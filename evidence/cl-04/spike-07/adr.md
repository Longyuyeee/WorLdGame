# CL-04 Spike 07 临时决策

状态：**保留外部调度模型为正式 Runtime 候选，不形成最终 Scheduler/时钟 ADR**。

保留候选：Skip/Auto 不进入剧情 State；所有模式调用相同转换器；速度仅影响有界批处理；Instant 强制让步预算；Skip Read 在显示首个未读边界后停止；Auto 延迟为外部安全整数建议；资源在 Effect 发出前预检；选择、输入、Effect、Barrier、Stop Point、错误和终局必须停止。

不保留为产品结论：把 instruction/batch 等同于句/秒、用 Node 循环耗时推导 UI 流畅度、把 descriptor blocklist 当正式资源 Manifest、把现有 Choice 输入边界宣称为文本输入完成，或把 State-only Scheduler 宣称为 Runtime History 集成。

下一决策点：Spike 08 冻结独立 Meta Progress 的已读/CG/结局单调合并与独立 Hash，执行 VM-13；之后进入 VM-14/15、生成序列与三宿主证据。
