import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const revisionPattern = /^\d+(?:\.\d+)+$/;

export function normalizeSourceRevision(value, label = "source revision") {
  const revision = typeof value === "string" ? value.trim() : "";
  if (!revisionPattern.test(revision)) {
    throw new Error(`${label} must be a dotted numeric value`);
  }
  return revision;
}

export function extractSourceRevision(html) {
  const section = String(html).match(
    /Document\s+Revision\s+Number\s*:\s*([\s\S]{0,240}?)(?:<\/p\s*>|<br\b|\r?\n)/i,
  )?.[1];
  const revision = section
    ?.replace(/<[^>]*>/g, " ")
    .match(/\d+(?:\.\d+)+/)?.[0];
  if (!revision) throw new Error("Unable to find Document Revision Number on the upstream revision page");
  return normalizeSourceRevision(revision);
}

export function compareSourceRevisions(left, right) {
  const leftParts = normalizeSourceRevision(left, "left source revision").split(".").map(Number);
  const rightParts = normalizeSourceRevision(right, "right source revision").split(".").map(Number);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

export function isAllowedSnapshotFailure(failure, rules) {
  return failure.kind !== "seed" && rules.some((rule) =>
    rule.url === failure.url &&
    Number.isInteger(failure.status) &&
    rule.statuses.includes(failure.status));
}

export function createSnapshotDiff(records, previousManifest, sourceRevision) {
  const before = new Map((previousManifest?.records ?? []).map((record) => [record.url, record.sha256]));
  const after = new Map(records.map((record) => [record.url, record.sha256]));
  return {
    schemaVersion: 1,
    sourceRevision: normalizeSourceRevision(sourceRevision),
    previous: previousManifest?.sourceRevision ?? null,
    added: [...after.keys()].filter((url) => !before.has(url)),
    changed: [...after.keys()].filter((url) => before.has(url) && before.get(url) !== after.get(url)),
    removed: [...before.keys()].filter((url) => !after.has(url)),
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function validateSnapshot(rootDirectory, revision, label, issues) {
  const snapshotDirectory = path.join(rootDirectory, "upstream", "snapshots", revision);
  const manifestPath = path.join(snapshotDirectory, "manifest.json");
  const diffPath = path.join(snapshotDirectory, "diff.json");
  if (!fs.existsSync(manifestPath)) {
    issues.push(`${label} snapshot does not exist: upstream/snapshots/${revision}/manifest.json`);
    return;
  }
  try {
    const snapshot = readJson(manifestPath);
    if (snapshot.schemaVersion !== 2) {
      issues.push(`${label} snapshot manifest must use schemaVersion 2`);
    }
    if (snapshot.sourceRevision !== revision) {
      issues.push(`${label} snapshot sourceRevision is ${snapshot.sourceRevision ?? "missing"}, expected ${revision}`);
    }
    if (snapshot.publishable !== true) {
      issues.push(`${label} snapshot is not marked publishable`);
    }
    if (!Array.isArray(snapshot.records) || snapshot.files !== snapshot.records.length) {
      issues.push(`${label} snapshot files count does not match its records`);
    } else {
      if (!["raw", "legacy-normalized"].includes(snapshot.storageMode)) {
        issues.push(`${label} snapshot storageMode is invalid or missing`);
      }
      for (const record of snapshot.records) {
        const filePath = path.resolve(snapshotDirectory, record.path ?? "");
        if (!filePath.startsWith(`${path.resolve(snapshotDirectory)}${path.sep}`) || !fs.existsSync(filePath)) {
          issues.push(`${label} snapshot record is missing or unsafe: ${record.url ?? record.path}`);
          continue;
        }
        if (snapshot.storageMode === "raw") {
          const sha256 = crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
          if (sha256 !== record.sha256) {
            issues.push(`${label} snapshot hash mismatch: ${record.url}`);
          }
        }
      }
    }
  } catch (error) {
    issues.push(`${label} snapshot manifest is invalid: ${error.message}`);
  }
  if (!fs.existsSync(diffPath)) {
    issues.push(`${label} snapshot diff does not exist: upstream/snapshots/${revision}/diff.json`);
  } else {
    try {
      const diff = readJson(diffPath);
      if (diff.schemaVersion !== 1 || diff.sourceRevision !== revision) {
        issues.push(`${label} snapshot diff metadata does not match revision ${revision}`);
      }
    } catch (error) {
      issues.push(`${label} snapshot diff is invalid: ${error.message}`);
    }
  }
}

export function validateUpstreamTracking(config, { rootDirectory, manifest, latestPointer }) {
  const issues = [];
  if (config?.schemaVersion !== 1) {
    return ["content/upstream.json must use schemaVersion 1"];
  }

  let origin;
  try {
    const parsed = new URL(config.origin);
    if (parsed.href !== `${parsed.origin}/`) throw new Error("origin must not include a path");
    origin = parsed.origin;
  } catch (error) {
    issues.push(`content/upstream.json origin is invalid: ${error.message}`);
  }

  try {
    const revisionUrl = new URL(config.revisionUrl);
    if (origin && revisionUrl.origin !== origin) {
      issues.push("content/upstream.json revisionUrl must use the configured origin");
    }
    if (!manifest.some((page) => page.sourceUrl === revisionUrl.href)) {
      issues.push("content/upstream.json revisionUrl must be present in content/manifest.json");
    }
  } catch (error) {
    issues.push(`content/upstream.json revisionUrl is invalid: ${error.message}`);
  }

  let mergedRevision;
  try {
    mergedRevision = normalizeSourceRevision(config.mergedRevision, "content/upstream.json mergedRevision");
  } catch (error) {
    issues.push(error.message);
  }

  if (!Array.isArray(config.allowedSnapshotFailures)) {
    issues.push("content/upstream.json allowedSnapshotFailures must be an array");
  } else {
    const urls = new Set();
    for (const [index, rule] of config.allowedSnapshotFailures.entries()) {
      const label = `allowedSnapshotFailures[${index}]`;
      try {
        const url = new URL(rule.url);
        if (origin && url.origin !== origin) throw new Error("URL must use the configured origin");
        if (urls.has(url.href)) throw new Error("URL is duplicated");
        urls.add(url.href);
        if (!Array.isArray(rule.statuses) || !rule.statuses.length ||
            rule.statuses.some((status) => !Number.isInteger(status) || status < 400 || status > 599)) {
          throw new Error("statuses must contain HTTP error status integers");
        }
        if (typeof rule.reason !== "string" || rule.reason.trim().length < 20) {
          throw new Error("reason must explain the upstream failure");
        }
      } catch (error) {
        issues.push(`${label}: ${error.message}`);
      }
    }
  }

  if (mergedRevision) validateSnapshot(rootDirectory, mergedRevision, "merged revision", issues);

  if (latestPointer?.schemaVersion !== 1) {
    issues.push("upstream/snapshots/latest.json must use schemaVersion 1");
  } else {
    try {
      const latestRevision = normalizeSourceRevision(
        latestPointer.sourceRevision,
        "upstream/snapshots/latest.json sourceRevision",
      );
      const expected = {
        snapshot: latestRevision,
        manifest: `${latestRevision}/manifest.json`,
        diff: `${latestRevision}/diff.json`,
      };
      for (const [field, value] of Object.entries(expected)) {
        if (latestPointer[field] !== value) {
          issues.push(`upstream/snapshots/latest.json ${field} must be ${value}`);
        }
      }
      validateSnapshot(rootDirectory, latestRevision, "latest", issues);
      if (mergedRevision && compareSourceRevisions(mergedRevision, latestRevision) > 0) {
        issues.push("content/upstream.json mergedRevision cannot be newer than the latest snapshot");
      }
    } catch (error) {
      issues.push(error.message);
    }
  }

  return issues;
}
