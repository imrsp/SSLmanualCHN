# 官方源站转储

运行以下命令会以 `content/en/manifest.json` 中的全部官方章节为种子，递归保存同域 `/Help/` 下引用的 HTML、CSS、JavaScript、JSON、字体和图片：

```bash
node scripts/snapshot_upstream.mjs
```

转储保存在 `upstream/snapshots/YYYY-MM-DD/site/`。每次转储同时生成：

- `manifest.json`：URL、最终 URL、HTTP 状态、Content-Type、ETag、Last-Modified、字节数和 SHA-256。
- `diff.json`：相对上一次转储的新增、修改和删除 URL。
- `upstream/snapshots/latest.json`：指向最新转储。

`upstream/ssl-live-help/` 是构建审计使用的精简稳定快照。确认新版官方内容并完成翻译后，再单独更新该目录，避免尚未审校的源站改动直接进入发布站。

## 当前基准

2026-06-10 的完整转储包含 651 个文件、47,183,405 字节。官方源站正文引用的
`g_OSCsetupGenericMethodsSwitchesConfig.png` 和 `g_SoloPopOut.png` 当前返回 404；
该状态记录在转储 `manifest.json` 的 `failures` 中。
