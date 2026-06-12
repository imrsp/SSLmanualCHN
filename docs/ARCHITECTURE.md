# 架构说明

## 设计目标

- 章节独立，新增和校对时只修改少量文件。
- 英文基准与中文译文一一对应，便于结构比对。
- 发布物可由 Nginx、Caddy、对象存储或 Pages 服务直接托管。
- 首屏不下载全部正文和图片。

## 数据流

```text
content/en/pages + content/zh/pages + content/site.json
                         |
                         v
              scripts/build_static_site.mjs
                         |
                         v
dist/index.html + data/catalog.{json,js} + data/pages/*.{json,js} + assets/
```

`catalog.json` 只包含目录、标题、状态和标题锚点。阅读器进入某章时才请求对应的 `data/pages/<id>.json`。全文搜索索引也延迟到用户第一次搜索时加载。

构建同时生成内容相同的 `.js` 数据文件。通过静态 Web 服务器访问时读取
JSON；直接打开 `dist/index.html` 时读取脚本数据，从而绕过浏览器对
`file://` 页面 `fetch()` 和 ES module 的本地文件限制。两种模式都保持章节
独立和按需加载。

## 目录职责

- `content/`：人工维护的正文和元数据，是内容事实来源。
- `src/`：静态阅读器，不包含手册正文。
- `public/`：正文实际引用、构建时不经转换直接发布的图片和附件；不保留旧站运行时脚本、样式或导航资源。
- `upstream/ssl-live-help/`：构建与审计使用的精简稳定快照。
- `upstream/snapshots/`：带日期、校验值和更新差异的官方源站完整转储。
- `scripts/`：确定性的构建和校验工具。
- `dist/`：可删除、可重复生成的发布目录。

## 添加章节

1. 在 `content/en/pages/` 添加英文基准；译文完成后在 `content/zh/pages/` 添加同名文件。缺少译文时站点显示英文并标记为待翻译。
2. 在 `content/en/manifest.json` 添加顺序、分组、标题、来源 URL 和文件名。
3. 在 `content/site.json` 的 `titlesZh` 对应位置添加中文标题。
4. 如需新分组，在 `content/site.json` 的 `sections` 中添加。
5. 运行 `npm run check`。

章节 ID 来自文件名去掉序号和扩展名后的部分，因此应保持稳定。
