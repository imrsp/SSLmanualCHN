function requiredText(config, key) {
  const value = config?.[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`content/seo.json must define a non-empty ${key}`);
  }
  return value.trim();
}

function escapeHtmlAttribute(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

export function resolveSeoConfig(config) {
  const description = requiredText(config, "description");
  const keywords = requiredText(config, "keywords");
  const rawUrl = requiredText(config, "url");
  const ogImage = requiredText(config, "ogImage");
  const defaultLastModified = requiredText(config, "defaultLastModified");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(defaultLastModified)) {
    throw new Error("content/seo.json defaultLastModified must use YYYY-MM-DD");
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    throw new Error(`content/seo.json url must be an absolute URL: ${rawUrl}`);
  }
  if (!/^https?:$/.test(parsedUrl.protocol) || parsedUrl.username || parsedUrl.password || parsedUrl.search || parsedUrl.hash) {
    throw new Error(`content/seo.json url must be a plain http(s) site URL: ${rawUrl}`);
  }
  if (!parsedUrl.pathname.endsWith("/")) parsedUrl.pathname += "/";

  const siteUrl = parsedUrl.href;
  const ogImageUrl = new URL(ogImage, siteUrl).href;
  if (!/^https?:/.test(new URL(ogImageUrl).protocol)) {
    throw new Error(`content/seo.json ogImage must resolve to an http(s) URL: ${ogImage}`);
  }
  return { description, keywords, siteUrl, ogImage, ogImageUrl, defaultLastModified };
}

export function renderIndexSeoTemplate(template, resolvedSeo) {
  const replacements = new Map([
    ["__SEO_DESCRIPTION__", resolvedSeo.description],
    ["__SEO_KEYWORDS__", resolvedSeo.keywords],
    ["__SEO_SITE_URL__", resolvedSeo.siteUrl],
    ["__SEO_OG_IMAGE_URL__", resolvedSeo.ogImageUrl],
  ]);
  let result = template;
  for (const [token, value] of replacements) {
    result = result.replaceAll(token, escapeHtmlAttribute(value));
  }
  const unresolved = result.match(/__SEO_[A-Z_]+__/g);
  if (unresolved) throw new Error(`Unresolved SEO template tokens: ${[...new Set(unresolved)].join(", ")}`);
  return result;
}

export function generateRobotsTxt(resolvedSeo) {
  return [
    "User-agent: *",
    "Allow: /",
    "Disallow: /data/",
    "Disallow: /themes/",
    "Disallow: /src/",
    "",
    `Sitemap: ${new URL("sitemap.xml", resolvedSeo.siteUrl).href}`,
    "",
  ].join("\n");
}
