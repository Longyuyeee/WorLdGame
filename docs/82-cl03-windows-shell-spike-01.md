# CL-03 Windows 壳探索 Spike 01：双壳同源 VM 自执行

> 日期：2026-08-13
> 状态：探索性通过；CL-03 仍未通过，Windows 壳仍未选型
> Source Revision：`7d5e606`
> 基线：`bundle.cl04.spike14.v0` / `d67631d6aaf36157501c7328b2d6486fd70c0dfc98493c3844c61dfbecc16f21`

## 1. 本轮要证明与明确不证明的内容

本轮只验证 CL-03 的第一个平台前置假设：同一份可移植前端产物能否分别在 Electron/Chromium 与 Tauri/WebView2 中直接执行 CL-04 Conformance Bundle，并通过版本化、最小权限的 `WindowsHostV0` 把 Observation 交给原生壳校验。Observation 必须由各自 WebView 自执行生成，不得由 Node CLI 代跑或转发。

本轮不证明完整 Windows 编辑器、系统目录选择、`ProjectFileStore`、WAL/备份/恢复、单写者、媒体导入、安装器、签名更新、回滚、卸载、便携版、诊断包、WIN-L 性能/内存或 WS-01–WS-18 全矩阵。以上任何一项都不能因本轮通过而自动改变状态。

## 2. 实现边界

- 新增 `@world-studio/windows-shell-conformance`，共享一份 Vite Web 产物；
- Electron 43.4.0 使用隐藏 sandboxed `BrowserWindow`，只暴露 `WindowsHostV0.submitConformance`；
- Tauri CLI 2.11.4 / API 2.11.1 / Rust `tauri` 2.11.5 使用同一 Web 产物，只注册 `submit_conformance`；
- 两边均验证窗口/发送者、2 MB 载荷上限、固定 Bundle 关键字段和结果；
- Electron 禁止权限、外部导航、新窗口、HTTP/HTTPS 请求、Node integration 与 DevTools；
- Tauri 不启用 Shell、Process、File System 插件，CSP 限制资源，导航只允许 `tauri:` 或精确的 `tauri.localhost` 应用映射；
- Domain、Compiler、Project Format 与 VM 核心不依赖 Electron/Tauri，架构审计增加对应回归项。

安全配置跟随仓库已登记的 Electron Security Checklist 与 Tauri v2 Capability/CSP 官方资料；本 Spike 的配置快照在 `apps/windows-shell-conformance/security-profile.json`。

## 3. 可复现工具链与环境

| 项目 | 本轮值 |
|---|---|
| Node / npm | 25.2.1 / 11.6.2 |
| Electron | 43.4.0，npm 精确锁定 |
| Rust / Cargo | 1.93.1 / 1.93.1，`stable-x86_64-pc-windows-msvc` |
| Tauri | CLI 2.11.4；API 2.11.1；Rust crate 2.11.5；`Cargo.lock` 冻结 |
| WebView2 | Evergreen 151.0.4129.72/78 在本机检测到；运行使用系统已安装 Runtime |
| OS / CPU / RAM / GPU | Windows build 26200；Ryzen 7 5800H；约 40 GB RAM；RTX 3060 Laptop |
| 证据资格 | `exploratory`；该开发机不是 CL-01 登记的 WIN-L |

Electron 43 不在依赖安装阶段自动下载运行时，本轮显式使用 `npm run install:electron-runtime --workspace @world-studio/windows-shell-conformance`。代理环境下需设置 `ELECTRON_GET_USE_PROXY=true`，这只是工具链准备，不进入产品运行时。

## 4. 执行结果

### 4.1 共享 Web 与宿主构建

```text
Shared Web: 80,056 bytes（JS gzip 20.22 kB）
Electron host JS: 12,061 bytes
Electron unpacked runtime: 364,284,120 bytes（不是最终安装包）
Tauri release EXE: 8,406,528 bytes（不是最终安装包）
```

这些数字仅用于早期方向判断。它们没有包含相同签名、安装器、更新器、资源集或安装后占用，因此不能直接用于 CL-03 评分，也不能宣传为最终包体。

### 4.2 双壳 Observation

