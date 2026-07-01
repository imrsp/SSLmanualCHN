const CACHE_NAME = `ssl-manual-${__CACHE_VERSION__}`;
const PRECACHE_URLS = __PRECACHE_URLS__;
const CACHE_PREFIX = "ssl-manual-";
const SCOPE_PATH = new URL(self.registration.scope).pathname;

function normalizeRequestUrl(requestUrl) {
  const url = new URL(requestUrl);
  if (url.origin !== self.location.origin) return url;
  url.searchParams.delete("v");
  if (url.pathname === "/" || url.pathname.endsWith("/")) {
    url.pathname = `${url.pathname}index.html`;
  }
  return url;
}

function cacheKeyFor(requestUrl) {
  return normalizeRequestUrl(requestUrl).toString();
}

function relativePath(url) {
  return url.pathname.startsWith(SCOPE_PATH)
    ? url.pathname.slice(SCOPE_PATH.length)
    : url.pathname.replace(/^\//, "");
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const key = cacheKeyFor(request.url);
  const cached = await cache.match(key);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(key, response.clone());
  }
  return response;
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const key = cacheKeyFor(request.url);
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(key, response.clone());
      return response;
    }
  } catch (_) {}
  const cached = await cache.match(key);
  if (cached) return cached;
  throw new Error(`No cached response for ${key}`);
}

function isNetworkFirstAsset(url) {
  const path = relativePath(url);
  return (
    path === "data/catalog.json" ||
    path === "data/themes.json"
  );
}

function isStaticAsset(url) {
  const path = relativePath(url);
  return (
    path === "manifest.webmanifest" ||
    path.startsWith("favicon") ||
    path.startsWith("apple-touch-icon") ||
    path.startsWith("pwa-icon") ||
    path.startsWith("src/") ||
    path.startsWith("data/pages/") ||
    path.startsWith("themes/") ||
    path.startsWith("assets/")
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(PRECACHE_URLS);
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => {
      if (key === CACHE_NAME) return null;
      if (!key.startsWith(CACHE_PREFIX)) return null;
      return caches.delete(key);
    }));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === "navigate" || url.pathname === "/" || url.pathname.endsWith("/index.html")) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  if (isNetworkFirstAsset(url)) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(event.request));
  }
});
