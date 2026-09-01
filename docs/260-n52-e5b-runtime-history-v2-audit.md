# N52-E5b Runtime History v2 Engineering 审计

> 日期：2026-09-01
>
> 分支：`codex/n52-e5b-runtime-history-v2`
>
> 直接基线：E5a 最终证据头 `788f93fb892136f045765279f240bb811e05e8a9` / Draft PR #117
>
> 当前判定：**E5b Runtime History v2 Engineering 已完成；实现头与后续交接头的 Windows / Node 22 完整门均成功。Product Acceptance 与 N60 仍阻断，后续按 #262 的纵向用户闭环方式进入 Settings/Core/Shell。**

## 1. 开发前实际代码复核与纠偏

E5a #259 冻结的是磁盘 schema v2，而实际公共函数和类型名中的 `V1` 表示既有 Runtime API 代际。若把所有 `create/advance/load...V1` 连带升级，会无理由破坏 Editor、Runtime Host 和 Player Core 的 API，并越出 E5b。因此本步保留公共 API 名，新增明确的 `RuntimeHistorySessionV2`、`RuntimeSessionSaveV2` 与仅供旧读取的 `LegacyV1` 类型；当前公开别名指向 v2。该纠偏不改变 E5a 的磁盘兼容要求。

## 2. 已实现合同

- Runtime History 新写 schema v2。改变 rewound 分支时，旧 Forward entries 被投影为 Runtime 唯一持有的只读 archive summary；每项保留原 entry ID/index、input/event、Barrier delta 与 after-state hash。
- archive ID 使用独立 `WORLd-RUNTIME-HISTORY-ARCHIVE\0v1\0` 域上的 canonical content hash，不读取 wall clock；活动 entries 与全部 archive summaries 共用确定性 10,000 项上限，超限返回 `RUNTIME_HISTORY_LIMIT`，不静默淘汰。
- Back/Forward、Barrier 阻断与 Scheduler 继续只读取原 `checkpoints/entries/cursor` 活动链；archive 不提供导航入口，Meta Progress rebase 也原样保留 archive。
- Runtime Session Save 新写 schema v2，History 与 Session Save 分别使用 v2 hash domain。读取同时接受 strict v1/v2；v1 先按旧 History domain 验证，再归一为 `archives: []` 的 v2，返回的 artifact hash 仍对应原 v1 envelope，保证 Player Save v3 的 opaque hash 校验不被破坏；future schema 和 unknown members fail closed。
- Runtime State schema/hash、Runtime Save v1、IR 1.0/1.1、Scheduler、Player Save v3 与 IndexedDB v3 未改变；Gal Settings/Core/Shell 的 E5c/E5d 工作没有提前进入本步。

## 3. 自动化与确定性证据

新增/扩展 Runtime 正反例覆盖：分支摘要字段与 ID 确定性、archive 篡改拒绝、archive 在 Back/Forward 中只读不变、strict v1 dual-read、v1 hash-before-normalize、v1 artifact identity、v2-only write、future/unknown/hash/corrupt fail closed。Runtime `63/63`，Formal Preview `15/15`，TypeScript 全仓通过。

正式 generated corpus 保持 10,000 seeds、20,000 deterministic replays、40 shards、七类计数与零失败；因 History/Session Save 正式升至 v2，冻结 digest 从旧 v1 的 `20e9a842…92ef2` 合法变更为 `01556a8c979e080cc653817713ad26f7d2882445e9ebdc727049f415da4863a9`。用于证明未偏移 Runtime State/Outcome 的基准分别仍为 `42110c45…a8f` 与 `b03e5bec…327`，只有版本化 History/Session Save 及其汇总 digest 变化。

机器合同为 `config/n52-e5b-runtime-history-v2.json`，审计命令为 `npm run audit:n52-e5b-runtime-history-v2`。完整本地 `npm run check` 已从头单次通过：普通回归 `154 files / 967 tests`，Runtime `63/63`，Player History 跨层 `90/90`，N50/N51 分别 `78/78`、`123/123`，VM `5/5` 用时 `34.25s <90s`；17 workspace build、100 portable / 4 adapters、Script `13/13`、Route `9/9`、Asset `4/4` 全绿。Route 编辑链 P95 `55.79ms <500ms`，Asset Dicing/Atlas/总计 `677.57/818.05/1495.62ms`。Editor 既有 `989.40 kB` chunk warning 继续作为拆包债，没有隐藏或提高阈值。

实现提交 `78a19eccbf141e19bf362028d5cc13dfad58c3f4` 已推送至 Draft PR #118；同头 Windows run `33457956272` / job `99701844659` 用时 `9m45s`，结论 `success`。交接文档头 `1a39394f02fe5090d2d2cab205c8e66cd5c1abca` 的 run `33458762331` / job `99704253946` 亦于 `12m41s` 后成功。E5b Engineering 据此关闭。

## 4. 接续点

按[产品目标对齐与交付节奏纠偏审计 #262](262-product-goal-alignment-and-delivery-correction.md)，E5c Settings/Core 与 E5d Shell 保留内部顺序，但共同构成一个 **Player History 用户闭环**；在真实 Branching 工程完成旧分支查看、选行回退、Barrier 解释、Forward 策略差异及保存重开以前，不登记 History 产品完成。之后只进行一次 E5e 总出口复审。任何 Product Acceptance、N60 或发布结论仍为 blocked。
