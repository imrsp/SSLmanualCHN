# 翻译与校对

## 目标

译文必须保持与英文基准一一对应，重点不是“润色”，而是结构保真、术语一致、信息不丢失、链接不走样。

## 标准流程

1. 从 `content/en/pages/` 读取英文基准。
2. 在 `content/zh/pages/` 创建或修改同名译文。
3. 保持标题、图片、表格、列表、折叠块、链接目标数量与结构一致。
4. 先按 `docs/glossary.csv` 与 `docs/TERMINOLOGY.md` 统一术语，再做正文表述。
5. 运行 `npm run check`。
6. 修复所有阻断项，再查看 `/reports` 中的人工复核报告。
7. 对照英文逐段人工审校。

## 通过标准

`npm run check` 的通过边界如下：

- 必须通过：`npm run validate`
- 必须通过：`npm run audit:links`
- 通常只生成报告：`npm run audit:content`
- 通常只生成报告：`npm run audit:external-links`
- 通常只生成报告：`npm run audit:terminology`

补充说明：

- `npm run audit:terminology` 发现术语覆盖问题时只写报告。
- 但如果 `docs/glossary.csv` 格式损坏，或存在重复 `term_en` 条目，术语审计会失败，因为此时报告本身不可信。

## `/reports` 的作用

生成后的报告主要看这些文件：

- `reports/VALIDATION_PROJECT.md`：工程结构、构建产物、资源引用、平台残留。
- `reports/VALIDATION_TRANSLATIONS.md`：中英结构对齐、链接目标一致性、文本长度异常。
- `reports/LINK_AUDIT.md`：站内链接、锚点、本地化路由问题。
- `reports/CONTENT_AUDIT.md`：逐页内容复核提示，如疑似漏译、中英混杂、标题层级异常。
- `reports/TERMINOLOGY_AUDIT.md`：术语覆盖情况与“英文仍保留、推荐译法未出现”的条目。
- `reports/EXTERNAL_LINK_AUDIT.md`：外链可达性、被限制、网络错误。

原则很简单：

- 阻断项先修。
- 非阻断项统一进 `/reports`，由人工复核决定是否改。

## 术语维护

`docs/glossary.csv` 是脚本与 Agent 的结构化术语源。
`docs/TERMINOLOGY.md` 是人类可读的术语规则、边界和维护说明。

调整术语时两处必须同步。

## 折叠内容与目录

- 英文源站 accordion 标题与内部同名标题只保留一个。
- 构建器会将源站 accordion 转换为原生 `<details>`；正文中不要手工复制折叠标题。
- 右侧目录严格按照正文标题在 DOM 中的顺序生成，不单独维护第二份目录。
- 同页标题允许同名，但最终锚点 ID 必须唯一。

## 人工校对重点

- 是否漏译、误译或擅自删改英文信息。
- 术语是否符合 `docs/glossary.csv`。
- UI 路径、按钮名、协议名、型号、端口、命令、数字、单位是否保持原样。
- 警告、注意、步骤条件、表格字段是否完整保留。
- 中英混杂是否属于刻意保留，而不是残留机器翻译或清理不完整。
