# CL-04 Narrative VM History、Back/Forward 与 Fork Spike 04 审计

> 实现 Revision：`6d8f61dfc75ba6ddf5ab8f239bb5775963b9d2bc`
>
> 风险：CL-04
>
> 判定：Spike 04 通过本轮门；CL-04 保持“进行中”，未通过
>
> 范围：VM-04/05 的最小 History 语义，不是确定性 replay、正式 Runtime Save 或生产容量方案

## 1. 需求与边界审计

本轮严格实现契约中的 Runtime History，不复用 Editor Undo/Redo 或 Project WAL。Story Step 边界保存 before/after State Hash、checkpoint 引用、稳定 step/source ID 和可选完整输入。Choice prompt 与 commit 是两个独立边界；结束也获得稳定 step ID。

冻结不变量：

1. Back 只恢复前一个已批准边界；
2. Forward 只恢复已记录 checkpoint，不重新请求宿主输入；
3. Back 后提交与下一记录相同的输入必须使用 Forward；
4. 只有不同输入才能 Fork，且成功转换与未来截断必须原子完成；
5. 被截断分支的 input ID 进入单调 tombstone ledger，不能在新分支复用；
6. Session、checkpoint、entry、Hash 链或稳定 ID 不一致时 fail closed。

## 2. Spike 实现与限制

Spike 04 在每个边界保存完整 canonical `RuntimeStateV0`。这种设计让 VM-04/05 的恢复语义可以被独立验证，但 Forward 是快照恢复，不是输入重放；每次操作还会完整校验 Session，因此不能据此推断生产性能或存储容量。

临时硬门：History 最多 256 entries，input tombstones 最多 1024；同步 History runner 遇到逻辑 wait 会拒绝继续。上述数字用于 fail closed，不是正式产品规格。

## 3. 测试与结果

VM 定向测试 39 项，其中 Spike 04 新增 11 项。全仓 `npm.cmd run check`：

- 常规测试：53 files / 362 tests / 0 failed；
- 全 workspace build：PASS；
- 架构审计：43 portable files / 3 Node adapter files，PASS；
- 脚本性能：9 tests，PASS；
- 资源性能：4 tests，PASS。

证据包位于 [`evidence/cl-04/spike-04`](../evidence/cl-04/spike-04/result.md)。

## 4. 审计结论与诚实缺口

| 契约项 | 当前状态 |
|---|---|
| VM-04 choice → Back → Forward | Spike 04 基础通过；仅 Node 开发宿主 |
| VM-05 Back → 改选/Fork | Spike 04 基础通过；仅完整 checkpoint 模式 |
| 改选失败原子性与旧输入防复用 | 基础通过 |
| 确定性 replay/增量 checkpoint | 未开始 |
| Effect/取消/Barrier | 未开始 |
| Runtime Save/迁移/完整性 | 未开始 |
| 10k 生成序列 | 未开始 |
| Web/Windows/Android 逐 Step Hash | 未开始 |
| Architecture + QA 独立审阅 | 待完成 |

下一切片是 Spike 05：先冻结 Effect intent、await/cancellation、提交边界和不可逆 Barrier，再执行 VM-06–08；仍不得提前发布 Save 或接入 UI。
