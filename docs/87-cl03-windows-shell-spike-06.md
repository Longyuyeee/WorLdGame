# CL-03 Windows 壳探索 Spike 06：CAS Guard 身份与强杀恢复

> 日期：2026-08-13
> 状态：探索性部分通过；WS-06 继续前进但未通过，CL-03 仍未通过且未选型
> Source Revision：`eadd13a`
> 前置：[Spike 05](86-cl03-windows-shell-spike-05.md) 的原子目录 CAS

## 1. 本轮 Claim

本轮只关闭 Spike 05 的“进程在持有 `cas.guard` 时被强杀会永久阻断”缺口：guard 从出现的第一刻必须携带完整 PID、nonce 与获取时间；活 owner 不得被接管；达到最小年龄且 PID 明确不存在后，多个恢复者必须通过原子 quarantine 竞争，恰好一个进程恢复锁位，其余继续按普通竞争返回 `held`；candidate、quarantine、release 和 guard 最终均不得残留。

## 2. 明确不证明

- marker 尚未绑定 Windows 进程创建时间，极端 PID 快速复用可能把旧 guard 保守误判为活跃，但不会主动误删；
- `OpenProcess` 查询权限不足或 `GetExitCodeProcess` 失败时一律按存活处理，可能阻断恢复，不会冒险接管；
- 250 ms 是探索性最小年龄，不是正式 SLA，也没有证明系统时钟回拨与睡眠/唤醒；
- 没有证明 candidate/marker/rename/quarantine/release 的目录项掉电耐久；
- 没有关闭重解析点检查与实际目录操作之间的 TOCTOU；
- 没有执行 renderer/main 的 WAL 七阶段真实强杀；
- 因此 WS-06 和 CL-03 均不得登记为通过。

## 3. 实现边界

两个候选采用同等身份 guard 协议：

1. 先创建私有 `candidate-<pid>-<nonce>` 并写入 `owner.json`；
2. marker 包含 `pid`、`nonce`、`acquiredAtMs`；
3. candidate 原子重命名为 `cas.guard`，因此可见 guard 从第一刻就有完整 marker；
4. 竞争者只有在 marker 合法、年龄至少 250 ms 且 PID 明确不存在时，才可把 guard 原子改名为唯一 quarantine；
5. 活 PID、无法查询的 PID、过新的 guard 均保持等待，5 秒后返回 `CAS_GUARD_TIMEOUT`/`cas-busy`；
6. holder 正常释放前重新验证 PID/nonce，再把 guard 原子改名为 `release-*`，随后有界重试清理；
7. stale quarantine 同样先原子移出锁位，再有界清理；
8. Schema/nonce 损坏继续硬失败为 `CAS_GUARD_CORRUPT`，不能当成 stale 自动删除；
9. `.world-lock` 仍为 renderer 不可访问保留路径，所有锁路径继续经过重解析点拒绝；
10. 安全配置与架构审计冻结 `identified-atomic-cas-fenced-lease-spike` 和 `minimum-age-and-dead-pid-quarantine`。

## 4. 强杀与同步恢复对抗

对实际 Electron runtime 和 Tauri release EXE 分别执行：

1. 启动专用 holder，在 guard 临界区输出 `cas-held` 后永久等待；
2. supervisor 读取 marker，验证 marker PID 等于实际子进程 PID；
3. holder 活跃时启动独立 probe，必须在 5 秒后返回 `cas-busy`，且 marker nonce 不变；
4. supervisor 强制终止 holder，等待超过探索性最小年龄；
5. 启动 8 个完成 grant 初始化并等待同一绝对时间的恢复 PID；
6. 必须恰好 1 个 `acquired`、7 个 `held`、0 个 `cas-busy/internal`；
7. 必须清除 stale guard，且没有 candidate/quarantine/release residue。

两次最终完整运行均对两个候选 PASS。最终机器结果的核心字段为：

```json
{"electron":{"killedGuard":{"holderConfirmed":true,"liveOwnerProtected":true,"acquiredCount":1,"heldCount":7,"busyCount":0,"staleGuardRemoved":true,"noRecoveryResidue":true}},"tauri":{"killedGuard":{"holderConfirmed":true,"liveOwnerProtected":true,"acquiredCount":1,"heldCount":7,"busyCount":0,"staleGuardRemoved":true,"noRecoveryResidue":true}},"status":"PASS"}
```

同一 supervisor 还重复 Spike 04 的正常释放/租约强杀和 Spike 05 的双壳 48 PID 同步 acquire；最终两次均全部 PASS。

