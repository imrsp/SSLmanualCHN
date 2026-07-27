import fs from "node:fs";
import { pathToFileURL } from "node:url";

const VERSION_PATTERN = /^v\d+\.\d+\.\d+$/;

export function extractReleaseNotes(changelog, version) {
  if (!VERSION_PATTERN.test(version)) {
    throw new Error(`Release version must use the stable format vX.Y.Z: ${version}`);
  }

  const normalized = changelog.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const headingPattern = new RegExp(`^### ${version.replaceAll(".", "\\.")}(?:\\s+-\\s+.+)?$`);
  const matchingIndexes = lines.flatMap((line, index) => (headingPattern.test(line) ? [index] : []));

  if (matchingIndexes.length === 0) {
    throw new Error(`CHANGELOG.md does not contain a release heading for ${version}`);
  }
  if (matchingIndexes.length > 1) {
    throw new Error(`CHANGELOG.md contains multiple release headings for ${version}`);
  }

  const start = matchingIndexes[0];
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^#{2,3}\s+/.test(lines[index])) {
      end = index;
      break;
    }
  }

  return `${lines.slice(start, end).join("\n").trim()}\n`;
}

function main() {
  const [version, changelogPath, outputPath] = process.argv.slice(2);
  if (!version || !changelogPath || !outputPath) {
    throw new Error(
      "Usage: node scripts/extract_release_notes.mjs <vX.Y.Z> <CHANGELOG.md> <output.md>",
    );
  }

  const changelog = fs.readFileSync(changelogPath, "utf8");
  fs.writeFileSync(outputPath, extractReleaseNotes(changelog, version));
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
