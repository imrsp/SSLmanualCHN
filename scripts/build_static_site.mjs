import fs from "node:fs";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import path from "node:path";
import {
  root,
  normalizeLegacyMarkup,
  markInlineImages,
  readJson,
  removePageTitleHeading,
  slugify,
  stripDocument,
  toPlainText,
 transformAccordions,
  extractMetaDescription,
} from "./lib/manual.mjs";

const contentDirectory = path.join(root, "content");
const outputDirectory = path.join(root, "dist");
const site = readJson(path.join(contentDirectory, "site.json"));
const manifest = readJson(path.join(contentDirectory, "manifest.json"));
const seoConfig = readJson(path.join(contentDirectory, "seo.json"));
const assetManifest = readJson(path.join(root, "public", "assets", "manual", "manifest.json"));
const pageTitleZhById = site.pageTitlesZhById;
const sectionById = new Map(site.sections.map((section, index) => [
  section.id,
  { ...section, order: index + 1 },
]));
const localAssets = new Map(
  assetManifest
    .filter((asset) => ["downloaded", "placeholder"].includes(asset.status))
    .map((asset) => [asset.sourceUrl.replace(/^http:/, "https:"), asset.localPath]),
);
const internalPages = new Map(
  manifest.map((item) => {
    const url = new URL(item.sourceUrl);
    const id = path.basename(item.outputFile, ".html").replace(/^\d+-/, "");
    return [url.pathname.toLowerCase(), id];
  }),
);
const anchorsByLanguage = { en: new Map(), zh: new Map() };

function getPageTitleZh(pageId) {
  const title = pageTitleZhById?.[pageId];
  if (!title) throw new Error(`Missing Chinese title mapping for page: ${pageId}`);
  return title;
}

