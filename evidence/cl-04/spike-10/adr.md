# Spike 10 ADR：宿主外层与权威 Trace 分离

## 决策

Corpus 与 Trace 使用版本化平台中立数据；`host`、User-Agent、运行时间等宿主元数据放在外层，不进入 Record 或 Trace Digest。浏览器 Harness 逐个比较由 Node 测试固化的 Record Digest。

## 原因

宿主标识进入权威数据会必然制造差异；只比较最终 Hash 又可能掩盖中间步骤漂移。逐记录 Golden 能在不污染剧情状态的前提下精确定位第一个差异。

## 后果

Windows/Android 未来必须复用同一 Corpus/Trace schema 和 Golden；允许宿主元数据不同，但剧情、Effect、Meta、诊断、History 与 Checkpoint Record Digest 不允许容差。
