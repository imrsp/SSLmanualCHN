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

// Check robots.txt
const robotsPath = path.join(distDir, "robots.txt");
check(
  fs.existsSync(robotsPath),
  "robots.txt exists"
);
if (fs.existsSync(robotsPath)) {
  const robots = fs.readFileSync(robotsPath, "utf8");
  check(
    robots.includes("Sitemap:"),
    "robots.txt contains Sitemap directive"
  );
  check(
    robots.includes("Allow:"),
    "robots.txt contains Allow directive"
  );
}

// Check sitemap.xml
const sitemapPath = path.join(distDir, "sitemap.xml");
check(
  fs.existsSync(sitemapPath),
  "sitemap.xml exists"
);
let sitemapEntries = 0;
if (fs.existsSync(sitemapPath)) {
  const sitemap = fs.readFileSync(sitemapPath, "utf8");
  check(
    sitemap.startsWith("<?xml"),
    "sitemap.xml is well-formed XML"
  );
  sitemapEntries = sitemap.split("<url>").length - 1;
  check(
    sitemapEntries >= 84,
    "sitemap.xml has at least 84 entries (got " + sitemapEntries + ")"
  );
  check(
    sitemap.includes("index.html"),
    "sitemap.xml includes index.html"
  );
}

// Check prerender pages
check(
  fs.existsSync(pagesDir),
  "dist/seo/ directory exists"
);

let pageFiles = [];
if (fs.existsSync(pagesDir)) {
  pageFiles = fs.readdirSync(pagesDir).filter(f => f.endsWith(".html"));
  check(
    pageFiles.length >= 83,
    "dist/seo/ has at least 83 HTML files (got " + pageFiles.length + ")"
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

  check(pagesWithTitle === pageFiles.length,
    "All " + pageFiles.length + " pages have <title> tag");
  check(pagesWithDescription === pageFiles.length,
    "All " + pageFiles.length + " pages have meta description");
  check(pagesWithCanonical === pageFiles.length,
    "All " + pageFiles.length + " pages have canonical link");
  check(pagesWithJsonLd === pageFiles.length,
    "All " + pageFiles.length + " pages have JSON-LD structured data");
  check(pagesWithOgTitle === pageFiles.length,
    "All " + pageFiles.length + " pages have og:title");
  check(pagesWithTwitterCard === pageFiles.length,
    "All " + pageFiles.length + " pages have twitter:card");
  check(pagesWithHreflang === pageFiles.length,
    "All " + pageFiles.length + " pages have hreflang links");
  check(pagesWithRedirect === pageFiles.length,
    "All " + pageFiles.length + " pages have SPA redirect");

  // Check prev/next on middle pages
  const aboutContent = pageFiles.includes("Intro.html")
    ? fs.readFileSync(path.join(pagesDir, "Intro.html"), "utf8")
    : "";
  check(
    aboutContent.includes('rel="next"') && !aboutContent.includes('rel="prev"'),
    "First page (Intro) has rel=next but no rel=prev"
  );

  const lastPage = pageFiles.includes("LAN-012.html")
    ? fs.readFileSync(path.join(pagesDir, "LAN-012.html"), "utf8")
    : "";
  check(
    lastPage.includes('rel="prev"') && !lastPage.includes('rel="next"'),
    "Last page (LAN-012) has rel=prev but no rel=next"
  );

  // Check standalone page
  const standaloneFile = pageFiles.find(f => f === "about-dmt.html");
  check(
    !!standaloneFile,
    "Standalone page (about-dmt.html) exists"
  );
  if (standaloneFile) {
    const standaloneContent = fs.readFileSync(path.join(pagesDir, standaloneFile), "utf8");
    check(
      standaloneContent.includes('name="description"'),
      "Standalone page has meta description"
    );
    check(
      standaloneContent.includes('type="application/ld+json"'),
      "Standalone page has JSON-LD"
    );
  }
}

// Check SPA index.html meta tags
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

// Summary
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