function localizeAssets(html, sourceUrl) {
  return html.replace(/\b(src|href)\s*=\s*(["'])([^"']+)\2/gi, (match, attribute, quote, reference) => {
    if (/^(?:data:|mailto:|javascript:|#|\{\{)/i.test(reference)) return match;
    let absolute;
    try {
      absolute = new URL(reference, sourceUrl);
    } catch {
      return match;
    }
    const normalized = `${absolute.protocol}//${absolute.host}${absolute.pathname}`.replace(/^http:/, "https:");
    const localPath = localAssets.get(normalized);
    return localPath ? `${attribute}=${quote}${localPath}${quote}` : match;
  });
}

function localizeInternalLinks(html, sourceUrl, language) {
  return html.replace(/\bhref\s*=\s*(["'])([^"']+)\1/gi, (match, quote, reference) => {
    if (/^(?:data:|mailto:|javascript:|#\/)/i.test(reference)) return match;
    let absolute;
    try {
      absolute = new URL(reference, sourceUrl);
    } catch {
      return match;
    }
    if (absolute.hostname.toLowerCase() !== "livehelp.solidstatelogic.com") return match;
    const id = internalPages.get(absolute.pathname.toLowerCase());
    if (!id) return match;
    const requestedAnchor = absolute.hash ? decodeURIComponent(absolute.hash.slice(1)) : "";
    const availableAnchors = anchorsByLanguage[language].get(absolute.pathname.toLowerCase()) ?? new Set();
    const anchor = requestedAnchor && availableAnchors.has(requestedAnchor)
      ? `/${encodeURIComponent(requestedAnchor)}`
      : "";
    return `href=${quote}#/page/${id}${anchor}${quote}`;
  });
}

function addHeadingIds(html) {
  const headings = [];
  const usedIds = new Set(
    [...html.matchAll(/<(?!h[1-6]\b)[^>]*\bid=["']([^"']+)["'][^>]*>/gi)]
      .map((match) => match[1]),
  );
  let index = 0;
  const content = html.replace(/<h([1-6])([^>]*)>([\s\S]*?)<\/h\1>/gi, (match, level, attributes, innerHtml) => {
    const title = toPlainText(innerHtml);
    const existingId = attributes.match(/\bid=["']([^"']+)["']/i)?.[1];
    const baseId = existingId || slugify(title, `section-${index + 1}`);
    let id = baseId;
    let suffix = 2;
    while (usedIds.has(id)) {
      id = `${baseId}-${suffix}`;
      suffix += 1;
    }
    usedIds.add(id);
    headings.push({ id, level: Number(level), title });
    index += 1;
    const cleanAttributes = attributes.replace(/\s+id=["'][^"']+["']/i, "");
    return `<h${level}${cleanAttributes} id="${id}">${innerHtml}</h${level}>`;
  });
  return { content, headings };
}

function splitContentIntoBlocks(contentHtml, headings) {
  if (!headings.length) {
    const text = toPlainText(contentHtml).trim();
    return text ? [{ heading: "", headingId: "", level: 0, text }] : [];
  }

  const headingById = new Map(headings.map((h) => [h.id, h]));
  const positions = [];
  const hRegex = /<h([1-6])\b[^>]*id=["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = hRegex.exec(contentHtml))) {
    positions.push({ index: m.index, id: m[2] });
  }

  const blocks = [];

  if (positions.length && positions[0].index > 0) {
    const text = toPlainText(contentHtml.slice(0, positions[0].index)).trim();
    if (text) blocks.push({ heading: "", headingId: "", level: 0, text });
  }

  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i];
    const heading = headingById.get(pos.id);
    if (!heading) continue;
    const next = i + 1 < positions.length ? positions[i + 1].index : contentHtml.length;
    const text = toPlainText(contentHtml.slice(pos.index, next)).trim();
    if (text) blocks.push({ heading: heading.title, headingId: heading.id, level: heading.level, text });
  }

  if (!blocks.length) {
    const text = toPlainText(contentHtml).trim();
    if (text) blocks.push({ heading: "", headingId: "", level: 0, text });
  }
  return blocks;
}

function dedupeIds(html) {
  const usedIds = new Set();
  return html.replace(/\bid=(["'])([^"']+)\1/gi, (match, quote, baseId) => {
    let id = baseId;
    let suffix = 2;
    while (usedIds.has(id)) {
      id = `${baseId}-${suffix}`;
      suffix += 1;
    }
    usedIds.add(id);
    return `id=${quote}${id}${quote}`;
  });
}


function subsetFonts() {
  const srcDir = path.join(root, "fonts", "src");
  const outDir = path.join(outputDirectory, "assets", "fonts");
  if (!process.env.CI) {
    console.log("[fonts] Not in CI, skip font subsetting. To rebuild: CI=true npm run build");
    return;
  }

  if (!fs.existsSync(srcDir)) {
    console.log("[fonts] No TTF, skipping.");
    return;
  }
  fs.mkdirSync(outDir, { recursive: true });
  const zhDir = path.join(contentDirectory, "zh", "pages");
  const chars = new Set();
  for (const file of fs.readdirSync(zhDir).filter(f => f.endsWith(".html"))) {
    const text = fs.readFileSync(path.join(zhDir, file), "utf8");
    for (const c of text) {
      if (c >= "\u4e00" && c <= "\u9fff") chars.add(c);
      if (c.charCodeAt(0) >= 0x20 && c.charCodeAt(0) <= 0x7e) chars.add(c);
    }
  }
  const textFile = path.join(outputDirectory, "data", "_subset_chars.txt");
  fs.writeFileSync(textFile, [...chars].join(""), "utf8");
  const entries = [
    ["NotoSansSC-Regular.ttf", "NotoSansSC-Regular.subset.woff2"],
    ["NotoSansSC-Bold.ttf", "NotoSansSC-Bold.subset.woff2"],
    ["NotoSerifSC-Regular.ttf", "NotoSerifSC-Regular.subset.woff2"],
    ["NotoSerifSC-Bold.ttf", "NotoSerifSC-Bold.subset.woff2"],
  ];
  for (const [src, dest] of entries) {
    const srcPath = path.join(srcDir, src);
    if (!fs.existsSync(srcPath)) continue;
    const destPath = path.join(outDir, dest);
    execSync("pyftsubset " + JSON.stringify(srcPath) + " --text-file=" + JSON.stringify(textFile) + " --flavor=woff2 --output-file=" + JSON.stringify(destPath), { stdio: "pipe" });
  }
  fs.rmSync(textFile, { force: true });
  console.log("[fonts] Subset " + entries.length + " fonts to " + outDir);
}

fs.rmSync(outputDirectory, { recursive: true, force: true });
fs.mkdirSync(path.join(outputDirectory, "data", "pages"), { recursive: true });
fs.mkdirSync(path.join(outputDirectory, "src"), { recursive: true });
fs.cpSync(path.join(root, "public"), outputDirectory, { recursive: true });
fs.copyFileSync(path.join(root, "src", "index.html"), path.join(outputDirectory, "index.html"));
for (const file of ["app.js", "styles.css"]) {
  fs.copyFileSync(path.join(root, "src", file), path.join(outputDirectory, "src", file));
}


subsetFonts();
/* — Generate theme CSS from content/themes/*.json — */
let themeFiles = [];
const themesDir = path.join(root, "content", "themes");
if (fs.existsSync(themesDir)) {
  themeFiles = fs.readdirSync(themesDir).filter(function (f) { return f.endsWith(".json"); });
  const themesOut = path.join(outputDirectory, "themes");
  fs.mkdirSync(themesOut, { recursive: true });
  themeFiles.forEach(function (tf) {
    const config = JSON.parse(fs.readFileSync(path.join(themesDir, tf), "utf8"));
    const h = config.hue;
    const dk = config.dark;
    const lt = config.light;
    const glow = config.aboutGlow;
    const css = `/* Theme: ${config.name} — ${config.label} */
/* Auto-generated by scripts/build_static_site.mjs */
:root {
  --_hue: ${h.primary}; --_hue-link: ${h.link}; --_hue-warn: ${h.warn}; --_hue-error: ${h.error};
  --acid:   hsl(var(--_hue), ${dk.acid.s}%, ${dk.acid.l}%);
  --cyan:   hsl(var(--_hue-link), ${dk.cyan.s}%, ${dk.cyan.l}%);
  --amber:  hsl(var(--_hue-warn), ${dk.amber.s}%, ${dk.amber.l}%);
  --red:    hsl(var(--_hue-error), ${dk.red.s}%, ${dk.red.l}%);
  --about-glow-r: ${glow.dark.r}; --about-glow-g: ${glow.dark.g}; --about-glow-b: ${glow.dark.b};
  --_accent-glow: rgba(${glow.dark.r},${glow.dark.g},${glow.dark.b},.25);
  --brand-accent-text: ${config.brandAccentText};
}
:root[data-theme="light"] {
  color-scheme: light;
  --acid:   hsl(var(--_hue), ${lt.acid.s}%, ${lt.acid.l}%);
  --cyan:   hsl(var(--_hue-link), ${lt.cyan.s}%, ${lt.cyan.l}%);
  --amber:  hsl(var(--_hue-warn), ${lt.amber.s}%, ${lt.amber.l}%);
  --red:    hsl(var(--_hue-error), ${lt.red.s}%, ${lt.red.l}%);
  --about-glow-r: ${glow.light.r}; --about-glow-g: ${glow.light.g}; --about-glow-b: ${glow.light.b};
  --_accent-glow: rgba(${glow.light.r},${glow.light.g},${glow.light.b},.25);
  --brand-accent-text: ${config.brandAccentTextLight};
}
}`;
    fs.writeFileSync(path.join(themesOut, config.name + ".css"), css);
  });

  /* --- Generate data/themes.json for runtime theme list --- */
  const themesData = themeFiles
    .map(function (tf) {
      const config = JSON.parse(fs.readFileSync(path.join(themesDir, tf), "utf8"));
      return {
        id: config.name,
        label: config.label,
        color: config.color,
        description: config.description || "",
        default: config.default === true,
        order: config.order || 99,
      };
    })
    .sort(function (a, b) { return a.order - b.order; });
  writeDataFiles(path.join(outputDirectory, "data", "themes.json"), themesData,
    (json) => `globalThis.__SSL_MANUAL_DATA__.themes = ${json};`);
}

function writeDataFiles(jsonPath, value, assignment) {
  const json = JSON.stringify(value);
  fs.writeFileSync(jsonPath, json);
  fs.writeFileSync(
    jsonPath.replace(/\.json$/, ".js"),
    `globalThis.__SSL_MANUAL_DATA__ ??= { pages: {} };\n${assignment(json)}\n`,
  );
}

function prepareStandaloneDocument(filePath) {
  const raw = stripDocument(fs.readFileSync(filePath, "utf8"));
  const structured = markInlineImages(
    normalizeLegacyMarkup(
      transformAccordions(raw),
    ),
  );
  return addHeadingIds(dedupeIds(structured));
}

function prepareDocument(filePath, sourceUrl, pageTitle) {
  const structured = markInlineImages(
    normalizeLegacyMarkup(
      removePageTitleHeading(
        transformAccordions(
          localizeAssets(stripDocument(fs.readFileSync(filePath, "utf8")), sourceUrl),
        ),
        pageTitle,
      ),
    ),
  );
  return addHeadingIds(dedupeIds(structured));
}

const preparedSources = manifest.map((item, index) => {
  const englishPath = path.join(contentDirectory, "en", item.outputFile);
  const chinesePath = path.join(contentDirectory, "zh", item.outputFile);
  const hasTranslation = fs.existsSync(chinesePath);
  const titleZh = getPageTitleZh(path.basename(item.outputFile, ".html").replace(/^\d+-/, ""));
  const english = prepareDocument(englishPath, item.sourceUrl, item.title);
  const chinese = hasTranslation
    ? prepareDocument(chinesePath, item.sourceUrl, titleZh)
    : english;
  const pathname = new URL(item.sourceUrl).pathname.toLowerCase();
  anchorsByLanguage.en.set(pathname, new Set([...english.content.matchAll(/\bid=["']([^"']+)["']/gi)].map((match) => match[1])));
  anchorsByLanguage.zh.set(pathname, new Set([...chinese.content.matchAll(/\bid=["']([^"']+)["']/gi)].map((match) => match[1])));
  return { english, chinese, hasTranslation, titleZh };
});

const pages = manifest.map((item, index) => {
  const id = path.basename(item.outputFile, ".html").replace(/^\d+-/, "");
  const { english, chinese, hasTranslation, titleZh } = preparedSources[index];
  const preparedEnglish = {
    ...english,
    content: localizeInternalLinks(english.content, item.sourceUrl, "en"),
  };
  const preparedChinese = {
    ...chinese,
    content: localizeInternalLinks(chinese.content, item.sourceUrl, "zh"),
  };
  const section = sectionById.get(item.section);
  if (!section) throw new Error(`Unknown section: ${item.section}`);

  const page = {
    id,
    order: item.order,
    section: item.section,
    sectionZh: section.titleZh,
    title: item.title,
    titleZh,
    sourceUrl: item.sourceUrl,
    translationStatus: hasTranslation ? "complete" : "pending",
    headings: preparedChinese.headings,
    englishHeadings: preparedEnglish.headings,
    contentHtml: preparedChinese.content,
    englishHtml: preparedEnglish.content,
  };
  writeDataFiles(
    path.join(outputDirectory, "data", "pages", `${id}.json`),
    page,
    (json) => `globalThis.__SSL_MANUAL_DATA__.pages[${JSON.stringify(id)}] = ${json};`,
  );
  return page;
});

const catalog = {
  meta: {
    title: site.title,
    version: 2,
    generatedAt: new Date().toISOString(),
    pageCount: pages.length,
    translatedCount: pages.filter((page) => page.translationStatus === "complete").length,
    source: site.source,
  },
  sections: site.sections.map((section, index) => ({
    ...section,
    order: index + 1,
    groups: section.groups ?? [],
  })),
  pages: pages.map(({ contentHtml, englishHtml, ...page }) => page),
};

/* ---- Standalone pages (not in catalog / search index) ---- */
function discoverStandalonePages() {
  const zhPagesDir = path.join(contentDirectory, "zh", "pages");
  const files = fs.readdirSync(zhPagesDir).filter(f => f.endsWith('.html'));
  const standalonePages = [];
  const manifestFiles = new Set(manifest.map(item => path.basename(item.outputFile)));
  const chapterIds = new Set(manifest.map((item) => path.basename(item.outputFile, ".html").replace(/^\d+-/, "")));
  const standaloneIds = new Set();
  for (const file of files) {
    if (manifestFiles.has(file)) continue;
    const filePath = path.join(zhPagesDir, file);
    const htmlContent = fs.readFileSync(filePath, 'utf8');
    const idMatch = htmlContent.match(/<meta\s+name="x-standalone-id"\s+content="([^"]+)"\s*\/?>/i);
    if (!idMatch) continue;
    const standaloneId = idMatch[1].trim();
    if (!standaloneId) {
      throw new Error(`Standalone page ${file} is missing x-standalone-id`);
    }
    if (chapterIds.has(standaloneId)) {
      throw new Error(`Standalone page id conflicts with chapter id: ${standaloneId} (${file})`);
    }
    if (standaloneIds.has(standaloneId)) {
      throw new Error(`Duplicate standalone page id: ${standaloneId} (${file})`);
    }
    standaloneIds.add(standaloneId);
    const titleMatch = htmlContent.match(/<meta\s+name="x-standalone-title"\s+content="([^"]*)"\s*\/?>/i);
    const titleZhMatch = htmlContent.match(/<meta\s+name="x-standalone-title-zh"\s+content="([^"]*)"\s*\/?>/i);
    standalonePages.push({
      id: standaloneId,
      chinesePath: filePath,
      title: titleMatch ? titleMatch[1] : '',
      titleZh: titleZhMatch ? titleZhMatch[1] : '',
    });
  }
  return standalonePages;
}
const standalonePages = discoverStandalonePages();
for (const sp of standalonePages) {
  const chinese = prepareStandaloneDocument(sp.chinesePath);
  const standalonePageData = {
    id: sp.id,
    title: sp.title,
    titleZh: sp.titleZh,
    headings: chinese.headings,
    contentHtml: chinese.content,
    standalone: true,
  };
  writeDataFiles(
    path.join(outputDirectory, "data", "pages", `${sp.id}.json`),
    standalonePageData,
    (json) => `globalThis.__SSL_MANUAL_DATA__.pages[${JSON.stringify(sp.id)}] = ${json};`,
  );
}

const searchIndexZh = pages.map((page) => {
  const chinesePlain = toPlainText(page.contentHtml);
  const chineseBlocks = splitContentIntoBlocks(page.contentHtml, page.headings);
  return {
    id: page.id,
    title: page.titleZh,
    text: [page.titleZh, chinesePlain].join(" "),
    blocks: [
      { heading: page.titleZh, headingId: "", level: 0, text: page.titleZh },
      ...chineseBlocks,
    ],
  };
});

const searchIndexEn = pages.map((page) => {
  const englishPlain = toPlainText(page.englishHtml);
  const englishBlocks = splitContentIntoBlocks(page.englishHtml, page.headings);
  return {
    id: page.id,
    title: page.title,
    text: [page.title, englishPlain].join(" "),
    blocks: [
      { heading: page.title, headingId: "", level: 0, text: page.title },
      ...englishBlocks,
    ],
  };
});

writeDataFiles(
  path.join(outputDirectory, "data", "catalog.json"),
  catalog,
  (json) => `globalThis.__SSL_MANUAL_DATA__.catalog = ${json};`,
);
writeDataFiles(
  path.join(outputDirectory, "data", "search-index-zh.json"),
  searchIndexZh,
  (json) => `globalThis.__SSL_MANUAL_DATA__.searchIndexZh = ${json};`,
);
writeDataFiles(
  path.join(outputDirectory, "data", "search-index-en.json"),
  searchIndexEn,
  (json) => `globalThis.__SSL_MANUAL_DATA__.searchIndexEn = ${json};`,
);

console.log(JSON.stringify({
  output: outputDirectory,
  pages: pages.length,
  translatedPages: catalog.meta.translatedCount,
  pageDataBytes: pages.reduce((total, page) =>
    total + fs.statSync(path.join(outputDirectory, "data", "pages", `${page.id}.json`)).size, 0),
  searchIndexZhBytes: fs.statSync(path.join(outputDirectory, "data", "search-index-zh.json")).size,
searchIndexEnBytes: fs.statSync(path.join(outputDirectory, "data", "search-index-en.json")).size,
}, null, 2));

/* ── Generate prerender HTML pages for SEO ── */
const pagesDir = path.join(outputDirectory, "seo");
fs.mkdirSync(pagesDir, { recursive: true });

function escapeXml(str) {
  return String(str).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c];
  });
}

