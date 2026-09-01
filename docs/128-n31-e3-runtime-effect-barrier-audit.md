# N31-E3 Runtime Effect / Barrier 审计

> 审计日期：2026-08-15
> 变更前基线：`a9ee6185223ad77d6c112b042c4e041e6597732b`
> 审计分支：`agent/n31-runtime-e3`
> 交付状态：实现头 `271d869`；首轮交付头 `56019ebf9c48933f8e33c053293bacdc2aaebe6b`；Draft PR #38；本地完整门、真实 Worker 向量及远端 CI 均通过
> 节点判定：N31 Engineering E3 候选；N31 Product Acceptance、N32、M1 Stable 与发布仍被 `RA-N21-003` 阻断

## 1. 需求边界与 IR 对齐

E3 对齐 N31 的 Effect 请求、取消、Barrier 和宿主响应协议。N30 Runtime IR v1 没有独立 `emit` opcode，因此正式 Runtime 不复制 Spike opcode，也不私自扩展 Compiler；它把现有 `direction` 的类型化参数降低为 Effect Intent。默认 `policy=pure`、`awaitMode=detached` 保持 E2 行为；awaited、reversible 和 barrier 必须显式声明并通过运行时元数据校验。

本节点不执行真实网络、购买、通知、文件写入或系统 Intent，不实现宿主 Scheduler、Save/History/Back/Forward、Auto/Skip 或 Editor 接入。Barrier Ledger 已进入 State，但“Back 在 Barrier 后阻断”须由后续 History 切片完成，不能在 E3 冒充已通过。

## 2. 正式协议

- Effect Intent 使用内容派生 `effectId`，绑定 execution、originating revision、logical sequence、descriptor、channel、kind、纯标量 payload、policy、awaitMode、cancellationScope、replayKey 和可选 compensation；
- detached Effect 发出后立即推进逻辑 Direction State；awaited Effect 保持 cursor 且不提前提交 Scene/Audio/Meta State，匹配 completion 后提交，cancel 后跳过；
- completion/cancel 必须匹配 schema、inputId、execution、revision、logical sequence、effectId 以及 replayKey 或 cancellationScope；
- receipt 保存完整输入与 accepted revision；相同 inputId/相同内容幂等，相同 ID/不同内容失败，receipt 上限为 10,000；
- 取消后迟到 completion 返回 `RUNTIME_EFFECT_CANCELLED`，不会污染新 revision；
- Barrier 第一次运行只生成域分离 requestId，Effect 和逻辑 Direction 均不发出；精确批准后才原子提交 Effect、State、receipt 与 Barrier Ledger；barrier 必须 detached 且提供用户可理解原因；
- reversible Effect 必须提供确定 compensation kind；缺失或错误 policy 元数据按 `RUNTIME_INVALID_IR` 失败关闭。

Runtime 升至 `0.3.0`。State schema 仍为 v1，但 runtimeVersion 会明确拒绝 E2 旧 State；新增 pending Effect/Barrier、Effect/Input 序号、receipt 和 Barrier Ledger 均进入 canonical State Hash。

## 3. 固定向量与真实 Worker

持续演进的 `executeRuntimeConformanceV1()` 在 E2 State/PRNG 向量上追加：

| 向量 | Golden |
|---|---|
| Effect Intent | `ae85cfea2908822b25f52c60fa4a602f2f36b7a204ae157023d91a7103268992` |
| Awaited issued State | `d687d89e8913e454d35fa2464e918880763fb28c436d4922aa55398a29624781` |
| Completed State | `a96de6a2a1d5b61f23345b02a0fea9b7496ff55de38a585f483d01137b1d9f3d` |
| Barrier request | `barrier.62b95f219800e9bad704d050252bddea054d18c84cd27a5f41e84498d19d3eaf` |
| Barrier committed State | `317c0f4a087b63b6e5806132cd55417ac760966d00778173564fa289d2d2167d` |

Node 定向测试断言完整对象；`apps/vm-conformance` 的真实模块 Worker 调用同一函数并与 Node Golden 比较，本地浏览器得到 `data-runtime=passed`。Spike 10k 仍是独立旧套件，正式 Runtime 10k Corpus 尚未完成。

## 4. 自动化与需求判定

Runtime 定向门 21 项通过：E1/E2 十五项回归，以及 awaited completion、外来/陈旧/乱序/token 拒绝、receipt 幂等冲突、scope cancel/迟到完成、Barrier 预批准/伪造拒绝/提交 ledger、detached/reversible 元数据。完整 `npm run check` 同样通过：98 个并行文件/609 项、存储 1 项、重型 VM 5 项、12 workspace 构建、77 个 portable 文件/4 个 Node adapter，以及 Script/Asset 性能门。首轮交付头 `56019ebf9c48933f8e33c053293bacdc2aaebe6b` 的远端 `product-baseline` run `31886139025` 已通过 Windows / Node 22 完整门，job `95015614789` 用时 4 分 16 秒。

REQ-RUNTIME 与 AC-13 只提升为“实现中”的更强工程证据；AC-07、AC-15、AC-16 仍未通过。M1 仍为 `0/27`，N21 `0/1`、N23 `0/2` 不变。

## 5. 下一顺序

E4 应在 N31 内实现 canonical Runtime Save、版本/Build/State Hash 校验、pending Effect rehydrate 和损坏/未来 Save 拒绝；E5 再建立 History/Back/Forward、分支截断和 Barrier Back 阻断。未关闭真人门和例外前不得进入 N32。
