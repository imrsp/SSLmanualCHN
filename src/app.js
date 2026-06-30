 const state = {
   catalog: null,
   searchIndexZh: null,
   searchIndexEn: null,
   searchEn: false,
   pageCache: new Map(),
   currentPage: null,
   query: "",
   searchShowCount: 12,
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
  installButton: document.querySelector("#installButton"),
  sidebar: document.querySelector("#sidebar"),
  menuButton: document.querySelector("#menuButton"),
  outlineButton: document.querySelector("#outlineButton"),
  scrim: document.querySelector("#scrim"),

};
let deferredInstallPrompt = null;
let routeRequestId = 0;
let lastLocationRouteHash = "";
let languageTransitionTimer = null;

/* — Theme management — */
function getEffectiveTheme() {
  if (state.theme === "dark") return "dark";
  if (state.theme === "light") return "light";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function syncThemeColor() {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  const effective = getEffectiveTheme();
  if (document.documentElement.classList.contains("sidebar-open")) {
    meta.content = effective === "dark" ? "#121613" : "#f0f1ef";
  } else {
    meta.content = effective === "dark" ? "#111513" : "#f5f6f3";
  }
}

function applyTheme() {
  const effective = getEffectiveTheme();
  document.documentElement.setAttribute("data-theme", effective);
  syncThemeColor();
}

function setSidebarChrome(open) {
  const active = open && mobileSidebarMql.matches;
  document.documentElement.classList.toggle("sidebar-open", active);
  document.body.classList.toggle("sidebar-open", active);
  syncThemeColor();
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

function isValidCssColor(value) {
  return typeof value === "string"
    && value.trim()
    && typeof CSS !== "undefined"
    && CSS.supports("color", value.trim());
}

function buildPresetDropdown() {
  var themes = state.themes || [];
  if (!elements.presetItems) return;
  elements.presetItems.textContent = "";
  for (var i = 0; i < themes.length; i++) {
    var t = themes[i];
    var button = document.createElement("button");
    button.type = "button";
    button.setAttribute("role", "menuitem");
    button.className = "preset-option" + (t.id === state.themePreset ? " active" : "");
    button.dataset.preset = t.id;
    button.dataset.description = t.description || "";

    var indicator = document.createElement("span");
    indicator.className = "preset-indicator";
    var colorValue = isValidCssColor(t.color) ? t.color.trim() : "var(--acid)";
    indicator.style.backgroundColor = colorValue;

    var label = document.createElement("span");
    label.textContent = t.label || "";

    button.append(indicator, label);
    elements.presetItems.appendChild(button);
  }
}

function togglePresetDropdown() {
  var dd = elements.presetDropdown;
  if (!dd) return;
  var open = !dd.classList.contains("open");
  setPresetDropdownOpen(open);
  if (!open) {
    hidePresetOptionTooltip();
  }
}

function setPresetDropdownOpen(open) {
  var dd = elements.presetDropdown;
  if (!dd) return;
  dd.classList.toggle("open", open);
  elements.presetToggle?.parentElement?.classList.toggle("preset-dropdown-open", open);
}

function selectThemePreset(id) {
  state.themePreset = id;
  try { localStorage.setItem("ssl-manual-preset", id); } catch (_) {}
  loadThemeCSS(id);
  buildPresetDropdown();
  setPresetDropdownOpen(false);
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

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const normalize = (value) => value.toLocaleLowerCase().replace(/\s+/g, " ").trim();
const contentHeadingSelector = [
  ".manual-content h1[id]",
  ".manual-content h2[id]",
  ".manual-content h3[id]",
  ".manual-content h4[id]",
  ".manual-content h5[id]",
  ".manual-content h6[id]",
].join(", ");
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

function updateInstallButtonVisibility() {
  if (!elements.installButton) return;
  const installed = isStandalonePwa();
  elements.installButton.hidden = !deferredInstallPrompt || installed;
}

function isStandalonePwa() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    window.navigator.standalone === true
  );
}

var mobileSidebarMql = window.matchMedia("(max-width: 760px)");
var compactOutlineMql = window.matchMedia("(max-width: 980px)");
var mobileBackgroundScrollLocked = false;
var outlineScrollTrapActive = false;
var sidebarTouchStartY = 0;
var outlineTouchStartY = 0;

function preventBackgroundTouchMove(event) {
  if (!elements.sidebar.classList.contains("open")) return;
  if (canSidebarHandleScroll(event)) return;
  event.preventDefault();
}

function canSidebarHandleScroll(event) {
  if (!elements.sidebar.contains(event.target)) return false;
  var scrollArea = event.target.closest?.("#manualNav");
  if (!scrollArea) return false;
  var maxScrollTop = scrollArea.scrollHeight - scrollArea.clientHeight;
  if (maxScrollTop <= 0) return false;

  var deltaY = 0;
  if (event.type === "wheel") {
    deltaY = event.deltaY;
  } else if (event.type === "touchmove") {
    var touch = event.touches[0];
    if (!touch) return false;
    deltaY = sidebarTouchStartY - touch.clientY;
  }

  if (deltaY < 0) return scrollArea.scrollTop > 0;
  if (deltaY > 0) return scrollArea.scrollTop < maxScrollTop;
  return true;
}

function handleSidebarTouchStart(event) {
  sidebarTouchStartY = event.touches[0]?.clientY || 0;
}

function outlineCanScrollBy(deltaY) {
  if (!elements.outline || !elements.outline.classList.contains("open")) return false;
  var maxScrollTop = elements.outline.scrollHeight - elements.outline.clientHeight;
  if (maxScrollTop <= 0) return false;
  if (deltaY < 0) return elements.outline.scrollTop > 0;
  if (deltaY > 0) return elements.outline.scrollTop < maxScrollTop;
  return false;
}

function preventOutlineScrollChain(event) {
  if (!elements.outline.classList.contains("open")) return;
  var deltaY = 0;
  if (event.type === "wheel") {
    deltaY = event.deltaY;
  } else if (event.type === "touchmove") {
    var touch = event.touches[0];
    if (!touch) return;
    deltaY = outlineTouchStartY - touch.clientY;
  }
  if (outlineCanScrollBy(deltaY)) return;
  event.preventDefault();
}

function handleOutlineTouchStart(event) {
  outlineTouchStartY = event.touches[0]?.clientY || 0;
}

function setMobileBackgroundScrollLock(locked) {
  if (locked === mobileBackgroundScrollLocked) return;
  mobileBackgroundScrollLocked = locked;
  const method = locked ? "addEventListener" : "removeEventListener";
  document[method]("touchstart", handleSidebarTouchStart, { passive: true });
  document[method]("touchmove", preventBackgroundTouchMove, { passive: false });
  document[method]("wheel", preventBackgroundTouchMove, { passive: false });
}

function setOutlineScrollTrap(active) {
  if (active === outlineScrollTrapActive) return;
  outlineScrollTrapActive = active;
  const method = active ? "addEventListener" : "removeEventListener";
  elements.outline[method]("wheel", preventOutlineScrollChain, { passive: false });
  elements.outline[method]("touchstart", handleOutlineTouchStart, { passive: true });
  elements.outline[method]("touchmove", preventOutlineScrollChain, { passive: false });
}

function syncOutlineScrollTrap() {
  setOutlineScrollTrap(compactOutlineMql.matches && elements.outline.classList.contains("open"));
}

function lockMobileScroll() {
  if (!mobileSidebarMql.matches) return;
  setSidebarChrome(true);
  setMobileBackgroundScrollLock(true);
}

function unlockMobileScroll() {
  setSidebarChrome(false);
  setMobileBackgroundScrollLock(false);
}

mobileSidebarMql.addEventListener("change", function (event) {
  if (!event.matches) closeMobilePanels();
});

compactOutlineMql.addEventListener("change", syncOutlineScrollTrap);

window.addEventListener("beforeinstallprompt", function (event) {
  event.preventDefault();
  deferredInstallPrompt = event;
  updateInstallButtonVisibility();
});

window.addEventListener("appinstalled", function () {
  deferredInstallPrompt = null;
  updateInstallButtonVisibility();
});

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
  try {
    await navigator.serviceWorker.register("./sw.js", {
      scope: "./",
      updateViaCache: "none",
    });
  } catch (error) {
    console.warn("Service worker registration failed:", error);
  }
}