| 结果 | Electron | Tauri/WebView2 |
|---|---|---|
| hostId | `host.windows.electron` | `host.windows.tauri-webview2` |
| Spike 10 corpus / trace | `6b0b…491f` / `9a2e…2738` | 相同 |
| Spike 11 suite | `3993…94cc` | 相同 |
| Spike 12 | 10,000 seeds；20,000 replay；0 failed；`7709…e048` | 相同 |
| Spike 13 suite | `fdf…fb26` | 相同 |
| 报告 / 退出码 | `match` / 0 | `match` / 0 |

宿主 ID 是预期差异；`observation.result` 的记录数和全部摘要一致。Tauri 结果由 release EXE 中的 WebView2 自执行生成，Electron 结果由 sandboxed renderer 自执行生成。

### 4.3 拒绝与静态审计

- Electron 注入缺失 Observation 的载荷：`invalid-payload`，退出码 64；
- Rust 单元测试：精确 Observation 接受，缺失 Observation 与失败种子伪造均拒绝，3/3 通过；
- 架构审计：portable core 未新增平台依赖；Electron/Tauri 安全配置与最小桥接检查通过；
- Tauri `cargo test --locked` 通过；Electron/Tauri release 构建通过。

## 5. 本轮发现并修复的问题

| 发现 | 根因 | 修复 | 剩余风险 |
|---|---|---|---|
| Electron 成功报告后又退出 70 | renderer 提交后退出与 `loadFile` Promise 结束发生竞态 | `completed` 成为单向终态，后续 rejection 不得覆盖结果 | 后续崩溃/重载仍需 WS-10 注入 |
| Electron 首次启动卡住 | Electron 43 包已安装但二进制未下载 | 增加显式 runtime 安装脚本和代理说明 | CI 缓存、离线镜像与校验仍未设计 |
| Tauri 首次构建失败 | Windows Resource 强制需要 `icons/icon.ico` | 保留可审计 SVG 源并由官方 CLI 生成派生图标 | 正式品牌图标与签名资源不在本轮 |
| `tauri:` 单一导航白名单导致隐藏页卡死 | Windows WebView2 实际使用 `tauri.localhost` 本地映射 | 仅额外允许精确 `tauri.localhost`，其他 URL 仍拒绝 | WS-09 仍需主动导航/新窗/协议注入测试 |
| WebView2 退出时报 `Failed to unregister class ... 1412` | 发生在 `app.exit` 后的 WebView2 窗口清理 | 未忽略；记录为待复现 | 必须在 WS-10/WS-17 稳定性批次判断是否影响资源回收 |

图标生成器还输出了 libpng profile 警告，但 Electron 在未加载本 Spike 图标时也出现同类警告。当前未观察到渲染或退出码错误；后续包体/品牌资源批次仍须清洗色彩配置，不能据此宣称关闭。

## 6. 需求与路线对齐结论

本轮没有继续堆叠 Web 编辑器功能，也没有进入正式 M1 产品编码；它把 CL-04 的确定性束接入了两个真实 Windows WebView 宿主，符合纠偏后“先关闭平台与运行时高风险”的顺序。结果支持继续 CL-03，但不支持选型：

- Electron 与 Tauri 都保留为候选；
- CL-03 状态从“未开始；契约已冻结”更新为“进行中；探索 Spike 01 通过”；
- 当前开发机不是 WIN-L，所有性能、容量和稳定性结论无准入效力；
- 下一切片必须把 `WindowsHostV0` 扩展到固定测试工程的系统目录选择、`ProjectFileStore` 事务保存/WAL/备份/恢复和单写者，不得用通用文件/Shell API；
- 完成相同功能切片后，才进入安装、签名更新、回滚、诊断与 WIN-L 对照，不得因当前 EXE 较小提前选择 Tauri。

## 7. 复现命令

```powershell
npm.cmd install --ignore-scripts
$env:ELECTRON_GET_USE_PROXY='true'
npm.cmd run install:electron-runtime --workspace @world-studio/windows-shell-conformance
npm.cmd run build --workspace @world-studio/windows-shell-conformance
npm.cmd run run:electron --workspace @world-studio/windows-shell-conformance
npm.cmd run run:electron --workspace @world-studio/windows-shell-conformance -- --inject-invalid-payload
cargo test --locked --manifest-path apps/windows-shell-conformance/src-tauri/Cargo.toml
npm.cmd run build:tauri --workspace @world-studio/windows-shell-conformance
apps/windows-shell-conformance/src-tauri/target/release/world-windows-shell-conformance.exe
npm.cmd run audit:architecture
```

代理变量只在确实使用代理的环境中设置；正常 Electron/Tauri 运行不依赖该变量。
