# 架构说明

## 设计目标

- 章节独立，新增、修订、审校时只改少量文件。
- 英文基准与中文译文一一对应，便于结构比对和人工校对。
- 发布物可由任意静态 Web 服务器直接托管。
- 阅读器首屏不加载全部正文。
- `file://` 本地打开与 HTTP 静态托管都可工作。

## 数据流

```text
content/en/pages + content/zh/pages + content/manifest.json + content/site.json + content/seo.json + content/themes/*.json
                                         |
                                         v
                              scripts/build_static_site.mjs
                                         |
                                         v
dist/index.html
dist/manifest.webmanifest
dist/sw.js
dist/src/app.<hash>.js
dist/src/styles.<hash>.css
dist/assets/fonts/*.<hash>.woff2
dist/data/catalog.{json,js}
dist/data/search-index-zh.{json,js}
dist/data/search-index-en.{json,js}
dist/data/themes.{json,js}
dist/data/pages/*.{json,js}
dist/themes/*.css
dist/assets/**
dist/seo/*.html
dist/sitemap.xml
dist/robots.txt
dist/llms.txt
```

## 运行时加载模型

- `catalog.json` 只包含目录、标题、状态、章节分组和标题锚点。
- 阅读器启动时并行请求 catalog、主题列表和当前路由对应的 `data/pages/<id>.json`，避免首章数据串行等待；后续进入其他章节时仍按需请求对应分片。
- 每章完成首次绘制后，阅读器在浏览器空闲阶段预取下一章分片；快速切换到其他章节时，尚未执行的旧预取会自动失效。
- 中英文搜索索引拆成 `search-index-zh` 和 `search-index-en`，按需加载。
- 主题预设元数据来自 `data/themes.json`。
- `manifest.webmanifest` 提供安装态元数据，`sw.js` 预缓存应用壳与核心元数据，并在访问过的页面分片和静态资源上做运行时缓存。Service Worker 的注册和换代安排在首章首次绘制后的空闲阶段，不阻塞正文；更新后的 SW 会在准备完成后接管。

构建同时生成内容相同的 `.js` 数据文件：

- 通过静态 Web 服务器访问时读取 JSON。
- 直接打开 `dist/index.html` 时读取 `.js` 数据文件，绕过浏览器对 `file://` 页面 `fetch()` 的限制。
- `file://` 仍保留为本地直开兼容模式；PWA 安装和 service worker 只在 `http(s)` / `localhost` 场景启用。

## 目录职责

- `content/`：人工维护的正文与元数据，是内容事实来源。
- `content/seo.json`：部署 URL、description、keywords、OG 图片、noindex 页面和 sitemap 回退日期的唯一 SEO 配置源。构建时同步生成 SPA 标签、预渲染标签、`robots.txt` 和 `llms.txt`。
- `content/upstream.json`：源站配置与内容合并进度的唯一记录；`mergedRevision` 表示当前中英文正文已经完整合并到的源站文档修订号，可以落后于最新抓取版本。
- `content/upstream-patches.json`：记录上游原文中已确认、但本站需要主动修正的错误；工程校验会确认上游证据仍存在且中英文目标均已应用补丁。
- `content/en/pages/`：英文基准正文。
- `content/zh/pages/`：中文译文和 standalone 页面。
- `content/themes/`：主题预设 JSON。
- `src/`：静态阅读器源码。
- `public/`：原样复制到发布物中的图片、PDF、favicon 和其他静态资源。
- `fonts/src/`：构建字体子集所用的 TTF 源文件；CI 构建生成 `dist/assets/fonts/*.<hash>.woff2`，并在最终样式表中写入对应的内容哈希文件名。
- `public/assets/manual/manifest.json`：手动维护的资源清单，用于告诉构建脚本哪些手册资源应被本地化并复制到发布物中。`downloaded` 和 `replaced` 资源会正常显示，`placeholder` 资源会在构建时被标记为 `hidden`，并由 CSS 直接隐藏。
- `scripts/`：构建、验证、审计、本地预览、快照工具。
- `upstream/snapshots/<Document Revision Number>/`：按官方文档修订号保存的不可覆盖源站转储。
- `upstream/snapshots/latest.json`：最新已抓取版本指针；内容审计不直接跟随它，而是使用 `content/upstream.json` 的 `mergedRevision`，避免异步合并期间误报。
- `reports/`：所有非运行时报告输出。
- `dist/`：可删除、可重复生成的发布目录。

## 添加章节

