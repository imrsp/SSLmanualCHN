import fs from "node:fs";
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

fs.rmSync(outputDirectory, { recursive: true, force: true });
fs.mkdirSync(path.join(outputDirectory, "data", "pages"), { recursive: true });
fs.cpSync(path.join(root, "public"), outputDirectory, { recursive: true });
for (const file of ["index.html", "app.js", "styles.css"]) {
  fs.copyFileSync(path.join(root, "src", file), path.join(outputDirectory, file));
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
const standalonePages = [
  {
    id: "about-dmt",
    englishPath: path.join(contentDirectory, "en", "pages", "about-dmt.html"),
    chinesePath: path.join(contentDirectory, "zh", "pages", "about-dmt.html"),
    title: "About DMT Club",
    titleZh: "关于 DMT Club",
  },
];
for (const sp of standalonePages) {
  const hasTranslation = fs.existsSync(sp.chinesePath);
  const english = prepareStandaloneDocument(sp.englishPath);
  const chinese = hasTranslation
    ? prepareStandaloneDocument(sp.chinesePath)
    : english;
  const standalonePageData = {
    id: sp.id,
    title: sp.title,
    titleZh: sp.titleZh,
    translationStatus: hasTranslation ? "complete" : "pending",
    headings: chinese.headings,
    contentHtml: chinese.content,
    englishHtml: english.content,
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
