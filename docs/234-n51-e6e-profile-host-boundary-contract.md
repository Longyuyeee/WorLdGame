# N51-E6e Profile / Host 所有权边界合同

> 日期：2026-08-28
> 分支：`codex/n51-e6-p0-coverage-exit`
> 直接基线：N51-E6d 最终绿色头 `37e404c`
> 授权：`RA-N21-010`，最大节点 N51
> 当前判定：实现头同头 Windows / Node 22 完整门绿色；E6e Engineering 关闭

## 1. 真实代码审计结论

仓库中存在三个名称相近、所有权不同的轴，不能合并为一个 Settings Profile：

| 轴 | 当前真实所有者 | 优先级 / 作用 | E6e 判定 |
|---|---|---|---|
| Settings default / project / platform | `@world-studio/gal-settings` | `default -> project -> host 选定的平台层` | 保持三层；不新增 runtime/build 第四层 |
| Story / Runtime 显式指令 | Story、Compiler IR、Runtime | 显式 Textbox、Stage 等指令高于 Settings 默认；Settings 不改写 Runtime State | 保持现有语义 |
| Compiler `debug / release` | `@world-studio/project-compiler` 的编译调用参数 | 影响 Build ID、debugSymbols 与 source map；Runtime artifacts / Story IR 保持一致 | 与 Settings 正交，不进入工程配置层 |
| Optimization Profile | N71/N80–N82 后续节点 | Quality First / Balanced / Small Download / Low Memory / Custom | E6e 不提前实现 |

Editor Preview 的 viewport preset 是编辑器本地观察状态，不是平台或构建 Profile。`PlayerShell.platform` 是可移植壳的注入点，允许合同测试消费 `windows/web/android` 平台层；正式 Web 适配器必须独占 `web`。`apps/windows-shell-conformance` 当前只验证原生受限项目存储与安全桥，不包含 Player；仓库也没有 Android Player Host。因此 Windows/Android 只能保持阻断，不能由浏览器切换 `PlayerShell.platform` 冒充实机证据。

## 2. 冻结预期与首次实际差异

先增加两个可执行合同：

1. 即使 JavaScript 或宽松类型调用方向 `WebPlayerHost` 注入 `platform: "android"`，正式 Web Host 仍必须解析 Web 层，并在 DOM 报告 `data-settings-platform="web"`；TypeScript 公共 props 也不能暴露 `platform`。
2. 版本化 `mountWorldPlayerV1` 观察值必须明确返回 `settingsPlatform: "web"`，让宿主证据可审计而不是靠调用者猜测。

首次运行 2 files / 24 tests，实际 22 通过、2 失败：Web Host 实际报告 `android` 并消费 Android quality，嵌入观察值缺少 `settingsPlatform`。失败与冻结缺口逐项一致，既有 22 项保持通过。

## 3. 修正范围

- `WebPlayerHostProps` 排除 `platform`；Web 适配器在展开调用方 props 后强制传入 `platform="web"`，因此无类型调用方也不能覆盖。
- `WorldPlayerObservationV1` 增加只读字面量 `settingsPlatform: "web"`；挂载 API 不接受平台输入，观察身份与真实适配器一致。
- 保留 `PlayerShell.platform`，只作为共享可移植壳和合同测试的显式 Host 注入点；这不代表 Windows/Android 产品 Host 已存在。
- 不修改 Settings schema、字段数、迁移、Compiler Profile、Runtime State 或 Build Profile；E6d 的 v5 / 36 Advanced / 23 Basic 保持不变。

修正后包含 Player、mount API、Compiler profile 与 Settings precedence 的 5 files / 81 tests 全绿；N50 聚合由 36 增至 37，N51 聚合由 94 增至 95。

## 4. 真实 Production Web Host 证据

`npm run audit:n51-settings-runtime-browser` 在 Chrome 151 冷 production build 上运行，沿用真实标题、Choice、路线选择、对白和 Settings 热应用链。证据新增冻结条件：9 个状态快照的 `data-settings-platform` 必须全部为 `web`。

| 冻结预期 | 实际 | 判定 |
|---|---|---|
| 9/9 快照固定 Web Host 身份 | title、热应用、waiting-choice、桌面/移动、presenting、pointer blocked 均为 `web` | PASS |
| Host 固定不破坏运行策略 | 同一 waiting-choice Core；Choice 2→0；桌面 2 列、390px 单列；ADV→bubble；pointer gate 生效 | PASS |
| 浏览器质量门 | 1440×900 / 390×844 overflow 0，console / Runtime errors 0 | PASS |

机器证据为 `evidence/n51/settings-runtime-browser.json`；两张截图与 E6d 的相同最终画面逐字节一致，说明本切片只收紧 Host 身份，没有改变呈现结果。

## 5. 本地退出门与异常审计

- tests-first：首次 22/24，预期 2 失败；修正后 24/24。
- 定向合同：5 files / 81 tests，PASS；根级 `tsc -b`，PASS。
- 聚合：N50 5 files / 37 tests，PASS；N51 10 files / 95 tests，PASS。
- 普通回归：两轮均为 149 files / 886 tests，PASS；独立 App 为 45/45，PASS。
- production browser：Chrome 151，9/9 Web 身份快照，原有桌面/移动行为与错误门全部 PASS。
- 连续 `npm run check` 本机尚未登记绿色：第一轮在两个既有 Stage App 测试触发 5 s 超时，独立复现分别 1.71 s / 2.53 s 且 App 45/45；第二轮通过该处后在既有 Autosave 恢复 5 s 等待超时，独立完整 Autosave 8.18 s 且原断言通过；随后 VM corpus 在当前负载下 94.64 s 超过冻结 90 s（E6d 本机同门约 54.39 s）。没有提高超时、缩减 corpus 或放宽预算。

进程审计未发现遗留项目 Node/Vite 进程；本机已有 Chrome 会话包含多个高内存 renderer，不能擅自终止用户进程。实现头 `b7d7c5c` 推送后，干净 GitHub Windows / Node 22 同头 `npm run check` 用时 13m01s 并完整通过：N50 37/37、N51 95/95、普通回归 149 files / 886 tests、App 45/45、Autosave 4.084s、VM 5/5 且 66.748s < 90s、Route edit P95 148.26ms < 500ms、Asset dicing 3.401s < 5s、100 portable / 4 adapter 架构审计绿色。run `33151182320` / job `98783287679` 是最终工程裁决，证明本地超时来自环境负载而非实现回归；E6e Engineering 关闭。

## 6. 需求对齐与下一步

E6e 关闭的是“Web Host 不能伪装其他平台”和“build/runtime/settings profile 所有权必须分层”的工程边界，不是多平台产品验收。Windows/Android Player Host、实体设备生命周期、图形性能、输入与包体证据仍不存在；`apps/windows-shell-conformance` 也不得提升为正式 Player Host。

下一切片只能进入 **N51-E6f 总出口审计**：逐项重查 P0 矩阵、字段覆盖、文档、真实 Web 证据与未完成边界。E6f 仍不能凭 Web 证据解除 Windows/Android、N52、M1 Stable 或 Public Release 阻断。
