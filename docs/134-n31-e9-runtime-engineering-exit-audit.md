# N31-E9 正式 Runtime Engineering 出口审计

> 审计日期：2026-08-15
> 审计基线：`7c3b9bd67ad5f1923d286e2c6ee7c292719bc947`（N31-E8 最终远端绿色头）
> 审计分支：`agent/n31-runtime-e9-exit-audit`
> 审计提交：`1da47ad856ec800d7d8edc3ab6f7d7fb0025e499`
> 交付入口：Draft PR #44（基于 `agent/n31-runtime-e8`）
> 审计范围：N31 Goal、7 项 Implementation、Tests、Acceptance 与 VM-01–VM-15 正式迁移
> 出口判定：**未通过（fail closed）**；保持 N31 Engineering 候选，不进入 N32

## 1. 结论

E1–E8 已经形成可移植的正式 `@world-studio/runtime` 候选，但不能据此宣告 N31 Engineering 出口通过。逐项回查 [CL-04 VM-01–VM-15 冻结契约](64-cl04-narrative-vm-evidence-contract.md)后，正式包只有 6 项完整对齐、6 项部分对齐、3 项未对齐；其中 VM-11、VM-13、VM-14、VM-15 的缺口直接阻断“将 VM-01–VM-15 契约迁入正式包”。

这不是产品 UI 或三端设备缺口，而是 N31 自身的正式 Runtime 工程契约缺口，因此不能全部后移到 N32/N50/N52。E9 只做审计与重新排程，不修改 Runtime 语义，也不把已有 Spike 结果冒充正式包结果。

## 2. VM-01–VM-15 对齐矩阵

| ID | 正式 Runtime 证据 | 判定 | 出口缺口 |
|---|---|---|---|
| VM-01 | E1 `set`、表达式、condition、jump 固定执行 | 完整 | 无 |
| VM-02 | E1 call/return 与 `MAX_CALL_STACK_DEPTH=64` 实现 | 部分 | 缺正式递归上限失败固定向量与 Worker Golden |
| VM-03 | E2 revision-safe xorshift32 固定向量；PRNG 已进入 State/Save | 部分 | 缺 Save/Load 后继续抽样序列一致固定向量 |
| VM-04 | E5 Choice → Back → Forward、State/Session Hash | 完整 | 无 |
| VM-05 | E5 Back → 改选、原子截断、tombstone | 完整 | 无 |
| VM-06 | E3 awaited Effect、token/revision、乱序/重复拒绝 | 完整 | 无 |
| VM-07 | E3 显式 scope cancel 与迟到 completion 拒绝 | 部分 | 缺“取消后跨入新 scene，迟到结果不污染新 scene”的正式向量 |
| VM-08 | E3 pure/reversible/barrier intent；E5 Barrier Back 阻断 | 部分 | Back 只返回 `reconciliationRequired`，尚未输出可审计的 reversible compensation/replay reconciliation 计划 |
| VM-09 | E6 Normal/5/10/20/40/Instant 最终 State/History Hash 一致 | 完整 | 无 |
| VM-10 | E6 Skip Read 在首个未读边界停止且不改变调度无关 State | 完整 | 无 |
| VM-11 | E4 保存单一 State；E5 History Session 独立存在 | 未对齐 | Save envelope 未包含 History Cursor/chain，Load 后无法恢复同一 Back/Forward 链 |
| VM-12 | E1 未来 Opcode 拒绝；E4 损坏、未来 Save、Build/Hash 拒绝 | 部分 | 缺“缺失/未来 Opcode Artifact + 活动 Session 不被覆盖”的组合固定向量 |
| VM-13 | E2 Meta Progress 位于 Runtime State；E5 Back 恢复完整旧 checkpoint | 未对齐 | 当前 Back 会恢复旧 `metaProgress`，与“已读/CG/结局不随剧情回滚”的冻结契约冲突；也缺独立 Meta Hash |
| VM-14 | E6 有预算让步；E7 是 10,000 seeds/20,000 replays | 未对齐 | 10k seed corpus 不等于单条 10,000-step 循环；缺正式 10k-step 有界批次、最终 Hash 与预算证据 |
| VM-15 | E5 Back/Forward、E7 replay equality | 部分 | 缺正式 Story Outcome Hash、quiescent 前置条件，以及插入 detached pure presentation 不改变剧情 Outcome 的变形向量 |

