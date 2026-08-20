# CL-04 Spike 08 临时决策

状态：**保留独立 G-Set Meta Progress 与内容寻址 Save 引用为正式 Runtime 候选，不形成最终持久化/同步 ADR**。

保留候选：Meta 与 Runtime State/History 分离；已读/CG/结局默认只增；显式事件；canonical 排序；独立域 Hash；项目与本地 scope 隔离；Save 由快照推导引用；Load 只有在引用快照验证成功后才原子采用 Runtime，并把旧 Meta 与当前 Meta 做并集。

不保留为产品结论：把本地 scope 描述为账户、把公开 SHA-256 描述为签名、把内存快照描述为持久化或云同步、把默认单调策略描述为已经支持所有项目覆盖策略。

下一决策点：Spike 09 执行 VM-14/15 与至少 10,000 个生成序列，固化失败种子和变形性质；之后再进入三宿主与真实 adapter 证据。
