# CL-04 Spike 04 Result

## 结论

`6d8f61d` 在单一 Node 开发宿主通过 VM-04/05 的最小 History 语义。每个批准边界保存完整 checkpoint；Back 恢复前一边界，Forward 恢复已记录边界且不重问输入；Back 后改选会原子截断未来记录，失败的改选不破坏原分支。CL-04 保持“进行中”。

## 已观察结果

- Runtime Session 与 Editor Undo/Redo、Project WAL 保持独立；
- Choice prompt 与 commit 使用不同的稳定 step ID；
- History Entry 绑定 before/after Hash、checkpoint ID、step/source ID 和可选完整输入；
- 同一已记录输入在 Back 后要求使用 Forward，不允许伪造 Fork；
- 不同输入才能 Fork，成功后截断未来 entries/checkpoints，失败则保留原未来；
- 截断分支的 input tombstone 仍保留，相同载荷为 no-op，不同载荷稳定冲突；
- checkpoint、entry step ID 或状态链被篡改时 fail closed；
- 同步 History runner 遇到逻辑等待时 fail closed；
- 256 History Entry 上限为显式停止门；
- 全仓 `npm.cmd run check` 为 PASS：53 files / 362 tests，构建、架构和两套性能审计全部通过。

固定向量见 [`raw/vm-0405-history-golden.json`](raw/vm-0405-history-golden.json)。

## 未完成

Forward 当前恢复完整 checkpoint，不是从输入日志重新执行，因而没有证明 replay 确定性。每步完整快照和全 Session 校验的时间/空间复杂度只适合 Spike；没有 Effect、Barrier、取消、正式 Save envelope、迁移、完整性、只读文本历史、平台宿主或独立审阅。256/1024 上限不代表产品容量。
