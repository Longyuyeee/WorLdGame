# Spike 11 ADR：Scheduler 与 Runtime History 分工作流记录

## 决策

Scheduler State 与 Runtime History Session 不共享可变 checkpoint；两者使用同一种固定字段 Record，在 Suite 层统一排序与摘要。

## 原因

Scheduler 可以在非 Story Boundary 停止，而 Runtime History 要求 State 精确匹配 Cursor checkpoint。强行混合会制造非法 Session 或隐藏真正边界。

## 后果

跨宿主可以统一比较 Record Digest，但必须明确记录所属工作流。未来 Windows/Android 复用同一 Suite，不能用墙钟或平台对象补写权威字段。
