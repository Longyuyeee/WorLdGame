# N52-E5c Gal History 策略与 Player Core 投影审计

> 日期：2026-09-01
>
> 直接基线：N52-E5b 最终整理头 `372e8a6b6c22883e128b2f82199b557b8c19c412` / Draft PR #118
>
> 当前判定：**E5c Settings/Core 实现候选已完成；Player History 用户闭环尚未完成，E5d Shell、N52 Product Acceptance 与 N60 继续阻断。**

## 1. 用户目标与实现前实际差异

本步继续服务 [PRD 3.8](03-prd.md)、[Gal 5.2](11-gal-foundation-and-automation.md)及[产品目标纠偏 #262](262-product-goal-alignment-and-delivery-correction.md)：玩家需要查看当前主线和被改写的旧分支、按某句回退、理解不可逆边界，并由项目设置决定回退后是否可以沿原分支 Forward。E5c 只建立 Settings/Core 能力；没有 Shell 页面以前不能登记用户任务完成。

实现前先在真实 Gal Settings、Branching fixture、Media Barrier 和 Session Save 路径写入 5 个结果测试。预期新测试全部失败；首次实际为原有 `42/42` 通过、新增 `0/5`：Settings 仍为 schema v5 且拒绝 `history`，Core 只有 cursor/length/canBack/canForward，没有活动条目、archive、稳定 ID 定点回退、Barrier 原因/距离或 Forward 项目策略。差异与 #258/#259 完全一致，没有发现第二套 Runtime。

第一轮修正后剩余 `1/47` 失败：测试错误地把可见对白绑定到 Runtime entries 固定下标。实际 History 含内部 Direction/Input 边界，因此改为按 Runtime event 语义与稳定 ID 投影，不使用数组位置作为身份。扩大到编辑器、项目保存、Node/IndexedDB 重开和 Shell 既有回归时首次为 `146/147`，唯一差异是 Advanced 设置页仍断言旧 36 项；更新为 v6 的 37 项后同范围 `147/147`。

## 2. 已实现边界

- Gal Settings 升至 strict schema v6，且只增加 `history.allowForwardAfterBack`；默认 `true`，v1–v5 严格读取后归一为 v6 默认，v5 伪装 History 字段与 future v7 均失败关闭。
- Catalog/Editor/Application 暴露同一 History 设置，保持 default → project → platform 来源和覆盖规则；没有把策略塞进 Compiler、Runtime 或 Shell 私有配置。
- Player Core 直接从 Runtime History v2 投影活动可见事件、只读 archives、`entryId/archiveId`、past/current/future、可定点回退状态、最近 Barrier 的 descriptor/reason/distance，以及录制 Forward 与策略阻断的区别。
- `backPlayerCoreToHistoryEntryV1()` 只接受活动主线的可见 Runtime entry ID；archive ID 即使被调用也保持状态不变。定点回退仍逐步调用 Runtime Back 和正式 Host reconciliation，不直接改 State/cursor。
- `allowForwardAfterBack=false` 时 Core 保留 Runtime 中未改写的 Forward 分支，但 `canForward=false` 且 Forward intent 不改变 snapshot；默认 `true` 继续保持既有行为。
- 真实 Session Save v2 保存/加载后，活动与 archive 投影完全一致；Player Save v3、IndexedDB v3、Runtime State/History/Session Save schema、Compiler IR 和 Scheduler均未改变。

## 3. 当前验证与未完成项

受影响范围复测为 9 files / 147 tests 全部通过；其中 Player Core `25/25`，包含真实 Branching 改线、archive 只读、稳定 ID 定点回退、true/false Forward、Media Barrier approval、Session Save 重开。全仓 TypeScript 通过，未放宽 timeout、预算或断言。

首次全仓门在 Compiler `31/32` 暴露四个 Golden Build ID 差异：Settings v5→v6 会改变 Canonical Project 语义，所以四个 `storyIrHash` 全部保持原值，而 Build ID 合法变化。修正选择更新冻结的 Build 身份；没有把 History 设置排除出语义 hash，因为项目策略变化必须进入正式构建身份。

第二次全仓门通过 Player `83/83`、Gal Settings `125/125` 后，在 N51 历史出口审计发现旧脚本把当时 v5/36/23 基线当作永久当前版本。修正保留 N51 contract 原值，同时要求读取 E5a 授权后当前值必须精确为 v6/37/24；没有回写或伪造 N51 历史状态。

第三次全仓门进入普通回归后为 `152/154 files`、`970/974 tests`：Formal Preview 三项 State/History hash 和 Blank Project semantic hash仍冻结 v5 Build identity。实际 Story IR、路线 Outcome、保存重开相等关系均未变化；按新 v6 Build identity 更新这些 Golden，不删除断言。

最终本地 `npm run check` 从头完整通过：普通回归 `154 files / 974 tests`，N50 Player `83/83`、N51 Settings `125/125`、N52 Player History `95/95`，Runtime corpus 10,000 seeds / 20,000 replays 零失败且 digest 不变；VM `5/5` 用时 `84.72s < 90s`。17 workspace production build、架构 `100 portable / 4 adapters`、Script `13/13`、Route `9/9`、Asset `4/4` 全绿；Route 编辑链 P95 `143.78ms < 500ms`，Asset dicing/atlas/总计 `1549.12/1740.30/3289.42ms`。Editor 既有大 chunk warning继续保留，没有提高阈值。

E5c 仍不是 Player History 产品完成点。下一接续是 **N52-E5d Shell History 用户界面与 production 路径**：在桌面和 390×844 的真实 Branching 工程完成 History 入口、活动/旧分支展示、选行回退、Barrier 原因与距离、Forward 策略反馈，以及保存—刷新—读取。完成前 USP-09、REQ-RUNTIME、AC-16、N52 Product Acceptance、N60 与发布保持 blocked。
