import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

import { createBuildHash, createContentHashedFileName } from "./lib/build_hash.mjs";
import { extractReleaseNotes } from "./extract_release_notes.mjs";
import { findUnsafeContentIssues } from "./lib/content_security.mjs";
import { validateDeployTarget } from "./lib/deploy_target.mjs";
import { generateLlmsTxt, validateLlmsTxtFormat } from "./lib/llms_txt.mjs";
import { assertSafeManifestOutputFile, assertSafePathSegment } from "./lib/safe_paths.mjs";
import {
  generateRobotsTxt,
  renderIndexSeoTemplate,
  resolveSeoConfig,
  resolveSiteWideNoindex,
} from "./lib/seo_config.mjs";
import { finalizeSnapshot } from "./lib/snapshot_publish.mjs";
import { validateUpstreamPatches } from "./lib/upstream_patches.mjs";
import {
  compareSourceRevisions,
  createSnapshotDiff,
  extractSourceRevision,
  isAllowedSnapshotFailure,
  validateUpstreamTracking,
} from "./lib/upstream_snapshot.mjs";

import {
  markInlineImages,
  readJson,
  removePageTitleHeading,
  root,
  stripDocument,
  toPlainText,
  transformAccordions,
} from "./lib/manual.mjs";

test("release notes are extracted from exactly one matching changelog version", () => {
  const changelog = [
    "# Changelog",
    "",
    "## 正式版本",
    "",
    "### v1.0.1 - 2026-07-27",
    "",
    "#### Fixed",
    "",
    "- Current fix",
    "",
    "### v1.0.0 - 2026-07-21",
    "",
    "- Previous release",
    "",
    "## 公开预览版本",
  ].join("\n");

  assert.equal(
    extractReleaseNotes(changelog, "v1.0.1"),
    "### v1.0.1 - 2026-07-27\n\n#### Fixed\n\n- Current fix\n",
  );
  assert.throws(() => extractReleaseNotes(changelog, "1.0.1"), /stable format/);
  assert.throws(() => extractReleaseNotes(changelog, "v2.0.0"), /does not contain/);
  assert.throws(
    () => extractReleaseNotes(`${changelog}\n### v1.0.1 - duplicate\n`, "v1.0.1"),
    /multiple release headings/,
  );
});

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
  const template = [
    '<meta name="description" content="__SEO_DESCRIPTION__">',
    '<meta name="keywords" content="__SEO_KEYWORDS__">',
    '<meta name="robots" content="__SEO_ROBOTS__">',
    '<link rel="canonical" href="__SEO_SITE_URL__">',
    '<meta property="og:image" content="__SEO_OG_IMAGE_URL__">',
    "__SEO_SITEMAP_LINK__",
  ].join("");
  const rendered = renderIndexSeoTemplate(
    template,
    seo,
  );
  const noindexRendered = renderIndexSeoTemplate(
    template,
    seo,
    { siteWideNoindex: true },
  );
  assert.match(rendered, /Description &amp; details/);
  assert.match(rendered, /https:\/\/example\.test\/manual\//);
  assert.match(rendered, /https:\/\/example\.test\/manual\/pwa-icon-512\.png/);
  assert.match(rendered, /content="index, follow"/);
  assert.match(rendered, /rel="sitemap"/);
  assert.match(noindexRendered, /content="noindex, nofollow"/);
  assert.doesNotMatch(noindexRendered, /rel="sitemap"/);
  assert.match(generateRobotsTxt(seo), /Sitemap: https:\/\/example\.test\/manual\/sitemap\.xml/);
  assert.doesNotMatch(generateRobotsTxt(seo, { siteWideNoindex: true }), /Sitemap:/);
  assert.doesNotMatch(generateRobotsTxt(seo, { siteWideNoindex: true }), /^Disallow: \/$/m);
  assert.doesNotMatch(rendered, /__SEO_/);
});

test("site-wide noindex mode only accepts explicit boolean strings", () => {
  assert.equal(resolveSiteWideNoindex(undefined), false);
  assert.equal(resolveSiteWideNoindex(""), false);
  assert.equal(resolveSiteWideNoindex("false"), false);
  assert.equal(resolveSiteWideNoindex("true"), true);
  assert.throws(() => resolveSiteWideNoindex("1"), /SEO_NOINDEX/);
});