function generatePrerenderPage(pageData, prevPage, nextPage) {
  var noindexIds = new Set(seoConfig.noindexPageIds || []);
 var robotsContent = noindexIds.has(pageData.id) ? "noindex, follow" : "index, follow";
  var crawlContent = pageData.contentHtml.replace(
    /href="#\/page\/([^"]+)"/g,
    function(match, path) {
      var parts = path.split("/");
      var pageId = parts[0];
      var heading = parts.slice(1).join("/");
      var url = "./" + pageId + ".html";
      if (heading) url += "#" + heading;
      return 'href="' + url + '"';
    }
  );
  const siteUrl = seoConfig.url && seoConfig.url !== "https://<domain>/"
    ? seoConfig.url : "https://<domain>/";
  var pageUrl = siteUrl + "seo/" + pageData.id + ".html";
  var title = pageData.titleZh + " | " + site.title;
  var description = extractMetaDescription(pageData.contentHtml);
  var ogImage = seoConfig.ogImage
    ? (seoConfig.ogImage.indexOf("http") === 0 ? seoConfig.ogImage : siteUrl + seoConfig.ogImage)
    : siteUrl + "pwa-icon-512.png";

  var jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: pageData.titleZh,
    description: description || seoConfig.description,
    author: { "@type": "Organization", name: "Solid State Logic" },
    publisher: { "@type": "Organization", name: "DMT Club" },
    inLanguage: "zh-CN",
    mainEntityOfPage: { "@type": "WebPage", "@id": pageUrl },
    about: { "@type": "Thing", name: "SSL Live Console" },
    isAccessibleForFree: true,
  });

  var links = "";
  links += "\n  <link rel=\"canonical\" href=\"" + escapeXml(pageUrl) + "\">";
  links += "\n  <link rel=\"alternate\" hreflang=\"zh-CN\" href=\"" + escapeXml(pageUrl) + "\">";
  links += "\n  <link rel=\"alternate\" hreflang=\"x-default\" href=\"" + escapeXml(pageUrl) + "\">";
  if (prevPage) links += "\n  <link rel=\"prev\" href=\"" + escapeXml(siteUrl + "seo/" + prevPage.id + ".html") + "\">";
  if (nextPage) links += "\n  <link rel=\"next\" href=\"" + escapeXml(siteUrl + "seo/" + nextPage.id + ".html") + "\">";

  var metaDesc = escapeXml(description);
  var ogDesc = escapeXml(description || seoConfig.description);
  var ogTitle = escapeXml(pageData.titleZh);

  return "<!doctype html>\n<html lang=\"zh-CN\">\n<head>\n  <meta charset=\"utf-8\">\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n  <meta name=\"description\" content=\"" + metaDesc + "\">\n  <meta name=\"robots\" content=\"" + robotsContent + "\">\n  <meta property=\"og:title\" content=\"" + ogTitle + "\">\n  <meta property=\"og:description\" content=\"" + ogDesc + "\">\n  <meta property=\"og:type\" content=\"article\">\n  <meta property=\"og:url\" content=\"" + escapeXml(pageUrl) + "\">\n  <meta property=\"og:image\" content=\"" + escapeXml(ogImage) + "\">\n  <meta property=\"og:locale\" content=\"zh_CN\">\n  <meta name=\"twitter:card\" content=\"summary_large_image\">\n  <meta name=\"twitter:title\" content=\"" + ogTitle + "\">\n  <meta name=\"twitter:description\" content=\"" + ogDesc + "\">" + links + "\n  <title>" + escapeXml(title) + "</title>\n  <script type=\"application/ld+json\">" + jsonLd + "</script>\n</head>\n<body>\n" + crawlContent + crawlContent + "\n<script>location.replace(\"../index.html#/page/" + pageData.id + "\");</script>\n<noscript><meta http-equiv=\"refresh\" content=\"0;url=../index.html#/page/" + pageData.id + "\"></noscript>\n</body>\n</html>\n";
}