function pageRoute(pageId, headingId = "") {
  return `#/page/${encodeURIComponent(pageId)}${headingId ? `/${encodeURIComponent(headingId)}` : ""}`;
}

function navigateToPage(pageId, headingId = "", options = {}) {
  if (options.language && state.language !== options.language) {
    state.language = options.language;
  }
  const hash = pageRoute(pageId, headingId);
  const sameRoute = hash === location.hash;
  if (sameRoute && options.source !== "search") return;
  if (hash !== location.hash) {
    history.pushState(null, "", hash);
  }
  lastLocationRouteHash = hash;
  route({
    pageId,
    headingId,
    source: options.source || "navigation",
  });
}

function getRoute() {
  const match = location.hash.match(/^#\/page\/([^/]+)(?:\/(.+))?$/);
  return {
    pageId: decodeURIComponent(match?.[1] || state.catalog?.pages[0]?.id || ""),
    headingId: match?.[2] ? decodeURIComponent(match[2]) : "",
  };
}

function routeFromLocation() {
  if (location.hash === lastLocationRouteHash) return;
  lastLocationRouteHash = location.hash;
  route();
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
    ).catch((error) => {
      state.pageCache.delete(pageId);
      throw error;
    });
    state.pageCache.set(pageId, request);
  }
  return state.pageCache.get(pageId);
}

