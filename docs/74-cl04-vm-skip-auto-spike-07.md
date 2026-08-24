# CL-04 Narrative VM Skip / Auto Spike 07 审计

> 实现 Revision：`f44b01fa2f2d881f2d8c82daf62d76e0f75fd66c`
>
> 风险：CL-04
>
> 判定：Spike 07 通过本轮问题；CL-04 保持“进行中”，未通过
>
> 范围：单一 Node 开发宿主上的确定性调度策略与 VM-09/10，不是正式玩家时钟、UI、三宿主或性能结论

## 1. 需求对齐与调度边界

Skip 与 Auto 位于 VM 转换器外部，不进入 `RuntimeStateV0`，也不建立第二套 Opcode 解释器。Normal、Auto、Skip Read、Skip All、Hold 与 Toggle 都调用同一个 `transitionV0`；速度只决定单批 instruction 预算，不能删除、重排或替换变量、调用、随机、逻辑等待、Effect 和检查点。

本轮冻结：

- Normal/Auto 一次运行到下一个 Story Boundary；Auto 只返回宿主计时建议；
- 5/10/20/40 与 Instant 是可让步的批处理预算，Instant 每批最多 1–4096 条，防止无限占用；
- Skip Read 在已读边界继续，在第一个未读边界完成显示后停止；已读集合是外部只读输入，不写入剧情 State；
- Skip All 可跨普通 Story Boundary，但不能跨选择、Barrier、awaited Effect、显式 Stop Point、资源预检失败、确定性错误或终局；
- `wait` 仍完整推进逻辑 tick 并返回 wait intent；本 Spike 没有用删掉逻辑时间来伪造相同 Hash；
- Hold/Toggle 只描述激活生命周期，两者执行语义一致，释放/再次点击由未来输入控制层管理。

## 2. Auto 与资源停止

Auto 的等待建议采用安全整数 tick：`max(base + readableUnits × perUnit, voiceDuration + voiceTail)`。该结果不写入剧情 State，因此 Normal 与 Auto 到同一边界的 State Hash 相同。语言分词、标点权重、真实语音元数据和前台/后台计时尚未纳入。

资源停止在执行 `emit` 前按稳定 `descriptorId` 预检。资源不可用时 State、Effect 与执行计数保持在该指令之前。当前 IR 没有正式文本输入 Opcode，故只证明现有 pending input 的通用停止边界和 Choice/Barrier；不得宣称文本输入命令已经完成。

## 3. VM-09/10 结果

固定程序覆盖 `set`、`add`、固定种子 `random`、`wait`、两个 Story Boundary 与终局。Normal、5、10、20、40、Instant 以相同顺序执行，最终 State Hash 均为：

`90dd1a392dffe73bb535d6c29fd4948b9e84db442297f2521fa556445b86ed2a`

VM-10 证明 Skip Read 跨过 `step.read.one`，在显示 `step.unread.two` 后停止；与 Normal 到同一边界的 State Hash 完全一致，且调度器没有改写 `readSession`。

全仓 `npm.cmd run check`：

- 常规测试：56 files / 393 tests / 0 failed；
- 全 workspace build：PASS；
- 架构审计：46 portable files / 3 Node adapter files，PASS；
- 脚本性能：9 tests，PASS；
- 资源性能：4 tests，PASS。

原始证据见 [`evidence/cl-04/spike-07`](../evidence/cl-04/spike-07/result.md)。

## 4. 审计结论与诚实缺口

| 契约项 | 当前状态 |
|---|---|
| VM-09 Normal/5/10/20/40/Instant | 单 Node 固定程序 Hash 一致，基础通过 |
| VM-10 Skip Read 未读边界 | 外部已读集合只决定停止，基础通过 |
| Skip All / Hold / Toggle | 同转换器与相同终局 Hash，基础通过 |
| Choice/Barrier/Effect/Stop Point/资源/错误停止 | 定向测试通过 |
| Auto 可读性计时 | 纯整数建议通过；真实文本/语音/宿主时钟未接入 |
| 句/秒真实节拍与帧让步 | 未测；当前档位只是确定性批预算 |
| 文本输入、未下载章节、真实资源清单 | 尚无对应正式 Opcode/Manifest 接口 |
| Runtime History + Scheduler 原子集成 | 未完成；本轮直接调度 Runtime State |
| UI、玩家设置持久化、音视频表现策略 | 未开始 |
| 10k 生成序列、Web/Windows/Android | 未开始 |
| Architecture + QA 独立审阅 | 待完成 |

Runtime Save 绑定版本提升为 `cl04-spike.7`。即使重新计算摘要，`.6` envelope 仍会 fail closed；当前没有真实历史迁移，不伪装兼容。

下一切片是 Spike 08：冻结独立 Meta Progress（已读、CG、结局）的单调合并、独立 Hash 及剧情 Back/Load 不回退语义，执行 VM-13；仍不得接入正式 UI 或宣称 CL-04 通过。
