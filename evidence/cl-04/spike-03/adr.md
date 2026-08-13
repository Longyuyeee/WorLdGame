# CL-04 Spike 03 临时决策

状态：**保留输入协议为下一 Spike 候选，不形成正式 Runtime/Save ADR**。

保留候选：显式 execution ID、确定 request token、`inputId/executionId/requestId/expectedRevision/logicalSequence` 五重匹配、相同载荷幂等、不同载荷冲突、恢复时重算 token、Choice options 隔离复制。

实施顺序冻结为：**输入协议 → Runtime History/Back/Forward/Fork → Effect/取消/Barrier → Runtime Save 外壳**。原因是契约要求 Save 包含 History Cursor、必要 History Entry 与 Barrier Ledger；现在先冻结 Save 会制造缺字段且很快失效的格式。

下一决策点：Spike 04 设计并验证 VM-04/05 的 History Entry、Back/Forward 与改选截断。Spike 03 的 1024 receipt ledger 只是 fail-closed 边界；正式 History 必须定义持久化、压缩和容量策略后才能替代。
