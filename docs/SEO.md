# SEO 实现说明

## 设计原则

搜索引擎优化不改变 SPA 架构或 `file://` 兼容性。所有 SEO 产出在构建时生成，与运行时无关。

核心策略：为每个内容页面生成**静态预渲染 HTML**，供搜索引擎爬虫直接读取，真实用户被重定向到 SPA 获得完整体验。

---

## 架构概览

```text
content/en/pages + content/zh/pages + content/manifest.json + content/site.json + content/seo.json
                                         |
                                         v
                              scripts/build_static_site.mjs
                                         |
                                         v
dist/seo/<id>.html        ← 每个章节与 standalone 页各一份预渲染页面
dist/sitemap.xml          ← 由当前章节与 standalone 页动态生成的站点地图
dist/robots.txt           ← 爬虫指令
src/index.html            ← SPA 入口模板（SEO 字段由构建注入）
```

### 预渲染页面 (`dist/seo/<id>.html`)

每个章节和 standalone 页面生成一个 HTML 文件，包含：

- 完整中文正文（供爬虫直接读取）
- 页面级 SEO 标签
- JSON-LD 结构化数据
- 重定向脚本（真人用户 → SPA）

预渲染页面之间的内链已被替换为指向其他 `seo/<id>.html` 的相对路径，爬虫可以通过这些链接发现全部页面。

---

## 页面级 SEO 标签

每页 `<head>` 包含以下标签：

| 标签 | 内容 | 来源 |
|---|---|---|
| `<title>` | 中文标题 `\| SSL Live 中文操作手册` | `content/site.json` `pageTitlesZhById` |
| `<meta name="description">` | 正文首段 160 字摘要 | `extractMetaDescription()` 自动抽取 |
| `<meta name="robots">` | `index, follow` 或 `noindex, follow` | 默认 `index`，`content/seo.json` 可配置 `noindexPageIds` |
| `<meta property="og:title">` | 页面中文标题 | 同 title |
| `<meta property="og:description">` | 同 meta description | 同上 |
| `<meta property="og:type">` | `article` | 固定 |
| `<meta property="og:url">` | 预渲染页面的 canonical URL | `content/seo.json` 的 `url` + `/seo/<id>.html` |
| `<meta property="og:image">` | 分享预览图片 | `content/seo.json` 的 `ogImage` |
| `<meta property="og:locale">` | `zh_CN` | 固定 |
| `<meta name="twitter:card">` | `summary_large_image` | 固定 |
| `<meta name="twitter:title">` | 同 og:title | 同上 |
| `<meta name="twitter:description">` | 同 og:description | 同上 |
| `<link rel="canonical">` | 规范 URL，指向本预渲染页面 | `content/seo.json` 的 `url` + `/seo/<id>.html` |
| `<link rel="alternate" hreflang="zh-CN">` | 中文版本 | 同 canonical |
| `<link rel="alternate" hreflang="x-default">` | 默认版本 | 同 canonical |
| `<link rel="prev">` / `<link rel="next">` | 按 manifest order 顺序的前后章节 | 自动计算 |
| `<script type="application/ld+json">` | TechArticle 结构化数据 | 由 `generatePrerenderPage()` 构建 |

### SPA 入口 (`dist/index.html`)

全局标签的结构在 `src/index.html` 中定义，具体值由构建从 `content/seo.json` 注入到 `dist/index.html`：

- `<meta name="description">` — 站点级描述
- `<meta name="keywords">` — 站点级关键字
- `<meta property="og:*">` — 6 个 OG 标签
- `<meta name="twitter:*">` — 3 个 Twitter 标签
- `<link rel="canonical">` — 指向站点根
- `<link rel="sitemap">` — 指向 `sitemap.xml`
- `<meta name="robots">` — `index, follow`

---

## 描述文本抽取

`scripts/lib/manual.mjs` 中的 `extractMetaDescription(html, maxChars=160)` 负责从正文抽取描述：

1. 跳过 `<span class="note">`、`<div class="note">`、`<div class="manual-disclosures">`、`<details>` 等低信息密度区域
2. 将剩余 HTML 转为纯文本
3. 按段落切分，取**第一个长度 > 20 字的段落**
4. 截断到 160 字，在句号处断开