function syncSearchToggleVisibility() {
  var shouldShow = Boolean(state.query.trim()) || elements.searchPanel.matches(":focus-within");
  elements.searchToggle.style.display = shouldShow ? "flex" : "none";
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
  var safeText = escapeHtml(text);
  var safeQuery = escapeHtml(query);
  var escaped = escapeRegExp(safeQuery);
  return safeText.replace(new RegExp("(" + escaped + ")", "gi"), "<mark>$1</mark>");
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
  return results;
}

function renderSearchResultsInNav() {
  var results = findSearchResults(state.query.trim());
  var total = results.length;
  elements.searchSummary.textContent = total
    ? "找到 " + total + " 个匹配结果"
    : "没有找到匹配的主题";
  if (!total) {
    elements.manualNav.innerHTML = '<div class="nav-empty">没有匹配结果</div>';
    return;
  }
  var showCount = Math.min(state.searchShowCount, total);
  var visibleResults = results.slice(0, showCount);
  var html = visibleResults.map(function (r) {
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
  if (showCount < total) {
    html += '<button class="search-load-more" type="button">加载更多（' + (total - showCount) + '）</button>';
  }
  elements.manualNav.innerHTML = html;
  elements.manualNav.querySelectorAll(".search-result").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var targetLanguage = state.searchEn ? "en" : "zh";
      navigateToPage(btn.dataset.pageId, btn.dataset.headingId || "", {
        language: targetLanguage,
        source: "search",
      });
    });
  });
  var loadMoreBtn = elements.manualNav.querySelector(".search-load-more");
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener("click", function () {
      state.searchShowCount += 20;
      renderSearchResultsInNav();
    });
  }
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
  var escaped = escapeRegExp(query);
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

