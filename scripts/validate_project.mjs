import fs from "node:fs";
import path from "node:path";
import { root, readJson } from "./lib/manual.mjs";

const requiredFiles = [
  "package.json",
  "content/site.json",
  "content/manifest.json",
  "docs/TERMINOLOGY.md",
  "docs/glossary.csv",
  "src/index.html",
  "src/app.js",
  "src/styles.css",
  "docs/ARCHITECTURE.md",
  "docs/CONTRIBUTING.md",
  "docs/DEPLOYMENT.md",
  "docs/TRANSLATION.md",
  "AGENTS.md",
  "dist/index.html",
  "dist/data/catalog.json",
  "dist/data/catalog.js",
  "dist/data/search-index-zh.json",
  "dist/data/search-index-zh.js",
  "dist/data/search-index-en.json",
  "dist/data/search-index-en.js",
];
const missingRequiredFiles = requiredFiles.filter((file) => !fs.existsSync(path.join(root, file)));
const sourceManifest = readJson(path.join(root, "content", "manifest.json"));
const site = readJson(path.join(root, "content", "site.json"));
const catalog = readJson(path.join(root, "dist", "data", "catalog.json"));
const assetManifest = readJson(path.join(root, "public", "assets", "manual", "manifest.json"));
const pageTitleZhById = site.pageTitlesZhById;
const manifestPageIds = sourceManifest.map((page) => path.basename(page.outputFile, ".html").replace(/^\d+-/, ""));
const manifestPageIdSet = new Set(manifestPageIds);

const missingSourcePages = sourceManifest
  .map((page) => path.join("content", "en", page.outputFile))
  .filter((file) => !fs.existsSync(path.join(root, file)));
const missingBuiltPages = catalog.pages
  .flatMap((page) => [
    path.join("dist", "data", "pages", `${page.id}.json`),
    path.join("dist", "data", "pages", `${page.id}.js`),
  ])
  .filter((file) => !fs.existsSync(path.join(root, file)));

