# 样式与主题系统

SSL Live 中文操作手册的 CSS 架构围绕一个**色相驱动（hue-driven）**的主题引擎设计。所有强调色和状态色从单一基础色相自动推导，支持深色/浅色双模式切换和任意数量的预设主题。

---

## 一、CSS 变量令牌系统

所有 CSS 变量定义在 `src/styles.css` 的 `:root` 中，按用途分组。`src/theme-tokens.css` 包含一份独立参考副本，不参与构建加载，只用作查阅模板。

### 1.1 令牌分组总览

| 分组 | 变量 | 用途 |
|---|---|---|
| 表面与背景 | `--black`, `--panel`, `--panel-soft`, `--line` | 页面背景、卡片表面、边框和分割线 |
| 文字颜色 | `--ink`, `--muted` | 正文、次要/辅助文字 |
| 强调与状态 | `--acid`, `--cyan`, `--amber`, `--red` | 品牌色、链接、警告、错误 |
| 语义别名 | `--color-bg-page`, `--color-surface`, `--color-surface-elevated`, `--color-border`, `--color-text-primary`, `--color-text-secondary`, `--color-accent`, `--color-accent-link`, `--color-warning`, `--color-error` | 未来颜色编辑器的稳定入口 |
| 表面便捷变量 | `--topbar-bg`, `--sidebar-bg`, `--reader-toolbar-bg`, `--grid-line-alpha`, `--grid-line-beta` | 组件级背景和网格线 |
| 光晕与高亮 | `--about-glow-r` / `--about-glow-g` / `--about-glow-b`, `--_accent-glow`, `--_accent-surface`, `--_accent-table-header` | About 链接发光、强调色表面 |
| 表层文本 | `--about-label-text`, `--brand-accent-text` | 表层上的文字颜色（品牌标记、About 标签） |
| 阴影 | `--outline-shadow`, `--sidebar-shadow` | 浮动面板阴影 |
| 布局 | `--sidebar-width`, `--topbar-height` | 侧栏宽度、顶栏高度 |

### 1.2 变量级联方式

强调色和状态色（`--acid` / `--cyan` / `--amber` / `--red`）从色相变量推导而来：

```css
:root {
  --_hue: 77;
  --acid: hsl(var(--_hue), 100%, 61%);
  --color-accent: var(--acid);
}
```

语义别名（`--color-text-primary` 等）通过 `var()` 引用原始变量。所有 UI 元素引用语义别名或直接使用原始变量，切换模式或主题时整站颜色自动更新。

### 1.3 深色模式默认值

`src/styles.css` 的 `:root` 块定义深色模式值（同时也是默认值）：

| 变量 | 值 |
|---|---|
| `--black` | `#0b0e0c` |
| `--panel` | `#171c19` |
| `--panel-soft` | `#1d2420` |
| `--line` | `#303a34` |
| `--ink` | `#eef2ed` |
| `--muted` | `#8d9891` |
| `--acid` | `hsl(var(--_hue), 100%, 61%)` |
| `--cyan` | `hsl(var(--_hue-link), 78%, 59%)` |
| `--amber` | `hsl(var(--_hue-warn), 100%, 63%)` |
| `--red` | `hsl(var(--_hue-error), 85%, 63%)` |
| `--topbar-bg` | `rgba(12,15,13,.94)` |
| `--sidebar-bg` | `rgba(18,22,19,.97)` |
| `--reader-toolbar-bg` | `rgba(11,14,12,.92)` |
| `--grid-line-alpha` | `rgba(255,255,255,.018)` |
| `--grid-line-beta` | `rgba(255,255,255,.012)` |
| `--about-glow-r/g/b` | `199` / `255` / `55` |
| `--_accent-glow` | `rgba(199,255,55,.25)` |
| `--_accent-surface` | `hsl(var(--_hue), 18%, 87%)` |
| `--_accent-table-header` | `hsl(var(--_hue), 12%, 91%)` |
| `--about-label-text` | `#d4dbd6` |
| `--brand-accent-text` | `#0c110d` |
| `--outline-shadow` | `rgba(0,0,0,.55)` |
| `--sidebar-shadow` | `rgba(0,0,0,.5)` |

### 1.4 浅色模式值

浅色模式通过 `:root[data-theme="light"]` 选择器覆盖上述变量。

