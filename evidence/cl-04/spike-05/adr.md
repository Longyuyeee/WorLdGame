# CL-04 Spike 05 临时决策

状态：**保留 Effect 协议不变量为正式 Runtime 候选，不形成正式 Scheduler/Save ADR**。

保留候选：Effect token 绑定 execution、descriptor、逻辑序号与 originating revision；Effect intent 使用独立 domain hash；完成与取消都是版本化外部输入；Back/Forward/Fork 先返回 cancellation directive；pure 可按 ledger 重发；reversible 必须携带确定性补偿；barrier 执行前请求许可、提交后写入 History 并阻止 Back。

宿主执行顺序冻结为：先消费 `cancellations`，再调度 `effects`，最后展示 diagnostics/新 State。实际并发 Scheduler 必须证明 idempotency、过期回收、channel 排序与生命周期取消，不能从本 Spike 的数组返回值推断已完成。

下一决策点：Spike 06 在现有 History + Effect/Barrier ledger 上冻结正式 Runtime Save envelope、完整性、版本拒绝与非破坏迁移，执行 VM-11/12；Save 前不得接入 UI。
