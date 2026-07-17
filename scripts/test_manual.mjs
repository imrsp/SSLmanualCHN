import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

import { createBuildHash } from "./lib/build_hash.mjs";
import { findUnsafeContentIssues } from "./lib/content_security.mjs";
import { validateDeployTarget } from "./lib/deploy_target.mjs";
import { assertSafeManifestOutputFile, assertSafePathSegment } from "./lib/safe_paths.mjs";
import { generateRobotsTxt, renderIndexSeoTemplate, resolveSeoConfig } from "./lib/seo_config.mjs";
import { validateUpstreamPatches } from "./lib/upstream_patches.mjs";

import {
  markInlineImages,
  readJson,
  removePageTitleHeading,
  root,
  stripDocument,
  toPlainText,
  transformAccordions,
} from "./lib/manual.mjs";

test("plain-text extraction decodes every named and numeric entity used by manual content", () => {
  assert.equal(
    toPlainText("<p>HUI&trade; &copy; &reg; &gamma; &Oslash; &emsp; &#8486; &#x3a9;</p>"),
    "HUI™ © ® γ Ø Ω Ω",
  );

  for (const language of ["en", "zh"]) {
    const pagesDirectory = path.join(root, "content", language, "pages");
    for (const fileName of fs.readdirSync(pagesDirectory).filter((name) => name.endsWith(".html"))) {
      const text = toPlainText(fs.readFileSync(path.join(pagesDirectory, fileName), "utf8"));
      assert.doesNotMatch(text, /&[A-Za-z][A-Za-z0-9]+;/, `${language}/${fileName}: unresolved named entity`);
      assert.doesNotMatch(text, /&#(?:[0-9]+|[xX][0-9A-Fa-f]+);/, `${language}/${fileName}: unresolved numeric entity`);
    }
  }
});

test("content security checks decoded URL attributes", () => {
  assert.deepEqual(findUnsafeContentIssues('<a href="https://example.test/">Safe</a>'), []);
  assert.deepEqual(findUnsafeContentIssues('<a href="java&#x73;cript:alert(1)">Unsafe</a>'), ["javascript URL"]);
  assert.deepEqual(findUnsafeContentIssues('<a href="java&#115cript:alert(1)">Unsafe</a>'), ["javascript URL"]);
  assert.deepEqual(findUnsafeContentIssues('<a href="java&Tab;script&colon;alert(1)">Unsafe</a>'), ["javascript URL"]);
  assert.deepEqual(findUnsafeContentIssues('<img src="data&colon;image/svg+xml,x">'), ["dangerous data URL"]);
});

test("generated output identifiers are restricted to safe path segments", () => {
  assert.equal(assertSafePathSegment("LAN-009", "page id"), "LAN-009");
  assert.equal(assertSafeManifestOutputFile("pages/02-GettingStarted.html", "output"), "pages/02-GettingStarted.html");
  assert.throws(() => assertSafePathSegment("../../outside", "page id"), /safe path segment/);
  assert.throws(() => assertSafeManifestOutputFile("pages/../../outside.html", "output"), /must match/);
});

test("deployment targets reject broad, home and shell-interpreted paths", () => {
  assert.equal(validateDeployTarget("/srv/ssl-live-manual", { sshUser: "deploy" }), "/srv/ssl-live-manual");
  assert.equal(validateDeployTarget("/home/deploy/sites/manual", { sshUser: "deploy" }), "/home/deploy/sites/manual");
  for (const target of ["", "/", "/srv", "/var/www", "/home/deploy", "/srv/site/../", "/srv/site;touch-pwned"]) {
    assert.throws(() => validateDeployTarget(target, { sshUser: "deploy" }), /Deployment target/);
  }
  assert.throws(
    () => validateDeployTarget("/srv/manual", { sshUser: "deploy", remoteHome: "/srv/manual" }),
    /remote home directory/,
  );
});

test("SEO templates are rendered only from content/seo.json values", () => {
  const seo = resolveSeoConfig({
    description: "Description & details",
    keywords: "one, two",
    url: "https://example.test/manual",
    ogImage: "pwa-icon-512.png",
    defaultLastModified: "2026-07-17",
  });
  const rendered = renderIndexSeoTemplate(
    '<meta name="description" content="__SEO_DESCRIPTION__"><meta name="keywords" content="__SEO_KEYWORDS__"><link rel="canonical" href="__SEO_SITE_URL__"><meta property="og:image" content="__SEO_OG_IMAGE_URL__">',
    seo,
  );
  assert.match(rendered, /Description &amp; details/);
  assert.match(rendered, /https:\/\/example\.test\/manual\//);
  assert.match(rendered, /https:\/\/example\.test\/manual\/pwa-icon-512\.png/);
  assert.match(generateRobotsTxt(seo), /Sitemap: https:\/\/example\.test\/manual\/sitemap\.xml/);
  assert.doesNotMatch(rendered, /__SEO_/);
});

test("registered upstream patches remain present in snapshots and applied to targets", () => {
  const registry = readJson(path.join(root, "content", "upstream-patches.json"));
  const manifest = readJson(path.join(root, "content", "manifest.json"));
  assert.deepEqual(validateUpstreamPatches(registry, { rootDirectory: root, manifest }), []);
});

test("removePageTitleHeading uses exact normalized titles and explicit aliases", () => {
  assert.equal(
    removePageTitleHeading("<h2>系统示例 A：测试</h2><p>正文</p>", "系统示例 A: 测试"),
    "<p>正文</p>",
  );
  assert.equal(
    removePageTitleHeading("<h2>Automation Overview</h2><p>Body</p>", "Automation: Overview"),
    "<p>Body</p>",
  );
  assert.equal(
    removePageTitleHeading("<h2>设置 Dante</h2><p>正文</p>", "Dante 设置"),
    "<p>正文</p>",
  );
  assert.equal(
    removePageTitleHeading("<h2>控制系统</h2><p>正文</p>", "系统控制"),
    "<h2>控制系统</h2><p>正文</p>",
  );
});

test("transformAccordions preserves pairs and removes only a repeated leading heading", () => {
  const source = `
    <div id="accordion">
      <div class="accordion-section-title">Section One</div>
      <div id="one" class="accordion-section-content"><h3>Section One</h3><p>First</p></div>
      <div class="accordion-section-title">Section Two</div>
      <div id="two" class="accordion-section-content"><p>Second</p></div>
    </div>`;
  const result = transformAccordions(source);

  assert.equal((result.match(/<details\b/g) ?? []).length, 2);
  assert.match(result, /<summary><h2 id="one">Section One<\/h2><\/summary>/);
  assert.doesNotMatch(result, /<h3>Section One<\/h3>/);
  assert.match(result, /<summary><h2 id="two">Section Two<\/h2><\/summary>/);
  assert.match(result, /<p>Second<\/p>/);
});

test("markInlineImages distinguishes inline icons from explicitly block-level images", () => {
  assert.equal(
    markInlineImages('<p>Press <img src="button.png" alt="Button"> now.</p>'),
    '<p>Press <img class="manual-inline-icon" src="button.png" alt="Button"> now.</p>',
  );
  assert.equal(
    markInlineImages('<p>Diagram <img class="center" src="diagram.png" alt="Diagram"></p>'),
    '<p>Diagram <img class="center" src="diagram.png" alt="Diagram"></p>',
  );
});

test("all manual pages keep structural tags balanced after build-time preparation", () => {
  const manifest = readJson(path.join(root, "content", "manifest.json"));
  const site = readJson(path.join(root, "content", "site.json"));
  const structuralTags = ["div", "details", "summary", "ul", "figure"];
  const assertBalanced = (prepared, label) => {
    for (const tag of structuralTags) {
      const openings = prepared.match(new RegExp(`<${tag}\\b`, "gi"))?.length ?? 0;
      const closings = prepared.match(new RegExp(`</${tag}>`, "gi"))?.length ?? 0;
      assert.equal(openings, closings, `${label}: unbalanced <${tag}> tags`);
    }
  };

  for (const language of ["en", "zh"]) {
    for (const page of manifest) {
      const pageId = path.basename(page.outputFile, ".html").replace(/^\d+-/, "");
      const filePath = path.join(root, "content", language, page.outputFile);
      const title = language === "en" ? page.title : site.pageTitlesZhById[pageId];
      const source = fs.readFileSync(filePath, "utf8");
      const prepared = markInlineImages(
        removePageTitleHeading(transformAccordions(stripDocument(source)), title),
      );
      assertBalanced(prepared, `${language}/${pageId}`);
    }
  }

  const pagesDirectory = path.join(root, "content", "zh", "pages");
  for (const fileName of fs.readdirSync(pagesDirectory).filter((name) => name.endsWith(".html"))) {
    const source = fs.readFileSync(path.join(pagesDirectory, fileName), "utf8");
    if (!/<meta\s+name="x-standalone-id"/i.test(source)) continue;
    assertBalanced(markInlineImages(transformAccordions(stripDocument(source))), `zh/${fileName}`);
  }
});

test("Chinese sources contain no build-time list or numbered-caption cleanup debt", () => {
  const pagesDirectory = path.join(root, "content", "zh", "pages");
  for (const fileName of fs.readdirSync(pagesDirectory).filter((name) => name.endsWith(".html"))) {
    const html = fs.readFileSync(path.join(pagesDirectory, fileName), "utf8");
    assert.doesNotMatch(html, /<\/ul>\s*<ul>/i, `${fileName}: adjacent lists must be merged in source`);
    assert.doesNotMatch(
      html,
      /<figure>\s*<img\b[^>]*>\s*<figcaption>图片\s*\d+<\/figcaption>\s*<\/figure>/i,
      `${fileName}: redundant numbered captions must be removed in source`,
    );
  }
});

test("Dante VTL note remains one explicit paragraph and does not consume following content", () => {
  const filePath = path.join(root, "content", "zh", "pages", "29-DanteVTL.html");
  const prepared = transformAccordions(stripDocument(fs.readFileSync(filePath, "utf8")));

  assert.match(
    prepared,
    /<p class="note"><span class="notetitle">请注意：<\/span>[\s\S]*?<\/p>\s*<p>在创建双域路由之前/,
  );
  assert.doesNotMatch(prepared, /<div class="note"><span class="notetitle">请注意：/);
});

test("build hash ignores catalog generation time but tracks deployable content", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ssl-manual-build-hash-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const catalogPath = path.join(directory, "data", "catalog.json");
  const workerPath = path.join(directory, "sw.js");
  const sitemapPath = path.join(directory, "sitemap.xml");
  fs.mkdirSync(path.dirname(catalogPath), { recursive: true });
  fs.writeFileSync(catalogPath, '{"meta":{"generatedAt":"first"},"pages":["Intro"]}');
  fs.writeFileSync(workerPath, "worker-v1");
  fs.writeFileSync(sitemapPath, "<url><lastmod>2026-07-16</lastmod></url>");

  const files = [catalogPath, workerPath, sitemapPath];
  const firstHash = createBuildHash(files, directory);
  fs.writeFileSync(catalogPath, '{"meta":{"generatedAt":"second"},"pages":["Intro"]}');
  assert.equal(createBuildHash(files, directory), firstHash);
  fs.writeFileSync(sitemapPath, "<url><lastmod>2026-07-17</lastmod></url>");
  assert.equal(createBuildHash(files, directory), firstHash);

  fs.writeFileSync(workerPath, "worker-v2");
  assert.notEqual(createBuildHash(files, directory), firstHash);
});

test("service worker keeps build versions in data cache keys and handles search indexes", () => {
  const source = fs.readFileSync(path.join(root, "public", "sw.js"), "utf8")
    .replace("__CACHE_VERSION__", JSON.stringify("test-build"))
    .replace("__PRECACHE_URLS__", "[]");
  const context = vm.createContext({
    URL,
    self: {
      location: { origin: "https://example.test" },
      registration: { scope: "https://example.test/manual/" },
      addEventListener() {},
    },
  });
  vm.runInContext(source, context);

  const firstKey = vm.runInContext(
    'cacheKeyFor("https://example.test/manual/data/pages/Intro.json?v=first")',
    context,
  );
  const secondKey = vm.runInContext(
    'cacheKeyFor("https://example.test/manual/data/pages/Intro.json?v=second")',
    context,
  );
  assert.notEqual(firstKey, secondKey);
  assert.equal(vm.runInContext("CACHE_NAME", context), "ssl-manual-%2Fmanual%2F-test-build");
  assert.equal(
    vm.runInContext(
      'isStaticAsset(new URL("https://example.test/manual/data/search-index-zh.json?v=test-build"))',
      context,
    ),
    true,
  );

  const betaContext = vm.createContext({
    URL,
    self: {
      location: { origin: "https://example.test" },
      registration: { scope: "https://example.test/beta/" },
      addEventListener() {},
    },
  });
  vm.runInContext(source, betaContext);
  assert.notEqual(vm.runInContext("CACHE_NAME", betaContext), vm.runInContext("CACHE_NAME", context));
});
