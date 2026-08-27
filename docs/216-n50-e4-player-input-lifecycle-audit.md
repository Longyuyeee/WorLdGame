# N50-E4 Player 输入等价与生命周期恢复审计

> 日期：2026-08-27
> 分支：`codex/n50-e4-player-input-lifecycle`
> 基线：N50-E3 最终头 `f288162`
> 授权：`RA-N21-009`，仅 N50 Engineering
> 当前判定：实现、真实浏览器差异复测和本机完整门通过；远端 Windows / Node 22 门待补录。N50 Product Acceptance、N51/N52、Android 实体包、M1 与发布继续阻断

## 1. 冻结目标与边界

E4 关闭 N50 Player Shell 的下一最小切片：平台无关 intent、桌面键盘/指针与基础手柄输入协议、Choice 焦点/选中同步、结局/错误后的显式新 Core，以及宿主替换 project 身份时清除旧 Runtime/Host 会话。所有路径仍调用同一个 portable Player Core，不在 Shell 复制剧情推进逻辑。

本步不做持久存档、History、Auto、Skip、Back/Forward 或 Gal Settings；这些仍属于 N52/N51。没有实体手柄和触屏，因此自动化只能证明 gamepad edge contract，390×844 浏览器只能证明移动布局和真实 pointer click，不能登记物理设备通过。

## 2. 实现事实

- `PlayerCoreIntentV1` 冻结 `primary / select-choice / cancel / restart`，`dispatchPlayerCoreIntentV1` 成为标题启动、对白推进、选择、Effect complete/cancel、Barrier approve 和结束重启的唯一 Core 入口。
- Player Core 与共享 Shell 公共契约按加法兼容升至 package `0.3.0-n50`，Core snapshot 为 `0.3.0`；Compiler、Runtime 和 Runtime Host 身份不变。
- Shell 的按钮、全局键盘和手柄 polling 都只发上述 intent；Pointer/Keyboard/Gamepad/System/Lifecycle 以 `data-input-source` 可观察，不改变 Runtime 状态结构。
- Choice 的 ArrowUp/ArrowDown 与 D-pad/左摇杆更新同一个 selected index，并把 DOM focus 移到同一按钮；数字快捷键仍直接选择对应 option。
- 基础手柄冻结 A=primary、B=cancel、D-pad/左摇杆=前后选项，采用 rising-edge 和阈值穿越，长按不会每帧重复触发。
- Ending/Error 增加 48px 显式恢复按钮；Ending restart 创建新的正式 Core，Runtime State Hash 回到 null，Host operation 为空。
- `project` prop 以 Canonical semantic hash 判断身份：等价新对象不重置；语义改变才清空旧 Core、媒体错误、generation 和 choice selection，不会把上一工程的 `waiting-choice` 或 Host Effect 带入新工程。
- 新增 `?demo=input` 的 Branching Golden 和 `?demo=lifecycle` 宿主替换入口；它们都走 Canonical→Compiler→Runtime/Host→Player，不是平行解释器。

## 3. 冻结预期—首次实际—修正

| 检查 | 冻结预期 | 首次实际 | 修正 | 原样复测 |
|---|---|---|---|---|
| 类型/构建 | input 重构后 typecheck/build 通过 | `TS6133`：旧 `PlayerCoreState` type import 无使用 | 删除死导入，不放宽编译门 | typecheck、Player build、N50 `19/19` 通过 |
| 键盘 Golden | 页面具有 Left/Right 路线 | 默认页是五分钟 Benchmark，Left selector 不存在 | 新增显式 `?demo=input`，不改变产品默认 | Enter→ArrowDown→Right→Space→Ending 通过 |
| 390 视口 | active tab 实际为 390×844 | 首次在建 tab 前设置 override，目标仍为 1280×720 | tab 存在后设置并先读 innerWidth/Height | 390×844、document `390/390` |
| 触屏动作 | 执行真实 tap | 浏览器控制接口没有 `tap` 方法 | 不伪造；改记 390 布局真实 pointer click，物理触屏继续阻断 | 对白 `362×188`、重启 `106×48` |
| 工程替换 | 旧会话不得泄漏 | 冻结前 Shell 仅在首次 mount 建 Core | 以 project prop effect 新建 Core 并清理壳状态 | Branching `waiting-choice` → Benchmark `title/lifecycle/none` |
| production 冷启动 | 一个 React root，无 HMR 报错 | 修改 main 时 dev HMR 曾报告重复 `createRoot` | 停止 dev，完整 build 后以干净 Vite preview 冷启动 | 前后 root child=1，路线/重启通过，preview terminal 无 React error |
| project identity | 等价重渲染保留会话，语义变化重置 | 初版监听对象引用，等价 clone 也会重置 | 改用 Canonical semantic hash | 等价 clone 仍为 waiting-choice；切 Media 才回 title |

原始实际值见 [player-input-lifecycle-browser.json](../evidence/n50/player-input-lifecycle-browser.json)。

## 4. 自动化、构建与真实浏览器

- `audit:n50-player-core`：`4 files / 19 tests`，新增 Core intent、gamepad edge、键盘焦点/选择、Ending restart、project replacement，同时保留 E3 media parity/recovery。
- typecheck 通过；最终 Player production build：CSS `9.87/2.95 kB`、JS `303.33/96.28 kB`（raw/gzip）。增量来自统一输入、gamepad polling、恢复 UI 与两个显式测试入口，不是 N80 发布包预算结论。
- 桌面真实键盘：初始 `title/lifecycle`；Enter 后 `waiting-choice`；ArrowDown 使 Right 同时 `selected=true/focused=true`；Enter 后显示 `The bright route.`；Space 到 `Right` Ending；回到标题后 `status=title / hostOperation=none`。
- 真实宿主 project 替换：Branching `waiting-choice/choice visible` 切到 Benchmark 后为 `title/lifecycle/none`，旧 choice 不存在。
- 390×844 真实移动布局：document `390/390`，对白 `362×188`，重启按钮 `106×48`；输入来源为 pointer。没有把 click 写成实体触摸。
- 本机完整门退出 0：普通回归 `141 files / 801 tests`，Editor integration 全绿，autosave 用例 `5.83s`，重型 VM `5/5`、测试 `55.00s`，16 workspace build、架构和 Script `13/13` 均通过；Route P95 `124.84ms`、Route `9/9`、Asset `4/4`。
- 干净 production preview 再走完整 Right 路线并重启：`#root` 前后都只有 1 个 child，页面无 createRoot 错误文本，preview terminal 无 React error；因此开发态报错裁决为编辑 main 时的 HMR invalidation 差异，不是冷启动产品错误。

## 5. 需求对齐与剩余阻断

E4 推进 REQ-RUNTIME 的输入边界和 N50 Goal：多输入源消费同一 Core intent，Choice 焦点语义、显式 restart 与 project 生命周期不再由各 UI 私自解释。它也保持现代多彩 UI、移动安全区、44px 触控基线和无障碍 focus-visible，方向没有偏离。

未关闭内容：真实手柄/触屏、Android lifecycle、后台/前台音频、持久 Save/Load、History、Auto/Skip、Back/Forward、设置热应用、三端正式宿主。尤其 E4 的“恢复”仅指 fresh Core/project replacement，不是 N52 存档恢复。

## 6. 下一步

远端 Windows / Node 22 绿色后，E4 Engineering 才可关闭。下一步仍须在 N50 内审计正式 Player 的剩余壳能力；进入 N51/N52 必须另行获得治理授权。N21 `0/1`、N23 `0/2`、全部 Product Acceptance、Android 实体包、M1 Stable 与 Public Release 持续 fail closed。
