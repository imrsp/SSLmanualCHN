import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { root, readJson } from "./lib/manual.mjs";
import { finalizeSnapshot } from "./lib/snapshot_publish.mjs";
import {
  compareSourceRevisions,
  createSnapshotDiff,
  extractSourceRevision,
  isAllowedSnapshotFailure,
  normalizeSourceRevision,
} from "./lib/upstream_snapshot.mjs";

const manifest = readJson(path.join(root, "content", "manifest.json"));
const upstreamConfig = readJson(path.join(root, "content", "upstream.json"));
const origin = new URL(upstreamConfig.origin).origin;
const revisionUrl = new URL(upstreamConfig.revisionUrl).href;
const snapshotsRoot = path.join(root, "upstream", "snapshots");
const latestPath = path.join(snapshotsRoot, "latest.json");
const referencePattern = /(?:href|src)\s*=\s*["']([^"'#]+)|url\(\s*["']?([^"'()]+)|@import\s+["']([^"']+)/gi;
const ignoredScheme = /^(?:data:|mailto:|tel:|javascript:)/i;
const retryableStatuses = new Set([408, 425, 429, 500, 502, 503, 504]);

class SnapshotFetchError extends Error {
  constructor(message, status = null) {
    super(message);
    this.status = status;
  }
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const allowedPath = (pathname) => pathname === "/favicon.ico" || pathname.startsWith("/Help/");

function decodeText(bytes, contentType) {
  return bytes.toString(/charset=iso-8859-1/i.test(contentType) ? "latin1" : "utf8");
}

async function download(url) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "user-agent": "SSL-Live-Manual-ZH-Archiver/1.0" },
        redirect: "follow",
        signal: AbortSignal.timeout(45_000),
      });
      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        throw new SnapshotFetchError(`${response.status} ${response.statusText}`.trim(), response.status);
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      return { response, bytes, attempts: attempt };
    } catch (error) {
      lastError = error;
      const retryable = error.status == null || retryableStatuses.has(error.status);
      if (!retryable || attempt === 3) break;
      await wait(attempt * 1_500);
    }
  }
  throw lastError;
}