function ensureSearchHighlightVisible(headingId, forceScroll = false) {
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
  if (forceScroll || rect.bottom > viewportHeight || rect.top < 0) {
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
  const forceExpanded = Boolean(state.query);
  elements.manualNav.innerHTML = state.catalog.sections.map((section) => {
    const pages = state.catalog.pages.filter((page) => page.section === section.id);
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
    ? "正在准备搜索结果…"
    : "可搜索中英文标题与正文";
  elements.manualNav.querySelectorAll("[data-page-id]").forEach((button) => {
    button.addEventListener("click", () => {
      navigateToPage(button.dataset.pageId);
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
  var headings = getPageHeadings(page, state.language);
  elements.outline.innerHTML = headings
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
  button.onclick = page ? () => { navigateToPage(page.id); } : null;
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
}

function getReadableScrollRatio() {
  var maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  return maxScroll ? window.scrollY / maxScroll : 0;
}

function getPageHeadings(page, language) {
  if (!page) return [];
  return language === "en" ? (page.englishHeadings || page.headings) : page.headings;
}

function getContentHeadings() {
  return Array.from(document.querySelectorAll(contentHeadingSelector))
    .filter((heading) => heading.closest("details")?.open !== false);
}

function getContentDisclosureStates() {
  return Array.from(elements.document.querySelectorAll(".manual-content details"))
    .map((details) => details.open);
}

function restoreContentDisclosureStates(states) {
  if (!states?.length) return;
  elements.document.querySelectorAll(".manual-content details").forEach((details, index) => {
    if (typeof states[index] === "boolean") details.open = states[index];
  });
}

function getVisibleHeadingAnchor() {
  var headings = getContentHeadings();
  var minVisibleTop = Infinity;
  var best = null;
  var bestTop = 0;

  headings.forEach((heading) => {
    var top = heading.getBoundingClientRect().top;
    if (top >= 0 && top < window.innerHeight && top < minVisibleTop) {
      minVisibleTop = top;
      best = heading;
      bestTop = top;
    }
  });
  if (best) return { id: best.id, top: bestTop };

  var closestAbove = -Infinity;
  headings.forEach((heading) => {
    var top = heading.getBoundingClientRect().top;
    if (top < 0 && top > closestAbove) {
      closestAbove = top;
      best = heading;
      bestTop = top;
    }
  });
  return best ? { id: best.id, top: bestTop } : null;
}

function getMappedHeadingIndex(page, headingId, fromLanguage, toLanguage) {
  var sourceHeadings = getPageHeadings(page, fromLanguage);
  var targetHeadings = getPageHeadings(page, toLanguage);
  var index = sourceHeadings.findIndex(function (heading) { return heading.id === headingId; });
  if (index < 0) return -1;

  var sourceHeading = sourceHeadings[index];
  var targetHeading = targetHeadings[index];
  if (!targetHeading) return -1;
  if (sourceHeadings.length !== targetHeadings.length) return -1;
  if (sourceHeading.level !== targetHeading.level) return -1;
  return index;
}

function restoreScrollByRatio(scrollRatio) {
  var maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  jumpToScrollTop(Math.round(maxScroll * scrollRatio));
}

function jumpToScrollTop(top) {
  var root = document.documentElement;
  var previousScrollBehavior = root.style.scrollBehavior;
  root.style.scrollBehavior = "auto";
  window.scrollTo(0, top);
  root.style.scrollBehavior = previousScrollBehavior;
}

function scrollTargetToPreferredTop(target, preferredTop) {
  if (!document.body.contains(target)) return;
  var targetTop = target.getBoundingClientRect().top;
  var maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  var nextTop = Math.min(Math.max(0, window.scrollY + targetTop - preferredTop), maxScroll);
  jumpToScrollTop(Math.round(nextTop));
}

function scrollToHeadingIndex(index, fallbackRatio, preferredTop = null) {
  requestAnimationFrame(() => {
    var headings = getPageHeadings(state.currentPage, state.language);
    var targetId = headings[index]?.id;
    if (!targetId) {
      restoreScrollByRatio(fallbackRatio);
      return;
    }
    var target = document.getElementById(targetId);
    if (!target) {
      restoreScrollByRatio(fallbackRatio);
      return;
    }
    target.closest("details")?.setAttribute("open", "");
    if (Number.isFinite(preferredTop)) {
      scrollTargetToPreferredTop(target, preferredTop);
      requestAnimationFrame(function () { scrollTargetToPreferredTop(target, preferredTop); });
      setTimeout(function () { scrollTargetToPreferredTop(target, preferredTop); }, 120);
      return;
    }
    target.scrollIntoView();
  });
}

function scrollToPagePosition(headingId = "", skipScroll = false) {
  if (skipScroll) return;
  if (headingId) {
    requestAnimationFrame(function () {
      var target = document.getElementById(headingId);
      if (!target) return;
      target.closest("details")?.setAttribute("open", "");
      target.scrollIntoView();
    });
    return;
  }
  window.scrollTo({ top: 0, behavior: "instant" });
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
  scrollToPagePosition(headingId, skipScroll);
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
          ? '<span class="translation-badge-dot">●</span> 中文翻译已完成 · 可切换英文原文'
          : '<span class="translation-badge-dot">△</span> 中文正文翻译进行中 · 当前显示完整英文原文'
     }</span>
    </header>
    <div class="manual-content">${state.language === "en" ? page.englishHtml : page.contentHtml}</div>
  `;
  elements.languageToggle.textContent = "中文 / EN";
  elements.languageToggle.disabled = page.translationStatus !== "complete";
  renderOutline(page);
  configurePageLinks();
  configurePageButton(elements.previousPage, previous, "上一主题");
  configurePageButton(elements.nextPage, next, "下一主题");
  renderNavigation(true);
  document.title = `${page.titleZh} | ${state.catalog.meta.title}`;
  scrollToPagePosition(headingId, skipScroll);
  if (next) loadPage(next.id).catch(() => {});
}

async function route(routeOptions = null) {
  if (!state.catalog) return;
  const requestId = ++routeRequestId;
  const { pageId, headingId } = routeOptions || getRoute();
  const isSearchNavigation = routeOptions?.source === "search";
  const summary = state.catalog.pages.find((candidate) => candidate.id === pageId);
  if (!summary) {
    try {
      const page = await loadPage(pageId);
      if (requestId !== routeRequestId) return;
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
    const page = await loadPage(pageId);
    if (requestId !== routeRequestId) return;
    renderPage(page, isSearchNavigation ? "" : headingId, isSearchNavigation);
    if (state.query.trim() && (state.searchIndexZh || state.searchIndexEn)) {
      highlightPageContent(state.query.trim());
      requestAnimationFrame(function () {
        if (requestId !== routeRequestId) return;
        ensureSearchHighlightVisible(headingId, isSearchNavigation);
      });
    }
  } catch (error) {
    if (requestId !== routeRequestId) return;
    elements.document.innerHTML = `<div class="error-state"><h2>章节载入失败</h2><code>${escapeHtml(error.message)}</code></div>`;
  } finally {
    if (requestId === routeRequestId) {
      elements.document.removeAttribute("aria-busy");
    }
  }
}

function toggleSidebar() {
  const open = elements.sidebar.classList.toggle("open");
  elements.scrim.classList.toggle("open", open);
  if (open) {
    lockMobileScroll();
  } else {
    unlockMobileScroll();
  }
}

function closeMobilePanels() {
  elements.sidebar.classList.remove("open");
  elements.outline.classList.remove("open");
  elements.scrim.classList.remove("open");
  setOutlineScrollTrap(false);
  unlockMobileScroll();
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
    updateInstallButtonVisibility();
    registerServiceWorker();
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
  state.searchShowCount = 12;
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
elements.outlineButton.addEventListener("click", () => {
  const open = elements.outline.classList.toggle("open");
  syncOutlineScrollTrap();
});
elements.installButton.addEventListener("click", async function () {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  try {
    await deferredInstallPrompt.userChoice;
  } finally {
    deferredInstallPrompt = null;
    updateInstallButtonVisibility();
  }
});
document.addEventListener("click", (event) => {
  if (!elements.outline.classList.contains("open")) return;
  if (elements.outline.contains(event.target) || elements.outlineButton.contains(event.target)) return;
  elements.outline.classList.remove("open");
  syncOutlineScrollTrap();
});

document.addEventListener("click", function (event) {
  var dd = elements.presetDropdown;
  if (!dd || !dd.classList.contains("open")) return;
  if (dd.contains(event.target) || elements.presetToggle.contains(event.target)) return;
  setPresetDropdownOpen(false);
  hidePresetOptionTooltip();
});

elements.presetItems?.addEventListener("click", function (event) {
  var btn = event.target.closest(".preset-option");
  if (!btn) return;
  selectThemePreset(btn.dataset.preset);
});

elements.presetItems?.addEventListener("mouseover", function (event) {
  var btn = event.target.closest(".preset-option");
  if (!btn || !elements.presetItems.contains(btn)) return;
  showPresetOptionTooltip({ currentTarget: btn });
});

elements.presetItems?.addEventListener("mouseleave", function () {
  hidePresetOptionTooltip();
});

elements.searchEnToggle.addEventListener("change", function () {
    state.searchEn = this.checked;
    state.searchShowCount = 12;
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
    if (elements.document.classList.contains("language-transition-out")) return;

    var fromLanguage = state.language;
    var toLanguage = fromLanguage === "zh" ? "en" : "zh";
    var headingAnchor = getVisibleHeadingAnchor();
    var targetIdx = headingAnchor
      ? getMappedHeadingIndex(state.currentPage, headingAnchor.id, fromLanguage, toLanguage)
      : -1;
    var scrollRatio = getReadableScrollRatio();
    var disclosureStates = getContentDisclosureStates();

    window.clearTimeout(languageTransitionTimer);
    elements.languageToggle.disabled = true;
    elements.document.classList.add("language-transition-out");
    languageTransitionTimer = window.setTimeout(function () {
      state.language = toLanguage;
      if (state.currentPage?.standalone) {
        renderStandalonePage(state.currentPage, "", true);
      } else {
        renderPage(state.currentPage, "", true);
      }
      restoreContentDisclosureStates(disclosureStates);
      if (state.query.trim() && (state.searchIndexZh || state.searchIndexEn)) {
        setTimeout(function () { highlightPageContent(state.query.trim()); }, 0);
      }

      if (targetIdx >= 0) {
        scrollToHeadingIndex(targetIdx, scrollRatio, headingAnchor?.top);
      } else {
        restoreScrollByRatio(scrollRatio);
      }
      elements.document.classList.remove("language-transition-out");
      elements.document.classList.add("language-transition-in");
      window.setTimeout(function () {
        elements.document.classList.remove("language-transition-in");
      }, 20);
      elements.languageToggle.disabled = state.currentPage?.translationStatus !== "complete";
    }, 120);
  });
window.addEventListener("hashchange", routeFromLocation);
window.addEventListener("popstate", routeFromLocation);
window.addEventListener("keydown", (event) => {
  if (event.key === "/" && document.activeElement !== elements.searchInput) {
    event.preventDefault();
    elements.searchInput.focus();
  }
  if (event.key === "Escape") {
    if (elements.outline.classList.contains("open")) {
      elements.outline.classList.remove("open");
      syncOutlineScrollTrap();
      return;
    }
    closeMobilePanels();
  }
});


/* — Mobile swipe gesture for sidebar (PWA-only, ≤760px) — */
(function () {
  if (!isStandalonePwa()) return;
  if (!mobileSidebarMql.matches) return;

  // Reserve a thin left-edge zone for the browser's own back-swipe gesture.
  // Sidebar opening only starts outside this zone so the two gestures do not
  // compete on the same touch sequence.
  var sidebarEdgeSwipeGuard = 48;
  var x0, y0;

  document.addEventListener("touchstart", function (e) {
    if (!mobileSidebarMql.matches) return;
    if (e.target === elements.searchInput) return;
    if (!elements.sidebar.classList.contains("open") &&
        (elements.scrim.contains(e.target) || elements.searchPanel.contains(e.target))) return;
    x0 = e.touches[0].clientX;
    y0 = e.touches[0].clientY;
  }, { passive: true });

  document.addEventListener("touchend", function (e) {
    if (!mobileSidebarMql.matches || x0 === undefined) return;
    var w = window.innerWidth;
    var startX = x0;
    var dx = e.changedTouches[0].clientX - x0;
    var dy = Math.abs(e.changedTouches[0].clientY - y0);
    x0 = y0 = undefined;
    if (dy > w * 0.08 || Math.abs(dx) < w * 0.12) return;

    if (!elements.sidebar.classList.contains("open") &&
        dx > w * 0.12 &&
        startX > sidebarEdgeSwipeGuard &&
        startX < w * 0.5) {
      toggleSidebar();
      return;
    }
    if (elements.sidebar.classList.contains("open") && dx < -(w * 0.12)) { closeMobilePanels(); }
  }, { passive: true });
})();

syncSearchToggleVisibility();
start();
