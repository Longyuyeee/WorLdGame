# CL-04 Spike 12 ADR

决定继续采用可移植、固定种子、显式分块的生成语料执行器作为跨宿主回归输入。宿主只负责任务调度与计时，不能进入剧情结果或摘要。

此决定只推进 CL-04 证据，不批准正式 VM，也不改变 Runtime Save schema。下一步扩展逐记录 Effect/Barrier/Meta/Skip 矩阵。