1. 在 `content/en/pages/` 添加英文基准文件。
2. 在 `content/zh/pages/` 添加同名译文文件。
3. 在 `content/manifest.json` 添加顺序、分组、标题、来源 URL 和输出文件名。
4. 在 `content/site.json` 的 `pageTitlesZhById` 中补对应中文标题。
5. 如需新分组，在 `content/site.json` 的 `sections` 中补充定义。
6. 运行 `npm run check`。

章节 ID 来自输出文件名去掉序号和扩展名后的部分，因此应保持稳定。

## Standalone 页面

standalone 页面不是目录章节，不出现在目录和搜索索引中，但仍由同一个阅读器加载。

使用方式：

1. 在 `content/zh/pages/` 下创建一个不在 `content/manifest.json` 中的 HTML 文件。
2. 在文件中提供：
   - `<meta name="x-standalone-id" content="<id>">`
   - `<meta name="x-standalone-title" content="...">`
   - `<meta name="x-standalone-title-zh" content="...">`
3. 运行 `npm run build`。
4. 通过 `#/page/<id>` 访问。

standalone 页面特点：

- 仅中文内容，无英文对照。
- 输出到 `dist/data/pages/<id>.json` 和 `.js`。
- 带 `standalone: true` 标记。
- 不进入 catalog，不进入搜索索引，不参与常规章节导航。

## 主题产物

构建脚本会扫描 `content/themes/*.json` 并生成：

- `dist/themes/<theme>.css`
- `dist/data/themes.json`
- `dist/data/themes.js`

运行时根据 `data/themes.json` 构建主题下拉菜单，再按需加载对应 CSS。
 
 ## SEO 产物
 
 构建脚本为每个章节和 standalone 页面生成 `dist/seo/<id>.html` 预渲染页面，供搜索引擎爬虫直接读取正文内容。
 
 每页包含完整的 SEO 标签：
 
 - `<title>` — 中文标题 `| SSL Live 中文操作手册`
 - `<meta name="description">` — 从正文自动抽取的描述文本
 - `<meta property="og:*">` / `<meta name="twitter:*">` — 社交分享标签
 - `<link rel="canonical">` — 规范 URL
 - `<link rel="alternate" hreflang="zh-CN">` / `hreflang="x-default"` — 中文与默认版本声明；英文内容没有独立预渲染 URL，因此不声明 `hreflang="en"`
 - `<link rel="prev">` / `<link rel="next">` — 前后章节导航
 - `<script type="application/ld+json">` — TechArticle 结构化数据
 
 预渲染页面附带 SPA 重定向脚本：有 JS 的用户自动跳转到 `index.html#/page/<id>` 获得完整体验；爬虫读取 HTML 正文内容。
 
 此外还生成：
 
 - `dist/robots.txt` — 根据 `content/seo.json` 动态生成，允许所有爬虫并指向 sitemap
 - `dist/sitemap.xml` — 涵盖 canonical 首页，以及未列入 `content/seo.json` `noindexPageIds` 的章节页和 standalone 页
 - `dist/llms.txt` — 按 llms.txt Markdown 规范生成的 AI 智能体内容索引；按 `content/site.json` 章节分组，链接到允许索引的 `seo/*.html`

`npm run audit:seo` 可独立验证所有 SEO 产物的完整性。

### Beta 全站 noindex 构建

`.github/workflows/beta-deploy.yml` 在执行 `npm run check` 时设置 `SEO_NOINDEX=true`。这是部署通道级开关，不写入 `content/seo.json`，因此不会改变正式版的 SEO 内容事实来源。

全站 noindex 模式会改变以下构建产物：

- `dist/index.html`：`<meta name="robots" content="noindex, nofollow">`
- `dist/seo/*.html`：全部使用 `noindex, nofollow`，覆盖 `noindexPageIds` 的页面级默认值
- `dist/sitemap.xml`：保留合法的空 XML 结构，但不发布 Beta URL
- `dist/robots.txt`：继续允许爬虫读取 HTML 中的 `noindex`，但不发布 Sitemap 指令

正式构建不设置 `SEO_NOINDEX`，继续生成 `index, follow`、正常 sitemap 和 Sitemap 指令。`SEO_NOINDEX` 仅接受字符串 `true` 或 `false`；其他值会使构建失败，避免拼写错误导致 Beta 意外进入可索引模式。

不能用 `robots.txt` 的 `Disallow: /` 代替 `noindex`。如果爬虫无法访问 HTML，就无法读取其中的 `noindex` 指令，URL 仍可能仅凭外部链接出现在搜索结果中。

服务器级 `X-Robots-Tag` 是可选的部署防护，不属于构建产物；Nginx、Caddy 配置及验证方式见[部署指南](DEPLOYMENT.md#可选的-x-robots-tag-防护)。
