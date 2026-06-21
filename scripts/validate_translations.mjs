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
    return {
      order: page.order,
      file: path.basename(chinesePath),
      hardFailures: ["缺少中文译文文件"],
      reportFindings: [],
      chineseCharacters: 0,
      structuralChecks: null,
      linkTargetsMatch: false,
      lengthRatio: null,
    };
  }
  const chinese = editableBody(
    fs.readFileSync(chinesePath, "utf8")
      .replace(/^\uFEFF/, "")
      .replace(/<!--[\s\S]*?-->/g, ""),
  );
  const englishPlain = stripMarkup(english);
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
  const missingLinkTargets = sourceLinkTargets.filter((target) => !translatedLinkTargets.includes(target));
  const extraLinkTargets = translatedLinkTargets.filter((target) => !sourceLinkTargets.includes(target));
  const hardFailures = [];
  for (const [name, [source, translated]] of Object.entries(structuralChecks)) {
    if (name === "links") continue;
    if (source !== translated) hardFailures.push(`${name}: 英文 ${source} / 中文 ${translated}`);
  }
  const reportFindings = [];
  if (structuralChecks.links[1] < structuralChecks.links[0]) {
    hardFailures.push(`links: 英文 ${structuralChecks.links[0]} / 中文 ${structuralChecks.links[1]}`);
  } else if (structuralChecks.links[1] > structuralChecks.links[0]) {
    reportFindings.push(`links: 英文 ${structuralChecks.links[0]} / 中文 ${structuralChecks.links[1]}`);
  }
  if (missingLinkTargets.length) {
    hardFailures.push(`缺少英文基准链接目标：${[...new Set(missingLinkTargets)].join(", ")}`);
  } else if (!linkTargetsMatch && extraLinkTargets.length) {
    reportFindings.push(`新增链接目标：${[...new Set(extraLinkTargets)].join(", ")}`);
  }
  const lengthRatio = plain.length / Math.max(englishPlain.length, 1);
  if ((chineseCharacters < 40 && plain.length >= 120)) {
    reportFindings.push(`中文字符偏少：${chineseCharacters}`);
  }
  if (lengthRatio < 0.25 || lengthRatio > 1.65) {
    reportFindings.push(`文本长度比异常：${lengthRatio.toFixed(2)}`);
  }
  return {
    order: page.order,
    file: path.basename(chinesePath),
    hardFailures,
    reportFindings,
    chineseCharacters,
    structuralChecks,
    linkTargetsMatch,
    lengthRatio: Number(lengthRatio.toFixed(2)),
  };
});

const summary = {
  generatedAt: new Date().toISOString(),
  total: reports.length,
  clean: reports.filter((report) => !report.hardFailures.length && !report.reportFindings.length).length,
  hardFailurePages: reports.filter((report) => report.hardFailures.length).length,
  reportOnlyPages: reports.filter((report) => !report.hardFailures.length && report.reportFindings.length).length,
};

fs.mkdirSync(path.join(root, "reports"), { recursive: true });
fs.writeFileSync(
  path.join(root, "reports", "validation-translations.json"),
  JSON.stringify({ summary, pages: reports }, null, 2),
);
fs.writeFileSync(path.join(root, "reports", "VALIDATION_TRANSLATIONS.md"), [
  "# 翻译结构校验报告",
  "",
  `生成时间：${summary.generatedAt}`,
  "",
  `- 页面：${summary.total}`,
  `- 无问题：${summary.clean}`,
  `- 硬失败页面：${summary.hardFailurePages}`,
  `- 仅报告页面：${summary.reportOnlyPages}`,
  "",
  "## 必须修复",
  "",
  ...reports.filter((item) => item.hardFailures.length).flatMap((item) => [
    `### ${String(item.order).padStart(2, "0")}. \`${item.file}\``,
    "",
    ...item.hardFailures.map((failure) => `- ${failure}`),
    "",
  ]),
  ...(reports.some((item) => item.hardFailures.length) ? [] : ["- 无", ""]),
  "## 报告项",
  "",
  ...reports.filter((item) => item.reportFindings.length).flatMap((item) => [
    `### ${String(item.order).padStart(2, "0")}. \`${item.file}\``,
    "",
    ...item.reportFindings.map((finding) => `- ${finding}`),
    "",
  ]),
  ...(reports.some((item) => item.reportFindings.length) ? [] : ["- 无", ""]),
].join("\n"));

console.log(JSON.stringify(summary, null, 2));
for (const report of reports.filter((item) => item.hardFailures.length)) {
  console.error(`${report.file}: ${report.hardFailures.join("；")}`);
}
if (reports.some((item) => item.hardFailures.length)) process.exitCode = 1;
