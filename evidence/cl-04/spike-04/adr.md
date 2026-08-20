# CL-04 Spike 04 临时决策

状态：**保留 History 不变量为下一 Spike 候选，不形成正式 Runtime/Save ADR**。

保留候选：Runtime Session 独立于编辑历史；边界具备稳定 step/source ID；History Entry 绑定 before/after Hash、checkpoint 引用和可选完整输入；Forward 不请求宿主输入；改选成功才原子截断未来；输入 tombstone 跨 Fork 单调保留；结构或链校验失败时 fail closed。

Spike 04 采用每边界完整 canonical State checkpoint，是为了隔离并验证 VM-04/05 语义，不是生产存储决策。正式方案必须在确定性 replay、Effect/Barrier 和 Save envelope 冻结后，评估基准快照、增量条目、压缩、容量与迁移。

下一决策点：Spike 05 先冻结 Effect intent、await/cancellation 与不可逆 Barrier，再执行 VM-06–08；不得把当前 SessionV0 发布为正式 Save 格式。
