# N31-E14 Runtime Engineering 出口复审

> 审计日期：2026-08-20
> 审计基线：`bbbac613bf1b566756acfbfdd581d4394149ab35`（E13 最终证据头；PR #49 run `32348096037` / job `96361069900` 绿色）
> 审计分支：`codex/n31-runtime-e14-engineering-exit-audit`
> 交付证据：Draft PR #50；审计提交 `e3d230bc5ff2ec81cf6492acabdae0d59d37370a`；Windows / Node 22 run `32349504993` / job `96365349584`，4 分 01 秒绿色
> 审计范围：N31 Goal、7 项 Implementation、Tests、Acceptance、VM-01–VM-15 与工程/产品边界
> 当前判定：**N31 Engineering 通过**；N31 Product Acceptance、N32、M1 Stable 与发布继续阻断。

## 1. 复审结论

E9 曾以 `完整 6 / 部分 6 / 未对齐 3` fail closed。E10 补齐 VM-02/03/07/08/12/15，E11 建立完整 Session Save 并关闭 VM-11，E12 建立永久 Meta boundary 并关闭 VM-13，E13 建立正式单流程 10,000-step 有界向量并关闭 VM-14。逐项重新读取正式包、Node Golden、真实浏览器 Worker 和 Windows / Node 22 证据后，当前矩阵为 `完整 15 / 部分 0 / 未对齐 0`。

这只表示 `@world-studio/runtime` 的 N31 工程契约在受支持环境中通过。Editor 仍未通过 N32 接入正式 Compiler/Runtime，正式 Player、媒体宿主、存档槽、Windows/Android 产品壳和设备证据均未完成。`RA-N21-003` 明确不授权进入 N32。

## 2. VM-01–VM-15 重新对齐

| ID | 正式证据 | 复审判定 |
|---|---|---|
| VM-01 | E1 set/表达式/condition/jump 确定执行 | 完整 |
| VM-02 | E10 递归 call 上限 64、固定失败代码与 Worker Golden | 完整 |
| VM-03 | E10 固定 PRNG Save/Load 后继续序列与 State Hash | 完整 |
| VM-04 | E5 Choice → Back → Forward 固定 State/History | 完整 |
| VM-05 | E5 Back → 改选、原子截断与 tombstone | 完整 |
| VM-06 | E3 awaited Effect token/revision/乱序/重复拒绝 | 完整 |
| VM-07 | E10 scene cancel 后迟到 completion 拒绝且新 scene State 不污染 | 完整 |
| VM-08 | E10 compensation/replay reconciliation plan 与 Barrier 阻断 | 完整 |
| VM-09 | E6 Normal/5/10/20/40/Instant 最终 State/History 一致 | 完整 |
| VM-10 | E6 Skip Read 未读边界和状态命令保持 | 完整 |
| VM-11 | E11 canonical Session Save 恢复 cursor、chain、future、tombstone 与 rehydration | 完整 |
| VM-12 | E10 future/missing Opcode 与活动 Session 不覆盖组合向量 | 完整 |
| VM-13 | E12 Back/Forward/旧 Save Load 永久 Meta union 与独立 Hash | 完整 |
| VM-14 | E13 10,000 次循环、128 指令上限、235 批、三域 Hash 与 Worker Golden | 完整 |
| VM-15 | E10 quiescent Story Outcome、Back/Forward/重放恒等、纯表现变形不改 Outcome | 完整 |

## 3. N31 计划出口复审

