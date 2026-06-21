const state = {
  catalog: null,
  searchIndexZh: null,
  searchIndexEn: null,
  searchEn: false,
  pageCache: new Map(),
  currentPage: null,
  query: "",
  language: "zh",
  theme: "auto",
  themePreset: null,
  themes: null,
  defaultTheme: null,
  expandedSections: new Set(),
  expandedGroups: new Set(),
};

const elements = {
  databaseStatus: document.querySelector("#databaseStatus"),
  manualNav: document.querySelector("#manualNav"),
  searchPanel: document.querySelector(".search-panel"),
  searchInput: document.querySelector("#searchInput"),
  searchLabel: document.querySelector("#searchLabel"),
  searchSummary: document.querySelector("#searchSummary"),
  searchToggle: document.querySelector("#searchToggle"),
  searchEnToggle: document.querySelector("#searchEnToggle"),
  breadcrumbs: document.querySelector("#breadcrumbs"),
  document: document.querySelector("#document"),
  outline: document.querySelector("#outline"),
  themeToggle: document.querySelector("#themeToggle"),
  themeTooltip: document.querySelector("#themeTooltip"),
  presetToggle: document.querySelector("#presetToggle"),
  presetDropdown: document.querySelector("#presetDropdown"),
  presetItems: document.querySelector("#presetItems"),
  languageToggle: document.querySelector("#languageToggle"),
  previousPage: document.querySelector("#previousPage"),
  nextPage: document.querySelector("#nextPage"),
  pageCounter: document.querySelector("#pageCounter"),
  sidebar: document.querySelector("#sidebar"),
  menuButton: document.querySelector("#menuButton"),
  outlineButton: document.querySelector("#outlineButton"),
  scrim: document.querySelector("#scrim"),

};

