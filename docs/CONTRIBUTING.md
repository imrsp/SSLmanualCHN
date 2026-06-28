# 贡献指南

## 修改正文

直接编辑 `content/en/pages/` 或 `content/zh/pages/` 中对应文件。正文允许使用语义化 HTML 片段；不要添加运行时脚本、站点壳层或本机路径。

图片与附件放在 `public/assets/manual/`。正文引用使用 `assets/manual/...`，不要写绝对路径。

只保留正文实际引用的发布资源；官方旧站的 Angular、jQuery、旧导航资源和无关运行时脚本不属于本站依赖。

## 修改元数据

- 英文标题、来源、顺序、章节输出文件：`content/manifest.json`
- 中文标题、章节分组、站点元数据：`content/site.json`
- 主题预设：`content/themes/*.json`
- 人类可读术语规则：`docs/TERMINOLOGY.md`
- 工具可读术语数据：`docs/glossary.csv`

## 提交前检查

默认执行：

```bash
npm run check
```

它会依次运行：

- `npm run build`
- `npm run validate`
- `npm run audit:content`
- `npm run audit:links`
- `npm run audit:terminology`
- `npm run audit:external-links`
- `npm run audit:seo`

## 如何理解结果

必须修复后才能算通过：

- `VALIDATION_PROJECT.md` 和 `VALIDATION_TRANSLATIONS.md` 中的硬失败
- `LINK_AUDIT.md` 中的硬失败
- `TERMINOLOGY_AUDIT.md` 对应的 glossary 结构错误或重复英文术语

只生成报告、供人工复核：

- `CONTENT_AUDIT.md`
- `EXTERNAL_LINK_AUDIT.md`
- `TERMINOLOGY_AUDIT.md` 中的术语覆盖问题
- 两份 validation 报告中的“报告项”

前端有变化时再运行：

```bash
npm run serve
```

重点检查目录、搜索、中英文切换、站内链接、锚点、表格、图片、standalone 页面、桌面端和窄屏布局。

## Git 工作流

项目源码、双语正文、发布资源、文档、报告和上游快照均由 Git 管理。`dist/` 是可重复生成的发布产物，不提交版本库。

开始修改前建议从 `main` 创建分支：

```bash
git switch main
git pull --ff-only
git switch -c topic/简短说明
```

提交前先运行检查，再只暂存本次修改：

```bash
git add <files>
git diff --cached
git commit -m "类型: 简要说明"
```

提交类型可使用 `content`、`fix`、`feat`、`docs`、`build` 或 `chore`。

## 不应提交

- `dist/`
- 临时翻译交接文本
- 编辑器缓存和系统文件，例如 `.DS_Store`
- 手工改过的生成产物
- 未被正文引用的旧站运行时资源
- 密钥、本机配置、临时调试文件
