# N52 Engineering 总出口与 N60 治理 checkpoint

> 日期：2026-09-01
>
> 分支：`codex/n52-engineering-exit-governance`
>
> 直接基线：N52-E4f 最终绿色头 `fe138ae2b88a54e8f91a4f23a4b829a545684bcb` / Draft PR #115
>
> 授权：`RA-N21-011`，最大交付节点 N52
>
> 当前判定：**N52 总 Engineering 出口：失败；N52 Product Acceptance 与 N60 Engineering 均阻断。**

## 1. 先回到原始需求

[PRD 3.8](03-prd.md)把 History、Auto、四种 Skip、Back/Forward 与 Save/Load 一并列为 P0 玩家能力；[Gal 基础系统 5.2](11-gal-foundation-and-automation.md)进一步要求：History 页面可选择某行回退，改选分支时旧 Forward 分支截断但仍保留在历史记录中供查看，边界、剩余步数和不可逆原因对玩家可见，并由项目策略决定从 History 回退后是否允许 Forward。N52 路线的原始 Goal 是把这些能力交付给玩家，而不是只在 Runtime/VM 测试中存在。

因此，E1–E4f 子切片完成不能自动换算为 N52 总出口。总出口必须再次对照原始需求与实际代码，而不能只汇总既有子切片的绿色结果。

## 2. 实际代码审计

已完成部分没有回退：Save/Load、手动/自动/快速/checkpoint 槽、截图与元数据、隔离恢复和迁移；唯一 Runtime Scheduler 驱动 Auto 与 Skip Read/All × Hold/Toggle × 五档速度；Back/Forward 可恢复正式 Runtime/Host 状态，并在 Barrier 前阻断。

但实际代码存在四项同源缺口：

1. `packages/runtime/src/history.ts` 在新输入创建分支时对旧 `entries` 执行 `slice(0, cursor)`，只把旧输入放入 `inputTombstones`；旧分支的事件、状态、Effect 与 Barrier 记录没有作为可查看分支归档保留。
2. `packages/player-core/src/player-core.ts` 的 History snapshot 只投影 `cursor / length / canBack / canForward`，没有只读条目、分支归档、边界原因或定点导航 intent。
3. `apps/player-shell/src/PlayerShell.tsx` 只有 Back、位置、Forward 三个控件，没有可打开的 History 页面，也不能选择某行回退。
4. Barrier 在当下待批准画面会显示 reason，但 Back 被已提交 Barrier 阻断时，Shell 只能从 disabled 状态推断；玩家看不到具体不可逆原因、目标距离，也没有项目级 History Forward 策略。

这不是文案问题，也不能通过在 Shell 复制一份历史数组修补。正确修复必须继续复用 N31 Runtime History 权威：先保存截断分支的版本化只读归档，再由 Player Core 产生安全投影和导航结果，最后由 Shell 提供桌面/移动均可操作的 History 页面。

## 3. 出口矩阵与纠偏

| N52 原始能力 | 实际状态 | 判定 |
|---|---|---|
| Save/Load、Auto/Quick、checkpoint、截图/元数据/恢复 | 已有正式 Store/Core/Shell 与工程证据 | 完成 |
| Auto 与四种 Skip、五档速度、媒体/Stop Point | E4 七项矩阵与 production Web 已闭环 | 完成 |
| Back/Forward 精确状态恢复 | 正式 Runtime History/Host reconciliation 已接入 | 完成 |
| 可选行回退的 History 页面 | Shell 不存在该页面 | 阻断 |
| 旧 Forward 分支保留供查看 | Runtime 只保留输入 tombstone | 阻断 |
| Barrier/不可逆原因与距离可见 | 已提交 Barrier 的导航阻断原因未投影 | 阻断 |
| History 回退后的 Forward 项目策略 | 无版本化项目策略与玩家反馈 | 阻断 |

上一接续说明隐含了“E1–E4f 足以关闭 N52 总 Engineering”的假设；实际对齐原始需求后，该假设不成立。现在明确把 N52 总出口改为 fail closed，并清理“History 已贯通”这类过度表述。E4 Engineering `7/7` 仍然成立，它只代表 Auto/Skip 子域完成。

## 4. 唯一接续点

下一代码切片冻结为 **N52-E5 Player History 与 Barrier 解释**：

1. 版本化扩展 Runtime History，归档被截断的 Forward 分支，保持确定性校验、保存/读取与旧存档迁移边界；
2. Player Core 投影只读主线/归档条目、可达性、跨越 Barrier 的具体原因和剩余步数，并提供定点回退；
3. 明确项目级“History 回退后是否允许 Forward”策略，默认值、序列化与运行时行为一致；
4. Shell 提供可打开、可选行回退、移动端明确入口的 History 页面，展示当前位置、旧分支和不可逆边界；
5. 补齐 Runtime/Core/Shell 正反例、存档兼容、桌面与 390×844 cold production，再重新进行 N52 总出口审计。

本 checkpoint 不修改产品代码，也不宣称 N52 Product Acceptance。`RA-N21-011` 仍把最大节点限制为 N52；在 E5 完成、N52 总出口复审通过且取得新授权之前，不得开始 N60。机器合同为 `config/n52-engineering-exit-governance.json`，审计命令为 `npm run audit:n52-engineering-exit-governance`。

## 5. 本步审计结果

新增治理门第一次执行得到四项失败：审计器误把风险清单字段写成 `acceptances`，并自行改写了 PRD/Gal 的三条中文 token。回到实际 `config/risk-acceptances.json` 的 `exceptions` 和需求原文修正后，新增门 PASS；这次修正只让审计器读取真实合同，没有降低判定条件。

第一次完整门随后在既有 E4f 审计处 fail closed：更新当前状态时删掉了旧合同要求永久保留的 `N52 Engineering 总出口与 N60 治理 checkpoint` 精确历史身份。恢复该 token 并明确标记“checkpoint 已完成、N52 总出口失败”后，E4f 与新治理门均 PASS。

第二次 `npm run check` 从头退出 0：普通回归 `154 files / 967 tests`，N50 `78/78`、N51 `123/123`、N52 History `90/90`，Runtime `61/61 + 10,000 seeds / 20,000 replays` 且 digest 不变，VM `5/5` 测试体 `25.51s`，17 个 workspace build 与 architecture 全绿。Route 正式 10k 编辑链 P95 `60.07ms <500ms`，Global Lazy Index `135.26ms <500ms`，Asset Dicing / Atlas / 总计 `704.86 / 851.93 / 1556.79ms`，全部保持原预算。Editor 大包 warning 仍为既有债务，没有在本 checkpoint 冒充解决。

治理实现头 `89c0a0f21b61fdfab3be6e8b9114c254529c11d5` 已推送至 Draft PR #116；同一精确 head 的 Windows / Node 22 `product-baseline` run `33414483328` / job `99561750228` 用时 `13m39s`，结论 `success`。该证据证明治理合同、全部历史 N52 门和完整产品基线可在干净远端环境复现；它不改变 N52 总出口失败、Product Acceptance 阻断或 N60 禁止准入的结论。
