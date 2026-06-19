# 样式与主题系统

本文档介绍 SSL Live 中文操作手册网站的 CSS 架构、语义化颜色令牌系统以及深色/浅色双模式的工作原理。

## CSS 变量令牌系统

所有颜色均以 CSS 自定义属性的形式定义在 `:root` 中，并按用途分组。`src/theme-tokens.css` 文件包含一份独立的参考副本，不参与构建加载，仅作为文档和搭建参考。

### 令牌分组

| 分组 | 变量 | 用途 |
|---|---|---|
| Surface & Background（表面与背景） | `--black`, `--panel`, `--panel-soft`, `--line` | 页面背景、卡片表面、边框 |
| Text（文本） | `--ink`, `--muted` | 正文、次要/辅助文字 |
| Accent & Status（强调与状态） | `--acid`, `--cyan`, `--amber`, `--red` | 品牌强调色、链接、警告、错误 |
| 语义别名 | `--color-bg-page`, `--color-surface`, `--color-surface-elevated`, `--color-border`, `--color-text-primary`, `--color-text-secondary`, `--color-accent`, `--color-accent-link`, `--color-warning`, `--color-error` | 未来主题定制入口 |
| 表面便捷变量 | `--topbar-bg`, `--sidebar-bg`, `--reader-toolbar-bg`, `--grid-line-alpha`, `--grid-line-beta` | 共享组件背景与网格 |

### 变量级联方式

10 个原始颜色变量（`--ink`, `--muted`, `--panel` 等）是唯一的真实数据源。UI 中几乎所有元素都直接使用这些变量。语义别名变量（`--color-text-primary`, `--color-accent` 等）通过 `var()` 引用原始变量，随原始变量自动更新。

```css
:root {
  --ink: #eef2ed;                            /* 深色模式值 */
  --color-text-primary: var(--ink);           /* 别名 — 始终跟随 --ink */
}
```

## 深色 / 浅色模式

### 工作机制

网站支持 **三种状态**，由 `state.theme` 控制：

1. **`"auto"`**（默认）— 点击主题切换按钮时显示「跟随系统」，JS 监听 OS 偏好并自动应用
2. **`"dark"`** — 始终使用深色模式
3. **`"light"`** — 始终使用浅色模式

### 实现方式

- **CSS**：浅色模式的值通过 `:root[data-theme="light"]` 选择器定义，仅当 `<html>` 元素具有 `data-theme="light"` 属性时生效。深色模式由默认的 `:root` 块提供。两个模式对应的值集使用完全相同的 CSS 变量。
- **JavaScript**：`state.theme` 通过 `localStorage` 持久化，键名为 `ssl-manual-theme`。页面加载时 `applyTheme()` 读取存储值（若无则为 `"auto"`），计算有效主题，设置 `data-theme` 属性并更新 `<meta name="theme-color">`。
- **手动切换**：
  1. 默认跟随系统（`auto` 模式）
  2. **短按（点击）**工具栏中的 `🌙 / ☀️` 按钮：切换为手动模式，取当前有效主题的相反值（深色→浅色，浅色→深色）。每次短按都在深色和浅色之间来回切换
  3. **长按（按住 500ms）**工具栏中的 `🌙 / ☀️` 按钮：恢复为 `auto` 模式，重新跟随系统偏好
  4. 手动选择通过 `localStorage` 持久化，**不会自动回到 `auto` 模式**（需要通过长按手动恢复）

### 跨模式保持一致的设计细节

- **背景网格**：两种模式均使用 `32px × 32px` 的重复网格。深色模式使用白色网格线（`rgba(255,255,255,.018)` + `rgba(255,255,255,.012)`），浅色模式使用极淡黑色网格线（`rgba(0,0,0,.04)` + `rgba(0,0,0,.025)`）。
- **面板层次**：`--color-surface`（基础面板）与 `--color-surface-elevated`（悬停/高亮）之间的相对深浅关系在两种模式下保持一致。
- **字体系统**：两种模式使用完全相同的 `font-family` 堆栈。

### 浅色模式颜色映射

