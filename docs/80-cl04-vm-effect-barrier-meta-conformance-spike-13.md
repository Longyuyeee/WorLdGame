# CL-04 Narrative VM Effect / Barrier / Meta / Skip 一致性 Spike 13 审计

> 实现 Revision：`9f56cffb264e595fc8e78fddfc0e8ff59c0a37bc`
>
> 判定：Spike 13 通过本轮问题；CL-04 保持“进行中”，未通过
>
> 范围：Node Golden 与 Windows Chrome 151 真实模块 Web Worker 的 22 条逐记录矩阵，不是 Windows/Android 壳、真实存储或目标设备证据

## 1. 需求对齐

新增独立版本化套件，覆盖 5 条 Effect、4 条 Barrier、5 条 Meta Progress 和 8 条 Scheduler 记录。记录固定 State/Meta Hash、Effect/取消摘要、诊断、History Cursor、停止原因和执行指令数；宿主、墙钟与帧时间不进入摘要。

## 2. 固定结果

| 项目 | 结果 |
|---|---|
| Spike 13 记录 | 22 / 22 Node-Web Worker 零差异 |
| Effect | issue、乱序完成、取消、重复取消、取消后迟到完成 |
| Barrier | 请求、伪造批准、有效批准、Back 阻断 |
| Meta | 初始、Text、CG、Ending、重复 CG 幂等 |
| Scheduler | Normal、Auto、Skip Read、Skip All 5/10/20/40/Instant，最终 State Hash 零差异 |
| Suite Digest | `fdf3b8dcc83f57f29b45a27f275c48254dbe4e3c208d788d196eb4fb7c74fb26` |
| Spike 10–13 宿主记录 | 50 条，差异 0 |
| Spike 12 语料回归 | 10,000 seeds / 20,000 replays / 0 failures |

全仓 `npm.cmd run check`：61 files / 413 tests、全 workspace build、50 portable files / 3 Node adapter files 架构审计、脚本与资源性能门禁全部通过。

## 3. 限制与下一步

- 当前矩阵是代表性行为，不是所有输入排列的笛卡尔积；
- 真实存储、Windows/Android 壳、目标真机、三宿主剧情 Hash 与独立审阅仍未完成；
- Runtime Save schema 未变，绑定继续为 `cl04-spike.9`。

下一切片是 Spike 14：冻结平台壳可执行 Conformance Bundle、命令行退出码和机器可读差异报告，为 Windows/Android 最小 Runtime 接入做准备。
