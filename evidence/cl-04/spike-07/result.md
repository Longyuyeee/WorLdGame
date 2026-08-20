# CL-04 Spike 07 Result

## 结论

`f44b01f` 在单一 Node 开发宿主通过 VM-09/10 的最小外部调度语义。所有模式复用同一转换器；批预算、已读集合、资源可用性和 Auto 等待建议均不进入剧情 State。CL-04 保持“进行中”。

## 已观察结果

- Normal、5、10、20、40、Instant 到终局的固定 State Hash 完全一致；
- 逻辑 `wait`、变量命令和固定种子 PRNG 在所有速度下都完整执行；
- Skip Read 只用外部已读集合决定是否继续，在首个未读 Story Boundary 完成显示后停止；
- Hold 与 Toggle 的执行结果一致，不把按钮生命周期写入 VM；
- Auto 以安全整数计算可读性/语音等待建议，Normal 与 Auto 到相同边界的剧情 Hash 一致；
- Choice、Barrier approval、awaited Effect、显式 Stop Point、资源不可用和确定性错误均停止；
- malformed schedule policy fail closed；旧 `.6` Runtime Save 即使重新计算摘要也因 runtime 不兼容而拒绝；
- 全仓 `npm.cmd run check` PASS：56 files / 393 tests，构建、架构和两套性能审计全部通过。

固定向量见 [`raw/vm-0910-scheduler-golden.json`](raw/vm-0910-scheduler-golden.json)。

## 未完成

5/10/20/40 当前是确定性 instruction 批预算，不是已经测量的真实“句/秒”；真实宿主让步、帧预算、前后台、文本/标点/语言、语音元数据、音视频压缩策略和 UI 尚未接入。调度器直接接收 Runtime State，未与 Runtime History 原子记录整合。IR 尚无文本输入 Opcode，资源门也只是 Effect descriptor 预检。Meta Progress、10k 生成序列、三宿主与独立审阅仍待完成。
