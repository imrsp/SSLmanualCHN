# 样式与主题系统

## 总览

阅读器样式由 `src/styles.css` 提供基础外观，由 `content/themes/*.json` 提供主题预设，再由 `scripts/build_static_site.mjs` 在构建时生成 `dist/themes/*.css` 与 `dist/data/themes.json`。

主题系统是 hue-driven 的：

- `src/styles.css` 定义默认 token 和组件样式
- `content/themes/*.json` 提供不同主题的色相和少量配色参数
- 构建脚本输出主题 CSS
- 运行时从 `data/themes.json` 构建下拉菜单，并按需加载对应主题文件

`docs/theme-tokens.css` 只是参考副本，不参与构建，也不会被浏览器加载。

`fonts/src/` 保存的是字体源文件，用于生成和维护子集字体；运行时实际加载的是构建产物中的 `.woff2`，不要把这些 TTF 当作前端直接引用资源来移动或删除。

## Token 分层

当前 token 可以按职责理解为四层：

- 基础表面与文字：`--black`、`--panel`、`--ink`、`--muted` 等
- 主题色相输入：`--_hue`、`--_hue-link`、`--_hue-warn`、`--_hue-error`
- 推导出的强调与状态色：`--acid`、`--cyan`、`--amber`、`--red`
- 依赖主题的辅助 token：`--_accent-glow`、`--_accent-surface`、`--_accent-table-header`、`--brand-accent-text`

字体也按 token 收敛：

- `--font-sans`：阅读器 UI、标题、表格和高亮注释
- `--font-serif`：正文内容
- `--font-mono`：编号、状态、工具提示、标签和路径元信息
- `--font-brand`：顶部品牌标记
- `--font-symbol`：搜索符号等装饰性字形

字体 fallback 的排序原则是：

- 第一优先级是已嵌入的 Noto 子集字体
- 第二优先级是当前 macOS 仍会优先命中的系统字体
- 第三优先级才是 Windows / 通用 fallback
- 无衬线区域只回退到无衬线链路，正文衬线区域只回退到衬线链路

默认值定义在 [src/styles.css](/Users/imrsp/Documents/Codex/SSLmanualCHN/src/styles.css:6)。

## 主题 JSON

每个主题对应 `content/themes/<name>.json` 一个文件，当前字段包括：

- `name`
- `label`
- `description`
- `order`
- `author`
- `default`
- `color`
- `hue.primary`
- `hue.link`
- `hue.warn`
- `hue.error`
- `dark.*.s/l`
- `light.*.s/l`
- `brandAccentText`
- `brandAccentTextLight`
- `aboutGlow.dark.r/g/b`
- `aboutGlow.light.r/g/b`

当前已有主题：

- `acid.json`
- `red.json`
- `blue.json`

## 构建产物

执行 `npm run build` 时，`scripts/build_static_site.mjs` 会直接完成主题生成：

1. 扫描 `content/themes/*.json`
2. 生成 `dist/themes/<theme>.css`
3. 生成 `dist/data/themes.json`
4. 生成 `dist/data/themes.js`

`scripts/build_theme.mjs` 是独立 CLI 工具，可单独把某个主题 JSON 转成 CSS，但它不是构建管线的必经步骤。

## 运行时行为

运行时逻辑在 [src/app.js](/Users/imrsp/Documents/Codex/SSLmanualCHN/src/app.js:46)。

关键点：

- `state.theme` 控制深色 / 浅色 / auto
- `state.themePreset` 控制当前主题预设
- 页面启动时先加载 `data/themes.json`
- 再从 `localStorage('ssl-manual-theme')` 与 `localStorage('ssl-manual-preset')` 恢复用户选择
- 如果当前预设不是默认主题，运行时动态插入 `<link rel="stylesheet">` 加载 `themes/<name>.css`

## 深色 / 浅色模式

当前模式状态：

- `auto`：跟随系统 `prefers-color-scheme`
- `dark`
- `light`

模式切换逻辑：

- 点击主题按钮：在深色和浅色之间切换
- 长按 500ms：恢复 `auto`

实现见 [src/app.js](/Users/imrsp/Documents/Codex/SSLmanualCHN/src/app.js:53)。

## `theme-color` 元标签

源模板 [src/index.html](/Users/imrsp/Documents/Codex/SSLmanualCHN/src/index.html:6) 的初始 `theme-color` 应与默认深色壳保持一致。

运行时 `applyTheme()` 会根据当前生效模式把它更新为：

- 深色：`#111513`
- 浅色：`#f5f6f3`

## 浅色模式覆盖

浅色模式不只是替换几个 token，还对部分组件做了额外覆盖，例如：

- 文档标题颜色
- 侧栏分组和导航项
- 搜索框和搜索开关
- 搜索结果高亮
- 目录面板
- 遮罩层
- note 块
- 表格表头和交替行
- 侧栏页脚与 About 区域

这些规则定义在 `:root[data-theme="light"]` 及相关 light-mode 选择器中，见 [src/styles.css](/Users/imrsp/Documents/Codex/SSLmanualCHN/src/styles.css:950)。

## 新增主题的最短流程

1. 复制一个现有 `content/themes/*.json` 作为模板。
2. 修改 hue、明度/饱和度、`brandAccentText`、`aboutGlow`。
3. 运行 `npm run build`。
4. 打开站点检查主题下拉菜单、深浅模式、导航高亮、表格表头、品牌标记和 About 发光效果。

## 维护规则

- 主题相关事实以 `src/styles.css`、`content/themes/*.json`、`scripts/build_static_site.mjs`、`src/app.js` 为准。
- `docs/theme-tokens.css` 只保留为参考副本，必须与当前实现同步；如果不同步，应先修正文档而不是依赖它做实现判断。
- 不要直接编辑 `dist/themes/*.css`。
