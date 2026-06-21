import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { root, readJson } from "./lib/manual.mjs";

const origin = "https://livehelp.solidstatelogic.com";
const manifest = readJson(path.join(root, "content", "manifest.json"));
const date = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const snapshotRoot = path.join(root, "upstream", "snapshots", date);
const filesRoot = path.join(snapshotRoot, "site");
const previousSnapshots = fs.existsSync(path.join(root, "upstream", "snapshots"))
  ? fs.readdirSync(path.join(root, "upstream", "snapshots"))
      .filter((entry) => entry < date && fs.existsSync(path.join(root, "upstream", "snapshots", entry, "manifest.json")))
      .sort()
  : [];
const previousManifestPath = previousSnapshots.length
  ? path.join(root, "upstream", "snapshots", previousSnapshots.at(-1), "manifest.json")
  : null;

const queue = manifest.map((page) => page.sourceUrl);
const queued = new Set(queue);
const records = [];
const failures = [];
const referencePattern = /(?:href|src)\s*=\s*["']([^"'#]+)|url\(\s*["']?([^"'()]+)|@import\s+["']([^"']+)/gi;
const allowedPath = (pathname) => pathname === "/favicon.ico" || pathname.startsWith("/Help/");
const ignoredScheme = /^(?:data:|mailto:|tel:|javascript:)/i;

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
  let response;
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      response = await fetch(url, {
        headers: { "user-agent": "SSL-Live-Manual-ZH-Archiver/1.0" },
        redirect: "follow",
        signal: AbortSignal.timeout(45_000),
      });
      break;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1_500));
    }
  }
  if (!response) throw lastError;
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") ?? "";
  const file = outputPath(url);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, bytes);
  // Discover static dependencies from markup and stylesheets. Scanning minified
  // JavaScript produces many false URLs from internal `src=` expressions.
  if (/text\/html|text\/css|image\/svg\+xml|application\/xml/i.test(contentType)) {
    const decoded = bytes.toString(/charset=iso-8859-1/i.test(contentType) ? "latin1" : "utf8");
    const text = /text\/html/i.test(contentType)
      ? decoded.replace(/<!--[\s\S]*?-->/g, "")
      : decoded;
    for (const match of text.matchAll(referencePattern)) enqueue(match[1] || match[2] || match[3], url);
  }
  records.push({
    url,
    finalUrl: response.url,
    path: path.relative(snapshotRoot, file),
    status: response.status,
    contentType,
    bytes: bytes.length,
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
      failures.push({ url, error: error.message });
    }
  }
});
await Promise.all(workers);

records.sort((a, b) => a.url.localeCompare(b.url));
failures.sort((a, b) => a.url.localeCompare(b.url));
const snapshotManifest = {
  generatedAt: new Date().toISOString(),
  origin,
  seedPages: manifest.length,
  files: records.length,
  failures,
  records,
};
fs.writeFileSync(path.join(snapshotRoot, "manifest.json"), JSON.stringify(snapshotManifest, null, 2));

let diff = { previous: null, added: records.map((record) => record.url), changed: [], removed: [] };
if (previousManifestPath) {
  const previous = readJson(previousManifestPath);
  const before = new Map(previous.records.map((record) => [record.url, record.sha256]));
  const after = new Map(records.map((record) => [record.url, record.sha256]));
  diff = {
    previous: path.basename(path.dirname(previousManifestPath)),
    added: [...after.keys()].filter((url) => !before.has(url)),
    changed: [...after.keys()].filter((url) => before.has(url) && before.get(url) !== after.get(url)),
    removed: [...before.keys()].filter((url) => !after.has(url)),
  };
}
fs.writeFileSync(path.join(snapshotRoot, "diff.json"), JSON.stringify(diff, null, 2));
fs.writeFileSync(
  path.join(root, "upstream", "snapshots", "latest.json"),
  JSON.stringify({ date, manifest: `${date}/manifest.json`, diff: `${date}/diff.json` }, null, 2),
);

console.log(JSON.stringify({
  snapshot: snapshotRoot,
  files: records.length,
  bytes: records.reduce((sum, record) => sum + record.bytes, 0),
  failures: failures.length,
  added: diff.added.length,
  changed: diff.changed.length,
  removed: diff.removed.length,
}, null, 2));
