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
} from "./lib/manual.mjs";

const contentDirectory = path.join(root, "content");
const outputDirectory = path.join(root, "dist");
const site = readJson(path.join(contentDirectory, "site.json"));
const manifest = readJson(path.join(contentDirectory, "en", "manifest.json"));
const assetManifest = readJson(path.join(root, "public", "assets", "manual", "manifest.json"));
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
fs.cpSync(path.join(root, "public"), outputDirectory, { recursive: true });
for (const file of ["index.html", "app.js", "styles.css"]) {
  fs.copyFileSync(path.join(root, "src", file), path.join(outputDirectory, file));
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
@media (prefers-color-scheme: light) {
  :root {
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
  const english = prepareDocument(englishPath, item.sourceUrl, item.title);
  const chinese = hasTranslation
    ? prepareDocument(chinesePath, item.sourceUrl, site.titlesZh[index])
    : english;
  const pathname = new URL(item.sourceUrl).pathname.toLowerCase();
  anchorsByLanguage.en.set(pathname, new Set([...english.content.matchAll(/\bid=["']([^"']+)["']/gi)].map((match) => match[1])));
  anchorsByLanguage.zh.set(pathname, new Set([...chinese.content.matchAll(/\bid=["']([^"']+)["']/gi)].map((match) => match[1])));
  return { english, chinese, hasTranslation };
});

const pages = manifest.map((item, index) => {
  const id = path.basename(item.outputFile, ".html").replace(/^\d+-/, "");
  const { english, chinese, hasTranslation } = preparedSources[index];
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
    titleZh: site.titlesZh[index],
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
  for (const file of files) {
    if (manifestFiles.has(file)) continue;
    const filePath = path.join(zhPagesDir, file);
    const htmlContent = fs.readFileSync(filePath, 'utf8');
    const idMatch = htmlContent.match(/<meta\s+name="x-standalone-id"\s+content="([^"]+)"\s*\/?>/i);
    if (!idMatch) continue;
    const titleMatch = htmlContent.match(/<meta\s+name="x-standalone-title"\s+content="([^"]*)"\s*\/?>/i);
    const titleZhMatch = htmlContent.match(/<meta\s+name="x-standalone-title-zh"\s+content="([^"]*)"\s*\/?>/i);
    standalonePages.push({
      id: idMatch[1],
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


/* === Cache-busting post-processing === */
console.log("[cache] Applying content hashes…");

function collectDataFiles(dir) {
  const result = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) collectDataFiles(fullPath).forEach(function (f) { result.push(f); });
    else if (entry.isFile()) result.push(fullPath);
  }
  return result;
}

const allDataFiles = collectDataFiles(path.join(outputDirectory, "data"));
var cacheThemeDir = path.join(outputDirectory, "themes");
if (fs.existsSync(cacheThemeDir)) {
  for (var cf of fs.readdirSync(cacheThemeDir).filter(function (f) { return f.endsWith(".css"); })) {
    allDataFiles.push(path.join(cacheThemeDir, cf));
  }
}

const dataHasher = crypto.createHash("sha256");
for (var df of allDataFiles.sort()) {
  dataHasher.update(fs.readFileSync(df));
}
const buildHash = dataHasher.digest("hex").slice(0, 12);

// Hash and rename app.js
const appJsPath = path.join(outputDirectory, "app.js");
const appHash = crypto.createHash("sha256").update(fs.readFileSync(appJsPath)).digest("hex").slice(0, 12);
const appHashed = "app." + appHash + ".js";
fs.renameSync(appJsPath, path.join(outputDirectory, appHashed));

// Hash and rename styles.css
const cssPath = path.join(outputDirectory, "styles.css");
const cssHash = crypto.createHash("sha256").update(fs.readFileSync(cssPath)).digest("hex").slice(0, 12);
const cssHashed = "styles." + cssHash + ".css";
fs.renameSync(cssPath, path.join(outputDirectory, cssHashed));

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
  'href="./styles.css"',
  'href="./' + cssHashed + '"'
);

html = html.replace(
  'src="./app.js"',
  'src="./' + appHashed + '"'
);

fs.writeFileSync(htmlFile, html);

console.log("[cache] " + appHashed);
console.log("[cache] " + cssHashed);
console.log("[cache] Build hash: " + buildHash);
