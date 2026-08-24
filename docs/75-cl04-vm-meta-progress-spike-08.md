# CL-04 Narrative VM Meta Progress Spike 08 审计

> 实现 Revision：`1c3bf1e53f76ac253fc6ad5788e69814dfb94d61`
>
> 风险：CL-04
>
> 判定：Spike 08 通过本轮问题；CL-04 保持“进行中”，未通过
>
> 范围：单一 Node 开发宿主上的 VM-13 Meta Progress 语义，不是账户、云同步、正式持久化或画廊 UI

## 1. 需求与数据边界

Meta Progress 与 Runtime State、Runtime History、Editor Undo/Redo、Project WAL 分离。V0 是项目与本地进度命名空间约束下的三个只增集合：

- `readTextIds`：已读文本稳定 ID；
- `unlockedCgIds`：已解锁 CG 稳定 ID；
- `reachedEndingIds`：已达成结局稳定 ID。

`progressScopeId` 是本地进度命名空间，不是账户。当前产品没有账户系统，本轮没有增加登录、用户资料或云端身份。

唯一变更入口是 `textRead`、`cgUnlocked`、`endingReached` 三类显式事件。API 不提供删除事件；重复事件幂等。集合使用严格稳定 ID、唯一且排序的 canonical 数组，每类最多 100,000 项，以避免无界解析与合并。

## 2. 合并、Hash 与 Save

Meta 合并是 G-Set 并集，测试证明交换、结合、幂等；项目或本地 scope 不一致时 fail closed 并保留当前进度。Meta 使用独立域：

`WORLd-VM-META-PROGRESS\0v0\0`

生成独立 SHA-256，不混入剧情 State Hash。固定 VM-13 Meta Hash 为：

`7f3ef6562bef4d6a3e24ac796dfe7df7b5c935147d75e8ec7c356c2613be920b`

Runtime Save 不嵌入或覆盖 Meta，只保存 `meta.<hash>` 内容寻址引用。创建 Save 时引用只能由已验证、同项目的 Meta 快照推导，不能由调用者自由填写。加载时宿主必须提供引用快照；引用缺失、Hash 不符、项目/scope 不符时，Session 与 Meta 都保持原对象，且不返回 Effect cancellation/rehydrate 意图。成功时只把存档快照与当前 Meta 做并集，因此旧存档不能撤销较新的已读、CG 或结局。

## 3. VM-13 与全仓结果

VM-13 覆盖：

- 剧情到达文本、CG、结局后记录 Meta；
- Runtime Back 改变剧情 State Hash，但 Meta Hash 不变；
- 加载较旧 Runtime Save 后，当前较新 Meta 不回退；
- 合并代数性质、重复事件、输入不变性、外部 scope、畸形集合和伪造引用；
- Meta 引用快照缺失时 Save + Meta 采用原子失败。

全仓 `npm.cmd run check`：

- 常规测试：57 files / 402 tests / 0 failed；
- VM 定向测试：8 files / 79 tests / 0 failed；
- 全 workspace build：PASS；
- 架构审计：47 portable files / 3 Node adapter files，PASS；
- 脚本性能：9 tests，PASS；
- 资源性能：4 tests，PASS。

证据包位于 [`evidence/cl-04/spike-08`](../evidence/cl-04/spike-08/result.md)。

## 4. 审计限制

| 项目 | 当前状态 |
|---|---|
| VM-13 Back 不撤销 Meta | 单 Node 基础通过 |
| 旧 Save 不覆盖新 Meta | 内容引用校验 + 并集基础通过 |
| Meta 独立 Hash | 固定向量通过 |
| 本地 scope 隔离 | 不兼容时 fail closed |
| 项目允许“随回滚撤销”的覆盖策略 | 未实现；本轮只冻结默认单调策略 |
| 文本 ID 与 Spike 07 Skip Read 的编译映射 | 未实现；当前 IR 缺正式 `say/textId` Opcode |
| Meta 快照存储、GC、事务和故障恢复 | 未实现 |
| 画廊、结局列表、回想 UI | 未实现 |
| 多本地档案、账户、云同步、冲突 UX | 未实现，且账户不在 M1 当前范围 |
| 签名、防作弊与隐私 | 未实现；SHA-256 不是真实性保护 |
| 10k 生成序列与三宿主 | 未开始 |
| Architecture + QA 独立审阅 | 待完成 |

Runtime Save 绑定版本提升为 `cl04-spike.8`；无真实历史迁移，因此旧 `.7` envelope 仍严格拒绝。

下一切片是 Spike 09：执行 VM-14/15 与至少 10,000 个生成序列，覆盖批处理让步、Back→Forward/重放恒等、纯表现 Effect 插入不改变剧情 Hash，并固化失败种子；仍不得宣称三宿主或 CL-04 通过。