汇总：`完整 6 / 部分 6 / 未对齐 3`。VM-15 虽有两项属性基础，缺失 Outcome Hash 使其仍属于出口阻断项。

## 3. N31 计划逐项审计

| 计划项 | 判定 | 说明 |
|---|---|---|
| Goal：把 VM Spike 收敛成受支持 Runtime 包 | 未通过 | 包与边界已建立，但 VM 契约尚未完整迁入 |
| 1. VM-01–VM-15 | 未通过 | 见上表 |
| 2. State/PRNG/Call Stack/Scene/Meta | 部分 | 结构均存在；VM-02/03 向量不完整，VM-13 语义冲突 |
| 3. Effect/cancel/Barrier/host response | 部分 | Effect/Barrier 主协议完成；VM-07 scene transition 与 VM-08 reconciliation 未闭环 |
| 4. Save/Load/Checkpoint/History | 部分 | 两套协议独立完成，但 VM-11 的 Session Save 未建立 |
| 5. Normal/Auto/Skip 调度 | 通过 | E6 固定向量成立 |
| 6. Source Statement 诊断 | 通过 | E8 fail-closed 映射成立 |
| 7. 正式包不依赖 Spike Harness | 通过 | Runtime workspace 只依赖 Compiler；架构门持续验证 |
| Tests | 部分 | 43 项、正式 10k corpus、损坏 Save、竞态、Barrier、分支截断均通过；仍缺上述正式 VM 向量 |
| Acceptance | 部分 | 既有 Node/真实 Worker Golden 零差异且完整门在预算内；尚未覆盖完整 VM-01–VM-15 Hash 流 |

## 4. 现有证据仍然有效

E9 不否定 E1–E8 已通过的工程证据：Runtime 43 项、正式 10,000-seed/20,000-replay corpus、Source Map 诊断、Node/真实浏览器 Worker Golden、本地完整门与 E8 最终 Windows / Node 22 CI 仍然有效。E8 最终证据头 `7c3b9bd67ad5f1923d286e2c6ee7c292719bc947` 的 run `31892269100` attempt 2、job `95030754155` 绿色通过。

E9 审计提交 `1da47ad856ec800d7d8edc3ab6f7d7fb0025e499` 已推送至 Draft PR #44；`product-baseline` run `31893152467`、job `95032331627` 在 Windows / Node 22 绿色通过，用时 4 分 56 秒。该结果只证明 E9 文档与既有 E1–E8 基线稳定，不改变本审计的 fail-closed 出口判定。

但这些证据不能替代缺失的 VM-11/13/14/15 正式契约。`apps/vm-conformance` 同时运行 Spike 与正式 Runtime，也不代表正式 Runtime 自动继承 Spike 的测试覆盖。

## 5. 修复顺序

N31 后续严格拆成以下节点，每个节点继续独立审计、需求对齐、推送和远端 CI：

1. **E10 Formal VM parity**：补 VM-02/03/07/08/12 固定向量，建立 quiescent Story Outcome Hash 与 VM-15 变形测试；
2. **E11 Runtime Session Save**：建立 canonical History Session Save/Load、Cursor/chain Hash、rehydration 与损坏/未来版本拒绝，关闭 VM-11；
3. **E12 Monotonic Meta boundary**：把 Meta Progress 与剧情回滚边界重新冻结，保证 Back/Load 不回退已读、CG、结局并提供独立 Hash，关闭 VM-13；
4. **E13 Bounded 10k-step conformance**：正式 Runtime 10,000-step 循环按固定预算让步，冻结最终 Hash、批次数和 Node/Worker 结果，关闭 VM-14；
5. **E14 Engineering exit re-audit**：重新逐项核对 VM-01–VM-15、10k seeds、10k steps、Node/Worker 与全仓门；只有全部通过才可登记 N31 Engineering 出口候选。

## 6. 产品与授权边界

E9 不改变产品验收：N21 `0/1`、N23 `0/2`、M1 `0/27`，N30/N31 Product Acceptance 均未通过。`RA-N21-003` 只允许继续关闭 N31 工程缺口；N32 Engineering、Editor Preview 正式接入、Player、M1 Stable 与发布仍被阻断。
