# 贡献指南

## 修改正文

直接编辑 `content/en/pages/` 或 `content/zh/pages/` 中对应章节。正文允许使用语义化 HTML 片段；不要添加完整文档外壳、脚本或内联样式。

图片与附件放在 `public/assets/manual/`。正文引用使用 `assets/manual/...`，不要写本机绝对路径。
只保留正文实际引用的发布资源；官方旧站的 Angular、jQuery、样式表和上一页/下一页导航资源不属于本站运行依赖。

## 修改元数据

- 英文标题、来源和顺序：`content/en/manifest.json`
- 中文标题和章节分组：`content/site.json`
- 人类阅读术语说明：`docs/TERMINOLOGY.md`
- 工具可读术语数据：`docs/glossary.csv`

## 提交前检查

```bash
npm run check
```

校验会检查章节数、双语文件映射、图片是否本地化、构建结果、平台专用残留，以及译文中的图片、表格、链接和标题数量。

`npm run validate` 只对必须修复的结构与完整性问题返回失败；其余提示统一写入 `reports/` 目录，供人工复核。

前端有变化时再运行：

```bash
npm run serve
```

检查目录、搜索、中英文切换、章间导航、锚点、图片、表格，以及窄屏侧栏。

## Git 工作流

项目源码、双语正文、发布资源、文档、审计报告和官方源站快照均由 Git 管理。
`dist/` 是可重复生成的发布产物，不提交版本库。

开始修改前从 `main` 创建主题分支：

```bash
git switch main
git pull --ff-only
git switch -c topic/简短说明
```

提交前先运行 `npm run check`，然后只暂存本次修改并检查差异：

```bash
git add <files>
git diff --cached
git commit -m "类型: 简要说明"
```

提交信息类型可使用 `content`、`fix`、`feat`、`docs`、`build` 或 `chore`。
不要提交密钥、本机配置、缓存、临时交接文件或手工修改后的 `dist/`。

## 不应提交

- `dist/`
- 临时翻译交接文本
- 编辑器缓存和系统文件
- 单文件内嵌资源版本
- 未被正文引用的旧站运行时资源
