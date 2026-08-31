# N52-E4 Auto/Skip 入口审计

> 日期：2026-08-31  
> 分支：`codex/n52-e4-auto-skip-entry`  
> 直接基线：N52-E3c4 最终绿色头 `e9bc714` / Draft PR #107  
> 授权：`RA-N21-011`，最大节点 N52  
> 判定：**N52-E4 Auto/Skip 入口 Engineering 关闭**；本步只冻结 Player 接线、真实计时/媒体与停止合同，不登记 Auto/Skip 产品实现或 Product Acceptance 完成。

## 1. 原始需求与真实代码

[PRD 3.8](03-prd.md)和[Gal 4](11-gal-foundation-and-automation.md)要求独立 Auto、Skip Read/All、Hold/Toggle、5/10/20/40/Instant、文本/等待/转场/角色运动/音频/视频分类策略，并在选择、输入、错误、未下载内容和显式 Stop Point 停止。Skip 只改变调度与表现，不能改变同一停止点的剧情 State Hash；Auto 必须综合文本、标点、语言和真实语音时长，且与 Skip 分开保存。

实际 N31 `RuntimeSchedulerSessionV1` 与 `scheduleRuntimeBatchV1()` 已完整拥有四种 mode、两种激活方式、五档速度、原子 History、Auto delay 和结构化 stop reason。Player Core 却仍直接调用 `advanceRuntimeHistoryV1()`，intent 只有 primary/choice/cancel/back/forward/restart；Shell 没有播放 Auto/Skip 控件，embed observation 也没有播放状态。Shell 当前“自动”只指五槽自动存档；Gal Settings 的 `advance.allowHold` 只表示普通持续推进，`waitForVoice` 只阻止手动 primary，二者都不是 E4 功能。

Runtime 的 `stopInstructionIds` 目前由外部传入，正式 build-authored Player Stop Point 来源尚未接线；Web Host 只有实际 `voicePlaying` 布尔状态，没有可供 Auto 使用的真实语音 duration provider，视频策略也不存在。因此 E4 不能在 Shell 内用 interval 连续点击 primary，也不能复刻第二套剧情循环。

## 2. 冻结合同与切片

机器合同位于 `config/n52-e4-auto-skip-entry.json`，所有权固定为：Runtime 继续是唯一确定性 Scheduler；Player Core 持有 Scheduler Session、策略分发、History 与 Host Effect 桥；Shell/Host 只拥有真实时钟、输入生命周期、资源可用性、媒体时长、控件和表现清理；N52 建立版本化 Player Playback Policy，不在 Gal Settings schema v5 下静默追加字段。

停止合同要求 Choice/Input、awaited Effect、Barrier、资源不可用、诊断、终局、build-authored Stop Point、宿主 suspend 与 History 导航停止。Skip Read 在提交首个未读对白/旁白后停止；存在 Forward History 时必须先显式解决，Scheduler 不得猜测跨越。任一停止都必须清除自有计时器并恢复普通文字、舞台、音频和视频状态。

实现顺序冻结为：

1. **E4a**：Player Core 接入唯一 N31 Scheduler，建立 canonical playback policy、History 边界与结构化 stop snapshot；
2. **E4b**：Shell Auto 控件和真实 clock，接入文字揭示、真实语音 duration/tail 与宿主 suspend；
3. **E4c**：Skip Read/All、Hold/Toggle、5/10/20/40/Instant、媒体分类清理与 embed observation。

## 3. 预期、首次实际与差异

本入口先建立机器合同和代码事实审计，再补文档。预期是 Runtime Scheduler、现有 Player/Settings/自动存档事实全部通过，只因四份权威文档尚未登记 E4 而失败。

首次 `npm run audit:n52-e4-auto-skip-entry` 实际为 **FAIL**，且恰好只有四项：本文不存在，89 缺少 `E4 Auto/Skip 入口状态`，90 与 99 缺少 `N52-E4 Auto/Skip 入口合同`。Runtime 四模式/速度/stop reason、Player 未接线、Shell auto-save、Gal advance 字段和 embed 缺口均与预期一致，没有额外代码差异。修正仅回填真实状态文档，不修改产品代码或降低审计条件。

文档回填后入口复验 PASS。正式 N31 Scheduler 回归为 `61/61`；Runtime corpus 为 `10,000 seeds / 20,000 replay`，failed seeds `0`，digest 保持 `20e9a842cd1e70b012d2307b37209f63192f4e463df7e15cf5beed8c5fc92ef2`。N52 Runtime Host、Player Core、Save Store、Shell 与 mount 组合为 `5 files / 67 tests` PASS。

首次完整 `npm run check` 的预期是全绿，实际在最后一组 Editor integration 中只有 `App.test.tsx` 的“全局搜索并跨场景跳转”以 `5.502s > 5s` 超时，其他 44 项通过。本切片未改 Editor 产品代码；同一测试、同一 5 秒预算隔离复跑实际测试体 `1.31s` 并通过，故未提高 timeout。第二次完整门从头执行，普通回归 `153 files / 929 tests`、Compiler `30/30`、Runtime `61/61`、Player `55/55`、Settings `105/105`、N52 `67/67`、App `45/45`、VM `5/5`（测试体 `80.05s < 90s`）、17 workspace production build、architecture 与 Script/Route 均通过；最后 Asset 门在累积负载下首次得到 Dicing `2945.64ms <3000ms`、Atlas `4054.28ms >3000ms`、总计 `6999.92ms >5000ms`。同一 8×512 RGBA 数据与原预算隔离复跑为 Dicing `1261.79ms`、Atlas `1857.91ms`、总计 `3119.70ms`，`4/4` PASS。预算、数据规模和断言均未修改。

入口提交 `e7bd5ccab2e6fecd11100f93c2ec7abc4a1e8ada` 已推送至 Draft PR #108。该精确 SHA 的 Windows / Node 22 `product-baseline` run `33351442390` / job `99365490775` 用时 `14m06s` 并成功：普通回归 `153/929`、Player `55/55`、Settings `105/105`、N52 `67/67`、Runtime corpus `10,000/20,000` 且 digest 未变、VM 测试体 `74.98s <90s`、Dicing/Atlas `1492.88/1912.61ms`，17 workspace build、架构与性能门全部通过。由此本地主机累积负载差异关闭，E4 入口由 candidate 转为 complete。

入口没有 Auto/Skip 产品 UI，故不生成浏览器截图冒充 E4 实现证据。E4a 开始后测试必须先记录预期，再用真实 Compiler/Runtime/History/Host 得到首次实际 State/History/stop reason；E4b/E4c 必须使用 cold production build 的真实计时、输入和媒体路径，不能用 mock timer 或开发服务器结果登记产品通过。

## 4. 边界与下一接续点

本入口不实现 Auto/Skip，不登记 AC-15、三端、真人或实体设备通过。下一唯一代码切片为 **N52-E4a Player Core Scheduler bridge**。它不得加入 Shell 私有剧情解释器；不得在有 Forward History 时静默截断；不得把 Runtime Scheduler 单测、响应式浏览器或自动存档证据换算成 Player Auto/Skip Product Acceptance。