for (var i = 0; i < pages.length; i++) {
  var page = pages[i];
  var prevPage = i > 0 ? pages[i - 1] : null;
  var nextPage = i < pages.length - 1 ? pages[i + 1] : null;
  fs.writeFileSync(path.join(pagesDir, page.id + ".html"), generatePrerenderPage(page, prevPage, nextPage));
}

for (var si = 0; si < standalonePages.length; si++) {
  var sp = standalonePages[si];
  var spJsonPath = path.join(outputDirectory, "data", "pages", sp.id + ".json");
  if (!fs.existsSync(spJsonPath)) continue;
  var spData = JSON.parse(fs.readFileSync(spJsonPath, "utf8"));
  fs.writeFileSync(path.join(pagesDir, sp.id + ".html"), generatePrerenderPage({
    id: spData.id,
    titleZh: spData.titleZh,
    contentHtml: spData.contentHtml,
  }, null, null));
}
console.log("[seo] Generated " + (pages.length + standalonePages.length) + " prerender pages in seo/");

/* ── Generate sitemap.xml ── */
var sitemapSiteUrl = seoConfig.url && seoConfig.url !== "https://<domain>/"
  ? seoConfig.url : "https://<domain>/";

function getSitemapDate(filePath) {
  try { return fs.statSync(filePath).mtime.toISOString().split("T")[0]; }
  catch (_) { return new Date().toISOString().split("T")[0]; }
}

