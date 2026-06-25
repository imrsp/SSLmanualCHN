# Changelog
 
## v0.11.0 - 2026-06-25

本版本聚焦 PWA 交互体验和搜索功能优化。

### Added

- **搜索结果"加载更多"** — 搜索结果不再硬限制 12 条，初始显示 12 条，超出的在底部显示"加载更多（N）"按钮，点击追加 20 条；输入新关键字或切换搜索语言时自动重置显示数
- **PWA 手势滑动开关目录** — 移动端窄屏（≤760px）下，支持从左边缘滑动手势唤出目录面板
- **PWA iOS 安全区域适配** — 适配 iOS 刘海屏安全区域（safe-area-inset-*）

### Changed

- **PWA body 滚动锁定** — 目录打开时（≤760px）锁定 body 滚动，防止背景内容随触摸滚动

### Fixed

- 修复 `.toggle-wrapper` 在浅色模式下的颜色
- 修复搜索面板相关显示问题（sw.js 同步更新、index.html div 结构调整）
- 修复部分字体细节（CSS 字号/字形微调）
## v0.10.0 - 2026-06-25

本版本引入 PWA 渐进式 Web 应用支持和完整的搜索引擎优化（SEO），将字体定义重构为 CSS 变量令牌系统，并修复多项 UI 细节。

### Added

- **PWA 渐进式 Web 应用支持** — 新增 `manifest.webmanifest`、service worker（`sw.js`）、三组 PWA 图标（192/512/maskable），支持添加至主屏幕和离线回访
- **PWA 安装按钮** — 工具栏新增"安装应用"按钮，监听 `beforeinstallprompt` 事件，安装后自动隐藏；SW 更新下次进入时自动接管并清理旧缓存
- **PWA 缓存策略** — 构建哈希同时参与 SW 缓存键计算，预缓存仅保留应用壳与核心元数据；SW 清理仅操作 `ssl-manual-*` 命名空间避免误删其他同源缓存
- **SEO 预渲染页面** — 为 83 个章节页和独立页面 about-dmt 生成 `dist/seo/<id>.html` 静态 HTML，爬虫直接读取完整正文
- **站点地图与爬虫指令** — 生成 `dist/sitemap.xml`（86 条条目，含首页与所有章节）及 `dist/robots.txt`，禁止抓取 `data/` / `themes/` / `src/`
- **SEO 元标签** — 每页预渲染 HTML 内置 `<title>`、description、OG/Twitter 卡片、canonical、hreflang（zh-CN/x-default）、prev/next 导航、JSON-LD（TechArticle）结构化数据
- **SEO 审计脚本** — `npm run audit:seo` 检验 28 项指标（robots.txt、sitemap、所有预渲染页标签完整性、standalone 页存在性、SPA 入口标签），阻断式运行
- **SEO 文档** — `docs/SEO.md` 完整实现说明，涵盖架构、标签明细、描述抽取策略、部署配置
- **配置化 SEO 全局设置** — `content/seo.json` 管理站点级别 description、keywords、url、ogImage、noindex 页面 ID
- **浏览器测试指南** — `docs/AGENT_BROWSER_TESTING.md` 提供 Playwright 测试指引

### Changed

- **字体定义重构为 CSS 变量令牌** — 将分散的 `font-family` 定义归并为 `--font-sans`、`--font-serif`、`--font-mono`、`--font-brand`、`--font-symbol` 五个 CSS 自定义属性；正文、标题、表格、导航、工具提示等全部统一引用
- **字体回退策略** — 无衬线区域只回退到无衬线链路，正文衬线区域只回退到衬线链路；`--font-mono` 追加无衬线 fallback 解决 Windows 显示问题
- **Favicon 全面优化** — SVG 矢量图标重新设计，16/32/48 多尺寸 PNG 全部优化体积，apple-touch-icon 从 25KB 压缩至 4KB，PWA 图标精简至 4KB/15KB
- **构建产物缓存失效加固** — buildHash 改为依赖完整发布产物（manifest、icons、data、theme 等），确保任何文件变更都能触发缓存更新

### Fixed

- 修复 `.translation-badge` 在浅色模式下的显示及 dot 样式问题
- 修复 `.preset-option` 主题色在深色/浅色模式下的颜色
- 修复 sidebar-about 显示
- `.nav-section-title` 字体调大
- 修复 `.search-box` 输入框溢出问题（text-overflow ellipsis + overflow hidden + white-space nowrap）
- 修复 LAN-009 / LAN-012 页面表格显示问题（中文内容溢出），同时校订 LAN-009 中文翻译结构


## v0.9.9 - 2026-06-24

