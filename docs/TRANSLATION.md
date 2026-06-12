# 翻译与校对

## 基本流程

1. 从 `content/en/pages/` 读取英文基准。
2. 在 `content/zh/pages/` 创建同名译文；仅有英文基准时可以暂缺，站点会标记为待翻译。
3. 保持标题、图片、表格、链接、列表等结构数量一致。
4. 按 `content/glossary.csv` 与 `content/TERMINOLOGY.md` 使用统一译法。
5. 运行 `npm run validate`，再进行人工双语对照。
6. 运行 `npm run audit`，检查 `reports/CONTENT_AUDIT.md` 中的结构差异和疑似未翻译正文。

## 翻译原则

- 完整逐句翻译，不摘要、删减或合并。
- 实际按钮、菜单、页签和参数名保留英文。
- 产品、协议、软件和商标名不翻译。
- `Layer` 和 `Bank` 保留英文；仅在解释概念时使用“层”。`Layer Manager` 仅在引用文章标题时翻译成“推子层管理器”，其它时候保留英文。
- `Useful Links` 统一译为“实用链接”。
- 警告与错误消息保留英文原文，并给出中文解释。
- 数字、单位、地址、端口、型号、版本和命令保持不变。

## 批量交接

导出缺少中文文件的章节：

```bash
npm run translation:export
```

结果位于 `handoff/remaining-translations.txt`。填好后导入：

```bash
npm run translation:import -- handoff/translated.txt
```

导入脚本只处理交接文件中标记完整的章节。导入后必须人工检查 HTML，并运行 `npm run check`。

## 术语维护

`content/glossary.csv` 是工具和 Agent 使用的结构化数据；`content/TERMINOLOGY.md` 提供规则与上下文。有修改时两处必须同步。

## 折叠内容与目录

- 英文源站的 accordion 标题与内部同名标题只保留一个。
- 构建器会将源站 accordion 转换为原生 `<details>` 控件；正文中不要手工复制折叠标题。
- 右侧目录严格按照正文标题在 DOM 中的先后顺序生成，不单独维护第二份目录。
- 同页标题允许同名，但生成的锚点 ID 必须唯一。
