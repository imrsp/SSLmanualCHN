# 翻译与校对

## 基本流程

1. 从 `content/en/pages/` 读取英文基准。
2. 在 `content/zh/pages/` 创建同名译文，保持全量章节一一对应。
3. 保持标题、图片、表格、链接、列表等结构数量一致。
4. 按 `docs/glossary.csv` 与 `docs/TERMINOLOGY.md` 使用统一译法。
5. 运行 `npm run validate`，先修复所有会阻断通过的结构与完整性问题。
6. 运行 `npm run audit:content`，检查 `reports/CONTENT_AUDIT.md` 中的结构差异、疑似未翻译正文和其它人工复核提示。

## 术语维护

`docs/glossary.csv` 是工具和 Agent 使用的结构化数据；`docs/TERMINOLOGY.md` 提供规则与上下文。有修改时两处必须同步。

## 折叠内容与目录

- 英文源站的 accordion 标题与内部同名标题只保留一个。
- 构建器会将源站 accordion 转换为原生 `<details>` 控件；正文中不要手工复制折叠标题。
- 右侧目录严格按照正文标题在 DOM 中的先后顺序生成，不单独维护第二份目录。
- 同页标题允许同名，但生成的锚点 ID 必须唯一。
