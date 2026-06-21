import fs from "node:fs";
import path from "node:path";
import { readJson, root } from "./lib/manual.mjs";

const manifest = readJson(path.join(root, "content", "manifest.json"));
function links(html, sourceUrl) {
  const result = [];
  const activeHtml = (html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html)
    .replace(/<p class="source">[\s\S]*?<\/p>/i, "")
    .replace(/<!--[\s\S]*?-->/g, "");
  for (const match of activeHtml.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["']/gi)) {
    let url;
    try {
      url = new URL(match[1], sourceUrl);
    } catch {
      continue;
    }
    result.push(url.href);
  }
  return result.sort();
}

const issues = [];
for (const page of manifest) {
  const englishPath = path.join(root, "content", "en", page.outputFile);
  const chinesePath = path.join(root, "content", "zh", page.outputFile);
  const english = fs.readFileSync(englishPath, "utf8");
  const chinese = fs.readFileSync(chinesePath, "utf8");
  if (/reconciled-reference-links|本页引用/.test(chinese)) {
    issues.push(`${page.outputFile}: contains a legacy appended-reference block`);
  }
  const sourceTargets = links(english, page.sourceUrl);
  const translatedTargets = links(chinese, page.sourceUrl);
  if (sourceTargets.join("\n") !== translatedTargets.join("\n")) {
    issues.push(`${page.outputFile}: link targets or duplicate counts differ from the source`);
  }
}

console.log(JSON.stringify({ pages: manifest.length, issues: issues.length }, null, 2));
for (const issue of issues) console.error(issue);
if (issues.length) process.exitCode = 1;
