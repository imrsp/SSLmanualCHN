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
dist/sitemap.xml          ← 正式构建由当前章节与 standalone 页动态生成的站点地图
dist/robots.txt           ← 爬虫指令
dist/llms.txt             ← 面向大语言模型和 AI 智能体的规范化内容索引
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

## AI 智能体索引 (`dist/llms.txt`)

构建根据 `content/site.json`、`content/manifest.json` 和 `content/seo.json` 自动生成站点根路径下的 `llms.txt`，不在 `public/` 中维护静态副本。

文件使用 [llms.txt Markdown 结构](https://llmstxt.org/)。规范只要求一个 H1；生成器在正式构建中还会输出以下可选内容：

1. 一个 H1 站点标题
2. 一个 blockquote 站点摘要
3. 无标题的用途与内容说明
4. 按 `content/site.json` 顺序排列的 H2 章节
5. 每个 H2 下仅包含以 Markdown 链接开头的文件列表

列表只包含允许索引的手册章节，并使用 `content/seo.json` 的部署 URL 指向对应 `seo/<id>.html` 预渲染页面。`noindexPageIds` 中的章节和 standalone 页面不会进入 `llms.txt`；全站 noindex 构建不输出任何 H2 文件列表。抓取权限仍由 `robots.txt` 表达，`llms.txt` 只提供推理时的内容导航和上下文。

---

## 页面级 SEO 标签

每页 `<head>` 包含以下标签：

| 标签 | 内容 | 来源 |
|---|---|---|
| `<title>` | 中文标题 `\| SSL Live 中文操作手册` | `content/site.json` `pageTitlesZhById` |
| `<meta name="description">` | 正文首段 160 字摘要 | `extractMetaDescription()` 自动抽取 |
| `<meta name="robots">` | `index, follow`、`noindex, follow` 或 `noindex, nofollow` | 默认 `index`；`content/seo.json` 可配置页面级 `noindexPageIds`；Beta 构建启用全站 noindex |
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
- `<link rel="sitemap">` — 正式构建指向 `sitemap.xml`；全站 noindex 构建不输出
- `<meta name="robots">` — 正式构建为 `index, follow`，Beta 构建为 `noindex, nofollow`

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

### Beta 全站禁止索引

`.github/workflows/beta-deploy.yml` 设置 `SEO_NOINDEX=true` 后再运行 `npm run check`。构建会让 SPA 入口和全部 `seo/*.html` 使用 `noindex, nofollow`，不生成 `sitemap.xml`，从 SPA 入口和 `robots.txt` 移除 sitemap 声明，并让 `llms.txt` 不列出任何手册页面链接。`robots.txt` 仍允许爬虫访问 HTML，以确保爬虫能够读取 `noindex`。

该开关不应写入 `content/seo.json`，因为它描述的是部署通道，而不是正式站点的内容规则。正式构建不设置该变量，保持正常索引行为。

### 搜索引擎提交

部署后执行：

1. **Google Search Console**：提交 `sitemap.xml` URL，验证站点所有权
2. **Bing Webmaster Tools**：同上

---

## 构建与验证

### 构建时自动生成

`npm run build` 或 `npm run check` 会自动产出：

- `dist/seo/*.html` — 每个章节和 standalone 页面各一份
- `dist/sitemap.xml` — 正式构建包含 canonical 首页及未列入 `noindexPageIds` 的内容页；Beta 构建不生成
- `dist/robots.txt` — 允许爬虫读取 HTML，禁止抓取 `data/`、`themes/`、`src/`；Beta 构建不发布 Sitemap 指令
- `dist/llms.txt` — 正式构建仅列出允许索引的手册章节并链接到对应预渲染页面；Beta 构建不列出手册页面

### 独立审计

```bash
npm run audit:seo
```

检验项目包括：

- `robots.txt` 存在；正式构建含 Sitemap 指令，Beta 构建不含
- 正式构建的 `sitemap.xml` 存在且仅包含允许索引的 canonical URL；Beta 构建确认该文件不存在
- `llms.txt` 位于站点根路径，格式有效、内容与当前元数据一致且不包含 noindex 页面
- 所有 `seo/*.html` 文件存在
- 每页都有 `<title>`、description、canonical、JSON-LD、OG、Twitter、hreflang、SPA 重定向，正文 ID 唯一且不存在无 JavaScript 强制跳转
- 首页有 `rel=next`，末页有 `rel=prev`
- standalone 页存在且有 description 和 JSON-LD
- SPA 入口 `index.html` 有 description、OG、Twitter、canonical、robots，正式构建另有 sitemap，且各项值符合当前构建模式

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

location = /llms.txt {
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
| `scripts/build_static_site.mjs` | 生成预渲染页面、sitemap 和 llms.txt |
| `scripts/lib/llms_txt.mjs` | 生成并校验 llms.txt Markdown 结构 |
| `scripts/lib/manual.mjs` | `extractMetaDescription()` 描述抽取 |
| `scripts/audit_seo.mjs` | SEO 完整性审计 |
| `src/index.html` | SPA 入口模板（SEO 字段由构建注入） |
| `content/seo.json` | SEO 全局配置（`description`、`keywords`、`url`、`ogImage`、`noindexPageIds`） |
