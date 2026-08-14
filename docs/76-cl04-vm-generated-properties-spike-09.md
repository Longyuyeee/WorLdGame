# CL-04 Narrative VM 生成属性语料 Spike 09 审计

> 实现 Revision：`45aad835239395f52294a9d8d11b807d66afe470`
>
> 风险：CL-04
>
> 判定：Spike 09 通过本轮问题；CL-04 保持“进行中”，未通过
>
> 范围：单一 Node 开发宿主上的 VM-14/15 基础与 10,000 个固定生成序列，不是目标设备性能或三宿主证据

## 1. 需求对齐与冻结语义

本轮没有扩展编辑器 UI，而是继续关闭已冻结的 CL-04 确定性风险：

- VM-14 实际执行 10,000 个循环步，调度批次最多 128 个纯步骤；
- VM-15 验证 Back→Forward、重放恒等与“插入脱离剧情的纯表现 Effect 不改变剧情结果”；
- 固定种子 `0..9999` 分布覆盖嵌套条件、调用/返回、随机、等待 Effect 取消、Save/Load 检查点和 Choice Back→Forward；
- 每个种子执行两次并比较结果，失败必须报告种子，便于直接固化为回归用例。

`stateHashV0` 仍是完整精确重放 Hash。新增 `storyOutcomeHashV0` 只用于等价程序的变形比较：它保留 Step、变量、PRNG、逻辑时钟、场景/音频逻辑、已读会话、终态与调用栈深度，排除 IP、revision 和 Effect 序号等执行账本。存在待处理输入或 Effect 时拒绝计算，避免把未静止状态误判为等价。

## 2. 固定结果

| 项目 | 结果 |
|---|---|
| VM-14 10k 循环精确 State Hash | `273dde1820c0d67dad879061e5a505b3c8af8582a59ece686eac84082bc5dc84` |
| VM-15 剧情结果 Hash | `34bcf067d7e841b82fb95eb4eafa8100e705675b6f90ab8d90275e81a9c91f93` |
| 10k 生成语料摘要 | `770920d96fdcb3388c3f7aead30ee45385ec9cd0c435960a6981b5cb6c92e048` |
| Runtime Save 完整性摘要 | `0a66fabd29fecf80f74d50d4b8f545ed3029226e9c5317bb7d07df3172331540` |
| 失败种子 | 无 |

全仓 `npm.cmd run check`：

- 常规测试：58 files / 406 tests / 0 failed；
- VM 定向测试：9 files / 83 tests / 0 failed；
- 全 workspace build：PASS；
- 架构审计：47 portable files / 3 Node adapter files，PASS；
- 脚本性能：9 tests，PASS；
- 资源性能：4 tests，PASS。

证据包位于 [`evidence/cl-04/spike-09`](../evidence/cl-04/spike-09/result.md)。

## 3. 审计限制与纠偏

- 10,000 个序列来自六类确定性生成器，是可复现属性语料，不是任意语法组合的完整 fuzz 证明；
- VM-14 证明批处理函数有界，不证明浏览器主线程真实让步、Windows/Android 调度或目标设备帧时间；
- 约 55.53 秒是 Node 开发机定向测试观察值，90 秒只是防抖测试超时，不是产品性能预算；
- `storyOutcomeHashV0` 是辅助投影，不能代替精确 `stateHashV0`；
- Runtime Save 绑定升级到 `cl04-spike.9`，重新签摘要的 `.8` 仍被拒绝，尚无历史迁移；
- History 与 Scheduler、真实时钟/存储、三宿主相同 Hash、Architecture + QA 独立审阅仍未完成。

下一切片是 Spike 10：冻结可移植语料执行器和逐步 Hash 流，先完成 Node 与 Web Worker 对照；Windows/Android 适配与真实设备结果必须在相应壳可用后补齐。在三宿主与独立审阅完成前不得宣布 CL-04 通过。
