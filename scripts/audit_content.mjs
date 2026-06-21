import fs from "node:fs";
import path from "node:path";
import {
  normalizeLegacyMarkup,
  readJson,
  removePageTitleHeading,
  root,
  stripDocument,
  toPlainText,
  transformAccordions,
} from "./lib/manual.mjs";

const manifest = readJson(path.join(root, "content", "manifest.json"));
const site = readJson(path.join(root, "content", "site.json"));
const outputDirectory = path.join(root, "reports");
const snapshotsDirectory = path.join(root, "upstream", "snapshots");
const latestSnapshot = fs.existsSync(snapshotsDirectory)
  ? fs.readdirSync(snapshotsDirectory).sort().at(-1)
  : null;
const count = (html, pattern) => [...html.matchAll(pattern)].length;
const normalized = (html, title) =>
  normalizeLegacyMarkup(
    removePageTitleHeading(
      transformAccordions(stripDocument(html).replace(/<!--[\s\S]*?-->/g, "")),
      title,
    ),
  );
const upstreamMain = (html) => {
  const main = html.match(
    /<div\s+id=["']main["'][^>]*>([\s\S]*?)<\/div>\s*<script\s+src=["'][^"']*OpenAccordionFromLink/i,
  )?.[1] ?? stripDocument(html);
  return main.replace(
    /<div[^>]*>\s*<a[^>]*>\s*(?:<img[^>]*>)?\s*<span[^>]*>(?:PREVIOUS|NEXT):[\s\S]*?<\/span>\s*(?:<img[^>]*>)?\s*<\/a>\s*<\/div>/gi,
    "",
  );
};
const imageNames = (html) =>
  [...html.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)/gi)]
    .map((match) => decodeURIComponent(match[1].split(/[?#]/)[0].split("/").pop()));
const headings = (html) =>
  [...html.matchAll(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi)]
    .map((match) => ({ level: Number(match[1]), title: toPlainText(match[2]) }));
const untranslatedBlocks = (html) => {
  const visible = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(?:style|script)\b[\s\S]*?<\/(?:style|script)>/gi, "");
  return [...visible.matchAll(/<(p|li|td|th|h[1-6]|span\b[^>]*class=["'][^"']*\bnote\b[^"']*["'][^>]*)>([\s\S]*?)<\/(?:p|li|td|th|h[1-6]|span)>/gi)]
    .map((match) => toPlainText(match[2]).replace(/\s+/g, " ").trim())
    .filter((text) => {
      const latin = (text.match(/[A-Za-z]/g) ?? []).length;
      const chinese = (text.match(/[\u3400-\u9fff]/g) ?? []).length;
      if (/[➔→]/.test(text) && !/[.!?。！？]/.test(text)) return false;
      return text.length >= 70 && latin >= 45 && chinese < 6;
    });
};
const mixedLanguageBlocks = (html) => {
  const visible = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(?:style|script)\b[\s\S]*?<\/(?:style|script)>/gi, "");
  const corruption = /(?:在put|在sert|选择ed|在stall|控制ler|Show\s+在fo)/i;
  const englishSyntax = /(?:^(?:on\s+the|the|with\s+the|engaging\s+the|navigate\s+to|enter\s+the|now\s+press|new\s+user\s+key)\b|\b(?:to\s+act\s+as|is\s+in\s+the\s+same\s+subnet|requires\s+permission|specified\.|ability\s+to)\b)/i;
  return [...visible.matchAll(/<(p|li|td|th|h[1-6]|span\b[^>]*class=["'][^"']*\bnote\b[^"']*["'][^>]*)>([\s\S]*?)<\/(?:p|li|td|th|h[1-6]|span)>/gi)]
    .map((match) => toPlainText(match[2]).replace(/\s+/g, " ").trim())
    .filter((text) => {
      const latin = (text.match(/[A-Za-z]/g) ?? []).length;
      const chinese = (text.match(/[\u3400-\u9fff]/g) ?? []).length;
      return corruption.test(text) || (latin >= 12 && chinese >= 2 && englishSyntax.test(text));
    });
};
const metrics = (html) => ({
  headings: count(html, /<h[1-6]\b/gi),
  images: count(html, /<img\b/gi),
  tables: count(html, /<table\b/gi),
  links: count(html, /<a\b/gi),
  listItems: count(html, /<li\b/gi),
  notes: count(html, /class=["'][^"']*\bnote\b/gi),
  disclosures: count(html, /class=["'][^"']*\bmanual-disclosure\b/gi),
  textLength: toPlainText(html).length,
});

function headingIssues(items) {
  const issues = [];
  for (let index = 1; index < items.length; index += 1) {
    if (items[index].level > items[index - 1].level + 1) {
      issues.push(`标题层级从 h${items[index - 1].level} 跳到 h${items[index].level}`);
    }
    if (items[index].title && items[index].title === items[index - 1].title) {
      issues.push(`连续重复标题：${items[index].title}`);
    }
  }
  return issues;
}

const pages = manifest.map((page, index) => {
  const englishRaw = fs.readFileSync(path.join(root, "content", "en", page.outputFile), "utf8");
  const chinesePath = path.join(root, "content", "zh", page.outputFile);
  const hasTranslation = fs.existsSync(chinesePath);
  const chineseRaw = hasTranslation ? fs.readFileSync(chinesePath, "utf8") : englishRaw;
  const sourcePath = latestSnapshot
    ? path.join(root, "upstream", "snapshots", latestSnapshot, "site", new URL(page.sourceUrl).pathname)
    : null;
  const sourceRaw = sourcePath && fs.existsSync(sourcePath)
    ? fs.readFileSync(sourcePath, "utf8")
    : englishRaw;
  const english = normalized(englishRaw, page.title);
  const chinese = normalized(chineseRaw, site.titlesZh[index]);
  const source = normalizeLegacyMarkup(
    removePageTitleHeading(transformAccordions(upstreamMain(sourceRaw)), page.title),
  );
  const englishMetrics = metrics(english);
  const chineseMetrics = metrics(chinese);
  const sourceMetrics = metrics(source);
  const suspiciousTranslation = hasTranslation ? untranslatedBlocks(chinese) : [];
  const suspiciousMixedLanguage = hasTranslation ? mixedLanguageBlocks(chinese) : [];
  const issues = hasTranslation ? [] : ["待翻译"];

  for (const key of ["images", "tables", "links", "listItems", "notes", "disclosures"]) {
    if (englishMetrics[key] !== chineseMetrics[key]) {
      issues.push(`${key}: 英文 ${englishMetrics[key]} / 中文 ${chineseMetrics[key]}`);
    }
  }
  const englishImages = imageNames(english);
  const chineseImages = imageNames(chinese);
  const missingImages = englishImages.filter((image) => !chineseImages.includes(image));
  const extraImages = chineseImages.filter((image) => !englishImages.includes(image));
  if (missingImages.length) issues.push(`中文缺少图片：${[...new Set(missingImages)].join(", ")}`);
  if (extraImages.length) issues.push(`中文额外图片：${[...new Set(extraImages)].join(", ")}`);
  const lengthRatio = chineseMetrics.textLength / Math.max(englishMetrics.textLength, 1);
  if (lengthRatio < 0.25 || lengthRatio > 1.65) {
    issues.push(`文本长度比异常：${lengthRatio.toFixed(2)}`);
  }
  if (/<p>\s*#{2,}/.test(chinese)) issues.push("仍有 Markdown 标题标记");
  if (suspiciousTranslation.length) {
    issues.push(`疑似未翻译正文块：${suspiciousTranslation.length}`);
  }
  if (suspiciousMixedLanguage.length) {
    issues.push(`疑似中英混杂或机器替换损坏：${suspiciousMixedLanguage.length}`);
  }
  issues.push(...headingIssues(headings(chinese)));

  return {
    order: page.order,
    file: page.outputFile,
    title: page.title,
    titleZh: site.titlesZh[index],
    metrics: { source: sourceMetrics, en: englishMetrics, zh: chineseMetrics },
    lengthRatio: Number(lengthRatio.toFixed(2)),
    missingImages: [...new Set(missingImages)],
    extraImages: [...new Set(extraImages)],
    untranslatedBlocks: suspiciousTranslation,
    mixedLanguageBlocks: suspiciousMixedLanguage,
    issues,
  };
});

const summary = {
  generatedAt: new Date().toISOString(),
  pages: pages.length,
  cleanPages: pages.filter((page) => !page.issues.length).length,
  reviewPages: pages.filter((page) => page.issues.length).length,
  pagesWithMissingImages: pages.filter((page) => page.missingImages.length).length,
  totalIssues: pages.reduce((sum, page) => sum + page.issues.length, 0),
};

fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(
  path.join(outputDirectory, "content-audit.json"),
  JSON.stringify({ summary, pages }, null, 2),
);

const markdown = [
  "# 内容审计报告",
  "",
  `生成时间：${summary.generatedAt}`,
  "",
  `- 页面：${summary.pages}`,
  `- 无结构问题：${summary.cleanPages}`,
  `- 待复核：${summary.reviewPages}`,
  `- 含缺失图片：${summary.pagesWithMissingImages}`,
  `- 问题项：${summary.totalIssues}`,
  "",
  "## 待复核页面",
  "",
  ...pages.filter((page) => page.issues.length).flatMap((page) => [
    `### ${String(page.order).padStart(2, "0")}. ${page.titleZh}`,
    "",
    `文件：\`${page.file}\`；中英文本长度比：${page.lengthRatio}`,
    "",
    ...page.issues.map((issue) => `- ${issue}`),
    ...(page.untranslatedBlocks.length
      ? [
          "",
          "疑似未翻译示例：",
          "",
          ...page.untranslatedBlocks.slice(0, 3).map((text) => `> ${text.slice(0, 240)}`),
        ]
      : []),
    ...(page.mixedLanguageBlocks.length
      ? [
          "",
          "疑似中英混杂示例：",
          "",
          ...page.mixedLanguageBlocks.slice(0, 3).map((text) => `> ${text.slice(0, 240)}`),
        ]
      : []),
    "",
  ]),
];
fs.writeFileSync(path.join(outputDirectory, "CONTENT_AUDIT.md"), `${markdown.join("\n")}\n`);
console.log(JSON.stringify(summary, null, 2));
