# SSL Live 中文操作手册

这是 SSL Live 官方在线帮助的中文整理版。项目以章节文件维护内容，构建后交付为可直接部署到任意静态 Web 服务器的站点。

## 快速开始

要求：macOS 或 Linux、Node.js 20 及以上版本。

```bash
npm run build
npm run validate
npm run audit:content
npm run serve
```

发布时只需部署 `dist/` 目录。

调试时可以直接用浏览器打开 `dist/index.html`。构建产物同时包含用于 Web 
服务器的 JSON 数据和用于 `file://` 本地访问的同粒度脚本数据。

未安装 npm 时可直接运行：

```bash
node scripts/build_static_site.mjs
node scripts/validate_project.mjs
node scripts/validate_translations.mjs
node scripts/serve.mjs
```

## 目录

```text
.
├── content/                 # 可编辑内容
│   ├── site.json            # 章节分组、中文标题、站点元数据
│   ├── en/pages/            # 英文基准正文，一章一文件
│   └── zh/pages/            # 中文译文，一章一文件
├── docs/glossary.csv        # 机器可读术语表
├── src/                     # 阅读器源码
├── public/                  # 原样复制到站点的图片、PDF 等资源
├── scripts/                 # 构建、校验、审计与本地服务
├── upstream/                # 官方站点原始快照，仅用于溯源
├── docs/                    # 架构、翻译、贡献和部署说明
└── dist/                    # 构建产物，不提交版本库
```

## 常用命令

```bash
npm run build                  # 生成静态站点
npm run serve                  # 在本地预览 dist/
npm run check                  # 构建+执行所有阻断校验与报告生成（含下面六个分别报告）

npm run validate               # 生成两个结构/完整性报告：VALIDATION_PROJECT.md 与 VALIDATION_TRANSLATIONS.md
npm run audit:content          # 生成逐页内容复核报告
npm run audit:links            # 校验站内链接和锚点（失败项阻断）
npm run audit:terminology      # 生成术语审计报告
npm run audit:external-links   # 生成外部链接可达性报告

npm run upstream:snapshot      # 保存官方源站完整转储并生成更新差异
```

详细说明见 [架构](docs/ARCHITECTURE.md)、[贡献指南](docs/CONTRIBUTING.md)、[翻译流程](docs/TRANSLATION.md)、[样式与主题系统](docs/STYLING.md)、[源站转储](docs/UPSTREAM_SNAPSHOTS.md)、和[部署指南](docs/DEPLOYMENT.md)。

原始来源：[SSL Live Help](https://livehelp.solidstatelogic.com/)
