# 使用外部模型辅助翻译

本文记录如何把逐章初译交给 MiniMax 等兼容 API，减少主 Agent 的模型用量。外部模型只生成候选译文；术语、结构和最终质量仍由本项目校验与人工审校负责。

## 推荐流程

1. 只向模型提交一个章节，不提交整个仓库或 `dist/`。
2. 提示词附带 `content/glossary.csv`、`content/TERMINOLOGY.md` 和当前英文正文。
3. 要求完整返回 HTML，禁止改动标签、属性、链接、图片路径、数字、单位、型号、命令和 UI 标签。
4. 将结果写入对应的 `content/zh/pages/NN-Slug.html`。
5. 运行 `npm run check`；集中验收时再运行 `npm run validate:strict`。
6. 对照英文逐段审校，重点检查漏译、术语、表格、链接和警告文本。

不要把多个长章节合并为一次请求。逐章请求便于失败重试、费用统计和结构校验，也能避免一次错误污染多页。

## MiniMax API

MiniMax 提供 OpenAI 兼容接口，基础地址为 `https://api.minimax.io/v1`。截至 2026-06-12，官方文档列出的当前模型包括 `MiniMax-M3` 与 `MiniMax-M2.7`；模型和价格可能变化，执行批量任务前应重新查看官方模型与价格页。

翻译属于低随机性的文本转换任务，建议先用 `MiniMax-M3`、关闭 thinking、设置较低 temperature，并记录响应中的 token usage。不要把 API Key 写入仓库：

```bash
export MINIMAX_API_KEY='your-key'
```

最小请求示例：

```bash
curl https://api.minimax.io/v1/chat/completions \
  -H "Authorization: Bearer $MINIMAX_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "MiniMax-M3",
    "thinking": {"type": "disabled"},
    "temperature": 0.2,
    "messages": [
      {"role": "system", "content": "Translate the supplied SSL Live manual HTML into Simplified Chinese. Preserve every HTML tag, attribute, URL, image path, number, unit, product name, command, and UI label. Return HTML only."},
      {"role": "user", "content": "<article>...</article>"}
    ]
  }'
```

## 在 Codex 中切换 MiniMax

MiniMax 官方也提供 Codex 配置方式，可在 `~/.codex/config.toml` 中增加自定义 provider，并将 `wire_api` 设为 `responses`。这会让 MiniMax 直接承担 Agent 工作，不只承担翻译。

对本项目更稳妥的分工是：主 Agent 负责拆分章节、文件操作、校验和审校；MiniMax API 只负责逐章候选翻译。这样成本可控，也不会把仓库操作权限和长上下文消耗交给翻译模型。

## 成本控制

- 先用一篇短文做术语和 HTML 保真测试，再批量执行。
- 固定系统提示和术语表，利用提供商的 prompt caching（如果所选计费方式支持）。
- 关闭不需要的 thinking；翻译不需要 Agent 工具调用或图片理解。
- 保存每次请求的模型、输入/输出 token、费用和目标文件，便于比较模型。
- 对失败章节单独重试，不重新发送已完成章节。

## 官方资料

- [MiniMax Codex 配置](https://platform.minimax.io/docs/token-plan/codex)
- [MiniMax OpenAI 兼容接口](https://platform.minimax.io/docs/api-reference/text-openai-api)
- [MiniMax 模型说明](https://platform.minimax.io/docs/guides/models-intro)
- [MiniMax 按量价格](https://platform.minimax.io/docs/guides/pricing-paygo)