| 变量 | 值 |
|---|---|
| `--black` | `#f5f6f3` |
| `--panel` | `#f0f1ef` |
| `--panel-soft` | `#e8eae7` |
| `--line` | `#d4d9d6` |
| `--ink` | `#2d332f` |
| `--muted` | `#6e7a72` |
| `--acid` | `hsl(var(--_hue), 54%, 51%)` |
| `--cyan` | `hsl(var(--_hue-link), 71%, 34%)` |
| `--amber` | `hsl(var(--_hue-warn), 100%, 39%)` |
| `--red` | `hsl(var(--_hue-error), 61%, 48%)` |
| `--topbar-bg` | `rgba(245,246,243,.94)` |
| `--sidebar-bg` | `rgba(240,241,239,.97)` |
| `--reader-toolbar-bg` | `rgba(245,246,243,.92)` |
| `--grid-line-alpha` | `rgba(0,0,0,.04)` |
| `--grid-line-beta` | `rgba(0,0,0,.025)` |
| `--about-glow-r/g/b` | `140` / `198` / `63` |
| `--_accent-glow` | `rgba(140,198,63,.25)` |
| `--_accent-surface` | `hsl(var(--_hue), 18%, 87%)` |
| `--_accent-table-header` | `hsl(var(--_hue), 12%, 91%)` |
| `--about-label-text` | `#2d332f` |

> 注：上表中表面/文字/光晕值为色相 `--_hue: 77`（SSL 经典绿）的推导结果。切换主题后这些值随色相变化。

---

## 二、色彩主题引擎

主题引擎的核心思想：**只需指定一个基础色相值 `--_hue`，脚本自动生成 4 个强调色的深色和浅色两套版本**。

### 2.1 色相偏移关系

4 个强调色基于不同的色相变量，彼此有固定偏移：

| 颜色 | CSS 变量 | 用途 | 偏移 | 默认值 |
|---|---|---|---|---|
| 基础强调色 | `--_hue` / `--acid` | 品牌色、高亮、侧栏焦点 | — | 77° (绿) |
| 链接色 | `--_hue-link` / `--cyan` | 超链接、文档中的次级标题色 | +108° | 185° (青) |
| 警告色 | `--_hue-warn` / `--amber` | 注意块、警告标记 | -39° | 38° (琥珀) |
| 错误色 | `--_hue-error` / `--red` | 错误块、破坏性操作 | -74° | 3° (红) |

### 2.2 推导公式

每个强调色在深色和浅色模式下使用不同的饱和度和明度参数：

```css
/* 深色模式：高饱和 + 中高亮度 */
--acid:  hsl(var(--_hue),      100%, 61%);
--cyan:  hsl(var(--_hue-link),  78%, 59%);
--amber: hsl(var(--_hue-warn), 100%, 63%);
--red:   hsl(var(--_hue-error), 85%, 63%);

/* 浅色模式：中饱和 + 中低亮度 */
--acid:  hsl(var(--_hue),      54%, 51%);
--cyan:  hsl(var(--_hue-link), 71%, 34%);
--amber: hsl(var(--_hue-warn), 100%, 39%);
--red:   hsl(var(--_hue-error), 61%, 48%);
```

### 2.3 从色相推导的其他变量

| CSS 变量 | 推导方式 |
|---|---|
| `--_accent-glow` | 从 `aboutGlow` 的 RGB 值生成 `rgba(r,g,b,.25)` |
| `--about-glow-r/g/b` | JSON 中直接预设 RGB 值（约等于 `--acid` 的 sRGB 分解） |
| `--brand-accent-text` | JSON 中直接预设（品牌标记上的文字，需确保与 `--acid` 有足够对比度） |
| `--_accent-surface` | `hsl(var(--_hue), 18%, 87%)`（浅色模式导航高亮背景） |
| `--_accent-table-header` | `hsl(var(--_hue), 12%, 91%)`（浅色模式表格表头背景） |
| `--about-label-text` | 浅色块中手写 hex，中性色调，不参与推导 |

### 2.4 不参与推导的变量

以下变量在深色和浅色模式下始终使用手写 hex / rgba，与主题色相无关：

- **文字色**：`--ink`, `--muted`
- **表面/背景色**：`--black`, `--panel`, `--panel-soft`, `--line`
- **表面便捷变量**：`--topbar-bg`, `--sidebar-bg`, `--reader-toolbar-bg`, `--grid-line-alpha`, `--grid-line-beta`
- **布局和阴影**：`--sidebar-width`, `--topbar-height`, `--outline-shadow`, `--sidebar-shadow`
- **About 标签文字**：`--about-label-text`

---

## 三、主题预设 JSON 配置

每个主题对应 `content/themes/<name>.json` 一个 JSON 配置文件。

### 3.1 完整示例（`acid.json`）

