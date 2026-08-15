# N31-E10 正式 VM Parity 与 Story Outcome 审计

> 审计日期：2026-08-16
> 审计基线：`d426fbe1608477e640b08e0c61818df3b4e6cbe9`（N31-E9 最终远端绿色头）
> 审计分支：`agent/n31-runtime-e10-formal-vm-parity`
> 审计范围：VM-02、VM-03、VM-07、VM-08、VM-12、VM-15 的正式 Runtime 契约、Node 固定向量与真实浏览器 Worker Golden
> 节点判定：**E10 Engineering 通过候选**；N31 Engineering 仍未通过，继续阻断 N32

## 1. 结论

E10 已把 E9 标记为“部分”的 6 项 VM 契约全部收进正式 `@world-studio/runtime`：递归栈上限、PRNG Save/Load 后续序列、跨场景取消、Effect 补偿/重放、未来 Opcode fail-closed，以及 quiescent Story Outcome Hash。VM-01–VM-15 矩阵由 `完整 6 / 部分 6 / 未对齐 3` 更新为 `完整 12 / 部分 0 / 未对齐 3`。

这不等于 N31 Engineering 出口通过。VM-11 Session Save、VM-13 Monotonic Meta boundary、VM-14 10,000-step bounded conformance 仍未完成，必须继续按 E11–E14 顺序推进。

## 2. 正式向量

| VM | 正式实现与固定向量 | Fail-closed / 等价判定 |
|---|---|---|
| VM-02 | 递归 `call` 到 64 帧后稳定返回 `RUNTIME_CALL_STACK_OVERFLOW` | 同 IR/State 重放结果和 State Hash 完全一致，不产生第 65 帧 |
| VM-03 | 先抽样 3 次后 canonical Save/Load，再连续抽样 5 次 | 原 Session 与 Load Session 后续值 `[17,-18,-7,-36,38]`、PRNG State 与最终 State Hash 一致 |
| VM-07 | awaited Effect 在旧 scene 显式取消，再选择进入新 scene | 旧 completion 返回 `RUNTIME_EFFECT_CANCELLED`，新 scene State Hash 不变 |
| VM-08 | History Back 输出逆序 compensation plan；Forward 输出 replay plan | reversible 为 `background.restore`，pure/reversible 可确定重放；Barrier 仍返回 `RUNTIME_BARRIER_BLOCKED` 且无计划 |
| VM-12 | 用包含未来 Opcode 的 Artifact 尝试加载现有 Save | 返回 `RUNTIME_INVALID_IR`；活动 State Hash 和原 Save 字符串不变 |
| VM-15 | 对 quiescent State 生成 Story Outcome；插入 detached pure presentation 后重跑 | 两个 Outcome Hash 均为 `85d860f97ece840d43272dcb89673dd602e3dfed94c0043a9ca73b748cd737c3`；pending Choice/Effect/Barrier 返回 `RUNTIME_OUTCOME_NOT_QUIESCENT` |

## 3. Story Outcome 真相边界

`RuntimeStoryOutcomeV1` 只包含 `irVersion/projectId/buildId`、语义位置、语义调用栈、剧情变量、PRNG 和逻辑时间。运行时 revision、execution ID、Scene/Audio 表现状态、Meta Progress、Input Receipt、Effect/Barrier bookkeeping 被有意排除；因此插入纯表现 Effect 可以改变表现 State 和完整 State Hash，但不能改变剧情 Outcome Hash。

Outcome 只能在没有 pending Choice、awaited Effect 或 Barrier 的静止点生成。运行态 cursor 与 call stack 会解析为 `sceneId + instructionId`，避免纯表现语句插入造成 instruction index 偏移；无法解析的 cursor fail closed，不生成 Hash。

## 4. History reconciliation 真相边界

`RuntimeHistoryReconciliationPlanV1` 固定包含方向、起止 checkpoint、恢复 checkpoint、补偿序列和重放 Effect：

- Back 对跨越 entry 的 reversible Effect 按逆序输出 compensation；
- Forward 按原记录顺序输出 pure/reversible replay Effect；
- Barrier 继续在生成计划前阻断，不允许静默跨越；
- History validation 会先验证 Effect ledger 的 canonical 结构、execution identity 和 revision 范围，畸形记录不能生成宿主操作计划。

计划本身使用独立 `WORLd-RUNTIME-HISTORY-RECONCILIATION\0v1\0` 域哈希；Story Outcome 使用独立 `WORLd-RUNTIME-STORY-OUTCOME\0v1\0` 域哈希，不能与 State/Save/History Hash 混用。

## 5. Node / Worker 证据

- Runtime 专门测试：`49/49` 通过，其中 E10 新增 6 项；
- VM Conformance 生产构建通过；
- 生产预览真实模块 Worker：`data-runtime=passed`；
- 完整 Worker 门：`data-status=passed`，正式 Runtime、Source Map 诊断、10,000-seed/20,000-replay Runtime Corpus 与 Node Golden 零差异；
- `formalVmParity` 15 个字段进入 `RuntimeConformanceResultV1` 和浏览器 Node Golden，包含错误码、固定随机序列、State/Outcome/Reconciliation Hash。

开发服务器的 HMR WebSocket 受浏览器连接层限制，因此浏览器验收使用刚构建的 production `dist` preview；验收页面与 Worker 均来自同一 E10 工作树构建产物，不使用外部服务或旧缓存。

## 6. 版本与兼容

包版本由 `0.8.0-n31` 升至 `0.9.0-n31`，因为新增公共 Story Outcome、Reconciliation Plan、验证与 Hash API。`RUNTIME_VERSION`、State schema、Save schema 和 History schema 保持 `0.6.0/1/1/1`：E10 没有改变序列化 State/Save/History wire payload，既有 State、Save、History 与 10k-seed Corpus Hash 保持不变。

## 7. 下一节点与边界

下一步严格进入 **N31-E11 Runtime Session Save**：把 canonical History Session、Cursor、checkpoint chain、tombstone 和 rehydration 纳入独立 Session Save/Load 协议，关闭 VM-11。之后仍按 E12 Monotonic Meta → E13 10k-step → E14 出口复审推进。

E10 不改变产品验收：N21 `0/1`、N23 `0/2`、M1 `0/27`，N30/N31 Product Acceptance 未通过。`RA-N21-003` 不授权 N32 Engineering、Player、M1 Stable 或发布。
