# 架构说明

## 设计目标

- 章节独立，新增、修订、审校时只改少量文件。
- 英文基准与中文译文一一对应，便于结构比对和人工校对。
- 发布物可由任意静态 Web 服务器直接托管。
- 阅读器首屏不加载全部正文。
- `file://` 本地打开与 HTTP 静态托管都可工作。

## 数据流

```text
content/en/pages + content/zh/pages + content/manifest.json + content/site.json + content/themes/*.json
                                         |
                                         v
                              scripts/build_static_site.mjs
                                         |
                                         v
dist/index.html
dist/src/app.<hash>.js
dist/src/styles.<hash>.css
dist/data/catalog.{json,js}
dist/data/search-index-zh.{json,js}
dist/data/search-index-en.{json,js}
dist/data/themes.{json,js}
dist/data/pages/*.{json,js}
dist/themes/*.css
dist/assets/**
```

## 运行时加载模型

- `catalog.json` 只包含目录、标题、状态、章节分组和标题锚点。
- 阅读器进入某章时才请求对应的 `data/pages/<id>.json`。
- 中英文搜索索引拆成 `search-index-zh` 和 `search-index-en`，按需加载。
- 主题预设元数据来自 `data/themes.json`。

构建同时生成内容相同的 `.js` 数据文件：

- 通过静态 Web 服务器访问时读取 JSON。
- 直接打开 `dist/index.html` 时读取 `.js` 数据文件，绕过浏览器对 `file://` 页面 `fetch()` 的限制。

## 目录职责

- `content/`：人工维护的正文与元数据，是内容事实来源。
- `content/en/pages/`：英文基准正文。
- `content/zh/pages/`：中文译文和 standalone 页面。
- `content/themes/`：主题预设 JSON。
- `src/`：静态阅读器源码。
- `public/`：原样复制到发布物中的图片、PDF、favicon 和其他静态资源。
- `scripts/`：构建、验证、审计、本地预览、快照工具。
- `upstream/ssl-live-help/`：构建与审计使用的稳定上游基线。
- `upstream/snapshots/`：带日期和差异信息的官方源站完整转储。
- `reports/`：所有非运行时报告输出。
- `dist/`：可删除、可重复生成的发布目录。

## 添加章节

1. 在 `content/en/pages/` 添加英文基准文件。
2. 在 `content/zh/pages/` 添加同名译文文件。
3. 在 `content/manifest.json` 添加顺序、分组、标题、来源 URL 和输出文件名。
4. 在 `content/site.json` 的 `titlesZh` 中补对应中文标题。
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