| 计划项 | 判定 | 证据 |
|---|---|---|
| Goal：Spike 收敛为受支持 Runtime 包 | 通过 | portable `@world-studio/runtime` `0.12.0-n31`，不依赖 Spike/Editor/平台 API |
| 1. VM-01–VM-15 | 通过 | 上表 `15/15` 完整 |
| 2. State/PRNG/Call Stack/Scene/Meta | 通过 | E1/E2/E10/E12 固定向量 |
| 3. Effect/cancel/Barrier/host response | 通过 | E3/E10 reconciliation 与竞态向量 |
| 4. Save/Load/Checkpoint/History | 通过 | E4/E5/E11/E12 canonical State/Session Save |
| 5. Normal/Auto/Skip 调度 | 通过 | E6 与 E13 有界批次 |
| 6. Source Statement 诊断 | 通过 | E8 fail-closed Source Map 映射 |
| 7. 正式包不依赖 Spike | 通过 | 架构审计 85 portable / 4 Node adapter |
| Tests | 通过 | 正式 57 项、10k seeds、10k steps、损坏 Save、竞态、Barrier、分支、Node/Worker Golden |
| Acceptance | 通过 | 真实浏览器完整门、E13 最终门及 E14 独立 Windows / Node 22 全仓门绿色 |

## 4. 真实测试：预期与实际

| 测试 | 预期 | 实际 | 判定 |
|---|---|---|---|
| 本机完整 `npm run check` | 全部步骤通过 | 前置治理、真人状态、Golden、内容、Compiler 均通过；正式 Runtime `56/57`，既有 10,000-seed 107.871 秒超过 90 秒后中止后续步骤 | 本机完整门失败；不放宽阈值 |
| 正式 Runtime 非 seed 项 | E13 与其余正式契约全部通过 | `56/56`；唯一失败为既有 seed 性能超时 | 语义通过 |
| 普通全仓回归 | 97 文件 / 588 项通过 | `97/97 files`、`588/588 tests` | 通过 |
| Editor 存储恢复 | 真实一致恢复通过 | `1/1`，测试 5.02 秒 | 通过 |
| 类型与 12 workspace 构建 | 零错误并生成生产产物 | `tsc -b`、完整 build 退出码 0 | 通过 |
| 架构 | Runtime 保持 portable，依赖不倒置 | 85 portable / 4 Node adapter，全部保证通过 | 通过 |
| Script / Asset 性能 | 所有冻结预算通过 | Script `10/10`、Asset `4/4` 通过 | 通过 |
| E13 最终支持版本门 | 同代码头在 Windows / Node 22 完整通过 | run `32348096037` / job `96361069900`，4 分 52 秒，`SUCCESS` | 通过 |
| E14 独立支持版本门 | 审计提交的完整仓库门通过 | Draft PR #50，run `32349504993` / job `96365349584`，4 分 01 秒，`SUCCESS` | 通过 |

本机使用不受支持的 Node `v25.2.1`，历史 Spike/正式 seed 性能存在明显波动；同一正式 Runtime 文件在 E13 隔离运行曾以 86.18 秒通过，本次完整 check 为 107.871 秒。该差异没有通过修改 seed 数、90 秒阈值或跳过测试掩盖。权威环境固定 Windows / Node `22.12.0`；E14 独立远端完整门现已绿色，因此登记 N31 Engineering 通过，同时保留本机红项作为环境差异证据。

## 5. 需求、产品与授权边界

- REQ-RUNTIME 的 N31 portable kernel 工程前置通过；REQ 仍为“实现中”，因为 N32/N50/N52 的 Editor/Player/媒体/玩家槽未完成；
- N31 Engineering 与 N31 Product Acceptance 是两个不同 Gate；后者继续被 N21/N23 真人记录和产品集成阻断；
- N21 真人 `pending-participant`（0/1），N23 真人 `pending-participants`（0/2）；自动审计 PASS 只说明记录结构有效；
- 当前 `main` 不包含候选开发链，连续 Draft PR 尚未集成；
- `RA-N21-003` 的最大节点是 N31，持续阻断 N32 Engineering、M1 Stable 与 Public Release；
- 因此 E14 结束后的下一动作不是直接开发 N32，而是处理真人门、例外和集成授权。

## 6. 下一步

1. N31 Engineering 已完成，冻结 E14 证据，不再用后续功能改写该结论；
2. 建立 GitHub 集成检查点，由仓库负责人明确堆叠 Draft PR 的审阅与合并策略；
3. 完成 N21/N23 真人门，或经正式治理流程取得覆盖 N32 的新授权；
4. 在上述门禁解除前，不进入 N32。
