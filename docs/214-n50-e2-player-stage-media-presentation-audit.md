# N50-E2 Player Stage/Media Presentation 与 Effect 生命周期审计

> 日期：2026-08-27
> 分支：`codex/n50-e2-player-presentation`
> 基线：N50-E1 最终交接头 `f41f728`
> 授权：`RA-N21-009`，仅 N50 Engineering
> 判定：E2 定向门与真实浏览器证据通过；本机完整长链存在已保留的资源负载/沙箱差异，远端 Windows / Node 22 完整门等待推送后裁决；N50 Product Acceptance、N51+、三端发布宿主、Android 实体包、M1 与发布继续阻断

## 1. 本步目标与边界

E2 在同一个 portable Player Core 上补齐正式 Stage/Media presentation contract，并由共享 Player Shell adapter 消费真实背景、角色和音频资源。Core 只公开 Runtime Host 的确定性 Effect snapshot：active、pending、operation receipt；它不导入 DOM、资源 URL、React 或平台 API。Shell adapter 才把 `background/show/audio/camera/textbox` 映射为媒体层、Camera transform 与 ADV/NVL/Bubble 表现。

Awaited Effect 必须先进入可见 `waiting-effect`，再由真实 CSS transition `animationend` 或明确按钮向 Core 提交 complete/cancel。缺失资源显示结构化媒体错误并禁用“完成动效”，不能静默完成。Barrier 继续要求明确批准。E2 不实现 Save/History/Settings、Auto/Skip/Back/Forward、Gallery UI、视频/Voice/SFX 完整策略或任何发布宿主。

## 2. 实现事实

- `@world-studio/player-core` 升至 `0.2.0-n50`，snapshot 新增排序稳定的 active/pending/operations Effect contract，Host Hash 仍由同一正式 Host snapshot 生成。
- `player-presentation-adapter.ts` 解析正式 Effect payload，不读取 Canonical StoryStatement；资源 URL 通过平台侧 `PlayerMediaAssetSourceV1` 注入。
- Player Shell 渲染真实 PNG 背景/立绘与 WAV `<audio>`，支持背景/角色转场、Camera transform、文本框模板、Effect 进度、完成/取消和 Barrier 确认。
- 编译后的 `volumePermille: 600` 不只进入 adapter；Shell 明确写入 `HTMLAudioElement.volume=0.6`，并以运行时回读标记固化实际应用值。
- `?demo=media` 使用冻结 Media Golden 的 16×9 PNG、4×8 透明角色 PNG 和 8kHz PCM WAV；所有内容仍先经 Canonical→Compiler→Runtime/Host。
- 缺资源路径保留 `waiting-effect`，完成按钮 disabled；手机触控取消后 Host 删除角色 channel，背景、后续 BGM 与对白按正式 Runtime 继续。

## 3. 冻结预期—首次实际—修正

| 检查 | 冻结预期 | 首次实际 | 根因与修正 | 原样复测 |
|---|---|---|---|---|
| Awaited 角色 Effect | 角色先可见，transition 完成后进入对白/BGM | Effect complete receipt 后进入 `error`：`RUNTIME_INVALID_IR` | Compiler 将 `loop=true volume=0.6` 作为字符串送入 Runtime；在 Compiler 边界规范化为 `loop: true`、`volumePermille: 600`，非法/不可精确表示值 fail closed | Player 到对白，WAV `readyState=4` 且 `paused=false` |
| Media Golden IR | 修正后重新冻结确定性 IR | 旧 Hash `0a19dec5…c6d` 不再匹配 | 新 IR Hash `b86a7178…9aea`，Build ID `24e4fb2d…c9d4`；只影响 Media Golden | Compiler `28/28`、Golden `7/7` |
| production load wait | 等待 production 页面就绪 | 浏览器能力不支持 `networkidle` wait | 改用受支持的 `domcontentloaded`，随后直接读取媒体 `complete/naturalWidth/readyState`，不把等待 API 当产品结论 | 页面、媒体与交互均有实际值 |
| 音量 payload | `volume=0.6` 实际作用到音频元素 | 初版 adapter 有 `0.6`，但 Shell 未把它写入元素 | ref 提交时设置 `HTMLAudioElement.volume`，并回读为 `data-applied-volume` | 请求值 `0.6`、实际值 `0.6`、`loop=true`、音频时间前进 |
| 原始证据持久化 | JSON 与桌面/手机截图进入 Git | Browser 沙箱不能直接写 workspace | 先写浏览器临时目录，再复制确定目标到 `evidence/n50/`，冻结 SHA-256 | 两张 PNG 与 JSON 均在工作区 |

