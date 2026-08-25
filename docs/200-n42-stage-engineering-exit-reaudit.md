# N42 Stage Engineering 出口复审

> 日期：2026-08-25
> 分支：`codex/n42-engineering-exit`
> 直接基线：N42-E9 `86f8457`
> Draft PR：#73，base `codex/n42-e9-bezier-character-path`
> Windows CI：run `32819164396` / job `97713489647`，6 分 18 秒，绿色
> 授权边界：`RA-N21-007` 只允许 N42 Stage Engineering
> 判定：N42 Stage Engineering 出口通过；N42 Product Acceptance、N43、正式 Player、M1 与发布继续阻断

## 1. 复审结论与纠偏

N42 冻结目标是“导演能操控镜头、角色、背景、音频和基础特效”，不是继续无上限扩张高级 Camera、Shader 或独立媒体时间线。E1–E9 已把真实媒体、角色空间编辑、缓动、stable-ID 关键帧、派生多轨时间线、折线/三次贝塞尔路径、基础 Camera、作用域转场和 ADV/NVL/Bubble 模板接入同一 Canonical Script，并贯通 Compiler、Formal Runtime、portable Host、Editor Preview 与保存重开。

复审没有发现新的 N42 Engineering 功能缺口。首次差异出现在“节点是否可以整体宣称完成”：冻结 Acceptance 要求 AC-13 样例在 Editor Preview 与正式 Player 一致，而仓库没有 `apps/player-web`，当前单文件试玩仍直接解释 `StoryStatement`。因此本轮纠正为 **Engineering 出口通过、Product Acceptance 0/1**，并停止继续用 E10+ 高级特效推迟 Player/Gal/Android 产品链。

## 2. 出口矩阵

| 类别 | 冻结条件 | 当前证据 | 判定 |
|---|---|---|---|
| Goal | 导演操控镜头、角色、背景、音频和基础特效 | Stage/Sequence 图形入口可写回 Camera、Show/Move、Background、Audio、Transition 与 Textbox canonical directive | 1/1 |
| Implementation | 多轨、关键帧、缓动、运动轨迹、镜头、基础转场、语义命令、Runtime 同步、三种文本模板 | E1–E9 与新增 `audit:n42-stage-exit` 覆盖 8 类冻结能力；路径、镜头、转场和模板均通过 Language→Compiler→Runtime/Host→Preview/重开 | 8/8 |
| Engineering 真实性 | 真实工程、真实媒体、失败关闭和确定性重开 | 冻结 PNG/WAV fixture、Asset Repository、Compiler diagnostics、Runtime invalid IR、Host receipt 与 Project reopen 均有实际测试 | 通过 |
| Acceptance | AC-13 在 Editor Preview 与正式 Player 一致 | Editor Preview 已有证据；正式 Player 与真实 Player Adapter 不存在，无法形成视觉/音频差分 | 0/1，阻断 |
| 产品验收边界 | 自动化不得替代真人和设备证据 | N21 `0/1`、N23 `0/2`；E8/E9 production browser 视觉证据缺失 | 阻断 |

## 3. 真实预期—首次实际—差异—修正

| 检查 | 预期 | 首次实际 | 差异与修正 | 最终实际 |
|---|---|---|---|---|
| N42 功能范围 | 冻结 Implementation 全部有代码和测试证据 | 8/8 均已存在；E9 已补齐任意三次贝塞尔路径 | 无需追加高级 Camera 或独立时间写入 | Engineering 功能出口关闭 |
| 节点完成声明 | 只有 Editor↔Player 一致才可整体完成 | 正式 Player 不存在，单文件 HTML 是平行 `StoryStatement` 解释器 | 拆分 Engineering 与 Product Acceptance；保持后者失败 | Engineering 通过，Acceptance `0/1` |
| 可重复出口门 | 根 `check` 可直接复验 N42 冻结能力 | 只有分散的 E1–E9 测试，没有 N42 汇总命令 | 新增 `audit:n42-stage-exit` 并纳入根 `check` | `16 files / 192 tests` 全绿 |
| 文档状态 | 当前状态必须包含 E9 | `docs/99` 一处仍写 E1–E8、任意曲线未完成 | 同步 89/90/99 与本出口复审 | E9 和出口边界一致 |
| 视觉验收 | production browser 实测才登记画面通过 | E6/E7 有真实浏览器证据；E8/E9 因本地 URL 安全策略未完成视觉实测 | 不以 DOM/数学测试替代视觉验收 | 视觉/Player Product Acceptance 保持阻断 |

