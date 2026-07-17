import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function normalizeBuildInput(relativePath, content) {
  if (relativePath === "data/catalog.json" || relativePath === "data/catalog.js") {
    return Buffer.from(
      content.toString("utf8").replace(
        /"generatedAt":"[^"]*"/,
        '"generatedAt":""',
      ),
    );
  }
  return content;
}

export function createBuildHash(filePaths, baseDirectory) {
  const hasher = crypto.createHash("sha256");
  const sortedPaths = [...filePaths].sort();

  for (const filePath of sortedPaths) {
    const relativePath = path.relative(baseDirectory, filePath).split(path.sep).join("/");
    const content = normalizeBuildInput(relativePath, fs.readFileSync(filePath));
    hasher.update(relativePath);
    hasher.update("\0");
    hasher.update(content);
    hasher.update("\0");
  }

  return hasher.digest("hex").slice(0, 12);
}
