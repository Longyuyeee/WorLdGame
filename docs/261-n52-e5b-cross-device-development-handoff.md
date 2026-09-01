# N52-E5b 跨电脑接续点

> 交接日期：2026-09-01
>
> 接续分支：`codex/n52-e5b-runtime-history-v2`
>
> 基线：E5a 最终头 `788f93fb892136f045765279f240bb811e05e8a9`
>
> 实现提交：`78a19eccbf141e19bf362028d5cc13dfad58c3f4`
>
> 远端入口：[Draft PR #118](https://github.com/Longyuyeee/WorLdGame/pull/118)
>
> Windows 证据：run `33457956272` / job `99701844659`，Windows / Node 22 完整门 **SUCCESS**，用时 `9m45s`
>
> 状态：**E5b 实现头与本交接头的远端 Windows CI 均已通过，证据状态已同步为 Engineering complete。后续经产品目标复审，E5c/E5d 改按一个 Player History 用户闭环推进。**

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

恢复后先核对 [E5b 实现审计](260-n52-e5b-runtime-history-v2-audit.md)、[产品目标与交付节奏纠偏 #262](262-product-goal-alignment-and-delivery-correction.md)、本文件、`config/n52-e5b-runtime-history-v2.json`、远端 Draft PR 与 Windows CI。

实现头 `78a19ec` 的 run `33457956272` / job `99701844659` 已成功；本交接头 `1a39394` 的 run `33458762331` / job `99704253946` 也于 `12m41s` 后成功。#260、#89、#90、#99 与机器合同已同步为 `complete`，不再存在 E5b 证据待办，也不得重做 E5b Runtime 实现。

## 4. 后续开发顺序

1. **E5b 已关闭**：只核对远端分支、Draft PR、机器合同和状态文档一致，不修改或重测已经完成的 Runtime History v2。
2. **一个 Player History 用户闭环**：E5c Settings/Core 与 E5d Shell 保留内部实现顺序，但不再分别作为产品完成点。Gal Settings v6 只增加 `history.allowForwardAfterBack`；Core 投影活动主线、只读 archive、Barrier 原因/距离和稳定 ID 定点回退；Shell 提供桌面与 390×844 History 页面、选行回退、旧分支查看和策略反馈。
3. **真实预期—实际差异测试**：使用真实 Branching 工程完成左分支→回退→右分支→旧左分支仍可查看→定点回退→策略 true/false→保存/刷新/读取。记录预期、首次实际、差异、修正和复测；页面未出现、原因不可见或读档后 archive 丢失均为失败。
4. **一次 E5e 总出口复审**：用户闭环完成后逐项对齐 Gal 5.2、PRD 3.8、USP-09、REQ-RUNTIME 与 AC-16；仍有缺口则 fail closed。
5. **先集成和真人反馈，再决定 N60**：E5e 后优先收束 main-target Draft PR，并执行长期欠缺的 N21/N23 真人任务；不得以新的 Engineering 子门回避产品验证。

## 5. 明确禁止

- 不在 Shell/Core 建第二套 Runtime History；不导航 archive；不使用 wall clock 或数组位置直接充当 archive ID；
- 不升级 Player Save v3/IndexedDB v3，不修改 Runtime State/IR/Scheduler，不提前做 Gal Settings/Core/Shell；
- 不把 E5b Engineering 换算成 N52 Product Acceptance、AC-16、M1 Stable、发布完成或 N60 授权。

## 6. 当前仓库与远端事实

- 可拉取分支：`origin/codex/n52-e5b-runtime-history-v2`；
- E5b 实现头：`78a19eccbf141e19bf362028d5cc13dfad58c3f4`；
- 堆叠基线：`origin/codex/n52-e5a-history-contract-authority` / `788f93f`；
- Draft PR：#118，base 为 E5a 分支；
- 实现头 Windows CI：`33457956272 / 99701844659 / success / 9m45s`；
- 下一台电脑无需重新实现 E5b；从第 4 节的 Player History 用户闭环接续，并遵守 #262 的产品结果优先规则。

本文件标题 token：**E5b 跨电脑接续点**。
