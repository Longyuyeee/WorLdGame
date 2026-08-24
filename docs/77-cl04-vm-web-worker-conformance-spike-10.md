# CL-04 Narrative VM Web Worker 一致性 Spike 10 审计

> 实现 Revision：`36f3d747df7a77798f69a274c2c78accab3e27c0`
>
> 风险：CL-04
>
> 判定：Spike 10 通过本轮问题；CL-04 保持“进行中”，未通过
>
> 范围：Node Golden 与 Windows 上 Chrome 151 真实模块 Web Worker 的一份 12 动作基础 Corpus，不是 Windows/Android 壳或完整三宿主证据

## 1. 需求对齐与实现边界

本轮继续关闭 CL-04 跨宿主确定性风险，没有扩展编辑器 UI。新增可移植 `ConformanceCorpusV0` 与执行器，输入只包含版本化 Program、PRNG 种子、Meta 快照和显式动作日志；输出逐动作记录：

- 精确 `stateHash`；
- `effectIntentHash` 数组；
- `metaProgressHash`；
- 诊断代码、History Cursor、Checkpoint Hash 与 Step ID；
- 每条 Record Digest、整体 Trace Digest 与 Corpus Digest。

独立 `apps/vm-conformance` Harness 只依赖 `narrative-vm-spike`，通过真实 `new Worker(..., {type: "module"})` 执行同一 Corpus。浏览器端不只比较整体摘要，还逐个比较 12 个 Record Digest 与 Node 固定 Golden；宿主名称和 User-Agent 位于比较结果外层，不污染权威剧情数据。

Corpus 覆盖整数变量、固定种子随机、call/return、Choice 外部输入、逻辑 wait、awaited pure Effect 完成、Checkpoint 和 Ending。输入动作次序不合法时 fail closed。

## 2. 固定结果

| 项目 | 结果 |
|---|---|
| Corpus Digest | `6b0b6a12c890a7c2cda7966e3825df12b484ad4a1a5b651e5cdada7c74d6491f` |
| Trace Digest | `9a2e76dc518be215453fb43854ccc6e97bb47e70feaff1b2a87c86223b052738` |
| 逐动作记录 | 12 / 12 Digest 零差异 |
| Effect Intent Hash | `58a8defd7b850d49d604ad04ce8eebe30c18c52bbabaf2331708f88c61b85599` |
| Meta Progress Hash | `c0c67b20e57ae7d4cc4505d3e0784039629e4724a018c0c3307d3729fd41fa7e` |
| 最终 State Hash | `ef3da73c34d1874ff5f7c304082f7c4da5d1ca05c3855263c5bb8753766cdeb6` |
| 浏览器控制台 warning/error | 0 |

真实浏览器 Harness 显示：`PASS：真实 Web Worker 的 12 条逐步 Hash 与 Node Golden 零差异`。宿主 User-Agent 为 Chrome 151 / Windows 64-bit。

全仓 `npm.cmd run check`：

- 常规测试：59 files / 409 tests / 0 failed；
- VM 定向测试：10 files / 86 tests / 0 failed；
- 全 workspace build（含独立 Harness）：PASS；
- 架构审计：48 portable files / 3 Node adapter files，PASS；
- 脚本性能：9 tests，PASS；
- 资源性能：4 tests，PASS。

证据包位于 [`evidence/cl-04/spike-10`](../evidence/cl-04/spike-10/result.md)。

## 3. 审计限制与路线纠偏

- 当前只有 Node 与一个真实 Web Worker，Windows/Android 壳尚未执行；
- Corpus 只有一条 12 动作基础路线，不等于 Spike 09 的 10k 语料已跨宿主运行；
- History Cursor 全程为 `-1`，尚未覆盖 Runtime History、Back/Forward/Fork；
- 尚未把 Runtime Save Corpus、Meta 事件变更、取消/乱序/重复 Effect、Barrier 或各 Skip 模式纳入跨宿主 Trace；
- 浏览器运行在 Windows 开发机，不是目标 Android 设备，也不构成性能证据；
- Runtime Save 绑定仍为 `cl04-spike.9`，本轮没有改变 Save schema；
- Architecture + QA 独立审阅仍未完成。

下一切片是 Spike 11：把 History/Scheduler 和 Runtime Save Corpus 纳入同一可移植 Trace 协议，先继续完成 Node/Web Worker 对照；随后才把稳定 Corpus 交给 Windows 与 Android 壳。三宿主和独立审阅完成前不得宣布 CL-04 通过。
