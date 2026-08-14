# M1 N21 指定集成基线

> 日期：2026-08-14
> 分支：`agent/m1-integration-n21`
> 基线状态：Candidate；完成面向 `main` 的整合 PR 与远端 Windows 全检查后才可提升为 Authoritative
> 集成范围：N00、N01、N10、N11、N12、N13、N20、N21、`RA-N21-001`
> 结构化登记：`config/delivery-baseline.json`

## 1. 目标

把分散在串联 Draft PR #23–#31 的产品候选收敛到一个可复现、可审查、可作为 N22 起点的指定集成分支。该分支不等于 `main` 已合并，也不等于 M1 产品能力通过；它只解决“后续开发究竟基于哪个完整提交”的权威性问题。

## 2. 冻结祖先链

| 节点 | 必须存在的证据提交 |
|---|---|
| N00 | `58b52bbba38270d19d143d0cc4a13a3805ecba9a` |
| N01 | `e74153910c64f6af671e1354bd6b908c5a3e4f34` |
| N10 | `20d1864dba56eee1de8a97052e08da060e8f7db0` |
| N11 | `89e9ab626299d34875a2fab0aa541df0b58a67bc` |
| N12 | `9be24f731aa3712456ec84ab411223f835d8cc06` |
| N13 | `a0a72038d725bc8bfce29847dabdb462f635b62c` |
| N20 | `43d066a362cf6e7741e8b27ec3189dc444ce17ff` |
| N21 | `67bfe55833f89e7413982e33e250d9fd6f235687` |
| RA-N21-001 | `2862cc75e81f247b9dcac2ae74586b875875e2d7` |

审计要求每个提交都是当前 HEAD 的祖先，并按表中顺序形成祖先链；同时要求当前集成 HEAD 不落后于 `origin/main`。删除、替换、重排或从旧分支开发都会使根级检查失败。

## 3. 集成策略

1. 使用单一指定分支承载完整 N00–N21 候选，不再从任一中间 Draft PR 继续堆叠产品功能；
2. 创建面向 `main` 的整合 Draft PR，用于集中查看完整差异、CI 和后续评审；
3. 不在本步骤擅自合并 `main`，合并仍需维护者明确操作；
4. N22 只能从 Authoritative 状态的本分支继续；
5. 若 `main` 新增提交，本分支必须先重新对齐并重跑全门，不能带着 behind 状态继续。

## 4. 非声明

- 不宣称串联 PR 已逐一完成独立 Review Decision；
- 不宣称 N21 真人产品门通过；
- 不关闭本地 VM/Dicing 性能红项；
- 不宣称 Compiler、Runtime、Player、Build 或三端产物存在；
- 不允许 N23、M1 Stable 或公开发布通过。

## 5. 自动审计

```powershell
npm.cmd run audit:delivery-baseline
npm.cmd run audit:delivery-baseline-policy
```

Candidate 提升为 Authoritative 时必须回填整合 PR 编号、远端 CI 结果和最终提交；只创建本地分支不能完成本节点。

## 6. PR #32 首轮 CI 与性能纠偏

- 整合 Draft PR：`#32`，目标分支为 `main`；首轮 GitHub Actions run `31764034234`、job `94656118694`；
- 交付基线审计、82/82 个测试文件和 497/497 项常规测试均通过；10,000-seed corpus 在远端耗时 71.786 秒，通过冻结的 90 秒门槛；
- 唯一失败为 VM-14 10k loop：远端耗时 8.332 秒，本地复现为 7.928 秒，超过冻结的 5 秒门槛；
- 根因是 `scheduleRuntimeBatchV0` 已在批次入口校验 Program/State 后，批次内每条指令仍通过公共 `transitionV0` 重复执行完整校验；两次 10k loop 因而产生约 40,000 次冗余校验；
- 经 Product Owner 明确批准，修复为：公共 `transitionV0` 保留完整边界校验，批次调度器仅在入口校验一次，批次内部使用不从包入口导出的预校验转换路径；
- 未修改 VM 指令语义、批量上限、最终 State hash 或 5 秒测试门槛；针对性 VM-14 复验为 110 毫秒，冻结 State hash 继续通过；
- 本机完整 VM 文件仍因 10,000-seed corpus 约 106 秒超过 90 秒而为 RED；该项在首轮远端 CI 为 71.786 秒并已通过。不得把本机结果描述成全绿，修复提交仍必须由 PR #32 的远端完整检查重新裁决。
- 修复后的本地独立审计：typecheck PASS；常规测试 82/82 文件、497/497 测试 PASS；10 个 workspace build PASS；Architecture PASS；Script Performance 10/10 PASS；Asset Performance 4/4 PASS；Delivery Baseline 与策略 4/4 PASS。完整根级检查仍因上述本机 corpus 红项而不得登记为 PASS。
