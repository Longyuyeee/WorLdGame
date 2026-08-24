# CL-04 Narrative VM 语义核 Spike 01 审计

> 实现 Revision：`498ae94f386c6d7ca614d8afb5ea0726a4987631`
>
> 风险：CL-04
>
> 判定：Spike 01 通过本轮门；CL-04 进入“进行中”，未通过
>
> 范围：VM-01 基础和 canonical State Hash，不是正式 Runtime

## 1. 需求对齐

本轮严格执行[CL-04 证据契约](64-cl04-narrative-vm-evidence-contract.md)的阶段 A，先建立不依赖宿主的确定性底座：

- `ProgramV0`、`InstructionV0`、`RuntimeStateV0` 与 Opcode Registry Digest；
- `set/add/jump/jumpIf/checkpoint/end` 六个无 Effect Opcode；
- safe integer、NFC 字符串、Unicode scalar 和 code-point key order；
- 纯 `transitionV0(program, state)`，失败返回稳定诊断且原状态不变；
- `WORLd-VM-STATE\0v0\0` 域分隔、canonical bytes 与依赖无关 SHA-256；
- VM-01 的六步固定 Hash Golden。

本轮没有实现 `say/choice/call/return/random/wait/emit`，也没有接 Editor Preview、Project WAL、DOM、Node 文件 API、Windows 或 Android 壳。

## 2. 实现边界

新增私有 workspace `@world-studio/narrative-vm-spike@0.0.0-cl04-spike.1`，名称和版本明确其可抛弃性质。它无 runtime dependency，并加入架构审计：禁止 UI、DOM、平台壳、文件/进程/Node Crypto、墙钟和环境随机源。

本轮 State 已预留契约要求的 call stack、PRNG、logical clock、scene/audio logic、pending request、read session、history cursor 和 terminal 字段，但尚未实现的 pending request 必须为空。预留字段不等于对应能力完成。

## 3. 拒绝式不变量

- IR/Instruction/Operand/Condition 使用精确字段集，未知字段不被静默保留或解释；
- IP 必须非负、唯一、严格递增，entry/jump/source map 必须引用精确存在的指令；
- 浮点、NaN、Infinity、`undefined`、非 NFC、孤立 surrogate、非 plain object 和未知 Opcode 被拒绝；
- `add` 缺变量、类型错误或溢出不修改 State；
- 非终态指令不能越过程序尾部，终态不能继续执行；
- checkpoint Hash 绑定转换后的 revision，而不是转换前快照。

## 4. 测试与结果

定向测试 8 项，覆盖标准 SHA-256、canonical 编码、VM-01、checkpoint、错误状态不变性、损坏 IR/State、非法 fallthrough 与终态重入。全仓 `npm.cmd run check` 结果：

- TypeScript project references：PASS；
- 常规测试：50 files / 331 tests / 0 failed；
- 全 workspace build：PASS；
- 架构审计：41 portable files / 3 Node adapter files，PASS；
- 脚本性能：9 tests，PASS；
- 资源性能：4 tests，PASS。

证据包位于 [`evidence/cl-04/spike-01`](../evidence/cl-04/spike-01/result.md)，绑定实现 Revision、源码 Tree、环境、命令、结构化结果、临时 ADR 和审阅状态。

## 5. 诚实缺口

| 契约项 | 当前状态 |
|---|---|
| VM-01 set/add/condition/jump | 基础通过；仅 Node 开发宿主 |
| VM-02–VM-03 call/return/random/Save 后序列 | 未开始 |
| VM-04–VM-08 History/Effect/取消/Barrier | 未开始 |
| VM-09–VM-10 Skip/Auto | 未开始 |
| VM-11–VM-13 Save/Load/Meta Progress | 未开始 |
| VM-14–VM-15 10k/属性/变形 | 未开始 |
| Web/Windows/Android 逐 Step Hash | 未开始 |
| Architecture + QA 独立审阅 | 待完成 |

因此本轮只允许 CL-04 状态变为“进行中”。下一切片是 Spike 02：`call/return/random/wait`、调用栈上限、版本化 xorshift32、逻辑 tick、PRNG Save Corpus 与 VM-02/VM-03 Golden。