function sitemapUrl(loc, priority, changefreq, lastmod) {
  return "  <url>\n    <loc>" + escapeXml(sitemapSiteUrl + loc) + "</loc>\n    <lastmod>" + lastmod + "</lastmod>\n    <changefreq>" + changefreq + "</changefreq>\n    <priority>" + priority.toFixed(1) + "</priority>\n  </url>";
}

var sitemapEntries = [];
var siteDate = getSitemapDate(path.join(contentDirectory, "site.json"));
sitemapEntries.push(sitemapUrl("", 1.0, "weekly", siteDate));
sitemapEntries.push(sitemapUrl("index.html", 0.9, "weekly", siteDate));

for (var i = 0; i < pages.length; i++) {
  var page = pages[i];
  var manifestItem = manifest.find(function(item) {
    return path.basename(item.outputFile, ".html").replace(/^\d+-/, "") === page.id;
  });
  var zhPath = manifestItem ? path.join(contentDirectory, "zh", manifestItem.outputFile) : "";
  var mtime = getSitemapDate(zhPath);
  var priority = 0.9 - (i / pages.length) * 0.3;
  sitemapEntries.push(sitemapUrl("seo/" + page.id + ".html", priority, "weekly", mtime));
}

for (var si = 0; si < standalonePages.length; si++) {
  var spMtime = getSitemapDate(standalonePages[si].chinesePath);
  sitemapEntries.push(sitemapUrl("seo/" + standalonePages[si].id + ".html", 0.4, "monthly", spMtime));
}

