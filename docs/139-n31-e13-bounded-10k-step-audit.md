# N31-E13 Bounded 10,000-step 开发与审计

> 审计日期：2026-08-20
> 起始基线：`fcd817ff839aba0d76947d61a4857101da85c114`（E12 最终证据头；PR #48 最新 run `32344677885` / job `96350790797` 绿色）
> 开发分支：`codex/n31-runtime-e13-bounded-10k-step`
> 交付：Draft PR #49；实现提交 `8be2e8e`; Windows / Node 22 `product-baseline` run `32347553788`、job `96359403849` 通过（5 分 14 秒）。
> 节点边界：只补齐 VM-14 正式单流程有界向量；不宣告 N31 Engineering、Product Acceptance、M1 Stable 或发布通过。

## 1. 目标冻结与修复前差异

现有 E7 的 10,000 seeds / 20,000 replays 用于生成语料确定性，它不是单条剧情连续执行 10,000 次循环，也不能证明每次宿主调用有固定上限。

| 项目 | 冻结预期 | 修复前实际 | E13 修正 |
|---|---|---|---|
| 单流程规模 | 同一正式 Runtime State 完成 10,000 次循环 | 只有 10,000 个独立 seed | 新增正式 `runtime-vm14` 循环向量 |
| 宿主让步 | 每次 Scheduler 调用最多执行 128 条内部指令 | E6 有一般预算测试，但没有 10k 单流程证据 | 固定 `instantInstructionBudget=128`，逐批验证上限 |
| 完整性 | 不丢步骤、不重复提交，最终 counter 精确为 10,000 | 没有正式包固定结果 | 记录总指令、批次、让步次数，并要求一个原子 History entry |
| 确定性 | 两次 Node 执行及 Node/Worker 的 State、Outcome、History Hash 相同 | 正式浏览器 Golden 不含 VM-14 | 新增三域固定 Hash 并纳入生产 Worker Golden |
| 失败边界 | 诊断、零进度、单批超限或 256 批仍未结束都 fail closed | 没有正式 VM-14 guard | Conformance 对每批与终态执行硬断言 |

本向量的“10,000-step”沿用 VM-14 冻结语义，指 10,000 次循环步。正式 IR 每次循环包含 Label、Set、Condition 三条内部指令，连同初始化与 Ending，实际总执行 30,002 条指令；这一区分进入固定证据，避免把循环次数伪装成指令数。

## 2. 实现结果

- 新增 `RuntimeBoundedTenThousandResultV1` 与 `executeRuntimeBoundedTenThousandV1`；
- 正式 IR 初始化 `counter=0`，循环执行精确 10,000 次后到达 `ending.vm14.complete`；
- Scheduler 每批上限 128，硬 guard 为 256 批；每批必须有进展且不得超过预算；
- 终态要求 counter=10,000、Terminal ended、Story Outcome 可生成、History 只有一个可见原子 entry；
- `executeRuntimeConformanceV1` 与 Web Worker Golden 新增完整 VM-14 观测；
- Runtime package 升为 `0.12.0-n31`，VM Conformance 精确依赖与 lockfile 同步；wire schema 与 `RUNTIME_VERSION` 不变。

## 3. 真实测试：预期与实际

| 真实测试 | 预期 | 实际 | 判定 |
|---|---|---|---|
| 首次非冻结向量 | 结构计数符合设计，三个 `PENDING` Hash 产生预期失败 | 235 批、234 次预算让步、最大批 128、总计 30,002、counter 10,000；仅三项 Hash 与 `PENDING` 不同 | 符合预期，按实际冻结 |
| E13 两次执行 | 两次完整结果相同且固定向量通过 | `1 passed / 56 skipped`；两次执行合计约 695 ms | 通过 |
| Runtime 非重型回归 | 除既有 10,000-seed 双重重放外全部通过 | `56 passed / 1 skipped` | 通过 |
| 正式 Runtime 完整串行门 | E13 与既有 10,000-seed 在冻结 90 秒单测预算内全部通过 | `57/57` 通过；测试主体 86.18 秒，总进程 90.26 秒 | 通过 |
| 既有 Spike 重型门 | 旧 VM-14 与 10,000-seed 均在各自冻结预算内通过 | 旧 VM-14 等 4 项通过；旧 10,000-seed 为 103.269 秒，超过 90 秒 | 性能门失败；不修改阈值 |
| 全仓普通并行回归 | 排除三个独立重型文件后无回归 | `97 files / 588 tests` 全部通过 | 通过 |
| Editor 存储恢复 | 一致恢复在 5 秒测试预算内完成 | 实际 2.98 秒，`1/1` 通过 | 通过 |
| TypeScript | 新公共类型与 Conformance Golden 零错误 | `tsc -b --pretty false` 退出码 0 | 通过 |
| VM Conformance 生产构建 | 真实模块 Worker 可打包 | Worker `171.17 kB`；入口 gzip `5.19 kB` | 通过 |
| 浏览器 Runtime 快速门 | 新增 VM-14 Node/Worker Golden 零差异 | 真实生产预览 `data-runtime=passed` | 通过 |
| 浏览器完整门 | 正式 Runtime、Source Map 与 10,000-seed 全部保持零差异 | 真实模块 Worker 最终 `data-status=passed`，页面显示 PASS | 通过 |
| Windows / Node 22 权威完整门 | 全仓在支持版本与冻结预算内通过 | PR #49 run `32347553788` / job `96359403849`，`SUCCESS`，5 分 14 秒 | 通过 |

固定结果：State Hash `42110c45…02a8f`、Outcome Hash `b03e5bec…1d327`、History Hash `28207f68…be6de`。这些值来自第一次带 `PENDING` 的真实失败输出，不是先写入后自证。

本机 Node `v25.2.1` 不属于仓库支持版本。正式 Runtime 完整门本轮实际在冻结单测预算内通过；历史 Spike seed 门仍因性能波动超时。E13 没有修改 Spike、seed 数、预算或超时阈值，最终权威结论继续由 Windows / Node `22.12.0` 独立 PR 完整门给出。

## 4. 需求与出口审计

- VM-14：正式实现、本地 Node、真实浏览器与 Windows / Node 22 权威完整门全部对齐，登记为关闭；
- REQ-RUNTIME：VM-11/13/14 均已关闭；玩家槽、媒体宿主、Editor/Player 接入仍缺；
- N31 Engineering：仍未通过；必须完成 E13 远端复验和 E14 全量出口复审；
- N31 Product Acceptance、N32、M1 Stable、Public Release 继续被产品/真人门阻断；
- N21/N23 真人记录仍为 `0/1`、`0/2`，自动化不能替代真人结果。

## 5. 下一步

1. E13 已在独立 Draft PR #49 取得 Windows / Node 22 完整门绿色，VM-14 关闭；
2. 进入 E14 N31 Engineering exit re-audit；
3. E14 只判定 N31 Engineering，不自动进入 N32，也不改变 Product Acceptance、M1 或发布状态。
