# CL-04 Narrative VM Effect、取消与 Barrier Spike 05 审计

> 实现 Revision：`40b575a794cdf24a04e46dea13938f0a95952630`
>
> 风险：CL-04
>
> 判定：Spike 05 通过本轮门；CL-04 保持“进行中”，未通过
>
> 范围：VM-06–08 的受控 Effect 协议，不是真实平台 Scheduler、完整场景系统或生产 Barrier

## 1. 需求与边界审计

本轮只实现契约允许的受控测试 Effect。网络发布、购买、系统通知、文件写入和平台对象仍禁止进入 VM。`emit` descriptor 冻结 execution、originating revision、channel、kind、scalar payload、policy、await mode、cancellation scope 与 replay key；Effect ID 和 intent hash 使用独立 domain。

三类 policy：

- `pure`：Forward 可按已记录 ledger 重发，宿主必须用 effect ID/replay key 幂等；
- `reversible`：IR 必须提供 canonical compensation；Back 返回补偿 intent，Forward 返回原 intent；
- `barrier`：未许可只产生可恢复请求且不发 Effect；获许可后写入 History barrier，Back 返回 `VM_BARRIER_BLOCKED`、descriptor 和原因。

## 2. 完成、取消与宿主顺序

awaited Effect 的 completion/cancellation 必须精确匹配 execution、effect ID、expected revision、logical sequence，以及 replay key 或 cancellation scope。相同 input ID/载荷幂等，不同载荷冲突；scope 已取消后的迟到 completion 返回 `VM_EFFECT_CANCELLED`，不修改 State。

History 操作返回 `cancellations[]` 与 `effects[]`。候选宿主顺序固定为：先取消旧 scope，再调度补偿/重发 intent，最后采用新 State 与诊断。本轮只验证纯数据协议，没有真实线程、媒体对象或并发 channel。

## 3. 测试与结果

VM 定向测试 50 项，其中 Spike 05 新增 11 项。全仓 `npm.cmd run check`：

- 常规测试：54 files / 373 tests / 0 failed；
- 全 workspace build：PASS；
- 架构审计：44 portable files / 3 Node adapter files，PASS；
- 脚本性能：9 tests，PASS；
- 资源性能：4 tests，PASS。

证据包位于 [`evidence/cl-04/spike-05`](../evidence/cl-04/spike-05/result.md)。

## 4. 审计结论与诚实缺口

| 契约项 | 当前状态 |
|---|---|
| VM-06 awaited delay/out-of-order/duplicate | Spike 05 基础通过；受控输入、单 pending Effect |
| VM-07 场景切换期间取消 | scope cancellation → 下一场景边界 → 迟到拒绝基础通过；没有真实场景加载器 |
| VM-08 pure/reversible/barrier | ledger 重发、声明式补偿、Barrier Back 阻断基础通过 |
| Scheduler 并发、重试与平台生命周期 | 未开始 |
| 补偿失败/Barrier 真实威胁模型 | 未开始 |
| Runtime Save/迁移/完整性 | 未开始 |
| Skip/Auto、10k 生成序列 | 未开始 |
| Web/Windows/Android 逐 Step/Effect Hash | 未开始 |
| Architecture + QA 独立审阅 | 待完成 |

下一切片是 Spike 06：依照已冻结顺序，在 History、input、Effect 与 Barrier ledger 完整后设计正式 Runtime Save envelope、完整性、版本拒绝和非破坏迁移，并执行 VM-11/12；仍不得提前接入 UI。