本版本主要集中在主题安全、标题映射重构、构建校验加固以及阅读体验修正。

### Changed

- **章节中文标题映射重构** — `content/site.json` 改为以 `pageTitlesZhById` 按页面 ID 存储中文标题，构建与校验流程同步改为按 ID 读取，避免再依赖数组顺序
- **主题预设下拉改为原生 DOM 组装** — 主题菜单不再用 `innerHTML` 拼接，改为逐项创建按钮和色块，并对颜色值做合法性校验，减少主题 JSON 作为 HTML/CSS sink 的风险
- **构建与校验规则加固** — 新增独立页 ID 重复/冲突检查，并在 `glossary.csv` 解析时拒绝多行引号字段
- **静态资源缓存策略补强** — 为静态资源补充 Nginx gzip 与缓存策略，`index.html` 采用短缓存，哈希版 `js/css/json/themes` 采用长缓存并标记 `immutable`

### Fixed

- 修复 `data-theme` 与 `prefers-color-scheme` 在浅色模式下的冲突，确保悬停样式只跟随实际主题状态
- 修复页面请求失败后缓存住 rejected promise 的问题，避免同一章节在异常后持续加载失败
- 修复字体资源路径，Noto Sans SC / Noto Serif SC 可以在构建产物中正确加载
- 修复浅色模式下 LAN 标题颜色偏暗、面包屑在窄宽度下溢出，以及移动端正文段落字号偏小的问题

## v0.9.0 - 2026-06-21

本版本进行全面项目清理与架构重构：重写 dist/src 构建管线与目录结构、引入中文字体系统、更新全部项目文档，并集中修复 b0.8 版本发布后的交互细节问题。

### Added

- **中文字体系统** — 引入 Noto Sans SC（无衬线）与 Noto Serif SC（衬线）完整字体资源（Regular/Bold），构建脚本支持 CI 环境自动子集化
- **构建产出哈希化** — `build_static_site.mjs` 新增 asset hash 机制，资源文件携带内容摘要，浏览器缓存策略更可靠

### Changed

- **目录结构与构建管线重构** — 全面重组 `src/` 和 `dist/` 文件布局，按功能组归位，构建路径同步调整，manifest 文件迁移，删除 content 下废弃的 TERMINOLOGY.md 和 README 文件
- **项目文档全面重写** — 重写 `README.md` 及全部 `docs/*` 文档，新增 `docs/theme-tokens.css` 令牌参考文件，`glossary.csv` 从 `content/` 迁至 `docs/`
- **审计系统更新** — `audit_content.mjs`、`audit_terminology.mjs`、`validate_project.mjs`、`validate_translations.mjs` 适配新目录结构
- **代码审查与项目清理** — 修复大量Bug。删除无用的 content 文件、`src/theme-tokens.css` 及废弃的 `docs/PROOFREADING_STATUS.md`，更新 `.gitignore`

### Fixed

- 语言切换按钮在滚动时固定位置，防止随页面移动
- 英文版目录（TOC）点击后正确定位至对应章节，而非滚动至顶部
- `<h4>` 标题在浅色模式下颜色浅淡，无法辨识
- `nav-group` 阴影在特定布局下错位或缺失
- 760px 响应式断点阴影渲染不完整
- 构建配置中图片预览与外部文件引用修正
- 主题 JSON 配置细节调整（acid/red 主题）

## b0.8 - 2026-06-20

本版本引入完整的样式主题系统，包括色相驱动的色彩主题引擎、深色/浅色双模式切换、可扩展的主题预设配置，以及配套的构建管线和文档。

### Added

- **CSS 变量令牌系统** -- 全面重组 src/styles.css 变量体系：9 组令牌 30+ 个 CSS 自定义属性，表面/文字/强调/语义别名/光晕/阴影/布局全部分类管理
- **色相驱动主题引擎** -- 基于 --_hue 单一色相自动推导 4 个强调色（acid/cyan/amber/red）的深色和浅色两套版本
- **深色/浅色模式切换** -- 工具栏主题按钮，短按切换、长按 500ms 恢复跟随系统，状态持久化至 localStorage
- **主题预设系统** -- content/themes/*.json JSON 配置，npm run build 自动生成主题 CSS，运行时通过下拉菜单动态切换
- **内置主题** -- 清凉绿（默认，hue 77 度）、经典红（hue 3 度）、深海蓝（hue 210 度）
- **Favicon** -- SVG 矢量化 favicon 含 SSL 红品牌色，配 16/32/48/192/512 多尺寸 PNG + apple-touch-icon

### Fixed

- 修正项目内相关文档描述与结构说明

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
