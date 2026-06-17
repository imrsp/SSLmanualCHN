# Changelog

## b-audit1 - 2026-06-18

已校对 page 1-10

## b0.7 - 2026-06-16

本版本新增项目自身的关于独立页面，引入 Standalone 页面机制使其独立于目录和搜索索引，同时修复了 macOS 文件系统不区分大小写导致的构建冲突。

### Added

- 新增 `content/zh/pages/about-dmt.html` 关于页面，使用中文介绍项目背景与用途，不参与站点目录与全文搜索索引。
- 构建脚本 `scripts/build_static_site.mjs` 新增 `prepareStandaloneDocument()` 函数和独立页面处理流程，页面获得 `standalone: true` 标记，构建时自动排除在 `catalog` 和 `search-index` 之外。
- 前端 `src/app.js` 新增 `renderStandalonePage()` 渲染函数，独立页面不含翻译徽章、英文原文对照、语言切换按钮以及前/后章节导航。
- `route()` 逻辑在目录匹配未命中时自动尝试加载独立页面作为回退。

### Fixed

- 修复 `about.json` 与 `About.json` 在 macOS APFS 不区分大小写下文件名互相覆盖的冲突——独立页面 ID 改为 `about-dmt`，所有引用同步更新。
- gitignore 了 /report 目录

### Changed

- footer 中关于页面的链接路径更新为 `#/page/about-dmt`。
- `docs/ARCHITECTURE.md` 新增「添加独立页面」章节，记录创建步骤与约束条件。

## b0.6 - 2026-06-14

本版本引入 GitHub Actions CI/CD 流水线，`main` 分支推送后自动构建并部署站点至远程服务器，同时优化了项目首页描述文案。

### Added

- 新增 GitHub Actions 部署工作流（`.github/workflows/deploy.yml`）：`main` 分支推送时自动执行 `npm run build`，通过 SSH + rsync 将 `dist/` 上传至远程服务器。
- 支持 `workflow_dispatch` 手动触发部署，便于紧急发布。
- 构建步骤使用 Node.js 20 环境，部署密钥通过仓库 Secrets 安全管理。

### Changed

- 优化首页描述文案，更清晰的项目定位与功能说明。
- 经 b0.61 / b0.62 两次修复，完善部署流程中的目标目录清理与 SSH 密钥配置逻辑。

## b0.5 - 2026-06-14

本版本重构了全文搜索体验：搜索结果现以悬停面板展示，包含标题、所属章节与原文引用片段，点击可直达对应位置；页面正文中搜索关键词附带动效高亮，搜索面板在导航后保持可用。

### Added

- 搜索结果下拉面板，显示匹配页面的标题、章节标题与带高亮的原文引用片段。
- 页面正文关键词高亮，使用 TreeWalker 安全替换文本节点并附带 `highlight-pop` 过渡动画。
- 搜索面板遮罩点击关闭、Escape 键关闭、搜索框失焦关闭等多重关闭逻辑。

### Changed

- 构建脚本 `splitContentIntoBlocks()` 将页面内容按标题分块编入搜索索引，使引用片段能精确定位到具体章节。
- `hashchange` 处理器不再销毁搜索结果面板，仅隐藏；`route()` 在页面渲染完成后自动恢复搜索结果和高亮。
- 语言切换后自动重新高亮当前搜索词。
- 搜索提示文案改为"可搜索中英文标题与正文"。

## b0.3 - 2026-06-13

本版本优化了站点目录与移动端导航交互，减少了桌面与窄屏浏览时的误触与布局挤压。

### Changed

- 优化右侧目录的关闭逻辑，点击页面其他区域时会自动收起目录面板。
- 调整移动端目录链接的栅格与内边距，改善窄屏下的可点按区域与视觉密度。

## b0.21 - 2026-06-13

本版本新增并完成三篇 SSL Live Application Note 的中文初步翻译，同时完善目录展示、页面语义和发布资源。

### Added

- 新增 LAN-009《配置 Live 控制台以使用 Dante I/O》。
- 新增 LAN-010《Live Dante VTL / DDR 概念与配置》。
- 新增 LAN-012《Live 控制台 IP 地址配置指南》。

### Changed

- 将目录分类 `Live Application Note` 本地化为"LIVE 应用笔记"。
- 校订三篇应用笔记中的 Dante 网络术语、界面标签、表格、段落结构和技术表述。
- 将应用笔记页首的编号、主题和版本信息改为非标题语义，同时保留原有视觉样式，避免其进入本页目录。
- 按项目现有风格格式化三篇中文 HTML，改善换行与缩进。
- 更新全量审校状态、内容审计和术语审计报告，站点现包含 83 篇完整双语页面。

### Removed

- 删除 LAN-009 中无实际内容作用的 Logo 和分割线图片及其资源清单记录。

## b0.2 - 2026-06-12

Beta 内部测试 0.2 版。此版本将当前项目基线纳入 Git 管理，并补充变更日志入口，作为后续版本迭代的起点。

### Included

- 初始化仓库的首次可追踪版本。

## b0.1 - 2026-06-10

First Beta Launch.