如果所有页面的描述都不满意，可以在 `generatePrerenderPage()` 中为指定 `pageId` 覆盖。

---

## 英文内容处理

英文页面不设独立 URL，不被搜索引擎索引：

- `hreflang` 声明中**不包含** `hreflang="en"`
- 英文版本仅通过 SPA 内的语言切换按钮访问，无面向爬虫的静态入口
- sitemap 和 prerender 页面仅包含中文内容

---

## 配置指南

### 部署域名

部署 URL 只在 `content/seo.json` 的 `url` 字段维护，并应包含实际协议、域名及可选子路径。`description`、`keywords`、`ogImage` 和 `noindexPageIds` 也以该文件为唯一配置源。

构建会自动同步这些字段到 SPA 入口、所有预渲染页面、sitemap 和 `robots.txt`。`ogImage` 使用相对路径时必须对应 `public/` 下的真实发布文件；构建和 SEO 审计都会阻止缺失文件、残留模板占位符或配置不一致。

### 禁止索引的页面

当前在 `content/seo.json` 的 `noindexPageIds` 中设为 `noindex, follow` 的页面：

- `About` — 版权和版本历史页，内容价值有限
- `about-dmt` — 关于本站的 standalone 页

如需修改，直接调整 `content/seo.json`：

```json
"noindexPageIds": ["About", "about-dmt"]
```

### 搜索引擎提交

部署后执行：

1. **Google Search Console**：提交 `sitemap.xml` URL，验证站点所有权
2. **Bing Webmaster Tools**：同上

---

## 构建与验证

### 构建时自动生成

`npm run build` 或 `npm run check` 会自动产出：

- `dist/seo/*.html` — 每个章节和 standalone 页面各一份
- `dist/sitemap.xml` — canonical 首页，以及未列入 `noindexPageIds` 的章节和 standalone 页
- `dist/robots.txt` — 允许所有爬虫，禁止抓取 `data/`、`themes/`、`src/`

### 独立审计

```bash
npm run audit:seo
```

检验项目包括：

- `robots.txt` 存在且含 Sitemap 指令
- `sitemap.xml` 存在，且仅包含 canonical 首页和允许索引的内容页
- 所有 `seo/*.html` 文件存在
- 每页都有 `<title>`、description、canonical、JSON-LD、OG、Twitter、hreflang、SPA 重定向，正文 ID 唯一且不存在无 JavaScript 强制跳转
- 首页有 `rel=next`，末页有 `rel=prev`
- standalone 页存在且有 description 和 JSON-LD
- SPA 入口 `index.html` 有 description、OG、Twitter、canonical、sitemap、robots

该审计是 `npm run check` 的最后一个阻断步骤。

---

## sitemap 的 lastmod

每个页面的 `<lastmod>` 优先取自相应源文件最后一次 Git 提交的日期：

- 章节页：`content/zh/pages/<NN-Slug>.html` 的修改日期
- standalone 页：`content/zh/pages/<slug>.html` 的修改日期
- 首页：`content/seo.json` 的修改日期

设置 `SOURCE_DATE_EPOCH` 时统一使用该日期，以支持可复现构建；无法读取 Git 历史时使用 `content/seo.json` 的 `defaultLastModified`。文件系统 mtime 不参与结果，单纯重新 checkout 或重建不会产生新的构建版本。

---

## 部署缓存策略

`dist/` 中与 SEO 相关的文件建议如下缓存配置（Nginx 示例）：

```nginx
location = /robots.txt {
    expires 1d;
    add_header Cache-Control "public";
}

location = /sitemap.xml {
    expires 1d;
    add_header Cache-Control "public";
}

location /seo/ {
    expires -1;
    add_header Cache-Control "no-cache, must-revalidate";
}
```

完整配置参考 `docs/DEPLOYMENT.md`。

---

## 文件索引

| 文件 | 职责 |
|---|---|
| `scripts/build_static_site.mjs` | 生成预渲染页面 + sitemap |
| `scripts/lib/manual.mjs` | `extractMetaDescription()` 描述抽取 |
| `scripts/audit_seo.mjs` | SEO 完整性审计 |
| `src/index.html` | SPA 入口模板（SEO 字段由构建注入） |
| `content/seo.json` | SEO 全局配置（`description`、`keywords`、`url`、`ogImage`、`noindexPageIds`） |
