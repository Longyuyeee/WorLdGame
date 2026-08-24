# CL-04 Spike 11 Result

## 结论

`359b208` 的 Node Golden 与 Chrome 151 真实模块 Web Worker 对 5 条 Scheduler、11 条 History/Save 记录产生相同 Digest，并继续回归 Spike 10 的 12 条基础记录。浏览器控制台无 warning/error。CL-04 保持“进行中”。

## 已观察结果

- Normal 三批与 Instant 两批最终 State Hash 相同；
- Choice History 达到 Cursor 2，Back/Forward 恢复相同 State；
- Save Integrity、Session Digest、Meta 引用纳入逐记录比较；
- 损坏 Save 返回 `VM_SAVE_INTEGRITY` 且活动 Session 不变；
- 有效 Load 恢复 Cursor 2，Load 后 Back→Forward 再次恢复；
- 全仓 60 files / 411 tests，全部构建与审计通过。

固定向量见 [`raw/history-save-conformance.json`](raw/history-save-conformance.json)。

## 未完成

当前 Save 是内存 canonical 字符串，Scheduler 没有测墙钟或帧预算。10k Web Worker、Effect 乱序/Barrier、真实存储、Windows/Android 壳、真机和独立审阅仍待完成。