/* — Theme management — */
function getEffectiveTheme() {
  if (state.theme === "dark") return "dark";
  if (state.theme === "light") return "light";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function applyTheme() {
  const effective = getEffectiveTheme();
  document.documentElement.setAttribute("data-theme", effective);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = effective === "dark" ? "#111513" : "#f5f6f3";
}

/* — Theme management: quick-tap toggles, long-press resets to auto — */
let pressTimer = null;
const LONG_PRESS_MS = 500;
let wasLongPress = false;

function handleThemePress(e) {
  if (e.button !== 0) return;
  wasLongPress = false;
  pressTimer = setTimeout(function () {
    wasLongPress = true;
    pressTimer = null;
    /* Long press → reset to auto */
    state.theme = "auto";
    try { localStorage.removeItem("ssl-manual-theme"); } catch (_) {}
    applyTheme();
    syncThemeButton();
  }, LONG_PRESS_MS);
}

function handleThemeRelease(e) {
  if (wasLongPress) return;
  if (pressTimer) {
    clearTimeout(pressTimer);
    pressTimer = null;
    cycleTheme();
  }
}

function handleThemeCancel() {
  if (pressTimer) {
    clearTimeout(pressTimer);
    pressTimer = null;
  }
}

function cycleTheme() {
  const effective = getEffectiveTheme();
  state.theme = effective === "dark" ? "light" : "dark";
  try { localStorage.setItem("ssl-manual-theme", state.theme); } catch (_) {}
  applyTheme();
  syncThemeButton();
}

function syncThemeButton() {
  const tooltip = elements.themeTooltip;
  if (!tooltip) return;
  const effective = getEffectiveTheme();
  if (state.theme === "auto") {
    tooltip.textContent = "主题跟随系统（" + (effective === "dark" ? "深色" : "浅色") + "）";
    return;
  }
  const label = effective === "dark" ? "深色" : "浅色";
  tooltip.textContent = "当前" + label + "，点击切换，长按恢复跟随系统";
}

/* — Theme presets — */
let presetLinkEl = null;

function loadThemeCSS(name) {
  if (name === state.defaultTheme || !name) {
    if (presetLinkEl) { presetLinkEl.remove(); presetLinkEl = null; }
    return;
  }
  if (!presetLinkEl) {
    presetLinkEl = document.createElement("link");
    presetLinkEl.rel = "stylesheet";
    document.head.appendChild(presetLinkEl);
  }
  var cacheBuster = typeof window.__BUILD_HASH__ !== "undefined" ? window.__BUILD_HASH__ : Date.now();
  presetLinkEl.href = "themes/" + name + ".css?" + cacheBuster;
}

function buildPresetDropdown() {
  var html = "";
  var themes = state.themes || [];
  for (var i = 0; i < themes.length; i++) {
    var t = themes[i];
    var active = t.id === state.themePreset ? " active" : "";
    html += '<button class="preset-option' + active + '" type="button" role="menuitem" data-preset="' + t.id + '" data-description="' + escapeHtml(t.description || '') + '">' +
      '<span class="preset-indicator" style="background:' + t.color + '"></span>' +
      '<span>' + t.label + '</span>' +
      '</button>';
  }
  if (elements.presetItems) elements.presetItems.innerHTML = html;
}

function togglePresetDropdown() {
  var dd = elements.presetDropdown;
  if (!dd) return;
  var open = dd.classList.toggle("open");
  if (open) {
    dd.querySelectorAll(".preset-option").forEach(function (btn) {
      btn.addEventListener("click", function () {
        selectThemePreset(btn.dataset.preset);
      });
      btn.addEventListener("mouseenter", showPresetOptionTooltip);
      btn.addEventListener("mouseleave", hidePresetOptionTooltip);    });
  } else {
    hidePresetOptionTooltip();
  }
}

function selectThemePreset(id) {
  state.themePreset = id;
  try { localStorage.setItem("ssl-manual-preset", id); } catch (_) {}
  loadThemeCSS(id);
  buildPresetDropdown();
  if (elements.presetDropdown) elements.presetDropdown.classList.remove("open");
  hidePresetOptionTooltip();
}

function initThemePreset() {
  try {
    var saved = localStorage.getItem("ssl-manual-preset");
    if (saved && (state.themes || []).some(function (t) { return t.id === saved; })) {
      state.themePreset = saved;
    }
  } catch (_) {}
  buildPresetDropdown();
  if (state.themePreset !== state.defaultTheme) {
    loadThemeCSS(state.themePreset);
  }
}

var _presetOptionTooltipEl = null;

function showPresetOptionTooltip(e) {
  var btn = e.currentTarget;
  var desc = btn.getAttribute("data-description");
  if (!desc) return;
  if (!_presetOptionTooltipEl) {
    _presetOptionTooltipEl = document.createElement("div");
    _presetOptionTooltipEl.id = "presetOptionTooltip";
    document.body.appendChild(_presetOptionTooltipEl);
  }
  _presetOptionTooltipEl.textContent = desc;
  _presetOptionTooltipEl.style.display = "block";
  _presetOptionTooltipEl.style.maxWidth = "";
  _presetOptionTooltipEl.style.whiteSpace = "nowrap";
  _presetOptionTooltipEl.style.left = "-9999px";
  _presetOptionTooltipEl.style.top = "-9999px";
  var rect = btn.getBoundingClientRect();
  var naturalW = _presetOptionTooltipEl.offsetWidth;
  var leftPos = rect.right + 10;
  var maxAvail = window.innerWidth - leftPos - 10;
  if (naturalW > maxAvail) {
    var clamped = Math.max(maxAvail, 120);
    _presetOptionTooltipEl.style.maxWidth = clamped + "px";
    _presetOptionTooltipEl.style.whiteSpace = "normal";
  }
  _presetOptionTooltipEl.style.left = leftPos + "px";
  _presetOptionTooltipEl.style.top = (rect.top + rect.height / 2) + "px";
}
function hidePresetOptionTooltip() {
  if (_presetOptionTooltipEl) _presetOptionTooltipEl.style.display = "none";
}

const escapeHtml = (value) =>
  value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character]);

const normalize = (value) => value.toLocaleLowerCase().replace(/\s+/g, " ").trim();
const dataUrl = (path) => {
  const url = new URL(`data/${path}`, document.baseURI);
  if (typeof window.__BUILD_HASH__ !== "undefined" && location.protocol !== "file:") {
    url.searchParams.set("v", window.__BUILD_HASH__);
  }
  return url;
};
const localData = globalThis.__SSL_MANUAL_DATA__ ??= { pages: {} };

function loadDataScript(path) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = dataUrl(path.replace(/\.json$/, ".js"));
    script.onload = () => {
      script.remove();
      resolve();
    };
    script.onerror = () => {
      script.remove();
      reject(new Error(`本地数据文件载入失败：${path}`));
    };
    document.head.append(script);
  });
}

