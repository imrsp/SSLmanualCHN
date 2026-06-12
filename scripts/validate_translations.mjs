import fs from "node:fs";
import path from "node:path";
import { root, readJson } from "./lib/manual.mjs";

const manifest = readJson(path.join(root, "content", "en", "manifest.json"));
const count = (text, pattern) => [...text.matchAll(pattern)].length;
const stripMarkup = (html) =>
  html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z0-9#]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

const editableBody = (html) =>
  (html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html)
    .replace(/<p class="source">[\s\S]*?<\/p>/i, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .trim();

const linkTargets = (html, sourceUrl) =>
  [...html.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["']/gi)]
    .map((match) => {
      try {
        return new URL(match[1], sourceUrl).href;
      } catch {
        return match[1];
      }
    })
    .sort();

const reports = manifest.map((page) => {
  const englishPath = path.join(root, "content", "en", page.outputFile);
  const chinesePath = path.join(root, "content", "zh", page.outputFile);
  const english = editableBody(
    fs.readFileSync(englishPath, "utf8").replace(/<!--[\s\S]*?-->/g, ""),
  );
  if (!fs.existsSync(chinesePath)) {
    return { order: page.order, file: path.basename(chinesePath), status: "missing" };
  }
  const chinese = editableBody(
    fs.readFileSync(chinesePath, "utf8")
      .replace(/^\uFEFF/, "")
      .replace(/<!--[\s\S]*?-->/g, ""),
  );
  const plain = stripMarkup(chinese);
  const chineseCharacters = count(plain, /[\u3400-\u9fff]/g);
  const structuralChecks = {
    images: [count(english, /<img\b/gi), count(chinese, /<img\b/gi)],
    tables: [count(english, /<table\b/gi), count(chinese, /<table\b/gi)],
    links: [count(english, /<a\b/gi), count(chinese, /<a\b/gi)],
    headings: [count(english, /<h[1-6]\b/gi), count(chinese, /<h[1-6]\b/gi)],
  };
  const sourceLinkTargets = linkTargets(english, page.sourceUrl);
  const translatedLinkTargets = linkTargets(chinese, page.sourceUrl);
  const linkTargetsMatch = sourceLinkTargets.join("\n") === translatedLinkTargets.join("\n");
  const structureOk = Object.values(structuralChecks).every(([source, translated]) => source === translated)
    && linkTargetsMatch;
  const languageOk = chineseCharacters >= 40 || plain.length < 120;
  return {
    order: page.order,
    file: path.basename(chinesePath),
    status: structureOk && languageOk ? "ok" : "review",
    chineseCharacters,
    structuralChecks,
    linkTargetsMatch,
  };
});

const summary = {
  total: reports.length,
  complete: reports.filter((report) => report.status === "ok").length,
  review: reports.filter((report) => report.status === "review").length,
  missing: reports.filter((report) => report.status === "missing").length,
};
console.log(JSON.stringify(summary, null, 2));
for (const report of reports.filter((item) => item.status !== "ok")) {
  console.log(JSON.stringify(report));
}
if (process.env.STRICT_TRANSLATIONS === "1" && summary.complete !== summary.total) {
  process.exitCode = 1;
}
