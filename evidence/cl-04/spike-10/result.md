# CL-04 Spike 10 Result

## 结论

`36f3d74` 的 Node Golden 与 Chrome 151 真实模块 Web Worker 对同一 12 动作 Corpus 产生相同 Corpus Digest、Trace Digest 和全部 12 个 Record Digest。浏览器控制台无 warning/error。CL-04 保持“进行中”。

## 已观察结果

- Corpus/动作协议是纯版本化数据，JSON 边界往返不改变结果；
- 每条记录包含 State、Effect Intent、Meta、诊断、History Cursor、Checkpoint 与 Step 信号；
- Browser Harness 逐记录比较 Node 固定 Golden，不只比较最终状态；
- Choice 与 awaited Effect 输入由 pending token 物化，次序错误 fail closed；
- 独立 Harness 只依赖可移植 VM，架构审计禁止 Node/shell 适配器；
- 全仓检查为 59 files / 409 tests，所有构建与审计通过。

固定向量见 [`raw/host-conformance-trace.json`](raw/host-conformance-trace.json)。

## 未完成

当前只是 Node + 一个 Web Worker 的基础路线；History Cursor 仍为 `-1`。Runtime History、Save Corpus、10k 跨宿主、Windows/Android 壳、真机性能和独立审阅均未完成。
