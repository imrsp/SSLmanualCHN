import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

import { createBuildHash } from "../scripts/lib/build_hash.mjs";

import {
  markInlineImages,
  readJson,
  removePageTitleHeading,
  root,
  stripDocument,
  transformAccordions,
} from "../scripts/lib/manual.mjs";

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
  fs.mkdirSync(path.dirname(catalogPath), { recursive: true });
  fs.writeFileSync(catalogPath, '{"meta":{"generatedAt":"first"},"pages":["Intro"]}');
  fs.writeFileSync(workerPath, "worker-v1");

  const files = [catalogPath, workerPath];
  const firstHash = createBuildHash(files, directory);
  fs.writeFileSync(catalogPath, '{"meta":{"generatedAt":"second"},"pages":["Intro"]}');
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
  assert.equal(
    vm.runInContext(
      'isStaticAsset(new URL("https://example.test/manual/data/search-index-zh.json?v=test-build"))',
      context,
    ),
    true,
  );
});
