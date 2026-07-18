# 官方源站转储

## 目的

`upstream/snapshots/` 保存官方 SSL Live Help 的版本化原始转储，用于溯源、版本差异检查和内容合并复核。

源站版本以 About 页的 `Document Revision Number` 为准，不使用软件版本历史中的 `V6.2` 等产品版本号。文档修订号能够覆盖不伴随软件升级的手册修订。

## 抓取命令

```bash
npm run upstream:snapshot
```

等价脚本入口：

```bash
node scripts/snapshot_upstream.mjs
```

脚本首先只请求 `content/upstream.json` 中的 `revisionUrl`：

- 源站修订号与 `upstream/snapshots/latest.json` 相同：输出 `skipped: true`，不创建或修改快照。
- 源站修订号高于最新快照：抓取完整站点并创建新版本目录。
- 源站修订号低于最新快照：以错误退出，避免把回退或异常响应当成新版本。

该命令只更新 `upstream/snapshots/`，不会自动改写 `content/en/` 或 `content/zh/`。

## 输出内容

每个源站版本生成一组不可覆盖的文件：

- `upstream/snapshots/<revision>/site/`：源站文件
- `upstream/snapshots/<revision>/manifest.json`：修订号、URL、最终 URL、状态码、Content-Type、ETag、Last-Modified、字节数和 SHA-256
- `upstream/snapshots/<revision>/diff.json`：相对上一抓取版本的新增、修改、删除 URL
- `upstream/snapshots/latest.json`：最新已抓取版本指针

抓取先写入同目录的隐藏临时目录。存在阻断失败时临时目录会被清理，既有版本和 `latest.json` 保持不变。已经发布的版本目录不会被覆盖。

快照 `site/` 由 `.gitattributes` 保留原始响应字节，避免 Git 换行转换破坏 manifest 中的 SHA-256；同时仍启用文本 diff 供审查。由旧日期目录迁移而来的 21.0.3 曾在历史流程中发生文本规范化，其 manifest 使用 `storageMode: legacy-normalized` 保留原始抓取哈希并说明这一差异；新快照使用 `storageMode: raw`，校验会逐文件核对哈希。

## 已知源站失败

默认情况下，页面、资源或网络请求失败都会阻止发布快照。对于已经人工确认、且不应阻止正文版本归档的源站错误，可在 `content/upstream.json` 的 `allowedSnapshotFailures` 中按 URL 和 HTTP 状态登记。

允许的失败仍会完整写入快照 `manifest.json`；未登记的失败继续阻断发布。不要用该清单忽略临时网络错误、正文页面失败或未经确认的新问题。

## 异步内容合并

“最新已抓取版本”和“项目已完整合并版本”是两条独立状态：

- `upstream/snapshots/latest.json.sourceRevision`：最新抓取到本地的源站修订号。
- `content/upstream.json.mergedRevision`：当前项目中英文正文已经完整合并并复核到的源站修订号。

新快照抓取完成后，先阅读该版本的 `diff.json`，再分批更新中英文正文、资源和元数据。只有所有变更完成并通过 `npm run check` 后，才提升 `mergedRevision`。内容审计始终以 `mergedRevision` 对应快照为基准，因此异步合并期间不会提前切换基线。

## 上游勘误补丁

当上游快照中存在明确的事实或技术错误，而本站必须主动修正时：

1. 保留对应版本的原始快照不变。
2. 在 `content/en/pages/` 与 `content/zh/pages/` 的对应页面应用同一项事实修正。
3. 在 `content/upstream-patches.json` 增加记录，写明稳定 ID、上游 URL、证据快照、原值、修正值、原因及目标文件。
4. 运行 `npm run validate`。

该清单只记录对上游错误的主动修正，不记录普通翻译润色、排版调整或本站功能变更。

## 文档维护原则

不要把当前文件数、总字节数或某次失败清单硬编码在本文档中。这些事实应保存在对应版本的 `manifest.json` 和 `diff.json` 中。