async function loadData(path, readLocalValue) {
  if (location.protocol === "file:") {
    await loadDataScript(path);
    const value = readLocalValue();
    if (value === undefined) throw new Error(`本地数据文件内容无效：${path}`);
    return value;
  }
  const response = await fetch(dataUrl(path));
  if (!response.ok) throw new Error(`${path} HTTP ${response.status}`);
  return response.json();
}

function pageRoute(pageId, headingId = "") {
  return `#/page/${encodeURIComponent(pageId)}${headingId ? `/${encodeURIComponent(headingId)}` : ""}`;
}

function getRoute() {
  const match = location.hash.match(/^#\/page\/([^/]+)(?:\/(.+))?$/);
  return {
    pageId: decodeURIComponent(match?.[1] || state.catalog?.pages[0]?.id || ""),
    headingId: match?.[2] ? decodeURIComponent(match[2]) : "",
  };
}

async function loadSearchIndex() {
  var target = state.searchEn ? "en" : "zh";
  if (target === "zh" && state.searchIndexZh) return;
  if (target === "en" && state.searchIndexEn) return;
  elements.searchSummary.textContent = "正在载入全文索引…";
  if (target === "en") {
    state.searchIndexEn = await loadData("search-index-en.json", function () { return localData.searchIndexEn; });
  } else {
    state.searchIndexZh = await loadData("search-index-zh.json", function () { return localData.searchIndexZh; });
  }
}

async function loadPage(pageId) {
  if (!state.pageCache.has(pageId)) {
    const request = loadData(
      `pages/${encodeURIComponent(pageId)}.json`,
      () => localData.pages[pageId],
    );
    state.pageCache.set(pageId, request);
  }
  return state.pageCache.get(pageId);
}

function syncSearchToggleVisibility() {
  var shouldShow = Boolean(state.query.trim()) || elements.searchPanel.matches(":focus-within");
  elements.searchToggle.style.display = shouldShow ? "flex" : "none";
}

function visiblePageIds() {
  return new Set(state.catalog.pages.map(function (page) { return page.id; }));
}

function extractExcerpt(text, query, contextChars) {
  contextChars = contextChars || 40;
  var idx = normalize(text).indexOf(normalize(query));
  if (idx < 0) {
    return text.slice(0, contextChars * 2);
  }
  var start = Math.max(0, idx - contextChars);
  var end = Math.min(text.length, idx + query.length + contextChars);
  var excerpt = text.slice(start, end);
  if (start > 0) excerpt = "…" + excerpt;
  if (end < text.length) excerpt = excerpt + "…";
  return excerpt;
}

function highlightMatches(text, query) {
  var escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp("(" + escaped + ")", "gi"), "<mark>$1</mark>");
}

function findSearchResults(query) {
  var q = normalize(query);
  if (!q) return [];
  var idx = state.searchEn ? state.searchIndexEn : state.searchIndexZh;
  if (!idx) return [];
  var results = [];
  idx.forEach(function (record) {
    if (!normalize(record.text).includes(q)) return;
    var page = state.catalog.pages.find(function (p) { return p.id === record.id; });
    if (!page) return;
    record.blocks.forEach(function (block) {
      if (!normalize(block.text).includes(q)) return;
      results.push({
        pageId: record.id,
        pageTitle: record.title,
        heading: block.heading,
        headingId: block.headingId,
        excerpt: highlightMatches(extractExcerpt(block.text, query), query),
      });
    });
  });
  results.sort(function (a, b) {
    var aInHeading = a.heading && normalize(a.heading).includes(normalize(query));
    var bInHeading = b.heading && normalize(b.heading).includes(normalize(query));
    if (aInHeading && !bInHeading) return -1;
    if (!aInHeading && bInHeading) return 1;
    return 0;
  });
  return results.slice(0, 12);
}