## 4. 真实 production-browser 结果

证据：[player-media-browser.json](../evidence/n50/player-media-browser.json)、[desktop PNG](../evidence/n50/player-media-desktop.png)、[mobile PNG](../evidence/n50/player-media-mobile.png)。

- 桌面 1280×720：Stage `1180×663.75`，ratio `1.7777777777777777`；document `1280/1280`，横溢出 0。
- 背景 PNG `complete=true/naturalWidth=16`；角色 PNG `complete=true/naturalWidth=4`；WAV 请求/实际音量均 `0.6`、`loop=true`、`paused=false/readyState=4`。
- 手机 390×844：Stage `390×844`，document `390/390`；等待 Effect 卡 `350×198.5`，完成按钮 `98×44`；完成后对白 `362×188`。
- 手机触控“跳过动效”：actor count `0`、background count `1`、audio playing `true`、状态进入 `presenting`；证明 cancel receipt 真实改变 Host 可见层。
- Console warning/error：`[]`。
- 截图 Hash：desktop `aa980247…6fee8`；mobile `ec4724da…85b5`。

## 5. 自动化与构建

- `npm run audit:n30-compiler`：`1 file / 28 tests`；新增音频规范化与非法值 fail-closed。
- `npm run audit:n50-player-core`：`2 files / 10 tests`；覆盖 Effect snapshot、awaited complete、真实媒体层、缺资源阻断、指针和键盘。
- `npm run audit:goldens`：`7/7`；Media 新 IR Hash 已进入冻结证据。
- 全仓普通测试阶段：`139/139 files`、`792/792 tests`；Compiler `28/28`、Runtime `59/59`、10k VM corpus `10000 seeds / 20000 replay / 40 chunks` 均通过。
- `npm run audit:n50-player-core` 修正音量后再次 `2 files / 10 tests`；`npm run audit:architecture`、需求与风险门通过；Player Core 仍保持 portable 同源边界。
- Player Shell 最新源码以 `tsc --noEmit` 通过类型检查；受管本机对 Node 构建输出的 ACL 差异仍由远端完整 build 裁决。
- Player Shell production build：CSS `8.92/2.76 kB`、JS `297.23/94.61 kB`（raw/gzip）；相对 E1 为媒体 adapter、真实 fixture 与生命周期 UI 的可解释增加，不是 N80 发布包预算结论。
- 性能：Script `13/13`；Route 首轮在并发负载下 P95 `529.08ms > 500ms`，停止预览负载后原样复测 `206.02ms`、`9/9`；Asset `4/4`，无预算或代码改写。
- 完整本机长链的后半段保留三类物理差异：重复 N43 的 5 秒保存窗口、Storage 的 5 秒恢复窗口和 90 秒 VM corpus 在长时间串行负载下超时；同一 N43 用例在该链前段曾通过，其余 Editor integration 原样补跑通过。未放宽 timeout/corpus/assertion，交由干净远端 Windows / Node 22 裁决。
- 本机受管沙箱还拒绝 Node 重建 `player-shell/dist` 与 `.vite-temp`，但允许 PowerShell 对同路径写入；修正后的定向测试和基于最新源码的 Vite dev browser 实测通过。该 ACL/沙箱差异不能冒充产品失败或成功，远端 build 必须通过。

## 6. 需求对齐与剩余阻断

E2 直接推进 REQ-STAGE、REQ-RUNTIME 与 AC-13：正式 Player 不再只有对白层，真实 PNG/WAV、awaited/cancel receipt 和错误呈现已经贯通 Compiler/Runtime/Host/Player。它没有复制剧情逻辑，也没有把 Editor Preview adapter 冒充 Player adapter，因此方向与“专业运行时 + 现代共享 UI + 三端同源”一致。

仍未解除：Editor↔Player 像素/音频 Golden、完整 BG/多角色 channel 语义、Camera/文本模板真实项目矩阵、Voice/SFX、媒体加载/损坏恢复、Save/History/Settings、Auto/Skip/Back/Forward、Gallery、Web/Windows/Android 正式宿主与目标设备证据。N21 `0/1`、N23 `0/2` 和全部 Product Acceptance 保持阻断；开发者浏览器与自动化不能登记为真人验收。

## 7. 下一步

远端完整门绿色后关闭 E2 Engineering。下一切片仍在 N50 内，优先建立 Editor Stage 与 Player Stage 的同一 Media Golden 差分 contract，并补媒体加载失败/恢复与多 channel 规则；是否进入 Player Save/History/Settings 需按 N50 顺序和授权再次冻结。N51 继续禁止开始。
