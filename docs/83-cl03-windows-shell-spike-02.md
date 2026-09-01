# CL-03 Windows 壳探索 Spike 02：受限项目存储、WAL 恢复与 fencing lease

> 日期：2026-08-13
> 状态：探索性通过；CL-03 仍未通过，Windows 壳仍未选型
> Source Revision：`b341d15`
> 前置：CL-03 [Spike 01](82-cl03-windows-shell-spike-01.md) 与 CL-04 `bundle.cl04.spike14.v0`

## 1. 本轮 Claim 与限制

本轮验证同一共享前端能否在 Electron 与 Tauri/WebView2 两个 Windows 候选中，通过版本化 `WindowsHostV1` 使用原生受限项目存储，并复用既有 `ProjectFileStore`、WAL、SHA-256、备份和恢复语义。两个宿主必须执行相同故障顺序并生成相同结果摘要，不得把 Node CLI 的文件结果转发给 Tauri。

本轮只使用验证进程创建的 app-private 临时工程根；renderer/WebView 不知道绝对路径，不能枚举目录，也没有通用文件、Shell、Process 或外部 URL 能力。

本轮不证明：系统目录选择、用户选定工程根、junction/symlink 对抗、真实 renderer/WebView/主进程强杀、跨进程 OS lock、断电级目录项耐久、脏状态关闭 UI、安装器、签名更新、回滚、WIN-L 性能和 WS-01–WS-18 全矩阵。Promise 变更边界注入不能冒充真实进程强杀，因此 WS-03 仍未通过。

## 2. 冻结切片

`WindowsHostV1` 只公开：

- `projectRead/projectWrite/projectReplace/projectRemove`：规范相对路径、完整值、2 MB 单值上限；
- `projectReset`：仅供可抛弃验证宿主重置自己创建的临时根，不接受路径参数；
- `leaseAcquire/leaseRenew/leaseRelease`：单进程 owner 与递增 fencing token；
- `submitEvidence`：提交 VM 与存储 Observation，机器退出码为 0/2/64/70。

Electron 主进程复用 `NodeProjectFileStore` 的临时文件、文件 `fsync` 和原子 rename；IPC 操作在原生队列内重新验证 sender、路径、载荷和 active lease。Tauri Rust 宿主使用独立实现：临时文件写入并 `sync_all`，然后调用 Windows `MoveFileExW(REPLACE_EXISTING | WRITE_THROUGH)`；每个 command 验证窗口 label、规范路径、载荷和 lease。两边都诚实声明 `file-sync + best-effort directory metadata`，不声称 Windows 目录 `fsync` 已成立。

## 3. 同源场景与结果

固定工程是一幕校园门口短场景。每个候选按同一顺序执行：

1. 保存 revision 1；
2. 计算 revision 2 保存的 7 个变更边界；
3. 在第 1–7 个变更前分别注入一次失败，随后调用 `recoverProject/loadProject`；
4. 验证 revision 1 的保存前备份；
5. owner A 持有 lease 时 owner B 必须得到 `held`；
6. A 释放、B 获取更大 fencing token 后，A 的陈旧写入必须失败；
7. `../escape.txt` 必须在原生存储触碰根外之前失败。

7 个变更边界依次对应：prepared WAL、scene temp、manifest temp、staged WAL、scene replace、manifest replace、WAL remove。结果如下：

| 指标 | Electron | Tauri/WebView2 |
|---|---:|---:|
| WAL 边界 / 恢复次数 | 7 / 7 | 7 / 7 |
| 恢复为完整旧版 | 4 | 4 |
| 恢复为完整新版 | 3 | 3 |
| 损坏/不可恢复 | 0 | 0 |
| 备份 revision | `[1]` | `[1]` |
| 第二 owner 被阻断 | 是 | 是 |
| 陈旧 fencing token 被拒绝 | 是 | 是 |
| fencing token 前进 | 是 | 是 |
| 路径穿越被拒绝 | 是 | 是 |
| 结果摘要 | `69ffefe97f9c90c52d2e5795937fc5c5258e7cc281b05c1f9264f3ee1a40d73c` | 相同 |
| 正常退出码 | 0 | 0 |

