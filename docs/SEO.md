# SEO 实现说明

## 设计原则

搜索引擎优化不改变 SPA 架构或 `file://` 兼容性。所有 SEO 产出在构建时生成，与运行时无关。

核心策略：为每个内容页面生成**静态预渲染 HTML**，供搜索引擎爬虫直接读取，真实用户被重定向到 SPA 获得完整体验。

---

## 架构概览

```text
content/en/pages + content/zh/pages + content/manifest.json + content/site.json
                                         |
                                         v
                              scripts/build_static_site.mjs
                                         |
                                         v
dist/seo/<id>.html        ← 预渲染页面（84 个）
dist/sitemap.xml          ← 站点地图（86 条）
dist/robots.txt           ← 爬虫指令
src/index.html            ← SPA 入口（含增强 meta 标签）
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
| `<meta name="robots">` | `index, follow` 或 `noindex, follow` | 默认 `index`，特定页面手动设为 `noindex` |
| `<meta property="og:title">` | 页面中文标题 | 同 title |
| `<meta property="og:description">` | 同 meta description | 同上 |
| `<meta property="og:type">` | `article` | 固定 |
| `<meta property="og:url">` | 预渲染页面的 canonical URL | `site.url` + `/seo/<id>.html` |
| `<meta property="og:image">` | 分享预览图片 | `site.ogImage` |
| `<meta property="og:locale">` | `zh_CN` | 固定 |
| `<meta name="twitter:card">` | `summary_large_image` | 固定 |
| `<meta name="twitter:title">` | 同 og:title | 同上 |
| `<meta name="twitter:description">` | 同 og:description | 同上 |
| `<link rel="canonical">` | 规范 URL，指向本预渲染页面 | `site.url` + `/seo/<id>.html` |
| `<link rel="alternate" hreflang="zh-CN">` | 中文版本 | 同 canonical |
| `<link rel="alternate" hreflang="x-default">` | 默认版本 | 同 canonical |
| `<link rel="prev">` / `<link rel="next">` | 按 manifest order 顺序的前后章节 | 自动计算 |
| `<script type="application/ld+json">` | TechArticle 结构化数据 | 由 `generatePrerenderPage()` 构建 |

### SPA 入口 (`dist/index.html`)

全局标签在 `src/index.html` 中定义，构建时原样复制到 `dist/index.html`：

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

构建产物的所有 URL 使用占位符 `https://<domain>/`。部署前替换为实际域名：

- `content/site.json` 中的 `url` 字段
- `src/index.html` 中的所有 `<domain>` 引用
- `public/robots.txt` 中的 `Sitemap:` 行

建议部署后通过以下命令全局替换：

```bash
# 替换为实际域名
sed -i '' 's|<domain>|manual.example.com|g' dist/sitemap.xml dist/seo/*.html dist/index.html
sed -i '' 's|<domain>|manual.example.com|g' dist/robots.txt
```

### 禁止索引的页面

当前设为 `noindex, follow` 的页面（`scripts/build_static_site.mjs`）：

- `About` — 版权和版本历史页，内容价值有限
- `about-dmt` — 关于本站的 standalone 页

如需修改，编辑 `generatePrerenderPage()` 中的 `noindexIds` 集合：

```js
var noindexIds = new Set(["About", "about-dmt"]);
```

### 搜索引擎提交

部署后执行：

1. **Google Search Console**：提交 `sitemap.xml` URL，验证站点所有权
2. **Bing Webmaster Tools**：同上

---

## 构建与验证

### 构建时自动生成

`npm run build` 或 `npm run check` 会自动产出：

- `dist/seo/*.html` — 84 个预渲染页面（83 章节 + 1 standalone）
- `dist/sitemap.xml` — 86 条站点地图（首页 + index.html + 84 预渲染页）
- `dist/robots.txt` — 允许所有爬虫，禁止抓取 `data/`、`themes/`、`src/`

### 独立审计

```bash
npm run audit:seo
```

检验 28 项指标，包括：

- `robots.txt` 存在且含 Sitemap 指令
- `sitemap.xml` 存在且条目数 ≥ 84
- 所有 `seo/*.html` 文件存在
- 每页都有 `<title>`、description、canonical、JSON-LD、OG、Twitter、hreflang、SPA 重定向
- 首页有 `rel=next`，末页有 `rel=prev`
- standalone 页存在且有 description 和 JSON-LD
- SPA 入口 `index.html` 有 description、OG、Twitter、canonical、sitemap、robots

该审计是 `npm run check` 的最后一个阻断步骤。

---

## sitemap 的 lastmod

每个页面的 `<lastmod>` 取自相应中文源文件的 `mtime`，而非构建日期：

- 章节页：`content/zh/pages/<NN-Slug>.html` 的修改日期
- standalone 页：`content/zh/pages/<slug>.html` 的修改日期
- 首页/index：`content/seo.json` 的修改日期

只编辑内容文件才会刷新 `lastmod`，单纯重建不会触发搜索引擎重新抓取。

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
| `public/robots.txt` | 爬虫指令模板 |
| `src/index.html` | SPA 入口（全局 SEO 标签） |
| `content/seo.json` | SEO 全局配置（`description`、`keywords`、`url`、`ogImage`、`noindexPageIds`） |