function renderSearchResultsInNav() {
  var results = findSearchResults(state.query.trim());
  elements.searchSummary.textContent = results.length
    ? "找到 " + results.length + " 个匹配结果"
    : "没有找到匹配的主题";
  if (!results.length) {
    elements.manualNav.innerHTML = '<div class="nav-empty">没有匹配结果</div>';
    return;
  }
  elements.manualNav.innerHTML = results.map(function (r) {
    var headingLine = r.heading
      ? '<span class="result-heading">' + escapeHtml(r.heading) + '</span>'
      : '';
    return (
      '<button class="search-result" type="button" data-page-id="' + escapeHtml(r.pageId) +
      '" data-heading-id="' + escapeHtml(r.headingId) + '">' +
      '<span class="result-title">' + escapeHtml(r.pageTitle) + '</span>' +
      headingLine +
      '<span class="result-excerpt">' + r.excerpt + '</span>' +
      '</button>'
    );
  }).join("");
  elements.manualNav.querySelectorAll(".search-result").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var hash = pageRoute(btn.dataset.pageId, btn.dataset.headingId);
      var targetLanguage = state.searchEn ? "en" : "zh";
      if (state.language !== targetLanguage) {
        state.language = targetLanguage;
      }
      if (hash === location.hash) {
        if (state.currentPage) {
          renderPage(state.currentPage, btn.dataset.headingId || "");
        }
        highlightPageContent(state.query.trim());
        requestAnimationFrame(function () {
          ensureSearchHighlightVisible(btn.dataset.headingId);
        });
      } else {
        location.hash = hash;
      }
    });
  });
}

function highlightPageContent(query) {
  if (!query) return;
  var content = elements.document.querySelector(".manual-content");
  if (!content) return;
  content.querySelectorAll(".search-highlight").forEach(function (el) {
    el.replaceWith(el.textContent);
  });
  var walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT, null);
  var textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);
  var escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  var regex = new RegExp("(" + escaped + ")", "gi");
  textNodes.forEach(function (node) {
    var text = node.textContent;
    if (!regex.test(text)) return;
    regex.lastIndex = 0;
    var fragment = document.createDocumentFragment();
    var lastIndex = 0;
    var match;
    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
      }
      var mark = document.createElement("mark");
      mark.className = "search-highlight";
      mark.textContent = match[0];
      fragment.appendChild(mark);
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
    }
    node.replaceWith(fragment);
  });
}

