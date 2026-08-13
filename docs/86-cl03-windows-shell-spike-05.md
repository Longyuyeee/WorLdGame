# CL-03 Windows 壳探索 Spike 05：原子目录 CAS 与同步多 PID 竞争

> 日期：2026-08-13
> 状态：探索性部分通过；WS-06 继续前进但未通过，CL-03 仍未通过且未选型
> Source Revision：`5c003e3`
> 前置：[Spike 04](85-cl03-windows-shell-spike-04.md) 的持久租约与 fencing

## 1. 本轮 Claim

本轮只关闭 Spike 04 的“两个接管者同时读取旧状态并同时获胜”缺口：Electron 与 Tauri 在 acquire/renew/release 和每次 fenced write/replace/remove 外增加跨 PID 原子目录 CAS guard。多个已完成宿主初始化的独立进程在同一绝对时间竞争时，每轮必须恰好一个进程获得租约，其余全部得到 `held`，持久 token 只推进一次，guard 在成功路径无残留。

## 2. 明确不证明

- 没有证明进程在持有 `cas.guard` 的短临界区内被强杀后的自动恢复；当前会留下 guard 并在 5 秒后稳定返回 `CAS_GUARD_TIMEOUT`；
- 没有为 guard 写入 owner、nonce、PID/start-time 或可审计 stale 判据，因此禁止自动删除未知 guard；
- 没有证明重解析点检查与随后 `create_dir/mkdir` 之间不存在 TOCTOU；
- 没有证明系统时钟回拨、睡眠/唤醒、网络卷、FAT/exFAT、目录项掉电耐久；
- 没有执行真实 renderer/main 的 WAL 七阶段强杀；
- 本机探索每候选只有 3 轮，尚未满足证据契约对 WS-06 正式矩阵、目标 WIN-L 和原始结果留存的全部要求；
- 因此 WS-06 和 CL-03 均不得登记为通过。

## 3. 实现边界

两个候选在 renderer 不可访问的 `.world-lock` 下使用 `cas.guard` 目录：

1. Windows 文件系统的原子目录创建决定临界区唯一持有者；
2. 已存在时每 5 ms 重试，5 秒后返回稳定错误 `CAS_GUARD_TIMEOUT`；
3. guard 内重新读取 `lease.json` 与 `next-token.txt`，不能依赖进入临界区前的内存快照；
4. acquire/renew/release 与 write/replace/remove 均在 guard 内完成 fencing 校验和实际状态变更；
5. 正常完成或抛错时通过 `finally` / Rust `Drop` 释放 guard；
6. guard 路径继续执行 Spike 03 的重解析点拒绝；
7. `security-profile.json` 与架构审计冻结 `atomic-directory-cas-fenced-lease-spike`，防止静默回退到无 CAS 的磁盘租约。

## 4. 同步多 PID 对抗

外部 supervisor 对实际 Electron runtime 与 Tauri release EXE 各执行 3 轮：

- 每轮创建全新 grant；
- 启动 8 个独立 PID，全部先完成 grant 初始化；
- 每个 PID 等待同一绝对时间后同时 acquire，TTL 为 60 秒；
- 断言每轮 1 个 `acquired`、7 个 `held`；
- 断言 `next-token` 只比 winner token 大 1；
- 断言进程退出后 `cas.guard` 不存在。

本轮共覆盖 2 候选 × 3 轮 × 8 PID = 48 个同步竞争进程。机器结果：

```json
{"electron":{"simultaneous":{"rounds":3,"exactlyOneWinnerEveryRound":true,"allOthersHeldEveryRound":true,"tokenAdvancedOnceEveryRound":true,"guardRemovedEveryRound":true}},"tauri":{"simultaneous":{"rounds":3,"exactlyOneWinnerEveryRound":true,"allOthersHeldEveryRound":true,"tokenAdvancedOnceEveryRound":true,"guardRemovedEveryRound":true}},"status":"PASS"}
```

同一 supervisor 还保留 Spike 04 的正常释放接管、有效租约 `held`、强杀持有者后到期接管、token 递增和旧 token 真实写拒绝；本轮两候选仍全部 PASS。

## 5. 审计发现与纠偏

| 发现 | 处理 | 剩余限制 |
|---|---|---|
| 磁盘 JSON 替换本身无法防两个 takeover 同时获胜 | 所有租约变更与 fenced 写入进入原子目录临界区并重新读盘 | kill-during-guard 尚无安全接管协议 |
| Node `rm(..., recursive:false)` 对目录返回 `EISDIR` | Electron guard 释放改用专用 `rmdir`，针对性测试后通过 | 后续仍需验证防病毒/索引器占用下的稳定错误 |
| 仅并发启动进程不能保证竞争点同步 | 宿主完成 grant 初始化后等待 supervisor 给出的同一绝对时间 | 绝对时间只用于测试编排，不是产品租约时钟方案 |
| 全仓并发仍触发既有 VM-14 5 秒超时 | 未改 CL-04 阈值；本轮继续将完整 `check` 记为阻断 | 应另立审计修复性能测试隔离/预算契约 |

## 6. 验证结果

- Electron 针对性测试：4/4；
- Rust `cargo test --locked`：8/8；
- 真实 junction 双壳审计：PASS；
- 双壳同步 48 PID 原子竞争与 Spike 04 回归：PASS；
- 根 typecheck、全应用 build、architecture、script performance、asset performance：分别 PASS；
- 全仓常规测试：63 files 中 62 passed / 1 timed out，420 用例中 419 passed / 1 timed out；既有 VM-14 10k 用例本轮为 5.766 秒，超过框架 5 秒；完整 `npm run check` 不登记为 PASS。

容量盘点：共享 Web 98,198 B；Electron main 35,617 B；Tauri release EXE 8,600,064 B。它们不是安装包或签名产物。

## 7. 需求对齐与下一步

本轮继续已冻结的 CL-03 可抛弃 Spike，没有新增编辑器 UI。下一轮应先为 CAS guard 设计可验证的 owner/nonce/process-start 记录和 kill-during-guard 恢复规则，证明不会误删活锁或永久阻断；同时补充时钟回拨、睡眠唤醒、锁状态损坏和重复次数矩阵。之后才能进入真实 renderer/main WAL 七阶段强杀。完成前不得宣布 WS-06 或 CL-03 通过。

## 8. 复现命令

```powershell
npm.cmd run build --workspace @world-studio/windows-shell-conformance
npm.cmd run build:tauri --workspace @world-studio/windows-shell-conformance
npm.cmd run audit:grant --workspace @world-studio/windows-shell-conformance
npm.cmd run audit:lock --workspace @world-studio/windows-shell-conformance
npm.cmd exec -- vitest run apps/windows-shell-conformance/electron/storage-host.test.ts
cargo test --locked --manifest-path apps/windows-shell-conformance/src-tauri/Cargo.toml
npm.cmd run audit:architecture
npm.cmd run audit:script-performance
npm.cmd run audit:asset-performance
```
