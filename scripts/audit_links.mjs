import fs from "node:fs";
import path from "node:path";
import { readJson, root } from "./lib/manual.mjs";

const catalog = readJson(path.join(root, "dist", "data", "catalog.json"));
const knownIds = new Set([
  ...catalog.pages.map((page) => page.id),
  ...fs.readdirSync(path.join(root, "dist", "data", "pages"))
    .filter((file) => file.endsWith(".json"))
    .map((file) => path.basename(file, ".json")),
]);
const hardFailures = [];
const warnings = [];
let internalLinks = 0;
let externalLinks = 0;

for (const page of catalog.pages) {
  const data = readJson(path.join(root, "dist", "data", "pages", `${page.id}.json`));
  for (const [language, html] of [["zh", data.contentHtml], ["en", data.englishHtml]]) {
    for (const match of html.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["']/gi)) {
      const href = match[1];
      if (/^#(?!\/page\/)/.test(href)) {
        hardFailures.push(`${page.id} (${language}): unlocalized fragment link ${href}`);
        continue;
      }
      if (href.startsWith("#/page/")) {
        internalLinks += 1;
        const [, target = "", encodedAnchor] = href.match(/^#\/page\/([^/]+)(?:\/(.+))?$/) ?? [];
        if (!knownIds.has(target)) {
          hardFailures.push(`${page.id} (${language}): unknown internal page ${href}`);
          continue;
        }
        if (encodedAnchor) {
          const targetData = readJson(path.join(root, "dist", "data", "pages", `${target}.json`));
          const anchor = decodeURIComponent(encodedAnchor);
          const targetHtml = language === "zh" ? targetData.contentHtml : targetData.englishHtml;
          if (!new RegExp(`\\bid=["']${anchor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`, "i").test(targetHtml)) {
            hardFailures.push(`${page.id} (${language}): missing anchor ${href}`);
          }
        }
      } else if (/^https?:/i.test(href)) {
        externalLinks += 1;
        if (/^https?:\/\/livehelp\.solidstatelogic\.com\/Help\/(?:[^/]+)\.html/i.test(href)) {
          const targetPath = new URL(href).pathname.toLowerCase();
          const isIncluded = catalog.pages.some((candidate) =>
            new URL(candidate.sourceUrl).pathname.toLowerCase() === targetPath);
          if (isIncluded) warnings.push(`${page.id} (${language}): 已有站内页面，仍使用外链 ${href}`);
        }
      }
    }
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  pages: catalog.pages.length,
  internalLinks,
  externalLinks,
  hardFailures,
  warnings,
};
fs.mkdirSync(path.join(root, "reports"), { recursive: true });
fs.writeFileSync(
  path.join(root, "reports", "link-audit.json"),
  JSON.stringify(report, null, 2),
);
fs.writeFileSync(path.join(root, "reports", "LINK_AUDIT.md"), [
  "# 站内链接校验报告",
  "",
  `生成时间：${report.generatedAt}`,
  "",
  `- 页面：${report.pages}`,
  `- 内部链接：${report.internalLinks}`,
  `- 外部链接：${report.externalLinks}`,
  `- 硬失败：${report.hardFailures.length}`,
  `- 警告：${report.warnings.length}`,
  "",
  "## 错误",
  "",
  ...(report.hardFailures.length ? report.hardFailures.map((item) => `- ${item}`) : ["- 无"]),
  "",
  "## 警告",
  "",
  ...(report.warnings.length ? report.warnings.map((item) => `- ${item}`) : ["- 无"]),
  "",
].join("\n"));
console.log([
  "=== 站内链接校验报告 ===",
  "",
  `  页面：${report.pages}`,
  `  内部链接：${report.internalLinks}`,
  `  外部链接：${report.externalLinks}`,
  ...(report.hardFailures.length ? [`  [FAIL] 硬失败：${report.hardFailures.length}`] : [`  [OK]   无硬失败`]),
  ...(report.warnings.length ? [`  [WARN] 警告：${report.warnings.length}`] : [`  [OK]   无警告`]),
  "",
].join("\n"));
for (const issue of hardFailures) console.log(`  [FAIL] ${issue}`);
for (const warn of warnings) console.log(`  [WARN] ${warn}`);
if (hardFailures.length) process.exitCode = 1;
