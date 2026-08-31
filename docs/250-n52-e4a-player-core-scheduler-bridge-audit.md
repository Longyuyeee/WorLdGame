# N52-E4a Player Core Scheduler bridge 审计

> 日期：2026-08-31  
> 分支：`codex/n52-e4a-player-core-scheduler-bridge`  
> 直接基线：E4 入口最终绿色头 `172c3b2b79a61ba0857f7999e43a21bf015ecfa6` / Draft PR #108  
> 判定：**N52-E4a Player Core Scheduler bridge Engineering 关闭**。本步不是 Shell Auto、Skip UI 或 Product Acceptance。

## 1. 目标对齐与真实实现

E4a 的目标不是在 Player 内重写 Auto/Skip 循环，而是把已有 N31 `RuntimeSchedulerSessionV1` / `scheduleRuntimeBatchV1()` 作为唯一调度权威接入正式 Player Core。`PlayerCorePlaybackPolicyV1` 直接别名到 canonical `RuntimeSchedulePolicyV1`；Core `0.5.0` 新增 Scheduler Session 和版本化 playback snapshot，公开 mode、激活方式、速度、停止原因、本批及累积指令数和 Auto delay。

`schedulePlayerCorePlaybackV1()` 只从最新 History checkpoint 创建或续用 Scheduler Session。有 Forward History 时不猜测、不截断，返回 `history` 结构化停止且 State Hash、presentation、History 均不变。Direction 与 checkpoint 属于 Core 内部边界：Runtime 仍逐边界原子提交，Core 跨过它们直到下一可表现边界；checkpoint 同时从当时的精确截断 History 生成可加载 Session Save candidate。正式 Host effects 只在 Scheduler 接受提交后消费；资源不可用由 Runtime 在提交前回滚，因此 Core/History/Host 均保持原边界。

旧的手动 primary、choice、effect、barrier、Back/Forward 与 Load 路径会清除 Scheduler Session 和 playback stop，避免把已停止的自动批状态泄漏到手动操作。Shell 时钟、文本揭示、真实 voice duration、宿主 suspend、Skip Hold/Toggle/速度、媒体清理和 embed observation 仍分别属于 E4b/E4c。

## 2. 预期、首次实际与修正

首轮测试在写实现前冻结三条真实链：Benchmark 正式 Compiler→Runtime Scheduler→History→Player Host 的 Auto 边界与 `90ms` delay；build instruction Stop Point；存在 Forward branch 时 fail closed。预期为原有 15 项继续通过、新增 3 项只因桥接 API 不存在而失败。首次实际正是 `15 pass / 3 fail`，三项均为 `schedulePlayerCorePlaybackV1 is not a function`，没有 Runtime、fixture 或旧 History 偏差。

补入桥接后第二轮为 `17/18`：三个新增路径全通过，唯一差异是协议已升 `0.5.0` 而旧断言仍为 `0.4.0`。修正是同步 Player Core package、Shell exact dependency、lockfile 与现有版本断言，没有回退版本或放宽测试。随后增加两个风险反例：内部 checkpoint candidate 必须真实加载并继续；真实 Stage descriptor 不可用必须以 `resourceUnavailable` 停止且 operations 为空。最终 Player Core 为 `20/20`，Player/Shell 定向组合为 `3 files / 52 tests`，全仓 TypeScript typecheck 通过。

机器审计首次预期只缺本文及 89/90/99 三份权威登记，实际恰为四项；实现、版本、测试 token 与边界均已通过。回填后审计转绿。

首次完整 `npm run check` 在 E3a 旧合同处停止：预期全部旧机器合同继续通过，实际因本轮压缩 90 顶部状态句而缺少精确 token `N52-E3a v2 元数据与截图`。恢复后第二次完整门又暴露同类 `N52-E3 入口契约` token；随后不再逐项猜测，而是从全部 N52 JSON 合同枚举 90 文档 required token，一次恢复 E3/E3a/E3b/E3c1/E3c2/E3c3/E3c4/E4/E4a 全集并机器核对 `ALL_N52_DOC90_TOKENS_PASS`。第三次完整门全绿，未修改测试数据、timeout 或预算：普通 `153 files / 934 tests`、N50 `60/60`、N51 `105/105`、N52 `72/72`、Runtime `61/61` 与 `10,000 seeds / 20,000 replay` digest 不变、VM `5/5`（测试体 `72.77s <90s`）、17 workspace production build、architecture 与 Script/Route/Asset 性能全部通过；Route P95 `158.30ms <500ms`，Dicing/Atlas/总计 `1048.36/1803.37/2851.73ms`，均保持原预算。

实现头 `ed37edd6321ae207de9b53847a1eac7bc87ed863` 已推送至 Draft PR #109。该精确 SHA 的 Windows / Node 22 `product-baseline` run `33355351685` / job `99376310859` 用时 `13m32s` 并成功：普通 `153/934`、N50 `60/60`、N51 `105/105`、N52 `72/72`；Runtime corpus `10,000 seeds / 20,000 replay` 且 digest 不变；VM 测试体 `67.53s <90s`；Route P95 `141.4ms <500ms`；Dicing/Atlas/总计 `1480.71/1801.75/3282.46ms`，17 workspace build、架构与全部性能门均通过。由此 E4a Engineering 从 candidate 转为 complete。

## 3. 开发目标审计

| 目标 | 实际证据 | 判定 |
|---|---|---|
| 复用唯一 Runtime Scheduler | Core 直接调用 create/schedule API，无第二套 Scheduler | 满足 |
| canonical policy | Player policy 是 Runtime policy 的显式别名 | 满足 |
| History fail closed | Forward branch 返回 `history`，State/History/presentation 无变化 | 满足 |
| 结构化停止快照 | snapshot 含 mode/activation/speed/reason/count/delay | 满足 |
| checkpoint 不回归 | Scheduler 内部 marker 生成精确、可加载 candidate | 满足 |
| Host effect 原子性 | unavailable Stage effect 未提交 History/State/Host | 满足 |
| 不越界 | 无 Shell timer、Auto 控件、Skip 输入、Embed 扩展 | 满足 |

## 4. 下一接续点

本切片完成后下一唯一开发点是 **N52-E4b Shell Auto real clock / text reveal / real voice-duration bridge**：Shell 消费 Core 的 Auto delay，并以真实宿主 clock、文字揭示完成态、真实 voice duration/tail 和 suspend 生命周期调度下一批。不得用 mock timer-only、循环点击 primary、auto-save 或 `waitForVoice` 布尔量冒充产品证据。E4c 的 Skip Read/All、Hold/Toggle、速度、媒体清理和 embed observation 继续保持后置。
