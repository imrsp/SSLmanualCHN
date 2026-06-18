# 使用外部模型辅助翻译

外部大语言模型可用于生成章节初译，减少主 Agent 的模型用量。外部模型只产出候选译文；术语一致性、HTML 结构保真和最终质量仍由本项目的校验脚本与人工审校负责。

## 适用场景

- 未翻译章节的批量初译
- 英文源站更新后对中文页面的增量修订
- 人工审校前获得可修改的候选译文

## 原则

1. **逐章提交** — 一次只提交一个章节的英文正文，不要合并多个长章节。逐章便于失败重试、费用统计和结构校验，也能避免一次错误污染多页。
2. **术语绑定** — 提示词中附带 `content/glossary.csv` 和 `content/TERMINOLOGY.md`，要求模型严格遵守。
3. **结构不变** — 要求完整返回 HTML，禁止改动标签、属性、链接、图片路径、数字、单位、型号、命令和 UI 标签。译文必须与英文基准保持相同的标题、图片、表格、列表数量。
4. **校验先行** — 不论使用哪个模型，每次写入译文后运行 `npm run check`；集中验收时再用 `npm run validate:strict`。
5. **人工复审** — 对照英文逐段阅读，重点检查漏译、术语、表格、链接和警告文本。

## 通用提示词框架

提示词结构应包含以下部分：

- **角色指令**：标明任务是对 SSL Live 手册 HTML 的逐句简体中文翻译。
- **术语表**：直接粘贴 `content/glossary.csv` 和 `content/TERMINOLOGY.md` 的完整内容。
- **约束列表**：逐一列出不得改动的元素——HTML 标签、属性、URL、图片路径、数字、单位、产品名、命令、UI 标签。
- **返回格式**：要求仅返回 HTML 正文，不添加说明、注释或包裹 markdown 代码块。
- **示例**：可附带一段已完成的译文作为风格参考（可选）。

## API 对接方式

任何提供文本生成接口的大模型均可使用，推荐使用 OpenAI 兼容接口（Chat Completions API）以降低集成成本。

翻译属于低随机性的文本转换任务，建议参数：

- `temperature`: 0.1–0.3
- `top_p`: 0.9
- 关闭不需要的 thinking / reasoning 扩展
- 不使用工具调用或图片理解

通用请求示例（OpenAI 兼容格式）：

```bash
curl https://YOUR_API_ENDPOINT/v1/chat/completions \
  -H "Authorization: Bearer $LLM_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "MODEL_ID",
    "temperature": 0.2,
    "messages": [
      {"role": "system", "content": "你是一名专业的音频设备技术文档翻译。将下面提供的 SSL Live 手册英文 HTML 逐句翻译为简体中文。必须保留所有 HTML 标签、属性、URL、图片路径、数字、单位、产品名、命令和 UI 标签。只返回 HTML 内容，不要附加任何说明。"},
      {"role": "user", "content": "<article>……</article>"}
    ]
  }'
```

各平台 API 端点与模型选择，请查阅对应提供商的官方文档。

## 模型选择参考

- **优先考虑**支持长上下文（≥32K tokens）的模型，单篇 SSL Live 章节的 HTML 可达到 5K–20K tokens。
- **优先考虑**价格透明的按量计费模型，翻译类任务消耗的 output token 通常接近 input token。
- 不建议本地部署小模型（< 7B 参数），手册包含大量领域术语与复杂表格，小模型的 HTML 保真度不足。

## 流程

```
1. 读取 content/en/pages/NN-Slug.html 的英文正文
2. 将英文正文 + glossary.csv + TERMINOLOGY.md 组装到提示词
3. 调用外部模型获取候选译文
4. 写入 content/zh/pages/NN-Slug.html
5. 运行 npm run check
6. 运行 npm run validate:strict（集中验收时）
7. 人工逐段对比审校
```

## 成本控制

- 先用一篇短文（如 `04-GUI.html`）做术语和 HTML 保真测试，通过后再批量执行。
- 固定系统提示和术语表，利用模型的 prompt caching 功能（如果所选计费方式支持）。
- 关闭不需要的 thinking/推理扩展；翻译不需要 Agent 工具调用或图片理解。
- 保存每次请求的模型、输入/输出 token、费用和目标文件，便于比较模型性价比。
- 只对失败的章节单独重试，不重新发送已完成章节。
- 不要把 API Key 写入仓库：通过环境变量传入。

## 注意事项

- 大模型可能自行"修正"看起来不完美的 HTML（如补全缺失的引号、统一标签大小写），导致 `npm run validate` 报出结构差异。写入后必须运行校验并人工检查 diff。
- 多次重复翻译同一章节时，术语一致性可能漂移。建议在提示词中强调："之前已翻译的术语不得变更译法"。
- 部分模型对 `<details>` 等 HTML5 标签的保真度较低，需额外检查折叠内容是否完整保留。
