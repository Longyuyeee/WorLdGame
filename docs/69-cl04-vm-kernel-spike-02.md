# CL-04 Narrative VM 调用、随机与逻辑等待 Spike 02 审计

> 实现 Revision：`fe1132430dbd8880671ba2e4b04453a9aa1d814c`
>
> 风险：CL-04
>
> 判定：Spike 02 通过本轮门；CL-04 保持“进行中”，未通过
>
> 范围：VM-02 与 VM-03 的部分平台中立证据，不是正式 Runtime

## 1. 需求对齐

本轮只扩展[CL-04 证据契约](64-cl04-narrative-vm-evidence-contract.md)阶段 A：

- `call/return`、确定返回 IP、严格 LIFO 和 64 层硬上限；
- 版本化 `xorshift32-v0`，非零 32 位种子，每条 `random` 恰好推进一次；
- inclusive safe-integer 区间，跨度不得超过 `2^32`；
- `wait(durationTicks)` 推进整数逻辑时钟并返回宿主调度意图，不读取墙钟；
- VM-02/03 固定执行向量、七步 State Hash 和中途 canonical State 恢复语料。

本轮未实现 Choice、外部输入、Effect、History、Back/Forward、Runtime Save、Skip、Editor Preview 或平台壳。

## 2. 核心语义与拒绝边界

`call` 将按排序确定的下一 IP 入栈，再跳转目标；`return` 只弹出栈顶。运行时第 65 层调用失败，恢复时超过 64 层的 State 同样被拒绝，避免执行与加载采用不同上限。空栈返回、状态 revision、逻辑 tick 或 PRNG draw 溢出均返回稳定诊断且保持 State 对象不变。

`random` 使用一次 xorshift32 结果映射到 inclusive 区间。当前 v0 Spike 采用 modulo 映射以冻结“一指令一次推进”的确定语义；统计公平性尚未形成产品要求，正式 ADR 前必须选择版本化保留或以新算法/IR 版本替代，不能静默改变已有序列。

`wait` 在 VM 内立即更新权威逻辑 tick，同时输出 `{durationTicks, resumeAtTick}`。宿主如何暂停、取消和确认不在本轮范围；墙钟、Promise 和平台计时器不会进入 State。

## 3. 测试与结果

定向测试共 17 项，其中 Spike 02 新增 9 项，覆盖单层/嵌套调用、递归上限、空栈返回、超限恢复、固定 PRNG/wait、canonical 恢复、损坏参数和整数溢出。全仓 `npm.cmd run check` 结果：

- TypeScript project references：PASS；
- 常规测试：51 files / 340 tests / 0 failed；
- 全 workspace build：PASS；
- 架构审计：41 portable files / 3 Node adapter files，PASS；
- 脚本性能：9 tests，PASS；
- 资源性能：4 tests，PASS。

证据包位于 [`evidence/cl-04/spike-02`](../evidence/cl-04/spike-02/result.md)，绑定实现 Revision、源码 Tree、环境、命令、结构化门禁结果、固定 Hash、临时 ADR 和审阅状态。

## 4. 诚实缺口

| 契约项 | 当前状态 |
|---|---|
| VM-01 set/add/condition/jump | Spike 01 基础通过；仅 Node 开发宿主 |
| VM-02 call/return/递归上限 | Spike 02 基础通过；独立审阅与跨宿主未完成 |
| VM-03 fixed random + Save 后序列 | 固定随机与 canonical State 恢复通过；正式 Save/Load 未实现 |
| VM-04–VM-08 History/Effect/取消/Barrier | 未开始 |
| VM-09–VM-10 Skip/Auto | 未开始 |
| VM-11–VM-13 Save/Load/Meta Progress | 未开始 |
| VM-14–VM-15 10k/属性/变形 | 未开始 |
| Web/Windows/Android 逐 Step Hash | 未开始 |
| Architecture + QA 独立审阅 | 待完成 |

因此 CL-04 继续保持“进行中”。下一切片为 Spike 03：Choice 与版本化外部输入的幂等边界；Runtime Save 外壳和 History 的实施顺序必须在编码前再次审计冻结。
