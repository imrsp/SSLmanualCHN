import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(root, "dist");
const pagesDir = path.join(distDir, "seo");

const results = { passed: [], failed: [] };
function check(condition, label) {
  if (condition) results.passed.push(label);
  else results.failed.push(label);
}

// -- Read manifest to determine expected content boundaries --
const manifestPath = path.join(root, "content", "manifest.json");
const manifest = fs.existsSync(manifestPath)
  ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
  : [];
const expectedPageCount = manifest.length;

// Helper: extract page id from outputFile like "pages/01-Intro.html"
function pageIdFromOutputFile(of) {
  return of.replace(/^pages\/\d+-?/, "").replace(/\.html$/, "");
}

// -- Discover standalone pages from source content --
const zhPagesDir = path.join(root, "content", "zh", "pages");
const standalonePageIds = [];
if (fs.existsSync(zhPagesDir)) {
  for (const f of fs.readdirSync(zhPagesDir)) {
    if (!f.endsWith(".html")) continue;
    const html = fs.readFileSync(path.join(zhPagesDir, f), "utf8");
    const m = html.match(/<meta\s+name="x-standalone-id"\s+content="([^"]+)"\s*\/?>/i);
    if (m) standalonePageIds.push(m[1]);
  }
}

// -- robotx.txt --
const robotsPath = path.join(distDir, "robots.txt");
check(fs.existsSync(robotsPath), "robots.txt exists");
if (fs.existsSync(robotsPath)) {
  const robots = fs.readFileSync(robotsPath, "utf8");
  check(robots.includes("Sitemap:"), "robots.txt contains Sitemap directive");
  check(robots.includes("Allow:"), "robots.txt contains Allow directive");
}

// -- sitemap.xml --
const sitemapPath = path.join(distDir, "sitemap.xml");
check(fs.existsSync(sitemapPath), "sitemap.xml exists");
let sitemapEntries = 0;
if (fs.existsSync(sitemapPath)) {
  const sitemap = fs.readFileSync(sitemapPath, "utf8");
  check(sitemap.startsWith("<?xml"), "sitemap.xml is well-formed XML");
  sitemapEntries = sitemap.split("<url>").length - 1;
  check(
    sitemapEntries >= expectedPageCount,
    "sitemap.xml has at least " + expectedPageCount + " entries (got " + sitemapEntries + ")"
  );
  check(sitemap.includes("index.html"), "sitemap.xml includes index.html");
}

// -- Prerender pages dir --
check(fs.existsSync(pagesDir), "dist/seo/ directory exists");

let pageFiles = [];
if (fs.existsSync(pagesDir)) {
  pageFiles = fs.readdirSync(pagesDir).filter(f => f.endsWith(".html"));
  const expectedFiles = expectedPageCount + standalonePageIds.length;
  check(
    pageFiles.length >= expectedFiles,
    "dist/seo/ has at least " + expectedFiles + " HTML files (got " + pageFiles.length + ")"
  );

  let pagesWithTitle = 0;
  let pagesWithDescription = 0;
  let pagesWithCanonical = 0;
  let pagesWithJsonLd = 0;
  let pagesWithOgTitle = 0;
  let pagesWithTwitterCard = 0;
  let pagesWithHreflang = 0;
  let pagesWithRedirect = 0;

  for (const file of pageFiles) {
    const content = fs.readFileSync(path.join(pagesDir, file), "utf8");
    if (content.includes("<title>")) pagesWithTitle++;
    if (content.includes('name="description"')) pagesWithDescription++;
    if (content.includes('rel="canonical"')) pagesWithCanonical++;
    if (content.includes('type="application/ld+json"')) pagesWithJsonLd++;
    if (content.includes('property="og:title"')) pagesWithOgTitle++;
    if (content.includes('name="twitter:card"')) pagesWithTwitterCard++;
    if (content.includes('hreflang=')) pagesWithHreflang++;
    if (content.includes('location.replace') || content.includes('http-equiv="refresh"')) pagesWithRedirect++;
  }

  check(pagesWithTitle === pageFiles.length, "All " + pageFiles.length + " pages have <title> tag");
  check(pagesWithDescription === pageFiles.length, "All " + pageFiles.length + " pages have meta description");
  check(pagesWithCanonical === pageFiles.length, "All " + pageFiles.length + " pages have canonical link");
  check(pagesWithJsonLd === pageFiles.length, "All " + pageFiles.length + " pages have JSON-LD structured data");
  check(pagesWithOgTitle === pageFiles.length, "All " + pageFiles.length + " pages have og:title");
  check(pagesWithTwitterCard === pageFiles.length, "All " + pageFiles.length + " pages have twitter:card");
  check(pagesWithHreflang === pageFiles.length, "All " + pageFiles.length + " pages have hreflang links");
  check(pagesWithRedirect === pageFiles.length, "All " + pageFiles.length + " pages have SPA redirect");

  // -- First page: prev/next --
  if (manifest.length > 0) {
    const firstId = pageIdFromOutputFile(manifest[0].outputFile);
    const firstContent = pageFiles.includes(firstId + ".html")
      ? fs.readFileSync(path.join(pagesDir, firstId + ".html"), "utf8")
      : "";
    check(
      firstContent.includes('rel="next"') && !firstContent.includes('rel="prev"'),
      "First page (" + firstId + ") has rel=next but no rel=prev"
    );
  }

  // -- Last page: prev/next --
  if (manifest.length > 0) {
    const lastId = pageIdFromOutputFile(manifest[manifest.length - 1].outputFile);
    const lastContent = pageFiles.includes(lastId + ".html")
      ? fs.readFileSync(path.join(pagesDir, lastId + ".html"), "utf8")
      : "";
    check(
      lastContent.includes('rel="prev"') && !lastContent.includes('rel="next"'),
      "Last page (" + lastId + ") has rel=prev but no rel=next"
    );
  }

  // -- Standalone pages --
  for (const sid of standalonePageIds) {
    const found = pageFiles.some(f => f === sid + ".html");
    check(found, "Standalone page (" + sid + ") exists");
    if (found) {
      const sc = fs.readFileSync(path.join(pagesDir, sid + ".html"), "utf8");
      check(sc.includes('name="description"'), "Standalone page (" + sid + ") has meta description");
      check(sc.includes('type="application/ld+json"'), "Standalone page (" + sid + ") has JSON-LD");
    }
  }
}

// -- SPA index.html meta tags --
const indexPath = path.join(distDir, "index.html");
if (fs.existsSync(indexPath)) {
  const html = fs.readFileSync(indexPath, "utf8");
  check(html.includes('name="description"'), "SPA index.html has meta description");
  check(html.includes('property="og:title"'), "SPA index.html has og:title");
  check(html.includes('name="twitter:card"'), "SPA index.html has twitter:card");
  check(html.includes('rel="canonical"'), "SPA index.html has canonical link");
  check(html.includes('rel="sitemap"'), "SPA index.html has sitemap link");
  check(html.includes('name="robots"'), "SPA index.html has robots meta");
}

// -- Summary --
console.log([
  "=== SEO 审计报告 ===",
  "",
  ...(results.failed.length ? [`  [FAIL] 失败：${results.failed.length}`] : [`  [OK]   全部通过`]),
  `  [OK]   通过：${results.passed.length}`,
  "",
].join("\n"));

for (const f of results.failed) console.log(`  [FAIL] ${f}`);
for (const p of results.passed) console.log(`  [OK]   ${p}`);

process.exit(results.failed.length > 0 ? 1 : 0);