## 4. 本轮真实测试

新增根命令 `npm run audit:n42-stage-exit`，实际执行结果：

- 16 个真实测试文件、192 项测试全部通过；
- 覆盖 Story Language Camera/Transition/Textbox/Bezier 解析与失败关闭；
- 覆盖 Project Compiler lowering/diagnostics、Formal Runtime effect/invalid IR、portable Runtime Host channel；
- 覆盖 Editor 图形化写回、真实媒体 fixture、关键帧、时间线、折线路径、贝塞尔路径、Preview plan 与保存重开；
- 首次执行即为绿色，因为本轮纠正的是出口判定和可重复审计缺口，不伪造功能 RED；首次发现的实际差异是“没有正式 Player，不能满足 Acceptance”。

根 `check` 已加入该命令，后续任何 Stage、Compiler、Runtime、Host 或 Preview 回归都会阻断完整仓库门。

本机完整仓库门随后实际退出码为 0：常规回归 `128 files / 799 tests`，真实 IndexedDB storage `1/1`，重型 VM `5/5`；Runtime corpus 为 10,000 seeds / 20,000 replays、0 失败且 digest `20e9a842…92ef2` 不变；14 个 workspace 的 typecheck/build 与 93 个 portable 文件架构审计通过。Route 单场景编辑到锚点窗口 P95 `170.13ms <500ms`，Dicing 总耗时 `3699.84ms <5000ms`、净节省 `85.83%`。Editor production JS 为 `905.92 kB / gzip 252.88 kB`，仍触发 `>500 kB` 拆包警告，明确保留为优化债，未把构建成功写成包体达标。

远端干净 Windows / Node 22 在同一实现头 `b3485b3` 上复验并于 6 分 18 秒绿色结束：N42 汇总矩阵 `16 files / 192 tests`、常规回归 `128 files / 799 tests`、storage `1/1`、重型 VM `5/5`，Runtime corpus digest 不变。Route P95 `130.24ms <500ms`，10,000 条三次贝塞尔规划 `12.5ms <500ms`；Editor JS `906.00 kB / gzip 252.87 kB`，与本机差异不足以改变判定，继续保留同一拆包债。run `32819164396` / job `97713489647`。

## 5. 需求对齐与下一步边界

本轮关闭 N42 Stage **Engineering**，继续推进 `USP-01`、`REQ-STAGE`、`AC-03` 与 `AC-13` 的工程部分；没有把它们登记为产品通过。以下缺口明确保留：

- 正式 Player Core、Web Player 与 Editor↔Player 画面/音频 Golden；
- N43 七工作模式、Mobile Focus、Beginner/Pro 和完整动效/无障碍产品验收；
- N50–N52 Player 与 Gal Settings；
- N62 Gallery/Replay/Music/Ending 玩家页面；
- Windows/Android 正式编辑器与 Web/Windows/Android 发布链；
- 20–30 分钟 Benchmark Episode、真机性能与两小时稳定性。

`RA-N21-007` 的最大节点仍是 N42。远端 Windows / Node 22 完整门与证据提交关闭后，应建立新的有界治理检查点；在此之前不得自行进入 N43、Player 或发布实现。下一授权必须优先纠正“工程底座领先、用户产品链滞后”，禁止继续以 N42 高级特效替代正式 Player、Gal Settings、Android 和构建闭环。
