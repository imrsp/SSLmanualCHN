import fs from "node:fs";
import path from "node:path";
import { assertSafePathSegment } from "./safe_paths.mjs";

function countOccurrences(text, value) {
  if (!value) return 0;
  return text.split(value).length - 1;
}

function resolveInside(rootDirectory, relativePath, allowedPrefix, label) {
  if (typeof relativePath !== "string" || !relativePath.startsWith(allowedPrefix)) {
    throw new Error(`${label} must start with ${allowedPrefix}`);
  }
  const resolved = path.resolve(rootDirectory, relativePath);
  const allowedRoot = path.resolve(rootDirectory, allowedPrefix);
  if (resolved !== allowedRoot && !resolved.startsWith(`${allowedRoot}${path.sep}`)) {
    throw new Error(`${label} escapes ${allowedPrefix}`);
  }
  return resolved;
}

export function validateUpstreamPatches(registry, { rootDirectory, manifest }) {
  const issues = [];
  if (registry?.schemaVersion !== 1 || !Array.isArray(registry?.patches)) {
    return ["content/upstream-patches.json must use schemaVersion 1 and contain a patches array"];
  }

  const knownSourceUrls = new Set(manifest.map((page) => page.sourceUrl));
  const ids = new Set();
  for (const [index, patch] of registry.patches.entries()) {
    const label = `upstream patch ${index + 1}`;
    try {
      assertSafePathSegment(patch.id, `${label} id`);
      if (ids.has(patch.id)) throw new Error(`Duplicate upstream patch id: ${patch.id}`);
      ids.add(patch.id);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(patch.recordedAt ?? "")) {
        throw new Error(`${patch.id}: recordedAt must use YYYY-MM-DD`);
      }
      if (!knownSourceUrls.has(patch.sourceUrl)) {
        throw new Error(`${patch.id}: sourceUrl is not present in content/manifest.json`);
      }
      if (typeof patch.reason !== "string" || patch.reason.trim().length < 20) {
        throw new Error(`${patch.id}: reason must explain the upstream correction`);
      }
      if (typeof patch.original !== "string" || !patch.original || typeof patch.replacement !== "string" || !patch.replacement) {
        throw new Error(`${patch.id}: original and replacement must be non-empty strings`);
      }
      if (!Number.isInteger(patch.expectedUpstreamOccurrences) || patch.expectedUpstreamOccurrences < 1) {
        throw new Error(`${patch.id}: expectedUpstreamOccurrences must be a positive integer`);
      }

      const snapshotPath = resolveInside(
        rootDirectory,
        patch.upstreamSnapshot,
        "upstream/snapshots/",
        `${patch.id} upstreamSnapshot`,
      );
      if (!fs.existsSync(snapshotPath)) throw new Error(`${patch.id}: upstream snapshot does not exist`);
      const upstreamText = fs.readFileSync(snapshotPath, "utf8");
      const upstreamOccurrences = countOccurrences(upstreamText, patch.original);
      if (upstreamOccurrences !== patch.expectedUpstreamOccurrences) {
        throw new Error(
          `${patch.id}: upstream original occurrence count is ${upstreamOccurrences}, expected ${patch.expectedUpstreamOccurrences}`,
        );
      }

      if (!Array.isArray(patch.targets) || !patch.targets.length) {
        throw new Error(`${patch.id}: targets must be a non-empty array`);
      }
      const targetPaths = new Set();
      for (const target of patch.targets) {
        const targetPath = resolveInside(rootDirectory, target.path, "content/", `${patch.id} target path`);
        if (targetPaths.has(targetPath)) throw new Error(`${patch.id}: duplicate target ${target.path}`);
        targetPaths.add(targetPath);
        if (!fs.existsSync(targetPath)) throw new Error(`${patch.id}: target does not exist: ${target.path}`);
        if (!Number.isInteger(target.minimumReplacementOccurrences) || target.minimumReplacementOccurrences < 1) {
          throw new Error(`${patch.id}: minimumReplacementOccurrences must be a positive integer for ${target.path}`);
        }
        const targetText = fs.readFileSync(targetPath, "utf8");
        if (targetText.includes(patch.original)) {
          throw new Error(`${patch.id}: unpatched original remains in ${target.path}`);
        }
        const replacementOccurrences = countOccurrences(targetText, patch.replacement);
        if (replacementOccurrences < target.minimumReplacementOccurrences) {
          throw new Error(
            `${patch.id}: replacement occurs ${replacementOccurrences} times in ${target.path}, expected at least ${target.minimumReplacementOccurrences}`,
          );
        }
      }
    } catch (error) {
      issues.push(error.message);
    }
  }
  return issues;
}