function readLatestPointer() {
  if (!fs.existsSync(latestPath)) return null;
  const latest = readJson(latestPath);
  if (latest.schemaVersion !== 1) {
    throw new Error("upstream/snapshots/latest.json must use schemaVersion 1");
  }
  const sourceRevision = normalizeSourceRevision(
    latest.sourceRevision,
    "upstream/snapshots/latest.json sourceRevision",
  );
  const expectedManifest = `${sourceRevision}/manifest.json`;
  const expected = {
    snapshot: sourceRevision,
    manifest: expectedManifest,
    diff: `${sourceRevision}/diff.json`,
  };
  for (const [field, value] of Object.entries(expected)) {
    if (latest[field] !== value) throw new Error(`latest.json ${field} must be ${value}`);
  }
  const manifestPath = path.join(snapshotsRoot, expectedManifest);
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Latest snapshot manifest does not exist: ${expectedManifest}`);
  }
  const snapshot = readJson(manifestPath);
  if (snapshot.sourceRevision !== sourceRevision || snapshot.publishable !== true) {
    throw new Error(`Latest snapshot ${sourceRevision} is invalid or not publishable`);
  }
  return latest;
}

async function main() {
  const revisionDownload = await download(revisionUrl);
  const revisionContentType = revisionDownload.response.headers.get("content-type") ?? "";
  const sourceRevision = extractSourceRevision(decodeText(revisionDownload.bytes, revisionContentType));
  const latest = readLatestPointer();

  if (latest?.sourceRevision === sourceRevision) {
    console.log(JSON.stringify({
      sourceRevision,
      latestRevision: latest.sourceRevision,
      skipped: true,
      reason: "source-revision-unchanged",
    }, null, 2));
    return;
  }

  if (latest && compareSourceRevisions(sourceRevision, latest.sourceRevision) < 0) {
    throw new Error(
      `Upstream source revision ${sourceRevision} is older than latest snapshot ${latest.sourceRevision}`,
    );
  }

  fs.mkdirSync(snapshotsRoot, { recursive: true });
  const finalSnapshotRoot = path.join(snapshotsRoot, sourceRevision);
  if (fs.existsSync(finalSnapshotRoot)) {
    throw new Error(`Snapshot ${sourceRevision} already exists and will not be overwritten`);
  }

  const snapshotRoot = fs.mkdtempSync(path.join(snapshotsRoot, `.${sourceRevision}-`));
  const filesRoot = path.join(snapshotRoot, "site");
  let published = false;

  try {
    const seedUrls = new Set(manifest.map((page) => new URL(page.sourceUrl).href));
    const queue = [...seedUrls];
    const queued = new Set(queue);
    const records = [];
    const failures = [];
    let cachedRevisionDownload = revisionDownload;

    function enqueue(reference, baseUrl) {
      if (!reference || ignoredScheme.test(reference) || reference.includes("{{")) return;
      let url;
      try {
        url = new URL(reference, baseUrl);
      } catch {
        return;
      }
      url.hash = "";
      if (url.origin !== origin || !allowedPath(url.pathname)) return;
      const normalized = url.href;
      if (!queued.has(normalized)) {
        queued.add(normalized);
        queue.push(normalized);
      }
    }

    function outputPath(url) {
      const parsed = new URL(url);
      let pathname = decodeURIComponent(parsed.pathname);
      if (pathname.endsWith("/")) pathname += "index.html";
      const suffix = parsed.search
        ? `__query_${crypto.createHash("sha1").update(parsed.search).digest("hex").slice(0, 10)}`
        : "";
      return path.join(filesRoot, `${pathname.replace(/^\/+/, "")}${suffix}`);
    }

    async function fetchOne(url) {
      const result = url === revisionUrl && cachedRevisionDownload
        ? cachedRevisionDownload
        : await download(url);
      if (url === revisionUrl) cachedRevisionDownload = null;
      const { response, bytes, attempts } = result;
      const finalUrl = new URL(response.url);
      if (finalUrl.origin !== origin || !allowedPath(finalUrl.pathname)) {
        throw new SnapshotFetchError(`Redirected outside the allowed upstream scope: ${response.url}`);
      }

      const contentType = response.headers.get("content-type") ?? "";
      const file = outputPath(url);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, bytes);

      if (/text\/html|text\/css|image\/svg\+xml|application\/xml/i.test(contentType)) {
        const decoded = decodeText(bytes, contentType);
        const text = /text\/html/i.test(contentType)
          ? decoded.replace(/<!--[\s\S]*?-->/g, "")
          : decoded;
        for (const match of text.matchAll(referencePattern)) {
          enqueue(match[1] || match[2] || match[3], response.url);
        }
      }

      records.push({
        url,
        finalUrl: response.url,
        path: path.relative(snapshotRoot, file),
        status: response.status,
        contentType,
        bytes: bytes.length,
        attempts,
        etag: response.headers.get("etag"),
        lastModified: response.headers.get("last-modified"),
        sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
      });
    }

    fs.mkdirSync(filesRoot, { recursive: true });
    let cursor = 0;
    const workers = Array.from({ length: 3 }, async () => {
      while (cursor < queue.length) {
        const url = queue[cursor];
        cursor += 1;
        try {
          await fetchOne(url);
        } catch (error) {
          const failure = {
            url,
            kind: seedUrls.has(url) ? "seed" : "dependency",
            status: Number.isInteger(error.status) ? error.status : null,
            error: error.message,
          };
          failure.allowed = isAllowedSnapshotFailure(
            failure,
            upstreamConfig.allowedSnapshotFailures,
          );
          failures.push(failure);
        }
      }
    });
    await Promise.all(workers);

    records.sort((left, right) => left.url.localeCompare(right.url));
    failures.sort((left, right) => left.url.localeCompare(right.url));
    const blockingFailures = failures.filter((failure) => !failure.allowed);
    const allowedFailures = failures.filter((failure) => failure.allowed);
    const generatedAt = new Date().toISOString();
    const snapshotManifest = {
      schemaVersion: 2,
      sourceRevision,
      generatedAt,
      origin,
      revisionUrl,
      storageMode: "raw",
      seedPages: seedUrls.size,
      files: records.length,
      publishable: blockingFailures.length === 0,
      failures,
      records,
    };
    fs.writeFileSync(
      path.join(snapshotRoot, "manifest.json"),
      JSON.stringify(snapshotManifest, null, 2),
    );

    const previousManifest = latest
      ? readJson(path.join(snapshotsRoot, latest.manifest))
      : null;
    const diff = createSnapshotDiff(records, previousManifest, sourceRevision);
    fs.writeFileSync(path.join(snapshotRoot, "diff.json"), JSON.stringify(diff, null, 2));

    published = finalizeSnapshot({
      failures: blockingFailures,
      stagingRoot: snapshotRoot,
      snapshotRoot: finalSnapshotRoot,
      latestPath,
      latestRecord: {
        schemaVersion: 1,
        sourceRevision,
        snapshot: sourceRevision,
        manifest: `${sourceRevision}/manifest.json`,
        diff: `${sourceRevision}/diff.json`,
        capturedAt: generatedAt,
      },
    });

    const summary = {
      sourceRevision,
      previousRevision: previousManifest?.sourceRevision ?? null,
      snapshot: published ? finalSnapshotRoot : null,
      published,
      skipped: false,
      files: records.length,
      bytes: records.reduce((sum, record) => sum + record.bytes, 0),
      failures: failures.length,
      allowedFailures: allowedFailures.length,
      blockingFailures: blockingFailures.length,
      added: diff.added.length,
      changed: diff.changed.length,
      removed: diff.removed.length,
    };
    if (!published) {
      console.error(JSON.stringify({
        error: "Upstream snapshot has blocking failures; latest.json was not updated.",
        failures: blockingFailures,
      }, null, 2));
      process.exitCode = 1;
    }
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    if (!published && fs.existsSync(snapshotRoot)) {
      fs.rmSync(snapshotRoot, { recursive: true, force: true });
    }
  }
}

try {
  await main();
} catch (error) {
  console.error(JSON.stringify({ error: error.message }, null, 2));
  process.exitCode = 1;
}