| 原始变量 | 深色 | 浅色 |
|---|---|---|
| `--ink` | `#eef2ed` | `#2d332f` |
| `--muted` | `#8d9891` | `#6e7a72` |
| `--panel` | `#171c19` | `#f0f1ef` |
| `--panel-soft` | `#1d2420` | `#e8eae7` |
| `--line` | `#303a34` | `#d4d9d6` |
| `--black` | `#0b0e0c` | `#f5f6f3` |
| `--acid` | `#c7ff37` | `#8cc63f` |
| `--cyan` | `#43dbe8` | `#0f8e9e` |
| `--amber` | `#ffba43` | `#c97f00` |
| `--red` | `#f15b52` | `#c92a2a` |

## 主题定制

### 更改颜色方案

要引入自定义颜色方案，只需覆盖 **Accent & Status**（强调与状态）分组的变量即可：

```css
:root {
  --acid: #3b82f6;   /* 原值 #c7ff37 */
  --cyan: #06b6d4;
}
```

所有使用这些变量的元素将自动更新，因为语义别名令牌引用自原始变量。

### 未来颜色编辑器的实现思路

未来的颜色编辑器 UI 只需覆盖 **Accent & Status** 分组（4 个变量）和 **Surface & Background** 分组（4 个变量）即可切换整套主题。其余令牌（文本、布局、表面便捷变量）保持结构一致性，可沿用默认值。

完整令牌参考请参见 `src/theme-tokens.css`。

## 架构说明

- 不使用 CSS 预处理器或框架——所有令牌均为原生 CSS 自定义属性
- `src/theme-tokens.css` 文件为离线参考，构建脚本不会将其复制到 `dist/` 中
- `src/styles.css` 中的深色模式值**未做任何更改**——仅添加了浅色模式块和变量分组注释

## 颜色主题引擎

从 2026-06 版本起，网站支持通过**单一色相值 `--_hue`** 自动推导 4 个强调色（acid/cyan/amber/red）及其深/浅两模式版本，无需手动重新计算每个颜色。

### 推导范围

| 颜色 | 变量 | 来源 |
|---|---|---|
| 品牌强调色 | `--acid` | `hsl(var(--_hue), s%, l%)` |
| 链接色 | `--cyan` | `hsl(var(--_hue-link), s%, l%)` |
| 警告色 | `--amber` | `hsl(var(--_hue-warn), s%, l%)` |
| 错误色 | `--red` | `hsl(var(--_hue-error), s%, l%)` |
| 强调色光晕 | `--_accent-glow` | `rgba(r, g, b, .25)` |
| 强调色表面 | `--_accent-surface` | `#dce8d2` (浅色主题) |
| 表格头背景 | `--_accent-table-header` | `#e4ece2` (浅色主题) |

**不参与推导**（保持手写 hex，与主题色无关）：
- `--ink`, `--muted` — 文字色
- `--black`, `--panel`, `--panel-soft`, `--line` — 表面/背景色
- 所有布局、间距、字体、动画、网格参数
- ~25 个纯中性微调的浅色模式元素覆盖

### 色相偏移关系

当前 SSL 绿调色板中，4 个强调色的色相关系为：

| 变量 | 相对 `--_hue` | 默认值 |
|---|---|---|
| `--_hue` (primary) | — | 77 (green) |
| `--_hue-link` | +108° | 185 (cyan) |
| `--_hue-warn` | -39° | 38 (amber) |
| `--_hue-error` | -74° | 3 (red) |

### 创建新主题

1. 在 `content/themes/` 下新建 JSON 文件（参考 `ssl-default.json` 或 `blue.json`）
2. 指定色相值和饱和/明度：
```json
{
  "name": "my-theme",
  "label": "我的主题",
  "hue": {
    "primary": 260,
    "link": 220,
    "warn": 20,
    "error": 340
  },
  "dark": { "acid": { "s": 85, "l": 60 }, ... },
  "light": { "acid": { "s": 50, "l": 45 }, ... }
}
```
3. 生成 CSS：
```bash
node scripts/build_theme.mjs content/themes/my-theme.json > dist/themes/my-theme.css
```

### 在页面中启用主题

在 `<head>` 中加载生成的 CSS：
```html
<link rel="stylesheet" href="./themes/blue.css">
```

主题 CSS 利用 CSS 级联覆盖 `:root` 中的默认值，无需修改 `src/styles.css`。
