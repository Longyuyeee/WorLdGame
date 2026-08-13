# CL-04 Spike 02 Result

## 结论

`fe11324` 在单一 Node 开发宿主通过 Spike 02 定向测试与全仓门禁。VM-02 的调用、嵌套返回、递归上限和恢复状态上限已形成拒绝式证据；VM-03 的固定种子序列、PRNG 状态、逻辑等待意图和七步 State Hash 已固定。CL-04 仍为“进行中”。

## 已观察结果

- `call` 保存确定的下一 IP，嵌套调用按 LIFO 返回，最终栈为空；
- 第 65 层调用、超过 64 层的恢复状态以及空栈 `return` 均 fail closed，原 State 不变；
- 非零种子 `0x12345678` 经两次 `random` 得到 `roll.a = 6`、`roll.b = 10`，最终 PRNG state 为 `358294691`、draws 为 `2`；
- `wait(120)` 将逻辑时钟从 0 推进到 120，并返回 `{durationTicks: 120, resumeAtTick: 120}`；
- revision 3 进行 canonical State 往返后，余下 Hash 流与不中断执行完全一致；
- 零种子、反向随机区间、零 tick、未知 operand、逻辑时钟/抽取次数溢出均被拒绝；
- 全仓 `npm.cmd run check` 为 PASS：51 files / 340 tests，构建、架构、脚本性能和资产性能全部通过。

固定向量见 [`raw/vm-0203-golden.json`](raw/vm-0203-golden.json)。

## 未完成

canonical State 往返不是带外壳校验、版本迁移、完整性和 History 的 Runtime Save/Load，因此 VM-03 仅完成确定序列与恢复前置证据。Choice、Effect、History、Back/Forward、Skip、10k 生成序列和三宿主逐步 Hash 仍无证据。
