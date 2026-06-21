# 官方源站转储

## 目的

`upstream/snapshots/` 用来保存官方源站在特定日期的完整转储，供溯源、差异比对和回归核查使用。

`upstream/ssl-live-help/` 是更稳定、更精简的构建与审计基线，不应在每次抓取后自动覆盖。

## 抓取命令

```bash
npm run upstream:snapshot
```

等价脚本入口：

```bash
node scripts/snapshot_upstream.mjs
```

## 输出内容

每次抓取会生成：

- `upstream/snapshots/YYYY-MM-DD/site/`：完整站点文件
- `upstream/snapshots/YYYY-MM-DD/manifest.json`：URL、最终 URL、状态码、Content-Type、ETag、Last-Modified、字节数、SHA-256
- `upstream/snapshots/YYYY-MM-DD/diff.json`：相对上一次抓取的新增、修改、删除 URL
- `upstream/snapshots/latest.json`：指向最新转储

## 使用规则

- 新抓取先进入 `upstream/snapshots/`，不要直接替换 `upstream/ssl-live-help/`。
- 只有在确认官方内容变化、完成必要翻译和人工校核后，才考虑更新稳定基线。
- 构建和审计依赖稳定基线，而不是最新抓取，以避免未经审校的上游变化直接进入工作流。

## 文档维护原则

不要把“当前基准文件数、总字节数、某日 404 清单”长期硬编码在本文档里。此类信息会自然过时，更适合放在当次转储的 `manifest.json`、`diff.json` 或专项报告中。
