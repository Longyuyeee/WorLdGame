# CL-04 Spike 02 临时决策

状态：**保留为后续 Spike 输入，不形成正式 Runtime ADR**。

继续保留：64 层调用栈上限、非零 `xorshift32-v0` 状态、每条 `random` 恰好一次状态推进、整数逻辑 tick、等待调度意图、精确 Schema 与 fail-closed 恢复校验。

当前随机区间映射使用 `min + (nextUint32 % span)`。这是明确、可重放的一次抽取语义，但本轮未建立统计公平性要求；正式采用前必须决定是把该映射版本化冻结，还是引入新的算法/IR 版本，不得在同一版本内静默改变序列。

下一决策点：Spike 03 完成 Choice 与版本化外部输入幂等边界，并决定 Runtime Save 外壳和 History 进入顺序后，重新审查 State 是否足以支持 VM-04/05。
