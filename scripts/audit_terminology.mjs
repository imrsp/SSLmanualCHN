import fs from "node:fs";
import path from "node:path";
import { readJson, root, toPlainText } from "./lib/manual.mjs";

const glossaryPath = path.join(root, "content", "glossary.csv");
const manifest = readJson(path.join(root, "content", "en", "manifest.json"));
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
  if (values.length !== header.length) {
    throw new Error(`glossary.csv line ${index + 2}: expected ${header.length} columns, found ${values.length}`);
  }
  return Object.fromEntries(header.map((name, column) => [name, values[column]]));
});

const duplicateTerms = glossary
  .filter((entry, index) => glossary.findIndex((candidate) => candidate.term_en === entry.term_en) !== index)
  .map((entry) => entry.term_en);
const forbiddenVariants = [
  { pattern: /有用链接/g, preferred: "实用链接" },
  { pattern: /相关链接/g, preferred: "实用链接" },
  { pattern: /推子层管理器/g, preferred: "Layer Manager" },
  { pattern: /系统层/g, preferred: "System Layer" },
  { pattern: /用户层/g, preferred: "User Layer" },
];
const findings = [];

for (const page of manifest) {
  const chinesePath = path.join(root, "content", "zh", page.outputFile);
  if (!fs.existsSync(chinesePath)) continue;
  const text = toPlainText(fs.readFileSync(chinesePath, "utf8"));
  for (const rule of forbiddenVariants) {
    const matches = text.match(rule.pattern) ?? [];
    if (matches.length) {
      findings.push({ file: page.outputFile, found: matches[0], preferred: rule.preferred, count: matches.length });
    }
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  glossaryTerms: glossary.length,
  translatedPagesScanned: manifest.length - manifest.filter((page) =>
    !fs.existsSync(path.join(root, "content", "zh", page.outputFile))).length,
  duplicateTerms: [...new Set(duplicateTerms)],
  findings,
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
  `- 待确认用词：${report.findings.length}`,
  "",
  ...report.findings.map((finding) =>
    `- \`${finding.file}\`：发现“${finding.found}” ${finding.count} 次，建议“${finding.preferred}”`),
  "",
].join("\n"));

console.log(JSON.stringify({
  glossaryTerms: report.glossaryTerms,
  translatedPagesScanned: report.translatedPagesScanned,
  duplicateTerms: report.duplicateTerms.length,
  findings: report.findings.length,
}, null, 2));
if (report.duplicateTerms.length) process.exitCode = 1;
