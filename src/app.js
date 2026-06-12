const state = {
  catalog: null,
  searchIndex: null,
  pageCache: new Map(),
  currentPage: null,
  query: "",
  language: "zh",
  expandedSections: new Set(),
  expandedGroups: new Set(),
};

const elements = {
  databaseStatus: document.querySelector("#databaseStatus"),
  manualNav: document.querySelector("#manualNav"),
  searchInput: document.querySelector("#searchInput"),
  searchLabel: document.querySelector("#searchLabel"),
  searchSummary: document.querySelector("#searchSummary"),
  breadcrumbs: document.querySelector("#breadcrumbs"),
  document: document.querySelector("#document"),
  outline: document.querySelector("#outline"),
  languageToggle: document.querySelector("#languageToggle"),
  previousPage: document.querySelector("#previousPage"),
  nextPage: document.querySelector("#nextPage"),
  pageCounter: document.querySelector("#pageCounter"),
  sidebar: document.querySelector("#sidebar"),
  menuButton: document.querySelector("#menuButton"),
  outlineButton: document.querySelector("#outlineButton"),
  scrim: document.querySelector("#scrim"),
};

const escapeHtml = (value) =>
  value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character]);

const normalize = (value) => value.toLocaleLowerCase().replace(/\s+/g, " ").trim();
const dataUrl = (path) => new URL(`data/${path}`, document.baseURI);
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
  if (state.searchIndex) return;
  elements.searchSummary.textContent = "正在载入全文索引…";
  state.searchIndex = await loadData("search-index.json", () => localData.searchIndex);
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

function visiblePageIds() {
  const query = normalize(state.query);
  if (!query || !state.searchIndex) return new Set(state.catalog.pages.map((page) => page.id));
  return new Set(
    state.searchIndex
      .filter((record) => normalize(record.text).includes(query))
      .map((record) => record.id),
  );
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

function renderNavigation(focusActive = false) {
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

function renderPage(page, headingId = "") {
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
  if (headingId) {
    requestAnimationFrame(() => {
      const target = document.getElementById(headingId);
      target?.closest("details")?.setAttribute("open", "");
      target?.scrollIntoView();
    });
  } else {
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  if (next) loadPage(next.id).catch(() => {});
}

async function route() {
  if (!state.catalog) return;
  const { pageId, headingId } = getRoute();
  const summary = state.catalog.pages.find((candidate) => candidate.id === pageId);
  if (!summary) {
    location.replace(pageRoute(state.catalog.pages[0].id));
    return;
  }
  elements.document.setAttribute("aria-busy", "true");
  try {
    renderPage(await loadPage(pageId), headingId);
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
    expandAllNavigation();
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

let searchTimer;
elements.searchInput.addEventListener("input", async (event) => {
  state.query = event.target.value;
  clearTimeout(searchTimer);
  if (!state.query.trim()) {
    renderNavigation();
    return;
  }
  searchTimer = setTimeout(async () => {
    try {
      await loadSearchIndex();
      renderNavigation();
    } catch (error) {
      elements.searchSummary.textContent = error.message;
    }
  }, 120);
});
elements.menuButton.addEventListener("click", toggleSidebar);
elements.scrim.addEventListener("click", closeMobilePanels);
elements.outlineButton.addEventListener("click", () => elements.outline.classList.toggle("open"));
elements.languageToggle.addEventListener("click", () => {
  if (state.currentPage?.translationStatus !== "complete") return;
  state.language = state.language === "zh" ? "en" : "zh";
  renderPage(state.currentPage);
});
window.addEventListener("hashchange", route);
window.addEventListener("keydown", (event) => {
  if (event.key === "/" && document.activeElement !== elements.searchInput) {
    event.preventDefault();
    elements.searchInput.focus();
  }
  if (event.key === "Escape") closeMobilePanels();
});

start();
