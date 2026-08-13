# CL-04 Spike 04 Claim

Source Revision：`6d8f61dfc75ba6ddf5ab8f239bb5775963b9d2bc`

本批次证明平台中立 VM Spike 可以为每个已批准 Story Step 保存完整 canonical checkpoint、前后 State Hash、稳定 step/source ID 与可选外部输入，并在单一 Node 开发宿主完成 VM-04 Back → Forward 和 VM-05 Back → 改选/Fork 的基础语义。Forward 只恢复记录 checkpoint，不重新请求宿主输入；改选会原子截断未来 History，而输入 tombstone 在分叉后保持单调，防止旧分支 input ID 被复用。

本批次不证明确定性 replay、增量/压缩 checkpoint、Effect、取消、Barrier、正式 Runtime Save、迁移与完整性、10k 生成序列、三宿主一致性或 CL-04 通过。
