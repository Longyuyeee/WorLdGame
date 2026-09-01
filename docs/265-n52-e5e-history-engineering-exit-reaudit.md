# N52-E5e History Engineering 总出口复审

> 日期：2026-09-01
>
> 直接基线：N52-E5d 文档闭环头 `3be839dd8ba8edb0afc31c74a47b6e9477f7fc1b` / Draft PR #120
>
> 授权：`RA-N21-011`，最大交付节点仍为 N52
>
> 当前判定：**N52 Engineering：完成；N52 Product Acceptance、N60、M1 Stable 与发布继续阻断。**
>
> 基线远端证据：`3be839d` / Windows run `33469449751` / job `99736028759`，约 `13m37s` 成功

## 1. 复审目标与预期—实际差异

本步不再建立新功能，只按 [PRD 3.8](03-prd.md)、[Gal 5.2](11-gal-foundation-and-automation.md)、USP-09、REQ-RUNTIME、AC-16 和[产品目标纠偏 #262](262-product-goal-alignment-and-delivery-correction.md)复审 E5a–E5d 交付的同一个玩家任务。

预期是七项 N52 Engineering 能力全部 complete，同时 Product Acceptance 与 N60 保持 blocked。首次读取机器治理合同的实际结果是：Save/Load、Auto/Skip、精确 Back/Forward 三项已 complete，但可选行 History、旧 Forward 分支查看、Barrier 原因/距离和 Forward 项目策略四项仍停留在 E5 开始前的 blocked 快照，`engineeringStatus` 也仍是 blocked。与此同时，真实 N52 History 聚合回归为 `5 files / 101 tests` 全部通过。因此差异位于聚合治理状态，不是功能缺失。

更新治理合同和真实代码断言后，新增总出口门首次运行仍有 5 项失败：审计器把实际 `backwardBarrier.distance` 误写为不存在的 `barrierDistance`，另外四项是 #265、#89、#90、#99 尚未登记新状态。审计器改为核对真实字段表达式，文档按本复审同步更新；没有删除代码检查、降低状态要求或把产品门改成通过。

## 2. 原始需求逐项代码复核

| N52 工程能力 | 真实实现与证据 | E5e 判定 |
|---|---|---|
| Save/Load、Auto/Quick、checkpoint | 正式 Store/Core/Shell、迁移与槽位链已在 E1–E3c4 关闭 | complete |
| Auto 与四种 Skip、五档速度、媒体/Stop Point | E4 `7/7`，Web 桌面/390×844 production 已闭环 | complete |
| Back/Forward 精确状态 | Runtime History + Host reconciliation，State/Host 同步恢复 | complete |
| 可选行 History 页面 | Shell 展示活动条目，按 Runtime 稳定 `entryId` 派发 `history-back-to` | complete |
| 截断旧 Forward 分支仍可查看 | Runtime History v2 生成 content-addressed、只读、不可导航 archive；active+archive 共用 10,000 上限 | complete |
| Barrier 原因与距离可见 | Core 投影 `descriptorId/reason/distance`，Shell 明确展示 | complete |
| History Forward 项目策略 | Gal Settings strict v6 唯一持有 `history.allowForwardAfterBack`；Core 执行，Shell 显示 true/false 反馈并支持热应用 | complete |

代码所有权没有漂移：Runtime 仍是唯一 History 账本；Core 只投影并执行导航/策略；Shell 不复制 archive，也不允许导航只读旧分支。Runtime State/IR/Scheduler、Player Save v3/DB3 均未因 E5 升版。

## 3. 真实用户路径与工程证据

- E5b Runtime：History/Session Save v2、v1 严格双读、10k/20k corpus 与确定性 digest；实现头 `78a19ec` 的 Windows run `33457956272` / job `99701844659` 成功。
- E5c Settings/Core：实现前 `0/5`，修正后受影响范围 `147/147`、Core `25/25`；实现头 `cce203b` 的 run `33465730199` / job `99725069881` 成功。
- E5d Shell：实现前新增路径 `0/3`，修正与扩展后 `6/6`，N52 `101/101`、N51 `131/131`；实现头 `08bfb5c` 的 run `33468762702` / job `99734003643` 用时 `9m26s` 成功。
- 1440×900 与 390×844 cold production 均完成活动/旧分支、稳定 ID 回退、策略 false、Barrier 和保存—刷新—读取；overflow `0`、最小控件 `44/48px`、console error/warning `0`。首次移动路径被同项目真实 Recovery 记录覆盖，改为独立演示身份后通过，没有清除或绕过真实持久化。

E5e 自身不修改产品代码，因此不重复制造一套 UI 测试或假装新的浏览器功能证据；它复用精确 E5b–E5d 实现头证据，并重新运行现头 N52 `101/101`、机器治理门与候选头完整产品基线。

候选头唯一一次完整 `npm run check` 从头退出 0：普通回归 `154 files / 980 tests`，N50 `89/89`、N51 `131/131`、N52 `101/101`；Runtime `63/63 + 10,000 seeds / 20,000 replays`，digest 仍为 `01556a8c…63a9`；VM `5/5` 测试体 `71.69s < 90s`。TypeScript、17 个 workspace production builds、全部治理/架构/Script 门均通过；Route 10k 修改 P95 `107.92ms < 500ms`、lazy structure `227.61ms < 500ms`，Asset Dicing/Atlas/总计 `1219.64 / 1486.80 / 2706.44ms`，未调整任何预算。Editor 大包 warning 仍是既有债务，不在纯聚合复审中冒充解决。

## 4. 需求状态与接续点

N52 Engineering 现在可以关闭，但这只说明当前节点授权范围内的 Web 工程实现完整。USP-09、REQ-RUNTIME 与 AC-16 仍保持“实现中”：Windows/Android 正式 Player Host、实体设备、真人任务和 Product Acceptance 尚未完成，不能由 Web 响应式测试或自动化绿色代替。

下一接续点不是 N60 新功能，而是 **收束堆叠 Draft PR，形成 main-target 集成候选，并执行 N21/N23 长期欠缺的真人产品验证**。`RA-N21-011` 的最大节点仍为 N52；没有新的明确授权不得进入 N60。E5e 远端精确候选头证据将在本步提交推送后补记。