function ensureSearchHighlightVisible(headingId) {
  var highlights = elements.document.querySelectorAll(".search-highlight");
  if (!highlights.length) return;
  var target = highlights[0];
  if (headingId) {
    var heading = document.getElementById(headingId);
    if (heading) {
      var headingTop = heading.getBoundingClientRect().top;
      for (var i = 0; i < highlights.length; i++) {
        var hlBottom = highlights[i].getBoundingClientRect().bottom;
        if (hlBottom >= headingTop - 60) {
          target = highlights[i];
          break;
        }
      }
    }
  }
  var rect = target.getBoundingClientRect();
  var viewportHeight = window.innerHeight;
  if (rect.bottom > viewportHeight || rect.top < 0) {
    target.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function groupKey(sectionId, groupId) {
  return `${sectionId}::${groupId}`;
}

function expandAllNavigation() {
  for (const section of state.catalog.sections) {
    state.expandedSections.add(section.id);
    for (const group of section.groups ?? []) {
      state.expandedGroups.add(groupKey(section.id, group.id));
    }
  }
}

function ensureActiveNavigationExpanded() {
  const page = state.currentPage;
  if (!page) return;
  state.expandedSections.add(page.section);
  const section = state.catalog.sections.find((candidate) => candidate.id === page.section);
  const group = section?.groups?.find((candidate) => candidate.pageIds.includes(page.id));
  if (group) state.expandedGroups.add(groupKey(section.id, group.id));
}

function renderNavLink(page, nested = false) {
  return `
    <button class="nav-link ${nested ? "nested" : ""} ${page.id === state.currentPage?.id ? "active" : ""}"
      type="button" data-page-id="${escapeHtml(page.id)}">
      <span class="number">${String(page.order).padStart(2, "0")}</span>
      <span class="title">${escapeHtml(page.titleZh)}</span>
      <span class="state"></span>
    </button>
  `;
}

function renderSectionItems(section, pages, forceExpanded) {
  const pageById = new Map(pages.map((page) => [page.id, page]));
  const groupByPageId = new Map();
  for (const group of section.groups ?? []) {
    for (const pageId of group.pageIds) groupByPageId.set(pageId, group);
  }

  const renderedGroups = new Set();
  return pages.map((page) => {
    const group = groupByPageId.get(page.id);
    if (!group) return renderNavLink(page);
    if (renderedGroups.has(group.id)) return "";
    renderedGroups.add(group.id);

    const groupedPages = group.pageIds.map((pageId) => pageById.get(pageId)).filter(Boolean);
    if (!groupedPages.length) return "";
    const key = groupKey(section.id, group.id);
    const expanded = forceExpanded || state.expandedGroups.has(key);
    return `
      <div class="nav-group">
        <button class="nav-group-toggle" type="button" data-group-key="${escapeHtml(key)}"
          aria-expanded="${expanded}">
          <span class="nav-caret" aria-hidden="true"></span>
          <span>${escapeHtml(group.titleZh)}</span>
          <small>${groupedPages.length}</small>
        </button>
        <div class="nav-group-pages" ${expanded ? "" : "hidden"}>
          ${groupedPages.map((groupedPage) => renderNavLink(groupedPage, true)).join("")}
        </div>
      </div>
    `;
  }).join("");
}

function scrollActiveNavigationIntoView() {
  const active = elements.manualNav.querySelector(".nav-link.active");
  if (!active) return;
  requestAnimationFrame(() => {
    const navRect = elements.manualNav.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    const activeTop = elements.manualNav.scrollTop + activeRect.top - navRect.top;
    const targetTop = activeTop - ((elements.manualNav.clientHeight - activeRect.height) / 2);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    elements.manualNav.scrollTo({
      top: Math.max(0, targetTop),
      behavior: reduceMotion ? "instant" : "smooth",
    });
  });
}

function renderNavigation(focusActive) {
  focusActive = focusActive || false;
  if (state.query.trim() && (state.searchIndexZh || state.searchIndexEn)) {
    renderSearchResultsInNav();
    if (focusActive) scrollActiveNavigationIntoView();
    return;
  }
  const ids = visiblePageIds();
  const forceExpanded = Boolean(state.query);
  elements.manualNav.innerHTML = state.catalog.sections.map((section) => {
    const pages = state.catalog.pages.filter((page) => page.section === section.id && ids.has(page.id));
    if (!pages.length) return "";
    const expanded = forceExpanded || state.expandedSections.has(section.id);
    return `
      <section class="nav-section">
        <button class="nav-section-title" type="button" data-section-id="${escapeHtml(section.id)}"
          aria-expanded="${expanded}">
          <span class="nav-caret" aria-hidden="true"></span>
          <span>${escapeHtml(section.titleZh)}</span>
          <small>${pages.length}</small>
        </button>
        <div class="nav-section-pages" ${expanded ? "" : "hidden"}>
          ${renderSectionItems(section, pages, forceExpanded)}
        </div>
      </section>
    `;
  }).join("");

  elements.searchSummary.textContent = state.query
    ? `找到 ${ids.size} 个相关主题`
    : "可搜索中英文标题与正文";
  elements.manualNav.querySelectorAll("[data-page-id]").forEach((button) => {
    button.addEventListener("click", () => {
      location.hash = pageRoute(button.dataset.pageId);
      closeMobilePanels();
    });
  });
  elements.manualNav.querySelectorAll("[data-section-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const sectionId = button.dataset.sectionId;
      if (state.expandedSections.has(sectionId)) state.expandedSections.delete(sectionId);
      else state.expandedSections.add(sectionId);
      renderNavigation();
    });
  });
  elements.manualNav.querySelectorAll("[data-group-key]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.groupKey;
      if (state.expandedGroups.has(key)) state.expandedGroups.delete(key);
      else state.expandedGroups.add(key);
      renderNavigation();
    });
  });
  if (focusActive) scrollActiveNavigationIntoView();
}

function renderOutline(page) {
  elements.outline.innerHTML = page.headings
    .filter((heading) => heading.title)
    .map((heading) => `
      <a class="level-${heading.level}" href="${pageRoute(page.id, heading.id)}">
        ${escapeHtml(heading.title)}
      </a>
    `).join("");
}

function configurePageButton(button, page, label) {
  button.disabled = !page;
  button.querySelector("span").textContent = label;
  button.querySelector("strong").textContent = page?.titleZh || "—";
  button.onclick = page ? () => { location.hash = pageRoute(page.id); } : null;
}

