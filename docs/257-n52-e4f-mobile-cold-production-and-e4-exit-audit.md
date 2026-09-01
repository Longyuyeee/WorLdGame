# N52-E4f 移动端 cold production 与 E4 出口审计

> 日期：2026-08-31  
> 分支：`codex/n52-e4f-mobile-cold-production-exit`  
> 直接基线：E4e 最终绿色头 `569a4d30fd3b60caf9209ae7b72ce3b43bd045ca` / Draft PR #114  
> 授权：`RA-N21-011`，最大节点 N52  
> 当前判定：**E4 Engineering 出口通过；Product Acceptance 阻断。**

## 1. 原始需求与代码对齐

[PRD 3.8](03-prd.md)和[Gal Foundation 2.3 / 4](11-gal-foundation-and-automation.md)要求 Auto 与 Skip 独立，Skip Read/All 同时支持 Hold/Toggle 与 5/10/20/40/Instant，文字、等待、转场、音频、视频分别执行策略，并在 Choice、Input、Error、缺失下载和作者 Stop Point 停止。实际代码复核确认 E4a–E4e 已由唯一 N31 Runtime Scheduler 贯通这些语义，本切片不需要新增第二套播放逻辑；唯一待补的是 E4c 在 390×844 cold production 的正式复验。

## 2. 首次实际与纠偏

冻结预期是五个向量和移动布局无需改产品代码即可通过。首次生产实测中，document 横向 overflow 为 `0`，三个播放按钮均为 `58×48px`，但“快进激活方式”和“快进速度”两个 select 只有 `58×30px`，低于项目既有的移动端 `44px` 触控门。这是实际 UI 与最初 mobile-first 要求的偏移，而不是证据工具问题。

纠偏仅在 `max-width: 640px` 下为 `.player-playback-controls select` 增加 `min-height: 48px`，不改变 Scheduler、Playback Policy、状态机或桌面布局。重新 production build 后，三个按钮与两个 select 均为 `58×48px`；等待选择时 History 为 `48×48px`、Quick Save/Load 为 `89.6×44px`、Save toggle 为 `88×48px`、Choice 为 `362×55.6px`，全部位于视口内。

## 3. 390×844 cold production 证据

每个向量均从新页面开始，使用真实 production bundle 与浏览器真实指针生命周期；Hold 不是脚本直接触发事件。

| 向量 | 实际结果 |
|---|---|
| Auto | History `3→5`；`presenting / auto / storyBoundary / waiting-text` |
| Toggle Skip Read | History `3→4`；`presenting / skipRead / unreadBoundary / active=false` |
| Toggle Skip All，5× | History `3→17`；`waiting-choice / skipAll / input / active=false` |
| Hold Skip Read | History `3→4`；`presenting / skipRead / hold / unreadBoundary / active=false` |
| Hold Skip All，Instant | History `3→17`；`waiting-choice / skipAll / hold / input / active=false` |

五个向量均为 `390×844`、document 横向 overflow `0`、console error/warn `0`。因此 E4 七项矩阵现为 `完整 7 / 阻断 0`：唯一 Scheduler、Auto 真实时钟、四种 Skip/两种激活/五档速度、现有媒体清理、build-authored Stop Point、正式 video policy 和移动 cold production 均已取得工程证据。

专项回归为 `6 files / 149 tests`，E4f 与聚合 E4 机器审计均 PASS，`npm run typecheck` 通过。完整 `npm run check` 前两次分别在历史 `N52-E3 入口契约` 与 `N52-E3a v2 元数据与截图` 文档 token 处 fail closed：原因是更新追踪矩阵顶部摘要时过度压缩了旧节点名称；集中恢复 E3/E4 稳定历史索引后，全部 N52 合同连续 PASS，没有修改产品逻辑、timeout 或预算。第三次完整门退出 0：普通回归 `154 files / 967 tests`，N50 `78/78`、N51 `123/123`、N52 History `90/90`，Runtime `61/61 + 10,000 seeds / 20,000 replays`，VM `5/5` 测试体 `26.10s`，17 个 workspace production build 和 architecture 全绿；Route 10k 正式编辑链 P95 `54.90ms <500ms`，Asset Dicing / Atlas / 总计 `699.44 / 848.44 / 1547.88ms`，均在原预算内。

实现头 `b5681a711f6ff8798a3320543e15481c89dd8f06` 已推送至 Draft PR #115；同一精确 head 的 Windows / Node 22 `product-baseline` run `33408391033` / job `99541585012` 用时 `15m04s`，结论 `success`。远端普通回归 `154 files / 967 tests`、N51 `123/123`、N52 History `90/90`、VM `5/5` 测试体 `74.02s <90s`、Route P95 `162.72ms <500ms`、Asset Dicing / Atlas / 总计 `1571.18 / 1923.78 / 3494.96ms`，均在冻结预算内。

## 4. 出口边界与接续

本步只关闭 **N52-E4 Engineering**。Windows/Android 正式宿主、实体设备、真人向量、AC-15 和 N52 Product Acceptance 均未完成；响应式 Chrome 证据不能冒充 Android 真机。`RA-N21-011` 最大节点仍为 N52，因此不得直接开始 N60。

下一唯一接续点是 **N52 Engineering 总出口与 N60 治理 checkpoint**：逐项核对 N52 的 History、Save/Load、Auto/Skip、Back/Forward 是否覆盖原始 Goal/Implementation，关闭或保留 N52 工程缺口，并在任何 N60 代码工作前取得显式新授权。机器合同为 `config/n52-e4f-mobile-cold-production-exit.json`，专项审计命令为 `npm run audit:n52-e4f-mobile-cold-production-exit`。
