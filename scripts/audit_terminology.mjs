import fs from "node:fs";
import path from "node:path";
import { readJson, root, toPlainText } from "./lib/manual.mjs";

const glossaryPath = path.join(root, "docs", "glossary.csv");
const manifest = readJson(path.join(root, "content", "manifest.json"));
const outputDirectory = path.join(root, "reports");

function parseCsvLine(line) {
  const values = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      values.push(value.trim());
      value = "";
    } else {
      value += character;
    }
  }
  values.push(value.trim());
  return values;
}

const lines = fs.readFileSync(glossaryPath, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
const header = parseCsvLine(lines.shift());
const glossary = lines.map((line, index) => {
  const values = parseCsvLine(line);
  if (values.length > header.length) {
    throw new Error(`glossary.csv line ${index + 2}: expected at most ${header.length} columns, found ${values.length}`);
  }
  while (values.length < header.length) values.push("");
  return Object.fromEntries(header.map((name, column) => [name, values[column]]));
});

const duplicateTerms = glossary
  .filter((entry, index) => glossary.findIndex((candidate) => candidate.term_en === entry.term_en) !== index)
  .map((entry) => entry.term_en);
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const zhAlternatives = (value) => value
  .split("/")
  .map((item) => item.trim())
  .filter(Boolean);
const translatedPages = [];
const findings = [];
const coverage = [];

for (const page of manifest) {
  const chinesePath = path.join(root, "content", "zh", page.outputFile);
  if (!fs.existsSync(chinesePath)) continue;
  const text = toPlainText(fs.readFileSync(chinesePath, "utf8"));
  translatedPages.push({ file: page.outputFile, text });
}

for (const entry of glossary) {
  const termEn = entry.term_en.trim();
  const termZh = entry.term_zh.trim();
  if (!termEn || !termZh) continue;

  const enPattern = new RegExp(`\\b${escapeRegExp(termEn)}\\b`, "g");
  const zhPatterns = zhAlternatives(termZh).map((item) => new RegExp(escapeRegExp(item), "g"));
  let englishCount = 0;
  let chineseCount = 0;
  const filesWithEnglish = [];
  const filesWithChinese = [];

  for (const page of translatedPages) {
    const enMatches = page.text.match(enPattern) ?? [];
    if (enMatches.length) {
      englishCount += enMatches.length;
      filesWithEnglish.push(page.file);
    }

    const zhMatches = zhPatterns.reduce((total, pattern) => total + (page.text.match(pattern) ?? []).length, 0);
    if (zhMatches) {
      chineseCount += zhMatches;
      filesWithChinese.push(page.file);
    }
  }

  const allowedEnglish = /(保留英文|保留\s*[A-Za-z]+|首次出现可说明)/.test(entry.note || "")
    || /^(VCA|Aux|Stem|Dante Primary|Dante Secondary)$/i.test(termEn);
  coverage.push({
    termEn,
    termZh,
    context: entry.context?.trim() || "",
    note: entry.note?.trim() || "",
    englishCount,
    chineseCount,
    filesWithEnglish,
    filesWithChinese,
    allowedEnglish,
  });

  if (englishCount > 0 && chineseCount === 0 && !allowedEnglish) {
    findings.push({
      type: "english-only",
      termEn,
      preferred: termZh,
      count: englishCount,
      files: filesWithEnglish,
    });
  }
}

coverage.sort((a, b) => a.termEn.localeCompare(b.termEn, "en"));

const report = {
  generatedAt: new Date().toISOString(),
  glossaryTerms: glossary.length,
  translatedPagesScanned: translatedPages.length,
  duplicateTerms: [...new Set(duplicateTerms)],
  findings,
  coverage,
  references: {
    glossary: "docs/glossary.csv",
    manifest: "content/manifest.json",
    translatedPagesRoot: "content/zh/pages",
  },
};
fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(path.join(outputDirectory, "terminology-audit.json"), JSON.stringify(report, null, 2));
fs.writeFileSync(path.join(outputDirectory, "TERMINOLOGY_AUDIT.md"), [
  "# 术语审计报告",
  "",
  `生成时间：${report.generatedAt}`,
  "",
  `- 术语条目：${report.glossaryTerms}`,
  `- 已扫描译文：${report.translatedPagesScanned}`,
  `- 重复英文术语：${report.duplicateTerms.length}`,
  `- 待确认问题：${report.findings.length}`,
  "",
  "## 参考来源",
  "",
  `- \`${report.references.glossary}\``,
  `- \`${report.references.manifest}\``,
  `- \`${report.references.translatedPagesRoot}\``,
  "",
  "## 问题",
  "",
  ...(report.findings.length
    ? report.findings.map((finding) => {
      return `- \`${finding.termEn}\`：译文中保留英文 ${finding.count} 次，但未发现推荐译法“${finding.preferred}”；涉及 ${finding.files.join(", ")}`;
    })
    : ["- 未发现需要报告的问题。"]),
  "",
  "## 术语覆盖统计",
  "",
  ...report.coverage.map((item) =>
    `- \`${item.termEn}\` -> “${item.termZh}”：中文 ${item.chineseCount} 次，英文 ${item.englishCount} 次`),
  "",
].join("\n"));

console.log(JSON.stringify({
  glossaryTerms: report.glossaryTerms,
  translatedPagesScanned: report.translatedPagesScanned,
  duplicateTerms: report.duplicateTerms.length,
  findings: report.findings.length,
}, null, 2));
for (const term of report.duplicateTerms) console.error(`Duplicate glossary term: ${term}`);
if (report.duplicateTerms.length) process.exitCode = 1;