## 5. 审计发现与修复

| 发现 | 根因 | 修复 | 剩余限制 |
|---|---|---|---|
| Tauri rename 竞争出现 OS 145 与 OS 5 | Windows 对“目标非空/被并发访问”的目录重命名返回码不只 `AlreadyExists` | 将 145/AccessDenied 作为竞争 loser，仍须重新读 marker | 防病毒与第三方 filter driver 矩阵未覆盖 |
| marker 读取偶发 NotFound/PermissionDenied | winner 正在原子移动或释放 guard | 状态切换时重新竞争；成功读取但 Schema 非法仍硬失败 | 文件系统过滤器的长时间拒绝会超时阻断 |
| stale quarantine 后删除偶发 AccessDenied | Windows 目录句柄短暂未释放 | 锁位先原子释放，再对唯一隔离目录做 1 秒有界清理 | 超时仍返回硬错误 |
| Tauri 曾出现两个恢复 winner | holder 递归删除 guard 时先删 marker，另一个 contender 可把新 guard 放入同一空目录位置，旧删除继续删除新 guard | 正常释放改为 nonce 校验后将整个 guard 原子重命名为 `release-*`，再清理 | 需要更高轮次和 WIN-L 正式矩阵 |
| Electron 原子 release 偶发 ownership lost | contender 读取 marker 时 Windows rename 短暂拒绝 | 每次重读 nonce 后有界重试原子 release；不同 nonce 立即硬失败 | 1 秒阈值仍为探索值 |
| 全仓 CL-04 门继续失败 | VM-14 10k 在当前机器超过固定 5 秒；并发运行时 corpus 也曾超过 90 秒 | 未修改无关测试或阈值，如实保留红项 | 需单独审计 CL-04 性能预算与隔离策略 |

## 6. 验证结果

- Electron 针对性测试：4/4；
- Rust `cargo test --locked`：8/8；`cargo fmt --check`：PASS；
- 双壳真实 junction：PASS；
- 两次最终 CAS 全矩阵：PASS，包括活 owner 保护、强杀恢复、48 PID 同步竞争、旧 token 写拒绝和零 residue；
- typecheck、全应用 build、architecture、script performance、asset performance：分别 PASS；
- 全仓常规测试：63 files 中 62 passed / 1 failed；420 用例中 418 passed / 2 timed out。既有 VM-14 为 6.447 秒（门 5 秒），10,000-seed corpus 为 105.368 秒（门 90 秒）；
- 同文件隔离复跑：4 passed / 1 timed out，corpus 恢复 PASS，但 VM-14 仍为 5.286 秒；因此完整 `npm run check` 保持红色，不能再归因于纯并发偶发抖动。

容量盘点：共享 Web 98,198 B；Electron main 39,028 B；Tauri release EXE 8,527,360 B。它们不是安装包或签名产物。

## 7. 当前开发状态与下一步

当前仍处于 S0 的 CL-03 Windows 壳可抛弃验证阶段，不是产品 UI 开发。Spike 01–06 已依次覆盖双壳 VM、app-private WAL、原生 grant/junction、持久租约、同步 CAS 竞争与 CAS holder 强杀恢复；但 WS-06 仍缺 PID 创建时间绑定、时钟/挂起/损坏/掉电矩阵和 WIN-L 正式重复，WS-07 仍缺 handle-relative TOCTOU 关闭。

下一轮应优先将 marker 绑定到 Windows process creation time，验证 PID 重用和查询权限拒绝；同时增加 marker 损坏、时钟回拨、睡眠唤醒和更高轮次矩阵。完成后再进入真实 renderer/main WAL 七阶段强杀。不得提前宣布 Windows 壳选型或 CL-03 通过。

## 8. 复现命令

```powershell
npm.cmd run build --workspace @world-studio/windows-shell-conformance
npm.cmd run build:tauri --workspace @world-studio/windows-shell-conformance
npm.cmd run audit:grant --workspace @world-studio/windows-shell-conformance
npm.cmd run audit:lock --workspace @world-studio/windows-shell-conformance
npm.cmd exec -- vitest run apps/windows-shell-conformance/electron/storage-host.test.ts
cargo fmt --manifest-path apps/windows-shell-conformance/src-tauri/Cargo.toml -- --check
cargo test --locked --manifest-path apps/windows-shell-conformance/src-tauri/Cargo.toml
npm.cmd run audit:architecture
npm.cmd run audit:script-performance
npm.cmd run audit:asset-performance
```