CL-04 的 10,000 seeds / 20,000 replay / 0 failed 仍同时执行且两宿主摘要一致，证明加入存储桥没有污染 VM 确定性。

## 4. 安全与故障证据

- Electron 畸形最终载荷：`invalid-payload` / 64；
- Tauri 测试入口：差异 / 2，畸形载荷 / 64；机器观察到的真实进程退出码与报告一致；
- Rust locked tests：5/5，通过精确 VM Observation、失败 Observation、unsafe path 和 stale writer fencing；
- renderer/preload 不导入 `node:fs`、`node:path` 或 Node adapter；
- Electron 的 Node adapter 只在主进程，Tauri Rust 不启用通用 FS/Shell/Process plugin；
- 根架构审计确认 portable core 不反向依赖平台壳，两个安全 profile 都声明不暴露绝对路径和通用文件 API。

## 5. 审计发现与修复

| 发现 | 根因 | 修复 | 后续约束 |
|---|---|---|---|
| Tauri 字段相同却报告 difference | Rust `serde_json::Value` 重序列化键序与浏览器 `JSON.stringify` 插入序不同 | 原生端逐字段核对后比较冻结摘要；不再跨语言临时重算非规范 JSON | 下一协议版本必须抽出共享 canonical JSON，禁止依赖对象键序 |
| Tauri `app.exit(2)` 实际进程返回 0 | 框架退出请求未把验证结果可靠传播给父进程 | 清理临时根、刷新 stdout 后由验证 EXE 明确 `process::exit` | 该方式只属于证据 Harness；产品壳应采用正常生命周期和独立 runner |
| 旧 lease 仍保存在 renderer adapter | renderer 本地引用不等于授权 | 每次 mutation 在原生串行临界区重新核对 owner/token/expiry | 跨进程必须升级为 OS lock 或原生持久化 lease，不能沿用内存 lease |
| app-private 根没有 junction/symlink 来源 | 本 Spike 不允许用户或 renderer 创建目录项 | 只证明规范路径和根内自建目录 | 接入用户选定目录前必须增加 canonical handle/junction/symlink 对抗 |

## 6. 容量观察

| 产物 | Spike 01 | Spike 02 | 解释 |
|---|---:|---:|---|
| 共享 Web | 80,056 B | 98,198 B | 增加 portable persistence、WAL 场景和 V1 bridge |
| Electron host JS | 12,061 B | 28,999 B | 增加 Node store、lease 与 IPC 校验 |
| Tauri release EXE | 8,406,528 B | 8,409,600 B | 增加 Rust store 与 Windows 原子替换 |

以上仍不是安装包、签名产物或安装后占用，只能作为变化观察，不能用于 CL-03 候选评分。

## 7. 需求对齐与下一步

本轮继续执行纠偏后的 Wave A 风险关闭，没有扩展 UI，也没有进入 M1 产品壳。它把“VM 能在两个 Windows WebView 自执行”推进到“同一 ProjectFileStore/WAL/备份场景在两个原生存储实现上得到相同结果”。这支持继续两个候选，但仍不支持选型。

下一切片应实现受控系统目录选择和固定用户工程：以不暴露绝对路径的 project grant/handle 替换 app-private 临时根，并对绝对路径、`..`、Windows device name、junction/symlink、第二进程、renderer/WebView 强杀、主进程强杀和脏状态关闭执行 WS-02–WS-10。跨进程单写者和目录元数据耐久没有可靠方案前，不得进入安装更新评分。

## 8. 复现命令

```powershell
npm.cmd run build --workspace @world-studio/windows-shell-conformance
npm.cmd run run:electron --workspace @world-studio/windows-shell-conformance
npm.cmd run run:electron --workspace @world-studio/windows-shell-conformance -- --inject-invalid-payload
cargo test --locked --manifest-path apps/windows-shell-conformance/src-tauri/Cargo.toml
npm.cmd run build:tauri --workspace @world-studio/windows-shell-conformance
apps/windows-shell-conformance/src-tauri/target/release/world-windows-shell-conformance.exe
apps/windows-shell-conformance/src-tauri/target/release/world-windows-shell-conformance.exe --inject-difference
apps/windows-shell-conformance/src-tauri/target/release/world-windows-shell-conformance.exe --inject-invalid-payload
npm.cmd run check
```
