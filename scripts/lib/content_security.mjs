import { decodeHtmlEntities } from "./html_entities.mjs";

const unsafeMarkupPatterns = [
  { name: "script tag", pattern: /<script\b/i },
  { name: "event handler attribute", pattern: /\son[a-z]+\s*=/i },
  { name: "embedded browsing context", pattern: /<(?:iframe|object|embed|base|form|input|button|textarea|select)\b/i },
  { name: "srcdoc attribute", pattern: /\ssrcdoc\s*=/i },
  { name: "meta refresh", pattern: /<meta\b[^>]+http-equiv\s*=\s*(?:"refresh"|'refresh'|refresh)/i },
  { name: "inline svg/math", pattern: /<(?:svg|math)\b/i },
];

const urlAttributePattern = /\b(?:href|src|xlink:href|action|formaction)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi;
const dangerousDataUrlPattern = /^data:(?:text\/html|image\/svg\+xml|application\/xml|text\/xml)(?:[;,]|$)/i;

function normalizedUrlAttribute(value) {
  return decodeHtmlEntities(value)
    .replace(/[\u0000-\u0020\u007f-\u009f]/g, "")
    .trim();
}

export function findUnsafeContentIssues(html) {
  const issues = [];
  for (const check of unsafeMarkupPatterns) {
    if (check.pattern.test(html)) issues.push(check.name);
  }

  for (const match of html.matchAll(urlAttributePattern)) {
    const value = normalizedUrlAttribute(match[1] ?? match[2] ?? match[3] ?? "");
    if (/^javascript:/i.test(value)) issues.push("javascript URL");
    if (dangerousDataUrlPattern.test(value)) issues.push("dangerous data URL");
  }
  return [...new Set(issues)];
}

export function assertSafeContentHtml(html, label) {
  const issues = findUnsafeContentIssues(html);
  if (issues.length) {
    throw new Error(`Unsafe manual HTML in ${label}: ${issues.join(", ")}`);
  }
}