var sitemap = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n" + sitemapEntries.join("\n") + "\n</urlset>\n";
fs.writeFileSync(path.join(outputDirectory, "sitemap.xml"), sitemap);
console.log("[seo] Generated sitemap.xml with " + sitemapEntries.length + " entries");



/* === Cache-busting post-processing === */
console.log("[cache] Applying content hashes…");

function collectOutputFiles(dir) {
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".DS_Store") continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...collectOutputFiles(fullPath));
    } else if (entry.isFile()) {
      result.push(fullPath);
    }
  }
  return result;
}

const allOutputFiles = collectOutputFiles(outputDirectory)
  .filter((filePath) => !["index.html", "sw.js"].includes(path.basename(filePath)))
  .sort();

const dataHasher = crypto.createHash("sha256");
for (const filePath of allOutputFiles) {
  dataHasher.update(fs.readFileSync(filePath));
}
const buildHash = dataHasher.digest("hex").slice(0, 12);

// Hash and rename app.js
const appJsPath = path.join(outputDirectory, "src", "app.js");
const appHash = crypto.createHash("sha256").update(fs.readFileSync(appJsPath)).digest("hex").slice(0, 12);
const appHashed = "app." + appHash + ".js";
fs.renameSync(appJsPath, path.join(outputDirectory, "src", appHashed));

