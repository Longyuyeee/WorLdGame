# N50-E5 Player Web 宿主生命周期审计

> 日期：2026-08-27
> 分支：`codex/n50-e5-player-host-lifecycle`
> 基线：N50-E4 最终头 `9f5186c`
> 授权：`RA-N21-009`，仅 N50 Engineering
> 当前判定：实现、真实浏览器差异复测、本机完整门和远端 Windows / Node 22 门均通过，N50-E5 Engineering 关闭。N50 Product Acceptance、N51/N52、Android 实体包、M1 与发布继续阻断

## 1. 冻结目标与边界

E5 只关闭正式 Player Shell 的宿主嵌入和可见性生命周期：Web 宿主把 `document.visibilityState` 映射为 `active/suspended`，Shell 在暂停时冻结输入、系统 Effect 推进和媒体，在恢复时继续同一个 Core，在卸载时释放媒体引用，重挂载时建立 fresh Core。它继续消费 E1–E4 的正式 Compiler/Runtime/Host，不增加剧情解释器。

本步不做持久 Save/Load、History、Auto、Skip、Back/Forward、Gal Settings、Windows/Android 正式壳或构建发布；这些分别属于后续 N50 有序切片、N51/N52 与 N80+。真实浏览器 pointer 和媒体节点不等于物理触屏、手柄或真人验收。

## 2. 实现事实

- 新增 `WebPlayerHost`：默认监听真实 `visibilitychange`，也允许未来宿主以 `activityOverride` 注入等价平台状态。
- `PlayerShell` 新增 `PlayerHostActivityV1 = active | suspended`；Core 状态、Compiler artifacts 和 Runtime Host snapshot 不因暂停而重建。
- suspended 时不注册键盘/手柄消费，不允许 animation end 自动完成 awaited Effect；全屏现代化遮罩阻止 Player pointer，宿主恢复/卸载操作仍可用。
- 每个 audio bus 标记 `shouldPlay/playerPlayback`；暂停调用真实 `pause()`，恢复只对正式 Stage 标记 playing 的 bus 调用 `play()`，拒绝恢复 idle/removed bus。
- audio ref 在 null callback 删除 bus；卸载只暂停仍实际播放的节点，避免保留 detached DOM/media 引用。
- `?demo=host` 提供暂停/恢复、卸载/重挂载的显式宿主验证入口；默认、媒体、恢复和工程替换入口统一改由 `WebPlayerHost` 承载。
- Player Shell package 加法契约升至 `0.4.0-n50`；portable Player Core 仍为 `0.3.0-n50`，因为本步没有改变剧情 Core 协议。

## 3. 预期—首次实际—修正

| 检查 | 冻结预期 | 首次实际 | 修正与复测 |
|---|---|---|---|
| Golden 结局 | 测试预期 `Media Ending` | 正式 Compiler/Runtime 实际为 canonical `Curtain` | 修正测试预期，不改产品数据；路线通过 |
| 卸载清理 | 所有引用都调用 pause | 已 paused 的 jsdom 节点产生 6 条 unsupported pause 噪声 | 只暂停 `paused=false` 的真实活动节点；定向门无噪声 |
| bus 引用释放 | removed bus 不可恢复 | 初版 null ref 未删除 Map 中的 detached audio | null callback 删除 bus，新增移除后 suspend/resume 的 play/pause 均为 0 反例 |
| 浏览器暂停键盘 | 在遮罩上发送 Space | 控制接口拒绝对未聚焦非输入 locator 派键 | 不冒充通过；DOM 自动化覆盖冻结/恢复，浏览器只登记成功的 pointer、媒体和生命周期 |
| 移动布局 | 390×844 无横溢出且宿主操作 ≥44px | 实际 document `390/390`，舞台/遮罩 `390×844`，两按钮均 48px | 零差异 |

原始实际值见 [player-host-lifecycle-browser.json](../evidence/n50/player-host-lifecycle-browser.json)。

## 4. 自动化、真实浏览器与完整门

- N50 聚合：`4 files / 22 tests`；新增 visibility 映射、暂停输入/媒体、恢复同 Core、detached bus 释放反例。
- 桌面真实浏览器：active presenting 时 BGM/Voice 均 `paused=false/playing`；suspended 后 status 仍 presenting 且两轨 `paused=true/suspended`；恢复后两轨 `paused=false/playing` 且 currentTime 前进。
- 卸载后 `.player-shell=false`、audio count `0`；重挂载后为 `title/active`、audio count `0`，没有继承旧 presenting 会话。
- 390×844：实际 viewport `390×844`、document `390/390`、舞台和暂停遮罩 `390×844`、宿主按钮 `48/48px`；视觉检查保持现代多彩层次和清晰暂停语义。
- 干净 production preview：1280×720 完整暂停→恢复→卸载→重挂链通过，最终只有一个 main、无 createRoot 页面错误文本，preview terminal 无 React error。
- 本机 `npm run check` 退出 0：普通回归 `141 files / 804 tests`，autosave `2.81s`，重型 VM `5/5`、核心测试 `46.76s <90s`，16 workspace build、架构、Script `13/13`、Route `9/9`、Asset `4/4` 全绿；Route P95 `104.42ms <500ms`。
- Player production build：CSS `11.22/3.18 kB`、JS `305.50/96.95 kB`（raw/gzip）。增量来自宿主状态、暂停 UI 与验证入口，不登记为 N80 包体结论。
- 实现头 `8137784` 的 Draft PR #88 Windows / Node 22 完整门 run `33043581781` / job `98422396914` 用时 `11m58s` 并绿色：普通回归 `141/804`、N50 `22/22`、N42 `151/151`、重型 VM `5/5` 且 `67.313s <90s`、autosave `4.153s`；Route P95 `133.25ms <500ms`、Lazy Route Structure `303.73ms <500ms`、Global Lazy Index `284.39ms <500ms`；Player build CSS `11.22/3.18 kB`、JS `305.50/96.95 kB`。远端没有缩减规模或放宽预算。

## 5. 需求对齐与下一步

E5 直接推进 N50“同一 Player Core 被未来三宿主使用”的前置稳定边界，并改善用户要求的运行稳定、资源释放、移动安全区和现代暂停反馈。没有复制 Runtime、没有把 Web 响应式冒充 Android，也没有进入 N51/N52，方向对齐。

N50-E5 Engineering 已由本机、真实浏览器和远端实现头共同关闭。下一步仍只能在 N50 内冻结一个剩余 Player Shell 小切片；N21 `0/1`、N23 `0/2`、实体触屏/手柄、全部 Product Acceptance、N51+、Android 实体包、M1 Stable 与 Public Release 持续 fail closed。
