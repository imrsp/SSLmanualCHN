function requiredSingleLine(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.replace(/\s+/g, " ").trim();
}

function escapeMarkdownLinkLabel(value) {
  return requiredSingleLine(value, "llms.txt link label")
    .replace(/\\/g, "\\\\")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

function pageIdFromOutputFile(outputFile) {
  return outputFile.replace(/^pages\/\d+-?/, "").replace(/\.html$/, "");
}

export function validateLlmsTxtFormat(content) {
  const issues = [];
  const normalized = String(content).replace(/^\uFEFF/, "");
  const lines = normalized.split("\n");
  if (lines.at(-1) === "") lines.pop();

  if (!normalized.endsWith("\n")) {
    issues.push("file must end with a newline");
  }
  if (!/^# [^#\s].+/.test(lines[0] || "")) {
    issues.push("first line must be a single H1 project or site title");
  }
  if (lines.filter((line) => /^# /.test(line)).length !== 1) {
    issues.push("file must contain exactly one H1");
  }

  const summaryIndex = lines.findIndex((line, index) => index > 0 && line.trim());
  if (summaryIndex < 0 || !/^> \S/.test(lines[summaryIndex])) {
    issues.push("H1 must be followed by a blockquote summary");
  }

  const firstFileListIndex = lines.findIndex((line) => /^## /.test(line));
  if (firstFileListIndex < 0) {
    issues.push("file must contain at least one H2 file-list section");
  }
  if (lines.some((line) => /^#{3,}\s/.test(line))) {
    issues.push("only H1 and H2 headings are allowed");
  }

  let currentSection = "";
  let currentSectionItems = 0;
  const seenSectionNames = new Set();
  for (let index = Math.max(firstFileListIndex, 0); index < lines.length; index += 1) {
    const line = lines[index];
    const headingMatch = line.match(/^## (\S.*)$/);
    if (headingMatch) {
      if (currentSection && currentSectionItems === 0) {
        issues.push(`H2 section "${currentSection}" must contain at least one file-list item`);
      }
      currentSection = headingMatch[1].trim();
      currentSectionItems = 0;
      if (seenSectionNames.has(currentSection)) {
        issues.push(`duplicate H2 section: ${currentSection}`);
      }
      seenSectionNames.add(currentSection);
      continue;
    }
    if (!currentSection || !line.trim()) continue;
    if (!/^- \[[^\]]+\]\(https:\/\/[^)\s]+\)(?:: \S.*)?$/.test(line)) {
      issues.push(`invalid file-list item in "${currentSection}": ${line}`);
      continue;
    }
    currentSectionItems += 1;
  }
  if (currentSection && currentSectionItems === 0) {
    issues.push(`H2 section "${currentSection}" must contain at least one file-list item`);
  }

  return issues;
}

export function generateLlmsTxt({
  site,
  manifest,
  resolvedSeo,
  noindexPageIds = new Set(),
}) {
  const siteTitle = requiredSingleLine(site?.title, "content/site.json title");
  const summary = requiredSingleLine(resolvedSeo?.description, "content/seo.json description");
  const siteUrl = requiredSingleLine(resolvedSeo?.siteUrl, "resolved site URL");
  const sourceUrl = requiredSingleLine(site?.source, "content/site.json source");
  const excludedIds = noindexPageIds instanceof Set
    ? noindexPageIds
    : new Set(noindexPageIds || []);
  const pageTitlesZhById = site?.pageTitlesZhById || {};
  const manifestBySection = new Map();

  for (const item of manifest || []) {
    const pageId = pageIdFromOutputFile(requiredSingleLine(item.outputFile, "manifest outputFile"));
    if (excludedIds.has(pageId)) continue;
    const entries = manifestBySection.get(item.section) || [];
    entries.push({
      id: pageId,
      order: item.order,
      title: requiredSingleLine(item.title, `manifest title for ${pageId}`),
      titleZh: requiredSingleLine(pageTitlesZhById[pageId], `Chinese title for ${pageId}`),
    });
    manifestBySection.set(item.section, entries);
  }

  const lines = [
    `# ${siteTitle}`,
    "",
    `> ${summary}`,
    "",
    `本网站是 DMT Club 主导的 SSL Live 控制台帮助系统中文翻译项目。我们的目标是为中文母语的音响工程师提供高质量的技术文档，降低专业音频设备的学习门槛。`,
    "",
    "本文件用于帮助大语言模型快速定位本站公开、可索引的手册内容；抓取权限仍以 robots.txt 为准。",
    "",
    `以下链接均指向简体中文预渲染页面。交互式阅读器提供对应英文原文切换；英文资料来源为 [SSL Live Help](${sourceUrl})。`,
  ];

  for (const section of site?.sections || []) {
    const entries = (manifestBySection.get(section.id) || [])
      .sort((left, right) => left.order - right.order);
    if (!entries.length) continue;
    lines.push("", `## ${requiredSingleLine(section.titleZh, `Chinese title for section ${section.id}`)}`, "");
    for (const entry of entries) {
      const number = String(entry.order).padStart(2, "0");
      const label = escapeMarkdownLinkLabel(`${number} ${entry.titleZh}`);
      const url = new URL(`seo/${encodeURIComponent(entry.id)}.html`, siteUrl).href;
      lines.push(`- [${label}](${url}): 对应英文主题：${entry.title}。`);
    }
  }
  lines.push("");

  const output = lines.join("\n");
  const issues = validateLlmsTxtFormat(output);
  if (issues.length) {
    throw new Error(`Generated llms.txt is invalid:\n- ${issues.join("\n- ")}`);
  }
  return output;
}
