# 全量审校状态

更新时间：2026-06-10

## 本轮已完成

- 将 `Layer`、`Layer Manager` 和 `Bank` 统一保留英文；仅在解释概念时使用“层”。
- 将所有 `Useful Links` 章节统一为“实用链接”。
- 对 `12-ConsoleConfig`、`27-RecordingPlayback`、`28-DanteSetup` 和 `73-ExternalControl` 按英文基准完成重译或逐段重写。
- 修正 `35-Solo`、`59-OptionsUserKeys`、`61-OptionsNetwork`、`65-TaCo`、`66-RemoteControl` 和 `68-ExtScreen` 中的漏译、机器替换损坏及英文句法残留。
- 对齐 `31-DanteNetIO`、`32-DanteBridges`、`44-FXOther` 和 `45-FXTools` 的标题树；内容保留不变，不再让说明性小标题污染右侧目录。
- 统一自动化章节中的“自动化预览模式”表述，并修正 `54-AutoPreview` 的图片替代文本。
- 校订 `75-Storage`：表格行列名称保留英文，描述性功能术语改为中文。
- 修复 `19-ProcOrder` 的五张流程图片，使其在桌面端横向排列，在移动端自动换行。
- 修复表格内图标的多余正文图片边距，以及移动端居中图片因源站内联边距造成的局部横向溢出。
- 删除中英文内容中的源站上一页/下一页箭头导航；`14-ChanView` 已确认不再显示该元素。
- 重新对齐中英文页链接。纳入本站的 80 个章节全部改为站内路由；不存在的源站锚点回退到正确页面顶部。
- 将搜索主题数和页码总数改为从构建目录动态读取，避免章节增删后仍显示旧的 78 页常量。
- 建立官方源站完整转储与增量比对流程。2026-06-10 转储包含 651 个文件、47,183,405 字节。
- 桌面端和 390 x 844 移动端验收通过：目标页面无横向溢出、无破图、无浏览器控制台警告或错误。

## 校验结果

- 页面：80
- 严格翻译结构校验：80 / 80 通过
- 本地图片缺失：0
- 远程图片依赖：0
- 页面完整性问题：0
- 内部链接：2926
- 内部链接问题：0
- 唯一外部链接：32；可访问 26，明确失效 0，反自动访问 403 共 4，当前网络握手失败 2。
- 内容审计待复核：6 页，均为早期导入稿的列表或提示块数量差异；未发现缺图、远程图片依赖或站内链接错误。详见 `reports/CONTENT_AUDIT.md`。

## 源站转储

完整转储位于 `upstream/snapshots/2026-06-10/`，包含 URL、HTTP 元数据、SHA-256 和相对上次转储的差异清单。

源站当前有两张被正文引用但服务器返回 404 的图片：

- `images/g_OSCsetupGenericMethodsSwitchesConfig.png`
- `images/g_SoloPopOut.png`

这两项是官方源站缺失，不是本地抓取失败。

外部链接在线检查见 `reports/external-link-audit.json`。两个已返回 404 的 Meyer Sound
旧帮助地址已更新为当前官方 Spacemap Go User Guide。

## 待决定术语

当前仍存在多种写法的英文概念共 42 项：

`Rehearse Mode`、`Detail View`、`Channel View`、`Control Surface`、`Fader Tile`、`Master Tile`、`Control Tile`、`Stagebox`、`Full Processing`、`Dry`、`Feed Point`、`Store`、`Recall`、`Spill`、`Query`、`Showfile`、`Scene`、`Path Link`、`Remote Surface`、`Connectivity Network`、`Dante Primary`、`Dante Secondary`、`Virtual Tie Line`、`Dual Domain Route`、`Direct Output`、`Patch`、`Solo`、`Talkback`、`Mute`、`Preset`、`Snapshot`、`Automation`、`Stem`、`Aux`、`Master`、`Insert`、`Routing`、`Gain`、`Trim`、`Processing`、`User Key`、`Eyeconix`。

各写法及出现次数见 `reports/TERMINOLOGY_DECISIONS.md`。其中部分英文是界面标签或参数名，报告保留这些计数供人工决定，不会擅自批量替换。

## 仍待人工复核

`29-32`、`34`、`46` 页仍触发内容审计提示。正文可用且图片完整，但列表或提示块数量与英文基准不同；下一轮应逐项判断是中文合并表达，还是确有结构遗漏。

此外，部分早期导入页仍使用“图片 N”作为 `alt` 或 `figcaption`。下一阶段应优先为 `29-34`、`44-48` 等图片密集章节补充有意义的图片说明，再集中处理 `73-ExternalControl`、`79-LinkIndex` 和 `80-About` 的术语一致性。
