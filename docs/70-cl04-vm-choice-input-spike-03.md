# CL-04 Narrative VM Choice 与外部输入 Spike 03 审计

> 实现 Revision：`d57f1f701d628dcf8d41fe1ee0849103a3f5db07`
>
> 风险：CL-04
>
> 判定：Spike 03 通过本轮门；CL-04 保持“进行中”，未通过
>
> 范围：Choice 请求和外部输入前置语义，不是 VM-04/05 或正式 Runtime

## 1. 需求与顺序审计

契约要求正式 Save 包含 History Cursor、必要 History Entry 和 Barrier Ledger。因此本轮拒绝提前设计 Save 外壳，实施顺序冻结为：

1. Choice 与版本化外部输入；
2. Runtime History、Back、Forward、Fork；
3. Effect、取消与 Barrier；
4. 正式 Runtime Save、迁移与完整性。

本轮只实现第一项：Choice 产生可序列化请求；外部 `ChoiceSelected` 必须精确匹配 `inputId + executionId + requestId + expectedRevision + logicalSequence`，并验证 choice/option。

## 2. 冻结语义与审计修复

- 初始 State 必须由宿主显式提供 execution ID，不允许固定默认值造成跨运行输入串线；
- request token 规范绑定 execution、choice、序号和 revision，等待 State 与 receipt 恢复时均重算；
- Choice 出现时停在原 IP，State revision 与 input sequence 各推进一次；接受后再跳转目标；
- 同一 input ID 和相同载荷为幂等 no-op；同 ID 不同载荷稳定冲突；
- 旧 revision、错误 execution/token/sequence/option 和无请求输入保持原 State；
- 请求复制 options，宿主后续修改 Program 不会间接改变已产生 State；
- receipt 暂设 1024 硬上限并 fail closed，等待正式 History 定义替代策略。

## 3. 测试与结果

VM 定向测试 28 项，其中 Spike 03 新增 11 项。全仓 `npm.cmd run check`：

- 常规测试：52 files / 351 tests / 0 failed；
- 全 workspace build：PASS；
- 架构审计：42 portable files / 3 Node adapter files，PASS；
- 脚本性能：9 tests，PASS；
- 资源性能：4 tests，PASS。

证据包位于 [`evidence/cl-04/spike-03`](../evidence/cl-04/spike-03/result.md)。

## 4. 兼容与诚实缺口

`RuntimeStateV0` 仍是私有可抛弃 Spike 草案。本轮为了输入隔离增加 execution、pending request、sequence 和 receipt 精确字段，因此更新了本 Revision 下 VM-01/02 当前 Golden；Spike 01/02 的历史证据仍绑定各自源码 Revision，不被改写。本轮不承诺跨 Spike 状态兼容，也没有建立正式 Save schema。

| 契约项 | 当前状态 |
|---|---|
| Choice 请求与严格外部输入 | Spike 03 基础通过；仅 Node 开发宿主 |
| 输入幂等与冲突 | 基础通过；正式 History ledger 未建立 |
| VM-04 Back → Forward | 未开始 |
| VM-05 Back → 改选/Fork | 未开始 |
| Effect/取消/Barrier | 未开始 |
| Runtime Save/迁移/完整性 | 未开始 |
| Web/Windows/Android 逐 Step Hash | 未开始 |
| Architecture + QA 独立审阅 | 待完成 |

下一切片是 Spike 04：先冻结 History Entry、checkpoint/replay、Back/Forward/Fork 和 forward 截断不变量，再实现 VM-04/05；不得提前进入 Save 或 UI。