function configurePageLinks() {
  const pageBySourceFile = new Map(
    state.catalog.pages.map((page) => [new URL(page.sourceUrl).pathname.split("/").pop(), page]),
  );
  elements.document.querySelectorAll(".manual-content a[href]").forEach((link) => {
    const reference = link.getAttribute("href");
    if (reference.startsWith("#/page/")) {
      link.removeAttribute("target");
      link.removeAttribute("rel");
      return;
    }
    let url;
    try {
      url = new URL(reference, state.currentPage.sourceUrl);
    } catch {
      return;
    }
    const targetPage = pageBySourceFile.get(url.pathname.split("/").pop());
    if (url.hostname === "livehelp.solidstatelogic.com" && targetPage) {
      link.href = pageRoute(targetPage.id, url.hash.replace(/^#/, ""));
      link.removeAttribute("target");
    } else if (url.protocol.startsWith("http")) {
      link.target = "_blank";
      link.rel = "noreferrer";
    }
  });
  elements.document.querySelectorAll(".manual-content details a, .manual-content details [id]").forEach((element) => {
    if (!element.id) return;
    element.closest("details")?.setAttribute("data-anchor-container", element.id);
  });
}

function renderStandalonePage(page, headingId = "", skipScroll = false) {
  state.currentPage = page;
  elements.breadcrumbs.innerHTML = escapeHtml(page.titleZh);
  elements.pageCounter.textContent = "";
  elements.document.innerHTML = `
    <header class="document-header">
      <h1>${escapeHtml(page.titleZh)}</h1>
      <p class="english-title">${escapeHtml(page.title)}</p>
    </header>
    <div class="manual-content">${page.contentHtml}</div>
  `;
  elements.languageToggle.disabled = true;
  if (page.headings && page.headings.length > 0) {
    renderOutline(page);
  } else {
    elements.outline.innerHTML = "";
  }
  configurePageLinks();
  configurePageButton(elements.previousPage, null, "上一主题");
  configurePageButton(elements.nextPage, null, "下一主题");
  renderNavigation();
  document.title = page.titleZh + " | " + state.catalog.meta.title;
  if (!skipScroll) {
    if (headingId) {
      requestAnimationFrame(function () {
        var target = document.getElementById(headingId);
        if (target) {
          var details = target.closest("details");
          if (details) details.setAttribute("open", "");
          target.scrollIntoView();
        }
      });
    } else {
      window.scrollTo({ top: 0, behavior: "instant" });
    }
  }
}

function renderPage(page, headingId = "", skipScroll = false) {
  state.currentPage = page;
  ensureActiveNavigationExpanded();
  const index = state.catalog.pages.findIndex((candidate) => candidate.id === page.id);
  const previous = state.catalog.pages[index - 1];
  const next = state.catalog.pages[index + 1];
  elements.breadcrumbs.innerHTML =
    `<strong>${String(page.order).padStart(2, "0")}</strong> / ${escapeHtml(page.sectionZh)} / ${escapeHtml(page.titleZh)}`;
  elements.pageCounter.textContent =
    `${String(page.order).padStart(2, "0")} / ${state.catalog.meta.pageCount}`;
  elements.document.innerHTML = `
    <header class="document-header">
      <p class="eyebrow">${escapeHtml(page.sectionZh)} · CHAPTER ${String(page.order).padStart(2, "0")}</p>
      <h1>${escapeHtml(page.titleZh)}</h1>
      <p class="english-title">${escapeHtml(page.title)}</p>
      <span class="translation-badge">${
        page.translationStatus === "complete"
          ? "● 中文翻译已完成 · 可切换英文原文"
          : "△ 中文正文翻译进行中 · 当前显示完整英文原文"
      }</span>
    </header>
    <div class="manual-content">${state.language === "en" ? page.englishHtml : page.contentHtml}</div>
  `;
  elements.languageToggle.textContent = state.language === "zh" ? "中文 / EN" : "中文 / EN";
  elements.languageToggle.disabled = page.translationStatus !== "complete";
  renderOutline(page);
  configurePageLinks();
  configurePageButton(elements.previousPage, previous, "上一主题");
  configurePageButton(elements.nextPage, next, "下一主题");
  renderNavigation(true);
  document.title = `${page.titleZh} | ${state.catalog.meta.title}`;
  if (!skipScroll) {
    if (headingId) {
      requestAnimationFrame(() => {
        const target = document.getElementById(headingId);
        target?.closest("details")?.setAttribute("open", "");
        target?.scrollIntoView();
      });
    } else {
      window.scrollTo({ top: 0, behavior: "instant" });
    }
  }
  if (next) loadPage(next.id).catch(() => {});
}

async function route() {
  if (!state.catalog) return;
  const { pageId, headingId } = getRoute();
  const summary = state.catalog.pages.find((candidate) => candidate.id === pageId);
  if (!summary) {
    try {
      const page = await loadPage(pageId);
      if (page && page.standalone) {
        renderStandalonePage(page, headingId);
        return;
      }
    } catch {}
    location.replace(pageRoute(state.catalog.pages[0].id));
    return;
  }
  elements.document.setAttribute("aria-busy", "true");
  try {
    renderPage(await loadPage(pageId), headingId);
    if (state.query.trim() && (state.searchIndexZh || state.searchIndexEn)) {
      highlightPageContent(state.query.trim());
      requestAnimationFrame(function () {
        ensureSearchHighlightVisible(headingId);
      });
    }
  } catch (error) {
    elements.document.innerHTML = `<div class="error-state"><h2>章节载入失败</h2><code>${escapeHtml(error.message)}</code></div>`;
  } finally {
    elements.document.removeAttribute("aria-busy");
  }
}

function toggleSidebar() {
  const open = elements.sidebar.classList.toggle("open");
  elements.scrim.classList.toggle("open", open);
}

function closeMobilePanels() {
  elements.sidebar.classList.remove("open");
  elements.outline.classList.remove("open");
  elements.scrim.classList.remove("open");
}

async function start() {
  try {
    state.catalog = await loadData("catalog.json", () => localData.catalog);

    /* — Load themes from build data — */
    try {
      state.themes = await loadData("themes.json", () => localData.themes);
    } catch (e) {
      console.warn("Failed to load themes, using fallback:", e);
    }
    if (!state.themes || !state.themes.length) {
      state.themes = [{ id: "acid", label: "SSL 经典绿", color: "#c7ff37", default: true }];
    }
    var def = state.themes.find(function (t) { return t.default; });
    state.defaultTheme = def ? def.id : state.themes[0].id;
    state.themePreset = state.defaultTheme;

    expandAllNavigation();
    /* — Init theme from localStorage — */
    try {
      const saved = localStorage.getItem("ssl-manual-theme");
      if (saved === "dark" || saved === "light" || saved === "auto") state.theme = saved;
    } catch (_) {}
    applyTheme();
    syncThemeButton();
    initThemePreset();
    const themeMedia = window.matchMedia("(prefers-color-scheme: light)");
    themeMedia.addEventListener("change", function () {
      if (state.theme === "auto") {
        applyTheme();
        syncThemeButton();
      }
    });
    elements.databaseStatus.textContent =
      `${state.catalog.meta.pageCount} TOPICS`;
    elements.searchLabel.textContent =
      `搜索全部 ${state.catalog.meta.pageCount} 个主题`;
    renderNavigation();
    await route();
  } catch (error) {
    elements.databaseStatus.textContent = "CONTENT ERROR";
    elements.document.innerHTML = `
      <div class="error-state">
        <h2>内容库未能载入</h2>
        <p>请确认 dist 目录完整，且 index.html 与 data 目录位于同一级。</p>
        <code>${escapeHtml(error.message)}</code>
      </div>
    `;
  }
}

var searchTimer;
elements.searchInput.addEventListener("input", function (event) {
  state.query = event.target.value;
  syncSearchToggleVisibility();
  clearTimeout(searchTimer);
  if (!state.query.trim()) {
    renderNavigation();
    return;
  }
  searchTimer = setTimeout(function () {
    loadSearchIndex().then(function () {
      renderNavigation();
    }).catch(function (error) {
      elements.searchSummary.textContent = error.message;
    });
  }, 120);
});
elements.searchPanel.addEventListener("focusin", function () {
  syncSearchToggleVisibility();
});
elements.searchPanel.addEventListener("focusout", function () {
  setTimeout(syncSearchToggleVisibility, 0);
});
elements.menuButton.addEventListener("click", toggleSidebar);
elements.scrim.addEventListener("click", closeMobilePanels);
elements.outlineButton.addEventListener("click", () => elements.outline.classList.toggle("open"));
document.addEventListener("click", (event) => {
  if (!elements.outline.classList.contains("open")) return;
  if (elements.outline.contains(event.target) || elements.outlineButton.contains(event.target)) return;
  elements.outline.classList.remove("open");
});

document.addEventListener("click", function (event) {
  var dd = elements.presetDropdown;
  if (!dd || !dd.classList.contains("open")) return;
  if (dd.contains(event.target) || elements.presetToggle.contains(event.target)) return;
  dd.classList.remove("open");
  hidePresetOptionTooltip();
});

elements.searchEnToggle.addEventListener("change", function () {
    state.searchEn = this.checked;
    if (state.query.trim()) {
      clearTimeout(searchTimer);
      loadSearchIndex().then(function () {
        renderNavigation();
      }).catch(function (error) {
        elements.searchSummary.textContent = error.message;
      });
    }
  });
  elements.themeToggle.addEventListener("pointerdown", handleThemePress);
  elements.themeToggle.addEventListener("pointerup", handleThemeRelease);
  elements.themeToggle.addEventListener("pointercancel", handleThemeCancel);
  elements.themeToggle.addEventListener("pointerleave", handleThemeCancel);
  elements.presetToggle.addEventListener("click", togglePresetDropdown);
  elements.languageToggle.addEventListener("click", () => {
    if (state.currentPage?.translationStatus !== "complete") return;

    /* Find heading by index (IDs differ between zh/en pages) */
    let targetIdx = -1;
    const vpHeight = window.innerHeight;
    const headings = document.querySelectorAll(
      ".manual-content h1[id], .manual-content h2[id], .manual-content h3[id]," +
      ".manual-content h4[id], .manual-content h5[id], .manual-content h6[id]",
    );
    /* First pass: headings whose top edge is in the viewport */
    let minDist = Infinity;
    headings.forEach((el, i) => {
      /* Skip headings inside closed <details> — their getBoundingClientRect
         returns top=0 and would wrongly beat visible headings */
      if (el.closest("details")?.open === false) return;
      const rect = el.getBoundingClientRect();
      if (rect.top >= 0 && rect.top < vpHeight && rect.top < minDist) {
        minDist = rect.top;
        targetIdx = i;
      }
    });
    /* Second pass: no heading in viewport — pick the nearest heading
       that has been scrolled just above the viewport */
    if (targetIdx === -1) {
      /* No heading in viewport — find the nearest heading above,
         even if it is fully scrolled out of view */
      let closestAbove = -Infinity;
      headings.forEach((el, i) => {
        if (el.closest("details")?.open === false) return;
        const rect = el.getBoundingClientRect();
        if (rect.top < 0 && rect.top > closestAbove) {
          closestAbove = rect.top;
          targetIdx = i;
        }
      });
    }

    state.language = state.language === "zh" ? "en" : "zh";
    if (state.currentPage?.standalone) {
      renderStandalonePage(state.currentPage, "", true);
    } else {
      renderPage(state.currentPage, "", true);
    }
    if (state.query.trim() && (state.searchIndexZh || state.searchIndexEn)) {
      setTimeout(function () { highlightPageContent(state.query.trim()); }, 0);
    }

    /* Scroll directly to heading by index — renderPage skips its own scroll */
    if (targetIdx >= 0) {
      requestAnimationFrame(() => {
        const found = document.querySelectorAll(
          ".manual-content h1[id], .manual-content h2[id], .manual-content h3[id]," +
          ".manual-content h4[id], .manual-content h5[id], .manual-content h6[id]",
        );
        const target = found[targetIdx];
        if (target) {
          target.closest("details")?.setAttribute("open", "");
          target.scrollIntoView();
        }
      });
    }
  })
window.addEventListener("hashchange", function () { route(); });
window.addEventListener("keydown", (event) => {
  if (event.key === "/" && document.activeElement !== elements.searchInput) {
    event.preventDefault();
    elements.searchInput.focus();
  }
  if (event.key === "Escape") { closeMobilePanels(); }
});

syncSearchToggleVisibility();
start();
