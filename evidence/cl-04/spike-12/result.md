# CL-04 Spike 12 Result

## 结论

`cd95acb` 的同一可移植生成语料实现，在 Node 与 Chrome 151 真实模块 Web Worker 中对 10,000 种子 / 20,000 次重放产生相同摘要和场景计数，失败种子为 0；同时回归 Spike 10/11 的 28 条宿主记录，差异为 0。CL-04 保持“进行中”。

## 已观察结果

- 40 个分块，每块最多 250 seeds；
- 六类场景计数为 1667 / 1667 / 1667 / 1667 / 1666 / 1666；
- Outcome Digest 为 `770920d96fdcb3388c3f7aead30ee45385ec9cd0c435960a6981b5cb6c92e048`；
- 浏览器开发机观察耗时 37,598.30 ms，不进入 Golden；
- 全仓 60 files / 412 tests，全部构建与审计通过。

固定结果见 [`raw/generated-corpus-summary.json`](raw/generated-corpus-summary.json)。

## 未完成

本轮不是逐 Step 全矩阵，也没有真实存储、Windows/Android 壳、目标真机或独立审阅。开发机耗时不得外推为发布性能。
