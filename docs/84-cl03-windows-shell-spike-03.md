# CL-03 Windows 壳探索 Spike 03：原生工程 Grant 与重解析点拒绝

> 日期：2026-08-13
> 状态：探索性通过；WS-07 仅部分前进，CL-03 仍未通过且未选型
> Source Revision：`66c3b47`
> 前置：[Spike 02](83-cl03-windows-shell-spike-02.md) 的 `WindowsHostV1` app-private 存储

## 1. 本轮 Claim

本轮只验证用户工程目录进入原生壳后的第一层安全边界：Electron 与 Tauri 能否接收原生侧预授权的绝对目录，完成存在性、目录类型、卷根、canonical root 和重解析根校验，同时继续只向 renderer/WebView 暴露相对 `ProjectFileStore` 操作；每次 read/write/replace/remove 前还必须逐段拒绝已存在的 junction/symlink，不能跟随到 grant 根外。

本 Spike 通过测试启动参数 `--project-root=<absolute>` 模拟原生选择器已批准的目录。绝对路径只由主进程/Rust 读取，没有进入 preload bridge、renderer 参数、项目 JSON 或机器结果；但它仍存在于测试进程命令行，因此不等同于最终系统选择器或可脱敏诊断实现。

## 2. 明确不证明

- 没有实现最终 Windows 系统目录选择 UI、最近工程列表或 grant 持久化；
- 没有证明逐段 metadata 检查与随后打开之间不存在 TOCTOU；
- 没有使用 handle-relative I/O、`FILE_FLAG_OPEN_REPARSE_POINT` 或目录 handle 约束最终打开；
- 没有两个独立 writer PID、异常退出陈旧锁接管或真实强杀证据；
- 没有证明只读目录、权限撤销、磁盘不足、目录项断电耐久或 WIN-L；
- 因此 WS-06 未前进，WS-07 仅获得探索性部分证据，CL-03 状态不变为“通过”。

## 3. 实现边界

两个候选新增等价 `createGranted/create_granted` 入口：

1. 路径必须为绝对路径；
2. 拒绝卷根、缺失目标和非目录目标；
3. canonical path 与授权输入规范化后必须相等，拒绝 junction/symlink 根；
4. grant root 不归验证宿主所有，`projectReset` 必须返回 `GRANT_RESET_REJECTED`；
5. cleanup/退出不得删除用户 grant root；
6. 每个逻辑路径仍执行 portable 规范路径检查；
7. 每个已存在路径段执行 `lstat` / `symlink_metadata`，发现重解析点返回 `REPARSE_POINT_REJECTED`；
8. renderer 仍只持有 `WindowsHostV1`，看不到 grant root。

`security-profile.json` 与根架构审计同步冻结 `native-only-canonical-directory` 和 `deny-every-existing-segment`，防止后续静默移除。

## 4. 真实 Windows Junction 对抗

`tools/run-cl03-windows-grant-audit.mjs` 作为外部 supervisor：

1. 创建 grant root 与根外目录；
2. 在根外写入不可读取的固定正文；
3. 在 grant root 内创建指向根外目录的真实 Windows junction；
4. 分别启动 Electron 主进程和 Tauri release EXE；
5. 只传相对路径 `linked/secret.txt` 给宿主审计入口；
6. 两者必须在读取正文前返回 `reparse-rejected`，退出码 0；
7. supervisor 删除自己创建的 fixture，不输出绝对路径或正文。

机器结果：

```json
{"schemaVersion":0,"electron":{"exitCode":0,"rejected":true},"tauri":{"exitCode":0,"rejected":true},"status":"PASS"}
```

Electron Node 单测另验证 canonical grant 可读但不可 reset/cleanup 删除，卷根/缺失/文件目标拒绝，重解析根与子 junction 拒绝，共 3/3。Rust locked tests 为 7/7，验证卷根、grant 保留、reset 拒绝及既有安全/VM 条件。当前 Rust 测试进程缺少自行创建目录 symlink 的 Windows privilege；真实 junction 由外部 Node supervisor 创建并交给两个 release 宿主验证，因此没有把 privilege-limited 分支作为唯一证据。

## 5. 审计发现与修复

| 发现 | 根因 | 修复 | 剩余限制 |
|---|---|---|---|
| 合法 Tauri grant 被误判为 reparse root | Windows Rust `canonicalize` 返回 `\\?\` 扩展路径，输入为普通盘符路径 | 比较前统一分隔符、大小写并移除扩展路径前缀 | UNC、大小写敏感目录和网络卷仍需单独矩阵 |
| Rust 无权创建目录 symlink | 当前进程没有 Windows `SeCreateSymbolicLinkPrivilege` | 外部 Node supervisor 创建 junction，两个真实宿主只负责防御 | 正式测试设备仍需登记开发者模式/权限状态 |
| 组合命令吞掉前段 `cargo test --locked` 失败 | PowerShell 最终退出码来自后续成功命令 | 后续证据命令逐段检查 `$LASTEXITCODE` 并立即停止 | CI 应拆成独立 steps，不能依赖复合命令末尾状态 |
| 原计划同轮证明跨进程锁 | 未先关闭 grant/reparse 会让双进程测试本身存在越界风险 | 本轮按 WS-07 红线收紧为 grant/reparse 前置 | Spike 04 才允许引入外部双 PID supervisor 与锁恢复 |

## 6. 回归与容量

- 全仓常规测试：63 files / 419 tests；
- Rust：7/7，且 `--locked` 通过；
- 根 typecheck、全部应用 build、architecture、script performance、asset performance：全部 PASS；
- 外部 junction 双壳审计：PASS；
- 共享 Web：98,198 B，未因 grant 增长；
- Electron host JS：31,375 B；
- Tauri release EXE：8,424,960 B。

容量仍不是安装包或签名产物，只用于增量观察。

## 7. 需求对齐与下一步

本轮继续风险优先路线，没有增加编辑器 UI，也没有开始正式产品壳。它把 Spike 02 的 app-private 文件语义推进到“原生预授权目录不泄露给 renderer，明显重解析路径双壳均拒绝”。

下一轮应建立外部双进程 supervisor 和候选各自的原生锁协议：进程 A 持有 grant 写租约时 B 只能只读/held；A 正常释放后 B 获得更大 fencing token；A 被强杀后必须经过可审计的 stale-owner 判定和原子接管，且旧进程/旧 token 永远不能再次写入。完成后再将真实 renderer/main 强杀接到 WAL 各阶段，不能把同进程内存 lease 继续当 WS-06 证据。

## 8. 复现命令

```powershell
npm.cmd run build --workspace @world-studio/windows-shell-conformance
npm.cmd run build:tauri --workspace @world-studio/windows-shell-conformance
npm.cmd run audit:grant --workspace @world-studio/windows-shell-conformance
cargo test --locked --manifest-path apps/windows-shell-conformance/src-tauri/Cargo.toml
npm.cmd run check
```
