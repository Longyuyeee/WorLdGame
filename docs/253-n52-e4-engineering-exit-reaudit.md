# N52-E4 Engineering 出口复审与接续审计

> 日期：2026-08-31  
> 分支：`codex/n52-e4-engineering-exit-reaudit`  
> 直接基线：E4c 最终绿色头 `9e17bb260786c2ca07c51887fe231082d480533d`  
> 当前判定：**N52-E4 Engineering 总出口未通过**；E4a–E4c 子切片结论保持有效，下一唯一代码切片为 N52-E4d。

## 1. 出口结论

E4a–E4c 已建立真实的 Runtime→Player Core→Web Shell 播放链：N31 Runtime 仍是唯一 Scheduler；Auto 使用 Shell 真实时钟、文字揭示完成态和实际 audio duration/tail；Skip Read/All、Hold/Toggle、5/10/20/40/Instant、budget continuation、停止清理与 Embed API `1.2.0` observation 均存在。出口定向回归实际为 `6 files / 139 tests` 全绿，cold production 也再次到达预期的 Choice/Input 边界。

但 [PRD 3.8](03-prd.md) 与 [Gal 4.2](11-gal-foundation-and-automation.md)明确要求项目声明的 Stop Point 强制停止快进。真实代码中 Auto 与 Skip 的 `stopInstructionIds` 仍各自固定为 `[]`；正式 Canonical/Story Language/Compiler 也没有“Player Stop Point”作者来源。E4a 的精确 ID 单测只证明外部传入 ID 时 Core 能停止，不能替代作者→Build→Shell 的产品链。因此 E4 总出口必须 fail closed。

视频属于 PRD P1 renderer，但 P0 同时要求视频的独立快进策略。正式 Player 目前没有 `<video>` renderer，E4c 也未取得视频策略实测；它不应被伪造为现有实现。E4c 的 390×844 cold production 复验同样仍缺：本轮可用的 in-app production 浏览器固定为 1280×720，未提供可审计的 viewport 切换能力，故只保留 E4b 的旧手机证据，不把响应式 CSS 或 jsdom 当作新 E4c 手机证据。

## 2. 出口矩阵

| 冻结项 | 真实代码 / 测试事实 | 判定 |
|---|---|---|
| 唯一确定性 Scheduler | Shell 只调用 `schedulePlayerCorePlaybackV1`，Core 调用 `scheduleRuntimeBatchV1` | 完整 |
| Auto 真实时钟与媒体时长 | real `window.setTimeout`、文字 reveal、audio `duration-currentTime+tail`、suspend/resume | 完整 |
| 四种 Skip 与五档速度 | Skip Read/All × Hold/Toggle；5/10/20/40/Instant；budget 新任务续跑 | 完整 |
| 现有媒体退出清理 | text/stage/character CSS 归零；被策略暂停且仍应播放的 audio 恢复 | 完整 |
| build-authored Stop Point source | Shell 两处 `stopInstructionIds: []`；无作者声明和 Build artifact 来源 | 阻断 |
| 视频策略实证 | 正式 Player 无 video renderer，不能实测跳过/等待/恢复 | 阻断，不冒充 P0 完整 |
| E4c 手机 cold production | E4b 有 390×844；E4c 本轮仅可复验 1280×720 | 阻断证据项 |

矩阵为 `完整 4 / 阻断 3`。这不是把 E4c 已完成工作推翻，而是区分“子切片完成”和“E4 总目标完成”。AC-15、N52 Product Acceptance、Windows/Android 与真人证据继续保持 blocked。

## 3. 预期—首次实际—修正

### 3.1 机器出口审计

冻结预期：E4a–E4c 代码事实通过；E4 总出口保持 blocked；首次只应因新出口文档尚未登记而失败。首次实际为 **5 项违反**：四项是 #253、#89、#90、#99 缺少出口 token；第五项是审计器的负向正则在 `[]` 内回溯，把空数组误报成非空来源。

修正分为两部分：审计器改为枚举每个 `stopInstructionIds` 赋值并精确比较 `[]`，原始误报写入机器合同；四份权威文档随后登记真实的 fail-closed 判定和 E4d 接续点。没有修改 Player 产品代码、没有降低出口条件。

### 3.2 定向真实回归

冻结预期是 Runtime/Core/Policy/Shell/Embed/Media parity 六条现有链全部通过，同时不改变 Stop Point 缺口。首次实际为 `6 files / 139 tests PASS`，耗时 `44.91s`；和预期无功能差异。139 是当前真实收集数，不沿用 E4c 文档中的旧聚合数字。

### 3.3 cold production 1280×720

冷 production build 由 Vite 8.2.1 生成，`90 modules`，构建 `1.31s`。在真实 in-app production 浏览器中先清除旧 recovery，再执行：

- 开始后 History `3`；Auto 等待真实时间约 7.6 秒后 History `5`，`mode=auto`、`stop=storyBoundary`、`auto=waiting-text`；
- 再次清除 recovery 后，Skip Read 从 History `3` 到 `5`，`stop=unreadBoundary`、`active=false`；
- Skip All 从 History `5` 到 `17`，准确停在 `waiting-choice/input/active=false`；
- document 横向 overflow 为 `0`。

实际与冻结的“已实现链不回退、停在同一 Choice/Input 边界”一致。该证据不覆盖 390×844、video、实体设备或真人。

## 4. 唯一接续点：N52-E4d

N52-E4d 只实现 **build-authored Player Stop Point source 与 Shell policy bridge**，开始前必须冻结跨层窄合同：

1. 作者可在正式 Canonical/Story source 声明稳定 Player Stop Point，不复用内部 History checkpoint、墙钟或数组下标；
2. Compiler artifact 保留精确 instruction identity，Runtime Scheduler 仍只消费 `stopInstructionIds`，不新增第二套剧情解释器；
3. Auto、Skip Read/All × Hold/Toggle 都在该点停止，且到达停止点前的 State/History 与 Normal 执行一致；
4. Shell 不再硬编码空 stop list，Embed observation 暴露正式 `stopPoint`；
5. 真实测试必须先记录旧代码在作者链上的失败，再贯通 Source→Compiler→Runtime→Core→Shell，并做 cold production 复验。

视频策略和 E4c 390×844 证据继续显式保留。E4d 完成后必须再次执行 E4 出口复审；不得因为 Stop Point 一项关闭就自动登记 E4、AC-15 或 N52 Product Acceptance 通过。

## 5. 本切片退出门

本审计切片的目标是得出可重复、诚实的出口裁决，而不是关闭 E4。退出前必须满足：机器审计 PASS 且仍报告 `engineeringStatus=blocked`；定向真实回归与 cold production 结果写入本文；#89/#90/#99 对齐；完整仓库门通过；提交推送后取得精确头 Windows / Node 22 CI。远端证据在最终头绿色后回填，不得复用 E4c 的旧 run 冒充本头。

本地 `npm run check` 首次实际即完整绿色，没有修改预算或测试范围：普通回归 `154 files / 954 tests`；N50 `68/68`、N51 `113/113`、N52 History `80/80`；Runtime `61/61` 与 `10,000 seeds / 20,000 replay` 固定 digest；VM `5/5`（测试体 `62.00s <90s`）；17 workspace production build 与 architecture 全部 PASS。Route 10k 正式编辑链 P95 `204.14ms <500ms`，Asset Dicing/Atlas/总计 `1391.39/1684.89/3076.28ms`，均在原预算内。完整门和定向预期一致，没有出现需要修改产品代码的新差异。