```json
{
  "name": "acid",
  "label": "清凉绿",
  "description": "默认主题，鲜艳视觉风格",
  "order": 1,
  "author": "DMT Club",
  "default": true,
  "color": "#c7ff37",

  "hue": {
    "primary": 77,
    "link": 160,
    "warn": 38,
    "error": 3
  },

  "dark": {
    "acid":  { "s": 100, "l": 61 },
    "cyan":  { "s": 78,  "l": 59 },
    "amber": { "s": 100, "l": 63 },
    "red":   { "s": 85,  "l": 63 }
  },

  "light": {
    "acid":  { "s": 54,  "l": 51 },
    "cyan":  { "s": 71,  "l": 34 },
    "amber": { "s": 100, "l": 39 },
    "red":   { "s": 61,  "l": 48 }
  },

  "brandAccentText": "#0c110d",
  "brandAccentTextLight": "#0c110d",

  "aboutGlow": {
    "dark":  { "r": 199, "g": 255, "b": 55 },
    "light": { "r": 140, "g": 198, "b": 63 }
  }
}
```

### 3.2 字段说明

| 字段 | 必需 | 说明 |
|---|---|---|
| `name` | 是 | 主题 ID / CSS 文件名，必须与 JSON 文件名一致 |
| `label` | 是 | 下拉菜单显示的中文标签 |
| `description` | 否 | 鼠标悬停时的工具提示说明 |
| `order` | 否（默认 99） | 下拉菜单排序，越小编号越靠前 |
| `author` | 否 | 作者署名，预留扩展 |
| `default` | 否 | 只能一个主题为 `true`；无则第一个主题为默认 |
| `color` | 是 | 指示圆点颜色，建议取 `dark.acid` 的 hex 近似值 |
| `hue.*` | 是 | 4 个色相角度值（0-360） |
| `dark.*.s/l` | 是 | 深色模式下各颜色饱和度和明度百分比 |
| `light.*.s/l` | 是 | 浅色模式下各颜色饱和度和明度百分比 |
| `brandAccentText` | 是 | 品牌标记（`.brand-mark`）深色模式文字色 |
| `brandAccentTextLight` | 是 | 品牌标记浅色模式文字色 |
| `aboutGlow.*.r/g/b` | 是 | About 链接发光 RGB，约等于 `--acid` 的 sRGB 近似值 |

### 3.3 现有主题

| 文件 | label | 基础色相 | 指示颜色 |
|---|---|---|---|
| `acid.json` (default) | 清凉绿 | 77° | `#c7ff37` |
| `red.json` | 经典红 | 3° | `#91201A` |
| `blue.json` | 深海蓝 | 210° | `#5b9aff` |

---

## 四、创建新主题（分步指南）

### 步骤 1：创建配置文件

```bash
touch content/themes/purple.json
```

### 步骤 2：确定配色方案

- 选择一个基础色相值 `hue.primary`（0-360）
- 决定 4 个强调色的色相偏移（可沿用默认偏移量，也可自定义）
- 确定深色和浅色模式下每个颜色的饱和度和明度
- 确定 `aboutGlow` 的 RGB 值（各模式下 `--acid` 对应色值的 sRGB 近似值）
- 确定 `brandAccentText` 的 hex 色值（确保与 `--acid` 有足够对比度）

### 步骤 3：填写 JSON

复制 `acid.json` 作为模板，修改各字段。

### 步骤 4：构建

```bash
npm run build
```

构建脚本自动完成：

1. 扫描 `content/themes/` 下的所有 JSON 文件
2. 为每个文件生成主题 CSS 并写入 `dist/themes/{name}.css`
3. 生成 `dist/data/themes.json`（包含主题元数据，供运行时下拉菜单加载）

**无需**手动执行 `build_theme.mjs`——它在构建管线中自动运行。该脚本仅作为独立 CLI 工具存在，用于离线调试。

### 步骤 5：验证

打开网站，点击工具栏的预设按钮（四格方块图标 `⊞`），确认新主题出现在下拉菜单中。分别测试深色和浅色模式下的显示效果。

### 自定义色相偏移

如果不想沿用默认偏移，在 JSON 中自由修改：

```json
{
  "hue": {
    "primary": 260,
    "link": 220,
    "warn": 20,
    "error": 340
  }
}
```

此时 `--acid` = 260°（紫），`--cyan` = 220°（蓝），`--amber` = 20°（橙），`--red` = 340°（玫红）。

---

## 五、构建管线

### 5.1 构建流程

```
npm run build
  → scripts/build_static_site.mjs
      ├── 扫描 content/themes/*.json
      ├── 为每个 JSON 生成 dist/themes/{name}.css
      │     ├── :root { … }              （深色模式强调色）
      │     ├── :root[data-theme="light"] （浅色模式强调色）
      │     └── @media (prefers-color-scheme: light)   （系统浅色兼容）
      ├── 生成 dist/data/themes.json
      │     └── [{ id, label, color, description, default, order }]
      └── 其余常规构建步骤
```

