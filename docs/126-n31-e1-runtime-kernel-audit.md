# N31-E1 正式 Narrative Runtime 最小内核审计

> 审计日期：2026-08-15
> 变更前基线：`94bd565635cf15935c9dac1813cd758a9d101315`
> 审计分支：`agent/n31-runtime-e1`
> 节点判定：N31 Engineering E1 候选；N31 Product Acceptance、N32、M1 Stable 与发布仍被阻断

## 1. 准入与风险边界

N30 完成远端复验后，产品负责人在已明确“下一步会进入 N31”及真人资源仍缺失的前提下，再次要求严格按顺序开发、审计、推送和需求对齐。`RA-N21-003` 因而关闭并取代 `RA-N21-002`，只把工程上限从 N30 扩至 N31。

该例外不把 N21 `0/1`、N23 `0/2` 或任何产品验收标成通过，也不允许 N32 Editor 接入、Player、平台壳或发布工作。真人记录继续保持 pending；AI 和自动化仍不能替代参与者。

## 2. 正式包边界

E1 新建 `@world-studio/runtime`，而不是改名或发布 `@world-studio/narrative-vm-spike`：

- 唯一生产 workspace 依赖是 `@world-studio/project-compiler`；测试使用 `@world-studio/project-domain` 把真实 Branching S0 迁移后交给 Compiler；
- 输入是 N30 `RuntimeStoryIrV1`，不重新读取 Canonical Project 或 StoryStatement；
- 不引用 Spike、Editor、DOM、浏览器、文件系统、进程、平台壳、墙钟或环境随机源；
- Runtime `0.1.0` 与 State schema v1 显式拒绝未来/不兼容 IR；
- 新 workspace 从 planned boundary 移入 candidate registry，并进入根 typecheck/build/check。

## 3. E1 已实现语义

版本化 State 包含 project/build/execution 身份、状态 revision、场景/指令游标、64 层上限调用栈、标量变量、逻辑毫秒、pending Choice 和终止结局。`runRuntime` 在以下可观察边界停止：Dialogue、Narration、Direction、Choice、Wait、Ending。

内部确定执行覆盖 Label、Jump、Call/Return、Set 表达式和 Condition；Choice 输入绑定 `expectedStateRevision + instructionId + optionId`，陈旧或错配输入保持 State 不变并返回结构化诊断。闭合内部循环受固定 instruction budget 限制，不会无限占用宿主线程。

表达式只执行 Compiler 已验证并降低的 literal/identifier/unary/binary AST；运行时仍对缺变量、错误类型、除零、非有限结果和损坏 AST 失败关闭。E1 没有使用 `eval` 或重新解析源文本。

## 4. 自动化证据

定向测试覆盖：

1. Branching Golden 经真实 Compiler 产生 IR，再由正式 Runtime 选择左路线、显示对白并到达准确结局；
2. 相同 IR/State/Input 产生深度相等结果；
3. 陈旧 Choice revision 被拒绝且原 State 引用不变；
4. Label、Set、Condition、Call/Return 与逻辑 Wait 的组合固定向量；
5. 未来 IR 版本在创建 State 前拒绝；
6. 闭合跳转循环在固定预算终止；
7. 未知未来 Opcode 在创建 State 前拒绝；
8. 篡改的 State 身份拒绝且不发生迁移猜测。

当前定向结果为 Runtime 8/8、workspace 12 个/计划边界 4 个、portable 文件 72 个、风险策略 19/19。本地完整仓库门通过：常规测试 98 个文件/596 项，串行存储 1 项、VM 重型门 5 项、12 workspace 构建、架构及 Script/Asset 性能门均通过；远端 Windows / Node 22 结果在交付后回填。

## 5. 需求对齐与诚实缺口

| N31 计划项 | E1 状态 | 后续切片 |
|---|---|---|
| 正式包、不依赖 Spike | 已完成候选 | 持续架构门 |
| 版本化 State、Call Stack | 最小候选 | Scene/Audio 状态、PRNG、Meta Progress |
| Compiler IR 基础确定执行 | 已完成候选 | Effect/Barrier 与完整演出状态 |
| 外部 Choice 输入 | 已完成候选 | 通用输入 receipt、Effect completion/cancel |
| Save/Load、Checkpoint、History | 未开始 | N31-E3 |
| Normal/Auto/Skip/Instant | 未开始 | N31-E4 |
| State Hash、10k、Web Worker | 未开始 | N31-E2/E5 |
| Source Map 诊断映射 | 仅 instructionId/sceneId | N31-E5 |

因此 `REQ-RUNTIME` 仍是“实现中”，USP-09、AC-07、AC-15、AC-16 均不能据此通过。Editor 和独立 HTML 也尚未消费本正式 Runtime，它们仍使用 N23 运行器；共享接入属于被阻断的 N32。

## 6. 下一顺序

在 N31 工程范围内，E2 应先增加 canonical State Hash、确定 PRNG、Scene/Audio/Meta State 和 Node/Web Worker 固定向量；随后再迁移 Effect/Barrier、Save/History、调度与完整 Conformance。任何切片都必须继续保留 Spike 隔离，并同步需求矩阵和自动化证据。

`RA-N21-003` 到期、真人资源可用或 N31 工程出口形成时，以最先发生者重新审计。未关闭例外前不得进入 N32，也不得宣称 N31 产品通过。
