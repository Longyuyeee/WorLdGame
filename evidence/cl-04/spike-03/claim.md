# CL-04 Spike 03 Claim

Source Revision：`d57f1f701d628dcf8d41fe1ee0849103a3f5db07`

本批次证明平台中立 VM Spike 可以在 Choice 边界产生可序列化、可恢复且与 execution/revision/sequence 绑定的请求，并只接受严格匹配的 `ChoiceSelected` 输入。同一 `inputId` 与相同载荷重复提交为幂等 no-op；同 ID 不同载荷、错误 execution/request/revision/sequence/option、伪造 token 和无请求输入均 fail closed。

本批次不证明 VM-04/05，因为尚未实现 Runtime History、Back、Forward 或 Fork；也不证明正式 Runtime Save、Effect、Barrier、Skip、10k 生成序列、三宿主一致性或 CL-04 通过。