test("llms.txt generation follows the ordered Markdown file-list format", () => {
  const llmsTxt = generateLlmsTxt({
    site: {
      title: "测试手册",
      source: "https://source.example/",
      sections: [
        { id: "intro", titleZh: "入门" },
        { id: "appendix", titleZh: "附录" },
      ],
      pageTitlesZhById: {
        Intro: "简介",
        About: "关于",
        Reference: "参考",
      },
    },
    manifest: [
      { order: 1, section: "intro", title: "Introduction", outputFile: "pages/01-Intro.html" },
      { order: 2, section: "intro", title: "About", outputFile: "pages/02-About.html" },
      { order: 3, section: "appendix", title: "Reference", outputFile: "pages/03-Reference.html" },
    ],
    resolvedSeo: {
      description: "用于验证 llms.txt 生成规则的测试手册。",
      siteUrl: "https://manual.example/subpath/",
    },
    noindexPageIds: new Set(["About"]),
  });

  assert.deepEqual(validateLlmsTxtFormat(llmsTxt), []);
  assert.match(llmsTxt, /^# 测试手册\n\n> 用于验证 llms\.txt 生成规则的测试手册。\n/);
  assert.match(llmsTxt, /\n## 入门\n\n- \[01 简介\]\(https:\/\/manual\.example\/subpath\/seo\/Intro\.html\): 对应英文主题：Introduction。/);
  assert.match(llmsTxt, /\n## 附录\n\n- \[03 参考\]\(https:\/\/manual\.example\/subpath\/seo\/Reference\.html\): 对应英文主题：Reference。/);
  assert.doesNotMatch(llmsTxt, /About\.html/);
  assert.ok(llmsTxt.endsWith("\n"));
});

test("llms.txt validation rejects headings and prose inside file-list sections", () => {
  const invalid = [
    "# Test",
    "",
    "> Summary",
    "",
    "## Docs",
    "",
    "This is not a file-list item.",
    "",
    "### Nested heading",
    "",
  ].join("\n");

  const issues = validateLlmsTxtFormat(invalid);
  assert.ok(issues.some((issue) => issue.includes("invalid file-list item")));
  assert.ok(issues.some((issue) => issue.includes("only H1 and H2 headings")));
});

test("llms.txt validation accepts the spec minimum and optional summary or file lists", () => {
  assert.deepEqual(validateLlmsTxtFormat("# X"), []);
  assert.deepEqual(validateLlmsTxtFormat("\uFEFF# Minimal"), []);
  assert.deepEqual(validateLlmsTxtFormat([
    "# With optional sections",
    "",
    "> Summary",
    "",
    "More details.",
    "",
    "## Docs",
    "",
    "* [Relative URL example](/docs)",
    "",
  ].join("\n")), []);
});

test("site-wide noindex produces llms.txt without manual page links", () => {
  const llmsTxt = generateLlmsTxt({
    site: {
      title: "测试手册",
      source: "https://source.example/",
      sections: [{ id: "intro", titleZh: "入门" }],
      pageTitlesZhById: { Intro: "简介" },
    },
    manifest: [
      { order: 1, section: "intro", title: "Introduction", outputFile: "pages/01-Intro.html" },
    ],
    resolvedSeo: {
      description: "用于验证 Beta 全站 noindex 的测试手册。",
      siteUrl: "https://manual.example/beta/",
    },
    siteWideNoindex: true,
  });

  assert.deepEqual(validateLlmsTxtFormat(llmsTxt), []);
  assert.doesNotMatch(llmsTxt, /^## /m);
  assert.doesNotMatch(llmsTxt, /manual\.example\/beta\/seo\//);
});

test("registered upstream patches remain present in snapshots and applied to targets", () => {
  const registry = readJson(path.join(root, "content", "upstream-patches.json"));
  const manifest = readJson(path.join(root, "content", "manifest.json"));
  assert.deepEqual(validateUpstreamPatches(registry, { rootDirectory: root, manifest }), []);
});

test("21.0.4 External Control and KLANG changes remain synchronized", () => {
  for (const language of ["en", "zh"]) {
    const externalControl = fs.readFileSync(
      path.join(root, "content", language, "pages", "73-ExternalControl.html"),
      "utf8",
    );
    const klang = fs.readFileSync(
      path.join(root, "content", language, "pages", "74-KLANG.html"),
      "utf8",
    );

    assert.match(externalControl, /g_GenericOscDetailViewXY\.png/);
    assert.doesNotMatch(externalControl, /g_GenericOscDetailView\.png|g_OSCdetailSMGsnapshot\.png/);
    assert.match(klang, /g_KLANGAudioRoutingExample\.png/);
    assert.match(klang, /BusRouting\.html#VcaBusSends/);
    assert.match(klang, language === "en" ? /<h3>Automation<\/h3>/ : /<h3>自动化<\/h3>/);
  }

  const assets = readJson(path.join(root, "public", "assets", "manual", "manifest.json"));
  const bySourceUrl = new Map(assets.map((asset) => [asset.sourceUrl, asset]));
  for (const name of [
    "g_GenericOscDetailViewXY.png",
    "g_KLANGAudioRoutingExample.png",
    "g_OSCsetupGenericMethodsSwitchesConfig.png",
  ]) {
    const sourceUrl = `https://livehelp.solidstatelogic.com/Help/images/${name}`;
    const asset = bySourceUrl.get(sourceUrl);
    assert.equal(asset?.status, "downloaded", `${name}: resource must be downloadable`);
    assert.equal(
      fs.existsSync(path.join(root, "public", asset.localPath)),
      true,
      `${name}: localized file must exist`,
    );
  }
});

test("upstream source revisions are extracted, compared and diffed deterministically", () => {
  assert.equal(
    extractSourceRevision('<p>Document Revision Number: <span style="font-weight:bold">21.0.4</span></p>'),
    "21.0.4",
  );
  assert.equal(compareSourceRevisions("21.0.4", "21.0.3"), 1);
  assert.equal(compareSourceRevisions("21.0.3", "21.0.3.0"), 0);
  assert.equal(compareSourceRevisions("20.9.9", "21.0.0"), -1);
  assert.throws(() => extractSourceRevision("<p>No revision here</p>"), /Document Revision Number/);

  const previous = {
    sourceRevision: "21.0.3",
    records: [
      { url: "https://example.test/unchanged", sha256: "same" },
      { url: "https://example.test/changed", sha256: "before" },
      { url: "https://example.test/removed", sha256: "gone" },
    ],
  };
  const current = [
    { url: "https://example.test/unchanged", sha256: "same" },
    { url: "https://example.test/changed", sha256: "after" },
    { url: "https://example.test/added", sha256: "new" },
  ];
  assert.deepEqual(createSnapshotDiff(current, previous, "21.0.4"), {
    schemaVersion: 1,
    sourceRevision: "21.0.4",
    previous: "21.0.3",
    added: ["https://example.test/added"],
    changed: ["https://example.test/changed"],
    removed: ["https://example.test/removed"],
  });
});

test("only explicitly registered upstream HTTP failures are allowed", () => {
  const rules = [{ url: "https://example.test/missing.png", statuses: [404], reason: "Known source failure for testing" }];
  assert.equal(isAllowedSnapshotFailure({ url: rules[0].url, kind: "dependency", status: 404 }, rules), true);
  assert.equal(isAllowedSnapshotFailure({ url: rules[0].url, kind: "seed", status: 404 }, rules), false);
  assert.equal(isAllowedSnapshotFailure({ url: rules[0].url, kind: "dependency", status: 500 }, rules), false);
  assert.equal(isAllowedSnapshotFailure({ url: "https://example.test/other.png", kind: "dependency", status: 404 }, rules), false);
  assert.equal(isAllowedSnapshotFailure({ url: rules[0].url, kind: "dependency", status: null }, rules), false);
});

test("project content and latest snapshot revisions are tracked independently", () => {
  const config = readJson(path.join(root, "content", "upstream.json"));
  const manifest = readJson(path.join(root, "content", "manifest.json"));
  const latestPointer = readJson(path.join(root, "upstream", "snapshots", "latest.json"));
  assert.deepEqual(validateUpstreamTracking(config, { rootDirectory: root, manifest, latestPointer }), []);
});

test("snapshot publication preserves incomplete and already published versions", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ssl-manual-snapshot-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const snapshotRoot = path.join(directory, "21.0.3");
  const latestPath = path.join(directory, "latest.json");
  const stagingRoot = path.join(directory, ".21.0.4-incomplete");
  fs.mkdirSync(snapshotRoot);
  fs.mkdirSync(stagingRoot);
  fs.writeFileSync(path.join(snapshotRoot, "marker.txt"), "published");
  fs.writeFileSync(path.join(stagingRoot, "marker.txt"), "incomplete");
  fs.writeFileSync(latestPath, '{"sourceRevision":"21.0.3"}');

  const published = finalizeSnapshot({
    failures: [{ url: "https://example.test/missing", error: "404" }],
    stagingRoot,
    snapshotRoot,
    latestPath,
    latestRecord: { sourceRevision: "21.0.4" },
  });

  assert.equal(published, false);
  assert.equal(fs.readFileSync(path.join(snapshotRoot, "marker.txt"), "utf8"), "published");
  assert.deepEqual(JSON.parse(fs.readFileSync(latestPath, "utf8")), { sourceRevision: "21.0.3" });
  assert.equal(fs.existsSync(stagingRoot), false);

  const nextSnapshotRoot = path.join(directory, "21.0.4");
  const completeStagingRoot = path.join(directory, ".21.0.4-complete");
  fs.mkdirSync(completeStagingRoot);
  fs.writeFileSync(path.join(completeStagingRoot, "marker.txt"), "complete");
  assert.equal(finalizeSnapshot({
    failures: [],
    stagingRoot: completeStagingRoot,
    snapshotRoot: nextSnapshotRoot,
    latestPath,
    latestRecord: { sourceRevision: "21.0.4" },
  }), true);
  assert.equal(fs.readFileSync(path.join(snapshotRoot, "marker.txt"), "utf8"), "published");
  assert.equal(fs.readFileSync(path.join(nextSnapshotRoot, "marker.txt"), "utf8"), "complete");
  assert.deepEqual(JSON.parse(fs.readFileSync(latestPath, "utf8")), { sourceRevision: "21.0.4" });

  const collisionStagingRoot = path.join(directory, ".21.0.4-collision");
  fs.mkdirSync(collisionStagingRoot);
  fs.writeFileSync(path.join(collisionStagingRoot, "marker.txt"), "replacement");
  assert.throws(() => finalizeSnapshot({
    failures: [],
    stagingRoot: collisionStagingRoot,
    snapshotRoot: nextSnapshotRoot,
    latestPath,
    latestRecord: { sourceRevision: "21.0.4" },
  }), /will not be overwritten/);
  assert.equal(fs.existsSync(collisionStagingRoot), false);
  assert.equal(fs.readFileSync(path.join(nextSnapshotRoot, "marker.txt"), "utf8"), "complete");
});

test("RecordingPlayback keeps links and lists structurally valid", () => {
  const filePath = path.join(root, "content", "en", "pages", "27-RecordingPlayback.html");
  const html = fs.readFileSync(filePath, "utf8").replace(/<!--[\s\S]*?-->/g, "");
  let anchorDepth = 0;
  let listDepth = 0;

  assert.doesNotMatch(html, /<stromg\b/i, "RecordingPlayback: misspelled <strong> tag");
  assert.doesNotMatch(html, /<p\b[^>]*>\s*<(?:ul|ol)\b/i, "RecordingPlayback: list nested inside paragraph");
  for (const match of html.matchAll(/<(\/)?(a|ul|ol|li)\b[^>]*>/gi)) {
    const closing = Boolean(match[1]);
    const tag = match[2].toLowerCase();
    if (tag === "a") {
      if (closing) anchorDepth -= 1;
      else {
        assert.equal(anchorDepth, 0, "RecordingPlayback: nested anchor");
        anchorDepth += 1;
      }
    } else if (tag === "ul" || tag === "ol") {
      listDepth += closing ? -1 : 1;
    } else if (!closing) {
      assert.ok(listDepth > 0, "RecordingPlayback: list item without a list parent");
    }
  }
  assert.equal(anchorDepth, 0, "RecordingPlayback: unbalanced anchors");
  assert.equal(listDepth, 0, "RecordingPlayback: unbalanced lists");
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

test("content-hashed asset names preserve extensions and track file contents", () => {
  assert.equal(
    createContentHashedFileName("font.subset.woff2", Buffer.from("font-v1")),
    "font.subset.cea7364a8c7d.woff2",
  );
  assert.equal(
    createContentHashedFileName("font.subset.woff2", Buffer.from("font-v1")),
    createContentHashedFileName("font.subset.woff2", Buffer.from("font-v1")),
  );
  assert.notEqual(
    createContentHashedFileName("font.subset.woff2", Buffer.from("font-v1")),
    createContentHashedFileName("font.subset.woff2", Buffer.from("font-v2")),
  );
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

test("reader keeps service worker updates and next-page prefetch outside the render-critical path", () => {
  const appSource = fs.readFileSync(path.join(root, "src", "app.js"), "utf8");
  const startSource = appSource.slice(
    appSource.indexOf("async function start()"),
    appSource.indexOf("\nvar searchTimer", appSource.indexOf("async function start()")),
  );
  const renderPageSource = appSource.slice(
    appSource.indexOf("function renderPage("),
    appSource.indexOf("\nasync function route(", appSource.indexOf("function renderPage(")),
  );
  const buildSource = fs.readFileSync(path.join(root, "scripts", "build_static_site.mjs"), "utf8");

  assert.doesNotMatch(startSource, /await prepareServiceWorkerForBuild\(/);
  assert.match(startSource, /const catalogRequest = loadData\("catalog\.json"/);
  assert.match(startSource, /const themesRequest = loadData\("themes\.json"/);
  assert.match(startSource, /const initialPageRequest = startupRoute\.pageId/);
  assert.match(startSource, /scheduleServiceWorkerPreparation\(\)/);
  assert.match(appSource, /requestIdleCallback\(callback, \{ timeout: timeoutMs \}\)/);
  assert.match(appSource, /scheduleNextPagePrefetch\(page\.id, nextPage\.id\)/);
  assert.doesNotMatch(renderPageSource, /loadPage\(next\.id\)/);
  assert.match(buildSource, /window\.__DEFAULT_PAGE_ID__/);
});

test("reader startup routes the latest URL before waiting for theme metadata", () => {
  const appSource = fs.readFileSync(path.join(root, "src", "app.js"), "utf8");
  const startSource = appSource.slice(
    appSource.indexOf("async function start()"),
    appSource.indexOf("\nvar searchTimer", appSource.indexOf("async function start()")),
  );

  assert.match(startSource, /state\.catalogReady = true;\s+resolveCatalogReady\(\);/);
  assert.match(startSource, /const currentRoute = getRoute\(/);
  assert.match(startSource, /await route\(currentRoute\.pageId === startupRoute\.pageId/);
  assert.match(startSource, /state\.appReady = true;/);
  assert.ok(
    startSource.indexOf("await route(") < startSource.indexOf("state.themes = await themesRequest"),
    "theme metadata must not block the first chapter render",
  );
});

test("reader synchronizes expanded navigation state before activating a new chapter", () => {
  const appSource = fs.readFileSync(path.join(root, "src", "app.js"), "utf8");
  const navigationStateSource = appSource.slice(
    appSource.indexOf("function groupKey("),
    appSource.indexOf("\nfunction renderNavLink(", appSource.indexOf("function groupKey(")),
  );
  const loadingNavigationSource = appSource.slice(
    appSource.indexOf("function syncLoadingNavigation("),
    appSource.indexOf("\nfunction renderPageSkeleton(", appSource.indexOf("function syncLoadingNavigation(")),
  );
  const currentNavigationSource = appSource.slice(
    appSource.indexOf("function syncNavigationForCurrentPage("),
    appSource.indexOf("\nfunction renderOutline(", appSource.indexOf("function syncNavigationForCurrentPage(")),
  );

  function createPanel(className) {
    return {
      hidden: true,
      classList: { contains: (candidate) => candidate === className },
    };
  }
  function createButton(dataset, panel = null) {
    const attributes = new Map();
    const classes = new Map();
    return {
      dataset,
      nextElementSibling: panel,
      setAttribute(name, value) { attributes.set(name, value); },
      classList: {
        toggle(name, active) { classes.set(name, active); },
      },
      attributes,
      classes,
    };
  }

  const sectionPanel = createPanel("nav-section-pages");
  const groupPanel = createPanel("nav-group-pages");
  const sectionButton = createButton({ sectionId: "intro" }, sectionPanel);
  const groupButton = createButton({ groupKey: "intro::start" }, groupPanel);
  const previousPageButton = createButton({ pageId: "Intro" });
  const activePageButton = createButton({ pageId: "GettingStarted" });
  const manualNav = {
    childElementCount: 1,
    querySelectorAll(selector) {
      if (selector === "[data-section-id]") return [sectionButton];
      if (selector === "[data-group-key]") return [groupButton];
      if (selector === ".nav-link[data-page-id]") return [previousPageButton, activePageButton];
      return [];
    },
  };
  const context = vm.createContext({ manualNav });
  vm.runInContext([
    "const state = {",
    "  catalog: { sections: [{ id: 'intro', groups: [{ id: 'start', pageIds: ['Intro', 'GettingStarted'] }] }] },",
    "  currentPage: { id: 'GettingStarted', section: 'intro' },",
    "  expandedSections: new Set(),",
    "  expandedGroups: new Set(),",
    "  query: '',",
    "};",
    "const elements = { manualNav };",
    navigationStateSource,
    loadingNavigationSource,
    currentNavigationSource,
    "ensureActiveNavigationExpanded();",
    "syncNavigationForCurrentPage();",
  ].join("\n"), context);

  assert.equal(sectionButton.attributes.get("aria-expanded"), "true");
  assert.equal(groupButton.attributes.get("aria-expanded"), "true");
  assert.equal(sectionPanel.hidden, false);
  assert.equal(groupPanel.hidden, false);
  assert.equal(previousPageButton.classes.get("active"), false);
  assert.equal(activePageButton.classes.get("active"), true);
});

test("reader search deduplicates index requests and ignores stale completions", () => {
  const appSource = fs.readFileSync(path.join(root, "src", "app.js"), "utf8");
  const searchSource = appSource.slice(
    appSource.indexOf("function loadSearchIndex("),
    appSource.indexOf("\nasync function loadPage(", appSource.indexOf("function loadSearchIndex(")),
  );

  assert.match(searchSource, /state\.searchIndexRequests\[target\]/);
  assert.match(searchSource, /Promise\.all\(\[catalogReadyPromise, loadSearchIndex\(target\)\]\)/);
  assert.match(searchSource, /requestId !== searchRequestId/);
  assert.match(searchSource, /state\.searchStatus = "failed"/);
  assert.doesNotMatch(searchSource, /error\.message/);
});

test("reader commits theme presets only after their stylesheet loads", () => {
  const appSource = fs.readFileSync(path.join(root, "src", "app.js"), "utf8");
  const themeSource = appSource.slice(
    appSource.indexOf("function loadThemeCSS("),
    appSource.indexOf("\nvar _presetOptionTooltipEl", appSource.indexOf("function loadThemeCSS(")),
  );

  assert.match(themeSource, /nextLink\.media = "not all"/);
  assert.match(themeSource, /nextLink\.onload = function/);
  assert.match(themeSource, /if \(await loadThemeCSS\(id\)\) commitThemePreset\(id, true\)/);
  assert.ok(
    themeSource.indexOf("await loadThemeCSS(id)") < themeSource.indexOf("commitThemePreset(id, true)"),
    "selected preset state must follow stylesheet success",
  );
});

test("reselecting the active theme cancels a pending stylesheet request", async () => {
  const appSource = fs.readFileSync(path.join(root, "src", "app.js"), "utf8");
  const themeSource = appSource.slice(
    appSource.indexOf("let presetLinkEl"),
    appSource.indexOf("\nconst escapeHtml", appSource.indexOf("let presetLinkEl")),
  );
  const pendingLinks = [];
  const context = vm.createContext({
    window: { __BUILD_HASH__: "test-build" },
    document: {
      createElement() {
        return {
          remove() { this.removed = true; },
        };
      },
      head: {
        appendChild(link) { pendingLinks.push(link); },
      },
      body: { appendChild() {} },
    },
    localStorage: {
      getItem() { return null; },
      setItem() {},
    },
    CSS: { supports() { return true; } },
    console,
  });
  vm.runInContext([
    "const state = { defaultTheme: 'acid', themePreset: 'acid', themes: [] };",
    "const elements = { presetItems: null, presetDropdown: null, presetToggle: null };",
    themeSource,
    "var pendingSelection = selectThemePreset('red');",
  ].join("\n"), context);

  assert.equal(pendingLinks.length, 1);
  await vm.runInContext("selectThemePreset('acid')", context);
  pendingLinks[0].onload();
  await vm.runInContext("pendingSelection", context);

  assert.equal(vm.runInContext("state.themePreset", context), "acid");
  assert.equal(pendingLinks[0].removed, true);
  assert.equal(vm.runInContext("presetLinkEl", context), null);
});