### 5.2 独立工具

```bash
node scripts/build_theme.mjs content/themes/blue.json > dist/themes/blue.css
```

生成内容相同，输出到 stdout。适用于离线环境或 CI 中的单独生成。

### 5.3 运行时加载

1. 页面启动时 `app.js` 通过 `loadData("themes.json", …)` 获取主题元数据列表
2. 查找 `default: true` 的主题作为默认，记入 `state.defaultTheme` 和 `state.themePreset`
3. 从 `localStorage('ssl-manual-preset')` 恢复用户上次选择的预设
4. 若当前预设不是默认主题，动态创建 `<link rel="stylesheet">` 加载对应 CSS 文件
5. 用户切换预设时，`switchThemePreset(id)` 更新状态并加载/卸载 CSS
6. LocalStorage 键名：`ssl-manual-preset`（预设主题 ID）、`ssl-manual-theme`（深/浅/auto）

---

## 六、深色 / 浅色模式

### 6.1 三种状态

由 `state.theme` 控制，通过 `localStorage('ssl-manual-theme')` 持久化：

| 状态 | 行为 |
|---|---|
| `"auto"`（默认） | 跟随操作系统 `prefers-color-scheme` |
| `"dark"` | 强制深色模式 |
| `"light"` | 强制浅色模式 |

### 6.2 CSS 实现

- 深色模式：值定义在 `:root` 默认块中
- 浅色模式：值在 `:root[data-theme="light"]` 块中覆盖
- 切换方式：JS 设置 `<html>` 上的 `data-theme` 属性

```css
:root {
  --ink: #eef2ed;
  --panel: #171c19;
}
:root[data-theme="light"] {
  --ink: #2d332f;
  --panel: #f0f1ef;
}
```

主题 CSS 额外包含 `@media (prefers-color-scheme: light)` 块，用于**不使用本网站 JS** 的独立加载场景。

### 6.3 交互方式

工具栏中的 `🌙/☀️` 按钮（`#themeToggle`）：

1. **默认**：auto 模式，显示与当前系统偏好一致的图标
2. **短按（点击）**：切换为手动模式，取当前有效主题的相反值（深→浅，浅→深）。按钮 SVG 从太阳形态平滑旋转过渡为月亮形态
3. **长按（500ms）**：恢复 auto 模式，重新跟随系统偏好
4. 手动选择通过 `localStorage('ssl-manual-theme')` 持久化
5. 系统主题变化时，auto 模式下自动响应 `change` 事件更新页面

### 6.4 主题颜色元标签

```html
<meta name="theme-color" content="#111513">  <!-- 深色模式 -->
<meta name="theme-color" content="#f5f6f3">  <!-- 浅色模式 -->
```

JS 在 `applyTheme()` 中随模式自动更新。

### 6.5 浅色模式 ~25 个元素覆盖

除颜色变量覆盖外，浅色模式还对以下组件进行了精细调色（定义在 `src/styles.css` 的 `:root[data-theme="light"]` 块中）：

- 文档标题（h1/h2/h3）颜色
- 导航区（侧栏链接、分组标题、分组切换）
- 搜索框和搜索切换开关
- 搜索结果高亮
- 目录面板（`.outline`）
- 遮罩层（`.scrim`）
- 提示框（`.note`）
- 表格：表头背景、行交替色
- 侧栏页脚（`.sidebar-footer`）
- 关于区域（`.sidebar-about`）hover 文字色

这些覆盖使用 `:root[data-theme="light"] .class-name` 选择器，不影响深色模式，也不随主题变化。

---

## 七、架构说明

- **所有令牌为原生 CSS 自定义属性**，不使用预处理器或框架
- `src/theme-tokens.css` 是离线参考文件，**不参与构建加载**，只作为模板查阅
- `dist/themes/*.css` 由构建脚本**自动生成**，不应直接编辑
- 主题 JSON 控制的核心域：4 个强调色的 HSL 参数 + 品牌标记文字色 + About 发光 RGB
- 主题 JSON **不覆盖**的 token（定义在 `src/styles.css` 中）：
  - `--_accent-surface`、`--_accent-table-header`
  - `--about-label-text`、`--outline-shadow`、`--sidebar-shadow`
  - 所有布局变量（`--sidebar-width`, `--topbar-height`）
  - 所有表面便捷变量（`--topbar-bg`, `--sidebar-bg` 等）
- 浅色模式的约 25 个元素固定覆盖样式不随主题变化
