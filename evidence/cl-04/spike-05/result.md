# CL-04 Spike 05 Result

## 结论

`40b575a` 在单一 Node 开发宿主通过 VM-06–08 的最小 Effect 协议。Effect token 与 intent hash 可规范复现；awaited completion/cancellation 严格匹配；Back/Forward/Fork 返回明确 Scheduler cancellation directive；pure ledger 可 Forward 重发、reversible Back 产生补偿 intent、已提交 Barrier 返回 `VM_BARRIER_BLOCKED`。CL-04 保持“进行中”。

## 已观察结果

- `emit` 只接受 scalar payload 和 `pure/reversible/barrier` 三种策略；
- reversible 必须有 canonical compensation，barrier 必须有说明和独立许可请求；
- awaited Effect 在原 IP 等待，完成或取消后才进入下一指令；
- 错误 execution、effect token、revision、sequence、replay key 或 cancellation scope 均保持原 State；
- 相同 input ID/载荷幂等，不同载荷稳定冲突；
- scope 取消后进入下一场景边界，迟到 completion 返回 `VM_EFFECT_CANCELLED`；
- History ledger 被篡改、pending Effect 与 Program 不一致时 fail closed；
- 全仓 `npm.cmd run check` 为 PASS：54 files / 373 tests，构建、架构和两套性能审计全部通过。

固定向量见 [`raw/vm-0608-effect-golden.json`](raw/vm-0608-effect-golden.json)。

## 未完成

本轮没有真实 Scheduler、媒体解码、并发 channel 归并或平台生命周期；VM-07 只证明显式 scope cancellation 后迟到结果不改状态，不是完整场景加载器。补偿是声明式 intent，尚未验证补偿失败/重试；Barrier 是受控测试 Effect，未授权真实网络、购买、通知或文件写入。正式 Save、Replay、Skip、10k 生成序列与三宿主仍未完成。
