# CL-04 Spike 09 Result

## 结论

`45aad83` 在单一 Node 开发宿主通过 VM-14/15 基础和 10,000 个固定生成序列。批处理上限、重复执行、Back→Forward、取消、Save/Load 与等价程序剧情结果均满足本轮冻结条件。CL-04 保持“进行中”。

## 已观察结果

- 10k 循环最终计数 10,000，最大批次 128，重复执行精确 State Hash 相同；
- 种子 `0..9999` 每个执行两次，六类场景无失败种子；
- 插入脱离剧情的纯表现 Effect 后精确 State Hash 按预期不同，静止剧情结果 Hash 相同；
- 待处理 Choice/Effect 状态拒绝剧情结果投影；
- Runtime Save 升级到 `.9`，重新签摘要的 `.8` 仍被拒绝；
- 全仓检查为 58 files / 406 tests，构建、架构和两套性能审计全部通过。

固定向量见 [`raw/vm-1415-generated-golden.json`](raw/vm-1415-generated-golden.json)。

## 未完成

本语料不是完整语法 fuzz；批处理没有在浏览器主线程或目标设备测量。History+Scheduler、真实时钟/存储、跨版本迁移、Node/Web Worker/Windows/Android 一致性和 Architecture + QA 独立审阅仍待完成。