const pageIntegrityIssues = [];
const allBuiltHtml = catalog.pages.map((page) => {
  const data = readJson(path.join(root, "dist", "data", "pages", `${page.id}.json`));
  for (const [language, html] of [["zh", data.contentHtml], ["en", data.englishHtml]]) {
    const ids = [...html.matchAll(/\bid=["']([^"']+)["']/gi)].map((match) => match[1]);
    const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
    if (duplicateIds.length) {
      pageIntegrityIssues.push(`${page.id} (${language}): duplicate IDs ${[...new Set(duplicateIds)].join(", ")}`);
    }
    if (/\bid=["']accordion["']/i.test(html)) {
      pageIntegrityIssues.push(`${page.id} (${language}): unconverted accordion`);
    }
  }
  const contentHeadingIds = [...data.contentHtml.matchAll(/<h[1-6]\b[^>]*\bid=["']([^"']+)["']/gi)]
    .map((match) => match[1]);
  const outlineHeadingIds = data.headings.map((heading) => heading.id);
  if (JSON.stringify(contentHeadingIds) !== JSON.stringify(outlineHeadingIds)) {
    pageIntegrityIssues.push(`${page.id} (zh): outline order does not match document order`);
  }
  return `${data.contentHtml}\n${data.englishHtml}`;
}).join("\n");
const localReferences = [...allBuiltHtml.matchAll(/\b(?:src|href)=["'](assets\/manual\/[^"']+)/gi)]
  .map((match) => match[1]);
const missingAssets = [...new Set(localReferences)]
  .filter((file) => !fs.existsSync(path.join(root, "dist", file)));
const remoteImages = [...allBuiltHtml.matchAll(/<img[^>]+src=["']https?:/gi)].length;
const publishedAssets = new Set(
  assetManifest
    .filter((asset) => ["downloaded", "placeholder"].includes(asset.status))
    .map((asset) => asset.localPath),
);
const unusedPublishedAssets = [...publishedAssets]
  .filter((file) => file !== "assets/manual/missing-image.svg")
  .filter((file) => !localReferences.includes(file));
const staleAssetEntries = assetManifest
  .filter((asset) => !["downloaded", "placeholder"].includes(asset.status));

const forbiddenPatterns = [
  { name: "PowerShell", pattern: /\b(?:powershell|pwsh)\b/i },
  { name: "Windows script", pattern: /\.(?:ps1|bat|cmd)\b/i },
  { name: "Windows drive path", pattern: /\b[A-Z]:\\/ },
];
const textFiles = [
  "README.md",
  "AGENTS.md",
  ...fs.readdirSync(path.join(root, "docs")).map((file) => path.join("docs", file)),
];
const platformResidue = [];
for (const file of textFiles) {
  const text = fs.readFileSync(path.join(root, file), "utf8");
  for (const check of forbiddenPatterns) {
    if (check.pattern.test(text)) platformResidue.push(`${file}: ${check.name}`);
  }
}

const hardFailures = [
  ...missingRequiredFiles,
  ...missingSourcePages,
  ...missingBuiltPages,
  ...missingAssets,
  ...pageIntegrityIssues,
];
if (!pageTitleZhById || typeof pageTitleZhById !== "object" || Array.isArray(pageTitleZhById)) {
  hardFailures.push("Missing or invalid site.pageTitlesZhById mapping");
} else {
  const missingTitleMappings = manifestPageIds.filter((pageId) => !pageTitleZhById[pageId]);
  const extraTitleMappings = Object.keys(pageTitleZhById).filter((pageId) => !manifestPageIdSet.has(pageId));
  if (missingTitleMappings.length) {
    hardFailures.push(`Missing Chinese titles for pages: ${missingTitleMappings.join(", ")}`);
  }
  if (extraTitleMappings.length) {
    hardFailures.push(`Extra Chinese title mappings: ${extraTitleMappings.join(", ")}`);
  }
  for (const page of catalog.pages) {
    const expectedTitleZh = pageTitleZhById[page.id];
    if (expectedTitleZh && page.titleZh !== expectedTitleZh) {
      hardFailures.push(`Title mismatch for ${page.id}: catalog="${page.titleZh}" / site="${expectedTitleZh}"`);
    }
  }
}
if (catalog.pages.length !== sourceManifest.length) {
  hardFailures.push(`Page count mismatch: manifest=${sourceManifest.length}, catalog=${catalog.pages.length}`);
}
if (reportSectionsMismatch(catalog, site)) {
  hardFailures.push(`Section count mismatch: catalog=${catalog.sections.length}, site=${site.sections.length}`);
}
if (remoteImages) hardFailures.push(`Remote image dependencies: ${remoteImages}`);

const reportFindings = {
  unusedPublishedAssets,
  staleAssetEntries: staleAssetEntries.map((asset) => asset.sourceUrl),
  platformResidue,
};

const report = {
  generatedAt: new Date().toISOString(),
  pages: catalog.pages.length,
  translatedPages: catalog.meta.translatedCount,
  sections: catalog.sections.length,
  titleMappings: pageTitleZhById && typeof pageTitleZhById === "object" && !Array.isArray(pageTitleZhById)
    ? Object.keys(pageTitleZhById).length
    : 0,
  missingRequiredFiles: missingRequiredFiles,
  missingSourcePages: missingSourcePages,
  missingBuiltPages: missingBuiltPages,
  missingAssets: missingAssets,
  remoteImages,
  pageIntegrityIssues,
  hardFailures,
  reportFindings,
};

fs.mkdirSync(path.join(root, "reports"), { recursive: true });
fs.writeFileSync(
  path.join(root, "reports", "validation-project.json"),
  JSON.stringify(report, null, 2),
);
fs.writeFileSync(path.join(root, "reports", "VALIDATION_PROJECT.md"), [
  "# 工程校验报告",
  "",
  `生成时间：${report.generatedAt}`,
  "",
  `- 章节：${report.pages}`,
  `- 已翻译章节：${report.translatedPages}`,
  `- 硬失败：${report.hardFailures.length}`,
  `- 报告项：${report.reportFindings.unusedPublishedAssets.length + report.reportFindings.staleAssetEntries.length + report.reportFindings.platformResidue.length}`,
  "",
  "## 必须修复",
  "",
  ...(report.hardFailures.length ? report.hardFailures.map((item) => `- ${item}`) : ["- 无"]),
  "",
  "## 报告项",
  "",
  ...(report.reportFindings.unusedPublishedAssets.length
    ? [
        "### 未引用的已发布资源",
        "",
        ...report.reportFindings.unusedPublishedAssets.map((item) => `- ${item}`),
        "",
      ]
    : []),
  ...(report.reportFindings.staleAssetEntries.length
    ? [
        "### 资源清单中的非发布条目",
        "",
        ...report.reportFindings.staleAssetEntries.map((item) => `- ${item}`),
        "",
      ]
    : []),
  ...(report.reportFindings.platformResidue.length
    ? [
        "### 文档中的平台残留",
        "",
        ...report.reportFindings.platformResidue.map((item) => `- ${item}`),
        "",
      ]
    : []),
].join("\n"));

console.log(JSON.stringify({
  pages: report.pages,
  translatedPages: report.translatedPages,
  hardFailures: report.hardFailures.length,
  reportItems: report.reportFindings.unusedPublishedAssets.length + report.reportFindings.staleAssetEntries.length + report.reportFindings.platformResidue.length,
}, null, 2));
for (const issue of report.hardFailures) console.error(issue);
if (report.hardFailures.length) process.exitCode = 1;

function reportSectionsMismatch(catalogData, siteData) {
  return catalogData.sections.length !== siteData.sections.length;
}