// Hash and rename styles.css
const cssPath = path.join(outputDirectory, "src", "styles.css");
const cssHash = crypto.createHash("sha256").update(fs.readFileSync(cssPath)).digest("hex").slice(0, 12);
const cssHashed = "styles." + cssHash + ".css";
fs.renameSync(cssPath, path.join(outputDirectory, "src", cssHashed));

// Rewrite index.html
const htmlFile = path.join(outputDirectory, "index.html");
var html = fs.readFileSync(htmlFile, "utf8");

html = html.replace(
  '<meta name="viewport"',
  '<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">\n  <meta http-equiv="Pragma" content="no-cache">\n  <meta name="viewport"'
);

html = html.replace(
  "</head>",
  "  <script>window.__BUILD_HASH__=\"" + buildHash + "\"</script>\n</head>"
);

html = html.replace(
  'href="./src/styles.css"',
  'href="./src/' + cssHashed + '"'
);

html = html.replace(
  'src="./src/app.js"',
  'src="./src/' + appHashed + '"'
);

fs.writeFileSync(htmlFile, html);

console.log("[cache] " + appHashed);
console.log("[cache] " + cssHashed);
console.log("[cache] Build hash: " + buildHash);

const swPath = path.join(outputDirectory, "sw.js");
if (fs.existsSync(swPath)) {
  const precacheUrls = [
    "./apple-touch-icon.png",
    "./favicon-16x16.png",
    "./favicon-32x32.png",
    "./favicon-48x48.png",
    "./favicon.ico",
    "./favicon.png",
    "./favicon.svg",
    "./index.html",
    "./manifest.webmanifest",
    "./pwa-icon-192.png",
    "./pwa-icon-512.png",
    "./pwa-icon-512-maskable.png",
    `./src/${appHashed}`,
    `./src/${cssHashed}`,
    "./data/catalog.json",
    "./data/search-index-en.json",
    "./data/search-index-zh.json",
    "./data/themes.json",
  ];
  const swSource = fs.readFileSync(swPath, "utf8")
    .replace("__CACHE_VERSION__", JSON.stringify(buildHash))
    .replace("__PRECACHE_URLS__", JSON.stringify(precacheUrls));
  fs.writeFileSync(swPath, swSource);
  console.log("[cache] sw.js precache entries: " + precacheUrls.length);
}
