import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

export function stripDocument(html) {
  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html;
  return body
    .replace(/<p class="source">[\s\S]*?<\/p>/i, "")
    .replace(
      /<div\b[^>]*class=["'][^"']*\bTutorialNavNext\b[^"']*["'][^>]*>[\s\S]*?<\/div>/gi,
      "",
    )
    .replace(
      /<div\b[^>]*>\s*<a\b[^>]*>\s*(?:<img\b[^>]*class=["'][^"']*\bTutorialNav\b[^"']*["'][^>]*>\s*)?<span\b[^>]*class=["'][^"']*\bTutorialNav\b[^"']*["'][^>]*>[\s\S]*?<\/span>\s*(?:<img\b[^>]*class=["'][^"']*\bTutorialNav\b[^"']*["'][^>]*>\s*)?<\/a>\s*<\/div>/gi,
      "",
    )
    .replace(
      /<div\b[^>]*>[\s\S]*?n_Tut(?:Previous|Next)\.png[\s\S]*?<\/div>/gi,
      "",
    )
    .replace(/<!doctype[^>]*>/gi, "")
    .replace(/<\/?(?:html|head|body)(?:\s[^>]*)?>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .trim();
}

export function toPlainText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

export function slugify(value, fallback) {
  return value
    .toLowerCase()
    .replace(/&[a-z0-9#]+;/g, "-")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "") || fallback;
}

function findMatchingDiv(html, openingStart) {
  const tagPattern = /<\/?div\b[^>]*>/gi;
  tagPattern.lastIndex = openingStart;
  let depth = 0;
  let match;
  while ((match = tagPattern.exec(html))) {
    depth += /^<div\b/i.test(match[0]) ? 1 : -1;
    if (depth === 0) return tagPattern.lastIndex;
  }
  return -1;
}

function directChildDivs(containerHtml) {
  const openingEnd = containerHtml.indexOf(">") + 1;
  const closingStart = containerHtml.toLowerCase().lastIndexOf("</div>");
  const inner = containerHtml.slice(openingEnd, closingStart);
  const tagPattern = /<\/?div\b[^>]*>/gi;
  const children = [];
  let depth = 0;
  let childStart = -1;
  let match;
  while ((match = tagPattern.exec(inner))) {
    if (/^<div\b/i.test(match[0])) {
      if (depth === 0) childStart = match.index;
      depth += 1;
    } else {
      depth -= 1;
      if (depth === 0 && childStart >= 0) {
        children.push(inner.slice(childStart, tagPattern.lastIndex));
        childStart = -1;
      }
    }
  }
  return children;
}

function innerHtml(elementHtml) {
  return elementHtml
    .slice(elementHtml.indexOf(">") + 1, elementHtml.toLowerCase().lastIndexOf("</div>"))
    .trim();
}

function normalizeTitle(html) {
  return toPlainText(html).replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

function titleKey(html) {
  return normalizeTitle(html).match(/[a-z0-9]+|[\u4e00-\u9fff]/g)?.sort().join("") ?? "";
}

function titlesMatch(a, b) {
  return normalizeTitle(a) === normalizeTitle(b) || titleKey(a) === titleKey(b);
}

function removeRepeatedLeadingHeading(content, title) {
  const headingPattern = /^(\s*)<h([1-6])([^>]*)>([\s\S]*?)<\/h\2>/i;
  const match = content.match(headingPattern);
  if (!match || !titlesMatch(match[4], title)) return content;
  return content.slice(match[0].length).trimStart();
}

export function transformAccordions(html) {
  const openings = [...html.matchAll(/<div\b[^>]*\bid=["']accordion["'][^>]*>/gi)];
  const replacements = [];
  for (const opening of openings) {
    const start = opening.index;
    const end = findMatchingDiv(html, start);
    if (end < 0) continue;
    const container = html.slice(start, end);
    const children = directChildDivs(container);
    if (children.length < 2 || children.length % 2 !== 0) continue;

    const disclosures = [];
    for (let index = 0; index < children.length; index += 2) {
      const title = innerHtml(children[index]);
      const contentElement = children[index + 1];
      const contentOpening = contentElement.slice(0, contentElement.indexOf(">") + 1);
      const contentId = contentOpening.match(/\bid=["']([^"']+)["']/i)?.[1];
      const content = removeRepeatedLeadingHeading(innerHtml(contentElement), title);
      disclosures.push(`
<details class="manual-disclosure"${index === 0 ? " open" : ""}>
  <summary><h2${contentId ? ` id="${contentId}"` : ""}>${title}</h2></summary>
  <div class="manual-disclosure-content">
${content}
  </div>
</details>`);
    }
    replacements.push({ start, end, value: `<div class="manual-disclosures">${disclosures.join("\n")}\n</div>` });
  }
  return replacements
    .sort((a, b) => b.start - a.start)
    .reduce((result, replacement) =>
      `${result.slice(0, replacement.start)}${replacement.value}${result.slice(replacement.end)}`, html);
}

export function removePageTitleHeading(html, pageTitle) {
  const headingPattern = /<h([1-6])([^>]*)>([\s\S]*?)<\/h\1>/gi;
  let match;
  while ((match = headingPattern.exec(html))) {
    if (!titlesMatch(match[3], pageTitle)) return html;
    return `${html.slice(0, match.index)}${html.slice(match.index + match[0].length)}`;
  }
  return html;
}

export function normalizeLegacyMarkup(html) {
  return html
    .replace(
      /<p class="note">\s*(<span class="notetitle">[\s\S]*?<\/span>)\s*<\/p>\s*<p>([\s\S]*?)<\/p>/gi,
      '<div class="note">$1 $2</div>',
    )
    .replace(
      /<figure>\s*(<img\b[^>]*>)\s*<figcaption>图片\s*\d+<\/figcaption>\s*<\/figure>/gi,
      "$1",
    )
    .replace(/<\/ul>\s*<ul>/gi, "")
    .replace(/<p>\s*\*\*([^*]+)\*\*\s*<\/p>/gi, "<h4>$1</h4>")
    .replace(
      /<p>\s*(注意|请注意|警告|重要提示|例如|SSL 建议)\s*[：:]\s*([\s\S]*?)<\/p>/gi,
      '<div class="note"><span class="notetitle">$1：</span>$2</div>',
    )
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
}

function hasBlockImageIntent(imageHtml) {
  const className = imageHtml.match(/\bclass=["']([^"']+)["']/i)?.[1] ?? "";
  const style = imageHtml.match(/\bstyle=["']([^"']+)["']/i)?.[1] ?? "";
  const align = imageHtml.match(/\balign=["']([^"']+)["']/i)?.[1] ?? "";
  return /\b(?:center|TutorialNav)\b/i.test(className)
    || /(?:display\s*:\s*block|float\s*:)/i.test(style)
    || /^(?:left|right)$/i.test(align);
}

function addImageClass(imageHtml, className) {
  if (/\bclass=["'][^"']*["']/i.test(imageHtml)) {
    return imageHtml.replace(
      /\bclass=(["'])([^"']*)\1/i,
      (match, quote, value) => `class=${quote}${value} ${className}${quote}`,
    );
  }
  return imageHtml.replace(/<img\b/i, `<img class="${className}"`);
}

export function markInlineImages(html) {
  return html.replace(/<(p|li)(\b[^>]*)>([\s\S]*?)<\/\1>/gi, (element, tag, attributes, inner) => {
    if (!/<img\b/i.test(inner)) return element;
    const text = toPlainText(inner.replace(/<img\b[^>]*>/gi, " "));
    if (!text) return element;
    const content = inner.replace(/<img\b[^>]*>/gi, (image) =>
      hasBlockImageIntent(image) ? image : addImageClass(image, "manual-inline-icon"));
    return `<${tag}${attributes}>${content}</${tag}>`;
  });
}

export function extractMetaDescription(html, maxChars = 160) {
  const cleaned = html
    .replace(/<span class="note">[\s\S]*?<\/span>/gi, " ")
    .replace(/<div class="note">[\s\S]*?<\/div>/gi, " ")
    .replace(/<div class="manual-disclosures">[\s\S]*?<\/div>/gi, " ")
    .replace(/<details[\s\S]*?<\/details>/gi, " ");
  const text = toPlainText(cleaned);
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 20);
  let desc = paragraphs.length > 0 ? paragraphs[0].trim() : text.trim();
  if (desc.length > maxChars) {
    const truncated = desc.slice(0, maxChars);
    const lastPeriod = truncated.lastIndexOf("\u3002");
    const lastDot = truncated.lastIndexOf(".");
    const lastBreak = Math.max(lastPeriod, lastDot);
    if (lastBreak > maxChars * 0.5) {
      desc = truncated.slice(0, lastBreak + 1);
    } else {
      desc = truncated + "\u2026";
    }
  }
  return desc;
}

export function toFirstLine(text) {
  const clean = text.replace(/\s+/g, " ").trim();
  const firstSentence = clean.match(/^[^\u3002.。]*[\u3002.。]?/)?.[0] ?? clean;
  return firstSentence.length > 200 ? clean.slice(0, 197) + "\u2026" : firstSentence;
}
