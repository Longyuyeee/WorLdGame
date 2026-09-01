# CL-04 Narrative VM 10k 生成语料跨宿主一致性 Spike 12 审计

> 实现 Revision：`cd95acbd14177a336ec5bb31a37c2f1ad822e6b5`
>
> 风险：CL-04
>
> 判定：Spike 12 通过本轮问题；CL-04 保持“进行中”，未通过
>
> 范围：Node Golden 与 Windows Chrome 151 真实模块 Web Worker 的固定 10,000 种子 / 20,000 次重放，不是 Windows/Android 壳或目标设备性能证据

## 1. 需求对齐与执行边界

本轮只关闭 Spike 11 登记的 10k 跨宿主缺口。Spike 09 的六类固定生成场景被抽成不依赖 DOM、平台壳、文件系统、墙钟或环境随机数的可移植模块；Node 测试和 Web Worker 调用同一个导出实现。

每个种子执行两次并比较最终 State Hash，Web Worker 每 250 个种子完成一个有界任务并让出事件循环。权威结果只包含语料 ID、种子/重放/分块数量、六类场景计数、失败种子和结果摘要；User-Agent 与耗时不进入确定性比较。

## 2. 固定结果

| 项目 | 结果 |
|---|---|
| 种子 / 重放执行 | 10,000 / 20,000 |
| 有界分块 | 40 × 250 seeds |
| 条件 / 调用 / 随机 / 取消 | 1,667 / 1,667 / 1,667 / 1,667 |
| Save/Load / Choice Back→Forward | 1,666 / 1,666 |
| 失败种子 | 0 |
| Node-Web Worker 摘要差异 | 0 |
| Outcome Digest | `770920d96fdcb3388c3f7aead30ee45385ec9cd0c435960a6981b5cb6c92e048` |
| Spike 10/11 回归 | 28 条宿主记录，差异 0 |
| 浏览器观察耗时 | 37,598.30 ms，仅开发机观察值 |

真实宿主为 Windows 11 开发机上的 Chrome 151 模块 Web Worker。全仓 `npm.cmd run check` 同时通过：60 files / 412 tests、全 workspace build、49 portable files / 3 Node adapter files 架构审计、9 项脚本性能测试和 4 项资源性能测试。

证据包位于 [`evidence/cl-04/spike-12`](../../evidence/cl-04/spike-12/result.md)。

## 3. 审计限制与下一步

- 本轮只比较每个生成场景的最终结果摘要，不替代逐 Step Effect/Barrier/Meta/Skip Trace；
- 37.6 秒是未登记目标设备上的开发模式观察值，不是帧预算、发布包性能或最低档设备门禁；
- Save/Load 仍是内存 canonical 字符串，没有经过真实存储和故障注入；
- Windows/Android 壳、真机、三宿主剧情 Hash 和 Architecture + QA 独立审阅仍未完成；
- Runtime Save schema 未变，绑定继续为 `cl04-spike.9`，仅实验包版本提升到 Spike 12。

下一切片是 Spike 13：扩展真实 Web Worker Corpus，覆盖 Effect 重复/乱序/取消、Barrier、Meta 变化和各 Skip 档位的逐记录对照；稳定后才交给 Windows/Android 壳。
