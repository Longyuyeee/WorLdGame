# CL-04 Narrative VM History / Scheduler / Save 一致性 Spike 11 审计

> 实现 Revision：`359b208463076542589d5301b1c0c3d8c64aebc8`
>
> 风险：CL-04
>
> 判定：Spike 11 通过本轮问题；CL-04 保持“进行中”，未通过
>
> 范围：Node Golden 与 Windows Chrome 151 真实模块 Web Worker 的 16 条 Scheduler/History/Save 记录，不是 Windows/Android 壳、存储介质或目标设备性能证据

## 1. 需求对齐与记录协议

本轮只关闭 Spike 10 明确登记的跨宿主缺口。Scheduler 与 Runtime History 保持不同权威对象，不把调度后的任意 State 强塞入 History checkpoint；两个工作流使用同一种版本化记录格式，逐操作固定：

- State Hash 与完整 Session Digest；
- Save Integrity Digest 与 Meta Progress 引用；
- Effect Intent、取消、wait 摘要与诊断代码；
- History Cursor、Entry/Checkpoint 数量；
- Scheduler stop reason、执行指令数与 Auto 逻辑延迟。

Scheduler 工作流比较 Normal 与 Instant Skip 的分批路径和最终 State；History/Save 工作流执行 Choice、Back、Forward、Save、损坏 Load、有效 Load，以及 Load 后 Back→Forward。宿主名称、User-Agent 和墙钟仍不进入权威记录。

## 2. 固定结果

| 项目 | 结果 |
|---|---|
| Spike 11 Suite Digest | `39937239e2a6635ea7448f36f16297f71564323c6a97747b878a58a8e77894cc` |
| Scheduler 记录 | 5 / 5 Node-Web Worker 零差异 |
| History/Save 记录 | 11 / 11 Node-Web Worker 零差异 |
| Normal / Instant 最终 State Hash | `a2e1e2094dd9b505f83feb3e82c03f7132b1ce3f4e01229aa32b01839ce42c53` |
| Runtime Save Integrity | `793bce58bec8ce2f660975dc872d133e821d8c7877c759f1476ded8986e18074` |
| 有效 Load 后 State Hash | `08df42645fb3c7bd036293a14830f4c5cdcf6c5c0acffd2fc4b00d7d11b781a9` |
| 损坏 Load | `VM_SAVE_INTEGRITY`，活动 Session/Cursor 1 不变 |
| Load 后 Back→Forward | Cursor `2→1→2`，最终 State Hash 恢复 |
| 浏览器控制台 warning/error | 0 |

真实 Web Worker 同时回归 Spike 10 的 12 条基础记录，因此本轮浏览器共比较 28 条 Record Digest，差异为 0。

全仓 `npm.cmd run check`：

- 常规测试：60 files / 411 tests / 0 failed；
- VM 定向测试：11 files / 88 tests / 0 failed；
- 全 workspace build：PASS；
- 架构审计：48 portable files / 3 Node adapter files，PASS；
- 脚本性能：9 tests，PASS；
- 资源性能：4 tests，PASS。

证据包位于 [`evidence/cl-04/spike-11`](../evidence/cl-04/spike-11/result.md)。

## 3. 审计限制与下一步

- Scheduler 证明逻辑批次和停止结果一致，不证明浏览器/Android 墙钟定时精度或帧预算；
- Save 只经过 canonical 字符串内存传输，未经过 OPFS、Windows 文件系统、Android 私有目录或故障注入；
- 当前 Corpus 未覆盖待处理 Effect Save、取消/乱序/重复完成、Barrier、Meta 事件变化和所有 Skip 档位；
- Spike 09 的 10k 生成语料尚未在真实 Web Worker 执行；
- Windows/Android 壳、目标设备和 Architecture + QA 独立审阅仍未完成；
- Runtime Save schema 未变，绑定继续为 `cl04-spike.9`，仅实验包版本提升到 Spike 11。

下一切片是 Spike 12：把固定 10k 生成语料以有界任务方式放入真实 Web Worker，比较语料摘要并记录失败种子；这仍不代替 Windows/Android 壳和目标设备证据。
