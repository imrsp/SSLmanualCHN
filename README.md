# Solid State Logic Live 中文操作手册

这是 SSL Live 官方在线帮助的中文整理版。项目以章节文件维护内容，构建后交付为可直接部署到任意静态 Web 服务器的站点。

---

## 🚀 快速开始

### 📋 环境要求
* macOS 或 Linux
* Node.js 20 及以上版本

### 🛠️ 快捷构建命令
```bash
npm run build
npm run validate
npm run audit:content
npm run serve
```

### 📦 部署与调试说明

* **发布部署：** 发布时只需部署 `dist/` 目录。
* **本地调试：** 调试时可以直接用浏览器打开 `dist/index.html`；要测试安装态和离线态，请使用 `npm run serve` 在 `localhost` 下访问。
* **数据兼容：** 构建产物同时包含用于 Web 服务器的 JSON 数据和用于 `file://` 本地访问的同粒度脚本数据。
* **PWA 支持：** 站点提供 `manifest.webmanifest` 与 service worker，安装功能只对 `http(s)`/`localhost` 生效，`file://` 仅作为本地兼容回退；服务端更新会在下次进入站点时自动生效。
* **免免环境运行：** 未安装 npm 时可直接运行：

```bash
  node scripts/build_static_site.mjs
  node scripts/validate_project.mjs
  node scripts/validate_translations.mjs
  node scripts/serve.mjs
```

---

## 📂 项目目录结构

```text
.
├── content/                  # 可编辑内容
│   ├── manifest.json         # 英文章节清单与站点顺序
│   ├── site.json             # 章节分组、中文标题、站点元数据
│   ├── en/pages/             # 英文基准正文，一章一文件
│   └── zh/pages/             # 中文译文，一章一文件
├── docs/glossary.csv         # 机器可读术语表
├── src/                      # 阅读器源码
├── public/                   # 原样复制到站点的图片、PDF 等资源
├── scripts/                  # 构建、校验、审计与本地服务
├── upstream/                 # 官方站点原始快照，仅用于溯源
├── docs/                     # 架构、翻译、贡献和部署说明
└── dist/                     # 构建产物，不提交版本库
```

---

## 💻 常用命令


### 🔄 核心构建与服务

* `npm run build`：生成静态站点
* `npm run serve`：在本地预览 `dist/`
* `npm run check`：构建 + 执行所有阻断校验与报告生成（含下面七个分别报告）

### 📊 校验与审计报告

* `npm run validate`：生成两个结构/完整性报告：`VALIDATION_PROJECT.md` 与 `VALIDATION_TRANSLATIONS.md`
* `npm run audit:content`：生成逐页内容复核报告
* `npm run audit:links`：校验站内链接和锚点（失败项阻断）
* `npm run audit:terminology`：生成术语审计报告
* `npm run audit:external-links`：生成外部链接可达性报告
* `npm run audit:seo`：验证 SEO 标签完整性

### 💾 溯源管理

* `npm run upstream:snapshot`：保存官方源站完整转储并生成更新差异

---

## 📝 文档指南

* 🏗️ **[架构说明](docs/ARCHITECTURE.md)** (`docs/ARCHITECTURE.md`)
* 站点数据流、目录职责、章节接入方式和独立页面机制说明。


* 🚀 **[部署指南](docs/DEPLOYMENT.md)** (`docs/DEPLOYMENT.md`)
* 详细说明部署方式、缓存策略和静态托管约束。


* 🤝 **[贡献指南](docs/CONTRIBUTING.md)** (`docs/CONTRIBUTING.md`)
* 日常维护规范，涵盖正文与元数据修改范围、Git 提交流程以及提交前检查要求。


* 🌐 **[翻译流程](docs/TRANSLATION.md)** (`docs/TRANSLATION.md`)
* 翻译与人工校对流程，明确了结构保真要求、校验顺序，以及如何结合 `reports/` 处理人工复核项。


* 📖 **[翻译策略](docs/TERMINOLOGY.md)** (`docs/TERMINOLOGY.md` / `docs/glossary.csv`)
* 术语规范的双层来源：`glossary.csv` 为自动化脚本与 Agent 使用的结构化术语表；`TERMINOLOGY.md` 为人工可读的翻译规则与上下文。


* 🎨 **[样式与主题系统](docs/STYLING.md)** (`docs/STYLING.md`)
* 阅读器样式系统、主题变量和颜色机制说明。`docs/theme-tokens.css` 仅作为 Token 参考副本，不参与构建或运行时加载。


* 📦 **[源站转储](docs/UPSTREAM_SNAPSHOTS.md)** (`docs/UPSTREAM_SNAPSHOTS.md`)
* 官方源站转储与基线快照维护说明。


* 🤖 **[外部翻译指南](docs/EXTERNAL_TRANSLATION.md)** (`docs/EXTERNAL_TRANSLATION.md`)
* 使用外部翻译工具生成初译候选稿时的参考与提示词策略。



---

原始来源：[SSL Live Help](https://livehelp.solidstatelogic.com/)
