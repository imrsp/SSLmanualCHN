import fs from "node:fs";
import path from "node:path";
import { root, readJson } from "./lib/manual.mjs";

const requiredFiles = [
  "package.json",
  "content/site.json",
  "content/en/manifest.json",
  "content/TERMINOLOGY.md",
  "content/glossary.csv",
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
  "dist/data/search-index.json",
  "dist/data/search-index.js",
];
const missingRequiredFiles = requiredFiles.filter((file) => !fs.existsSync(path.join(root, file)));
const sourceManifest = readJson(path.join(root, "content", "en", "manifest.json"));
const site = readJson(path.join(root, "content", "site.json"));
const catalog = readJson(path.join(root, "dist", "data", "catalog.json"));
const assetManifest = readJson(path.join(root, "public", "assets", "manual", "manifest.json"));

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

const report = {
  pages: catalog.pages.length,
  translatedPages: catalog.meta.translatedCount,
  sections: catalog.sections.length,
  titleMappings: site.titlesZh.length,
  missingRequiredFiles: missingRequiredFiles.length,
  missingSourcePages: missingSourcePages.length,
  missingBuiltPages: missingBuiltPages.length,
  missingAssets: missingAssets.length,
  remoteImages,
  unusedPublishedAssets: unusedPublishedAssets.length,
  staleAssetEntries: staleAssetEntries.length,
  platformResidue: platformResidue.length,
  pageIntegrityIssues: pageIntegrityIssues.length,
};
console.log(JSON.stringify(report, null, 2));
for (const issue of [
  ...missingRequiredFiles,
  ...missingSourcePages,
  ...missingBuiltPages,
  ...missingAssets,
  ...unusedPublishedAssets.map((file) => `Unused published asset: ${file}`),
  ...staleAssetEntries.map((asset) => `Stale asset manifest entry: ${asset.sourceUrl}`),
  ...platformResidue,
  ...pageIntegrityIssues,
]) console.error(issue);

if (
  report.pages !== sourceManifest.length ||
  report.sections !== site.sections.length ||
  report.titleMappings !== sourceManifest.length ||
  report.missingRequiredFiles ||
  report.missingSourcePages ||
  report.missingBuiltPages ||
  report.missingAssets ||
  report.remoteImages ||
  report.unusedPublishedAssets ||
  report.staleAssetEntries ||
  report.platformResidue ||
  report.pageIntegrityIssues
) process.exitCode = 1;
