# Spike 09 ADR：分离精确状态与剧情结果 Hash

## 决策

保留 `stateHashV0` 作为精确重放依据，新增只允许静止状态使用的 `storyOutcomeHashV0`，供等价程序变形测试比较。两者使用不同域，禁止互换。

## 原因

插入纯表现 Effect 会合法改变 IP、revision 和 Effect 序号，却不应改变剧情结果。若修改原有 State Hash，会削弱存档、历史和跨宿主的精确审计能力。

## 后果

所有存档、历史与跨宿主精确一致性仍使用 `stateHashV0`。剧情结果投影只用于明确的变形测试，并在存在待处理输入/Effect 时 fail closed。
