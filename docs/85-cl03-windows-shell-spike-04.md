# CL-03 Windows 壳探索 Spike 04：双 PID 持久租约与 Fencing

> 日期：2026-08-13
> 状态：探索性部分通过；WS-06 前进但未通过，CL-03 仍未通过且未选型
> Source Revision：`13fb28b`
> 前置：[Spike 03](84-cl03-windows-shell-spike-03.md) 的原生 grant 与重解析点防护

## 1. 本轮 Claim

本轮只验证 Electron 与 Tauri 两个候选在同一原生 grant 上能否通过磁盘可见的租约协调两个独立 PID：有效租约存在时第二 writer 必须得到 `held`；正常释放后下一 writer 获得更大 fencing token；持有者进程被强制终止且租约到期后，下一 writer 可以接管并获得更大 token；旧进程留下的 token 必须在真正写入前被磁盘当前租约拒绝。

## 2. 明确不证明

- 没有证明两个接管者在完全相同瞬间竞争时具备线性化 CAS；当前临时文件替换不是最终原子锁原语；
- 没有使用 Windows 文件句柄排他锁、`CreateFile` share mode、命名互斥体或数据库事务；
- 没有证明系统时钟回拨、睡眠/唤醒、跨时区、网络卷、FAT/exFAT 或远程文件系统语义；
- 没有对锁目录和 token 目录项执行最终的目录 handle flush，断电耐久尚未证明；
- 没有在 WAL 的 7 个阶段强杀 renderer/main，也没有证明被强杀后的业务数据恢复；
- 因此 WS-06 只获得探索性部分证据，不能登记为通过，CL-03 状态不变。

## 3. 实现边界

两个候选都在 grant 根内使用保留目录 `.world-lock`：

1. `lease.json` 保存 `ownerId`、`fencingToken`、`expiresAtMs`；
2. `next-token.txt` 保存严格单调递增的下一 token；
3. acquire/renew/release 和每次 write/replace/remove 都重新读取磁盘租约；
4. 旧 lease 即使仍存在于旧进程内存，也必须因 owner/token/expiry 不匹配返回 `LEASE_LOST`；
5. `.world-lock` 及其子路径对普通 `ProjectFileStore` API 返回 `RESERVED_PATH`；
6. 锁文件操作继续执行 Spike 03 的逐段重解析点拒绝；
7. lock JSON/token 先写临时文件并同步文件内容，再替换目标；
8. `security-profile.json` 和架构审计冻结 `persistent-fenced-lease-spike` 与保留路径，防止静默回退到进程内状态。

## 4. 双 PID 外部对抗

`tools/run-cl03-windows-lock-audit.mjs` 对实际 Electron runtime 与 Tauri release EXE 分别执行：

1. PID A 获取租约后正常释放，PID B 获取更大的 token；
2. PID A 获取租约并保持；独立 PID B 在有效期内只能得到 `held`；
3. supervisor 强制终止 PID A；
4. 等待租约到期后，新的 PID B 接管并获得更大的 token；
5. 新 PID 使用 PID A 的旧 lease 尝试真实写入，宿主必须返回 `stale-rejected`；
6. supervisor 只输出布尔机器结果，并清理自己创建的 grant fixture。

机器结果：

```json
{"schemaVersion":0,"electron":{"normalReleaseTakenOver":true,"held":true,"killedOwnerTakenOver":true,"fencingAdvanced":true,"staleRejected":true},"tauri":{"normalReleaseTakenOver":true,"held":true,"killedOwnerTakenOver":true,"fencingAdvanced":true,"staleRejected":true},"status":"PASS"}
```

## 5. 审计发现与纠偏

| 发现 | 处理 | 仍需关闭 |
|---|---|---|
| 原实现 lease 只存在各宿主内存，独立 PID 无法协调 | lease 与 next token 改为 grant 内磁盘状态，每次变更和写入前重新读取 | 最终使用原子 OS 锁/CAS 替代探索性替换协议 |
| 锁状态若复用项目 API 会泄露 owner/expiry 并允许用户内容覆盖 | `.world-lock` 成为 renderer 不可访问保留路径，并进入架构审计 | 最终产品还需定义诊断脱敏与人工解锁流程 |
| 第一版 supervisor 把 Electron 空行当 JSON | 等待“可解析机器行”，保留超时和 stderr 诊断 | CI 中还需加入子进程泄漏检测 |
| 同 owner acquire 续租起初只更新内存 | Electron/Tauri 均同步持久化续租 | 时钟回拨与挂起恢复仍未验证 |
| 全仓并发测试两次触发既有 VM-14 5 秒框架超时 | 未放宽门槛；独立复跑该文件 5/5，并将完整 `check` 如实记为阻断 | 应单独审计性能测试的并发隔离和超时契约 |

## 6. 验证结果

- Electron grant/锁针对性测试：4/4；
- Rust `cargo test --locked`：8/8；
- 双壳真实 junction 审计：PASS；
- 双壳正常释放、强杀接管、token 递增和旧 token 写拒绝：PASS；
- 根 typecheck、全应用 build、architecture、script performance、asset performance：分别 PASS；
- 全仓常规测试在 4 workers 下：63 files 中 62 passed / 1 timed out，420 个用例中 419 passed / 1 timed out；失败为既有 `vm-spike09.test.ts` 的 VM-14 10k 用例超过框架 5 秒，测得 5.984 秒与 6.562 秒；
- 该 CL-04 文件独立复跑：5/5 PASS；因此没有功能断言失败，但完整 `npm run check` 不登记为 PASS。

容量盘点：共享 Web 98,198 B；Electron main 34,344 B；Tauri release EXE 8,583,168 B。它们仍不是安装包或签名产物。

## 7. 需求对齐与下一步

本轮继续风险优先的可抛弃 Spike，没有增加编辑器 UI，也没有开始正式产品壳。下一轮必须用真正可线性化的 Windows 原生锁/CAS 原语替换探索协议，并加入同时接管竞争、时钟异常、睡眠唤醒、锁状态损坏与目录耐久矩阵；随后再把真实 renderer/main 强杀注入 WAL 七阶段。完成这些之前不得把 WS-06 或 CL-03 宣布为通过。

## 8. 复现命令

```powershell
npm.cmd exec -- vitest run apps/windows-shell-conformance/electron/storage-host.test.ts
cargo test --locked --manifest-path apps/windows-shell-conformance/src-tauri/Cargo.toml
npm.cmd run build
npm.cmd run build:tauri --workspace @world-studio/windows-shell-conformance
npm.cmd run audit:grant --workspace @world-studio/windows-shell-conformance
npm.cmd run audit:lock --workspace @world-studio/windows-shell-conformance
npm.cmd run audit:architecture
npm.cmd run audit:script-performance
npm.cmd run audit:asset-performance
```
