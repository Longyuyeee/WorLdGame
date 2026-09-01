# N52-E5b 跨电脑接续点

> 交接日期：2026-09-01
>
> 接续分支：`codex/n52-e5b-runtime-history-v2`
>
> 基线：E5a 最终头 `788f93fb892136f045765279f240bb811e05e8a9`
>
> 状态：**E5b 实现、本地审计和完整仓库门已通过；正在推送并等待精确头 Windows CI。暂停开发，不进入 E5c。**

## 1. 当前已经完成

1. Runtime History 的磁盘 schema 已从 v1 升到 v2，新建 session 固定包含 `archives: []`。
2. rewound 状态改选分支时，被截断的 Forward entries 不再消失，而是形成 Runtime 唯一持有的只读摘要。摘要具备 canonical content-hash ID，并保留原 entry ID/index、input/event、Barrier delta 与 after-state hash。
3. Back/Forward、Barrier 阻断、Scheduler 与活动 State 仍只使用 `checkpoints/entries/cursor`；archive 不可导航。活动 entries 与所有 archive summaries 共用 10,000 项上限，超限失败关闭且不静默淘汰。
4. Runtime Session Save 已升至 schema v2，新写只发 v2；读取 strict v1/v2。旧 v1 在归一前按旧 History hash domain 验证，归一后 archives 为空；返回 artifact hash 仍对应原 v1 envelope，使 Player Save v3 的 opaque integrity check 保持有效。
5. 公共 API 名中的 `V1` 被确认是 API 代际而非磁盘 schema。本步保留现有函数入口，并新增显式 `RuntimeHistorySessionV2` / `RuntimeSessionSaveV2` / `LegacyV1` 类型，避免把 E5b 扩大为 Editor、Host、Core API 迁移。
6. History/Session Save v2 hash domain、VM golden、Formal Preview golden 与 generated corpus digest 已按版本化合同更新；Runtime State/Outcome hash、Runtime version `0.6.0`、IR 1.0/1.1、Player Save v3/DB3 均未改变。

## 2. 已完成审计

- E5b 机器审计：`npm run audit:n52-e5b-runtime-history-v2`，PASS；
- Runtime：`63/63`，正式 corpus `10,000 seeds / 20,000 replay / 40 shards / 0 failed`，v2 digest `01556a8c979e080cc653817713ad26f7d2882445e9ebdc727049f415da4863a9`；
- Formal Preview：`15/15`；Player History 跨层：`90/90`；
- 完整 `npm run check`：单次从头 PASS；普通回归 `154 files / 967 tests`，N50 `78/78`、N51 `123/123`、VM `5/5`，17 workspace build、100 portable / 4 adapters、全部治理与性能门通过；
- Route 编辑链 P95 `55.79ms <500ms`；Asset Dicing/Atlas/总计 `677.57/818.05/1495.62ms`。Editor `989.40 kB` 既有大包 warning 保留，没有调高阈值。

## 3. 换电脑后的恢复步骤

```powershell
git fetch origin --prune
git switch codex/n52-e5b-runtime-history-v2
git pull --ff-only origin codex/n52-e5b-runtime-history-v2
git status --short --branch
npm ci
npm run audit:n52-e5b-runtime-history-v2
```

恢复后先核对 [E5b 实现审计](260-n52-e5b-runtime-history-v2-audit.md)、本文件、`config/n52-e5b-runtime-history-v2.json`、远端 Draft PR 与 Windows CI。若 CI 尚未完成，只等待或修正 E5b，不能开始下一切片。

## 4. 后续开发顺序

1. **先关闭 E5b 远端证据**：精确实现头 Windows / Node 22 完整门绿色后，把 commit/run/job/conclusion 回填 #260、本文件、#89/#90/#99 与机器合同，再推送证据提交。
2. **E5c Settings + Core**：Gal Settings v6 只增加 `history.allowForwardAfterBack`；strict v1–v5 读取后归一默认 `true`。Player Core 从 Runtime History 投影活动主线、只读 archive、Barrier 原因/距离，并提供稳定 ID 的定点回退；Core 执行项目 Forward 策略，不另建历史账本。
3. **E5d Shell**：实现桌面与 390×844 History 页面/入口、选择某句回退、旧分支只读查看、不可逆 Barrier 原因和 Forward 策略反馈；完成 cold production 浏览器证据。
4. **E5e 总出口复审**：重新逐项对齐 Gal 5.2、PRD 3.8、USP-09、REQ-RUNTIME 与 AC-16。仍有缺口则 fail closed，不能进入 N60。

## 5. 明确禁止

- 不在 Shell/Core 建第二套 Runtime History；不导航 archive；不使用 wall clock 或数组位置直接充当 archive ID；
- 不升级 Player Save v3/IndexedDB v3，不修改 Runtime State/IR/Scheduler，不提前做 Gal Settings/Core/Shell；
- 不把 E5b Engineering 换算成 N52 Product Acceptance、AC-16、M1 Stable、发布完成或 N60 授权。

精确提交、Draft PR 和 Windows CI 编号将在本次推送完成后回填。本文件标题 token：**E5b 跨电脑接续点**。
