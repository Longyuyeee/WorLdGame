# N61-E7 本地化与配音 Engineering 出口审计

> 日期：2026-09-02
> 分支：`codex/n60-e1-debugger-session`
> 结论：N61 冻结的 Goal 与 Implementation 已完成，N61 Engineering 出口关闭
> 产品边界：Windows/Android 正式 Host、实体设备和三端语言状态一致性仍缺，N61 Product Acceptance 不通过
> 后续功能点：N62-E1 自动 Gallery / Replay / Music / Ending Catalog 的正式 Player 入口；当前窄范围授权仍阻断 N62 Engineering

## 1. 本次真实用户任务

目标用户是完成多语言资源配置后准备试玩的创作者。连续路径必须使用同一份工程和同一批真实文件：

1. 在 Editor Production 导入两张真实 PNG 和两段真实 WAV；
2. 把英文/简中 Voice 绑定到 `text_hello`，把简中视觉文件绑定到 `base_scene`；
3. 保存 Canonical Project，不另造 Player 专用映射；
4. 由 Compiler 直接编译该保存结果，确认 Asset Manifest 和 Localization Catalog 保留绑定；
5. 从同一 IndexedDB 读取实际 Blob 交给正式 Player；
6. Player 连续切换 `en → zh-Hans → ja`，目标资源存在时切换，不存在时回退源语言并显示原因。

这条路径由新增的 `apps/player-shell/integration/n61-editor-player-localization-handoff.test.tsx` 完整执行。它直接启动 Editor `App`、资源存储、Compiler 和 `PlayerShell`，没有复制 E5 demo 的手工 Canonical 或资源映射。

## 2. 预期、当前实际与处理

| 检查 | 预期 | 首次实际 | 处理 |
|---|---|---|---|
| Production 保存结果进入 Compiler | Voice/视觉绑定原样进入 Asset Manifest，`zh-Hans`/`ja` 进入 Localization Catalog | 完全一致；新增跨应用测试首次 `1/1` | 没有功能差异，不制造第二套适配层 |
| 同一 IndexedDB Blob 进入 Player | 英文使用基础图和英文 Voice，简中使用视觉变体和简中 Voice | 完全一致 | 保持现有 Canonical + Host media source 边界 |
| 日语文本存在但媒体缺失 | 保留日文文本，视觉和 Voice 回退英文，提示缺少 2 项 | 完全一致 | 无需修正 |
| 390×844 CJK/Ruby | 无横向溢出；Ruby 语义正确；禁则标点不落行首；触控至少 44px | 实际视口 `390×844`、overflow `0`、5 行首字符为 `黄/と/が/も/む`、Ruby `放送室/ほうそうしつ`、最小控件 `44px`、console `0` | E4 待补证据关闭，无 UI 修改 |

真实测试的职责是发现差异，不是强迫每次产生代码修改。本次首次实际已经满足预期，因此生产代码零修改；新增的是跨产品回归测试与真实移动页面证据。

## 3. 最小必要验证

- 新跨应用交付路径：`1 file / 1 test`，首次即通过；
- E4–E7 受影响路径：`4 files / 4 tests`，全部通过；
- Editor 与 Player TypeScript：通过；
- Editor 与 Player production build：通过；Editor 保留既有主包大于 500 kB 提示；
- Player production browser：真实 `390×844`，页面宽度 `390/390`、正文宽 `316px`、overflow `0`、5 行均无禁止标点行首、Ruby 与字体失败回退可见、console error/warning `0`。
- 实现 head `c0eb5a3` 的 Windows / Node 22 完整门 run `33610146493` / job `100183114863` 用时 `9m45s` 成功。

没有执行无关全仓重复测试、真人计时或额外安全审查；完整仓库范围只由上述精确 head CI 裁决。

## 4. N61 目标与实现逐项审计

| Delivery Plan N61 项 | 真实实现 | 结论 |
|---|---|---|
| Goal：稳定文本 ID 的多语言生产和运行切换 | E1/E2 Production、E3 Player、E7 同一 Canonical 交付 | 完成 |
| 源语言 / 目标语言 | E1 设置、校验、保存重开 | 完成 |
| CSV / XLSX | E2 真实双格式往返、预览与整批阻断 | 完成 |
| missing / draft / reviewed / outdated / locked | E1 文本状态；E6 媒体缺失与审阅状态 | 完成 |
| 运行时切换 | E3 文本/历史；E5 媒体/Voice；E7 创作结果直达 Player | 完成 |
| CJK / Ruby / 禁则 | E4 语义实现；E7 390×844 实际排版闭合 | 完成 |
| 字体回退 | E4 项目字体失败可见恢复 | 完成 |
| Voice Asset 映射 | E5 Player 消费；E6 stable text ID 生产；E7 跨层交付 | 完成 |

因此 **N61 Engineering 关闭**。这只关闭 Delivery Plan 中冻结的共享 Web 工程范围，不把 PRD 3.9 P1/P2 的翻译记忆、术语表、伪本地化、截图上下文、翻译平台或配音供应链冒充已完成。

## 5. Product Acceptance 与下一接续点

Delivery Plan Acceptance 要求“三端切换语言状态一致”。当前只有正式 Web Player；Windows/Android 正式产品 Host、安装包、实体设备和三端状态 Hash 尚不存在。因此 N61 Product Acceptance、REQ-L10N 总产品通过、M1 Stable 和发布继续 fail closed，不能用本次 Web Engineering 结果替代。

功能顺序上的下一点是 **N62-E1 自动附加页 Catalog 的正式 Player 入口**：从 Compiler 已有 Gallery/Music/Replay/Ending Catalog 和 Runtime 永久 Meta 出发，让玩家第一次实际打开自动生成页面。开始前需按现有窄范围授权确认 N62 Engineering 准入；真人测试继续等功能与整体 UI 收束后统一进行。
