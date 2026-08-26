# N50-E1 正式 Player Core 与最小共享 Shell 审计

> 日期：2026-08-26  
> 分支：`codex/n50-e1-player-core`  
> 基线：N50 治理最终头 `9ebb859`  
> 授权：`RA-N21-009`，仅 N50 Engineering  
> 判定：E1 Engineering 候选完成；N50 Product Acceptance、N51+、三端发布宿主、Android 实体包、M1 与发布继续阻断

## 1. 本步目标与边界

E1 关闭首个正式玩家纵向断点：`Canonical Project → N30 Project Compiler → N31 Runtime → N32 portable Runtime Host → Player Core snapshot → 最小共享 Player Shell`。新增 `@world-studio/player-core`，只依赖 `project-domain`、`project-compiler`、`runtime` 和 `runtime-host`；架构审计同时扫描其生产源码，禁止 DOM、React、平台壳、文件系统、墙钟和环境随机数进入 Core。

共享 `apps/player-shell` 只用于 N50 产品界面和 production-browser 工程验证，不是 N80 `apps/player-web`、N81 Windows 或 N82 Android 发布宿主。它没有复制剧情推进逻辑，也没有导入 `story-core` / `StoryStatement` 解释器。标题、开始、对白/旁白、选择、结局和错误页全部来自 Player Core snapshot；Effect/Barrier 保持正式 Runtime Host 边界，不在 UI 中猜测完成。

E1 不实现继续游戏、存档槽、历史、设置、Auto/Skip/Back/Forward、完整媒体 Adapter、手柄、三端宿主或发行构建；这些仍按 N50 后续切片、N52 与 N80–N82 执行。

## 2. 实现事实

- Core 启动即以 release profile 编译 Canonical Project；编译错误直接进入结构化错误页，`buildId=null`，绝不回退旧 `playable-web-export.ts`。
- Start 使用 Compiler `buildId` 创建确定性 Runtime State；标题前不伪造 Runtime State。
- Runtime 的 dialogue/narration/choice/wait/ending 是唯一可见剧情边界；direction Effect 交给 portable Runtime Host，并继续运行到下一可读边界。
- Choice 输入绑定 Runtime pending request、execution、revision、logical sequence 和 instruction；不存在的 option fail closed。
- snapshot 明示 Player Core、Compiler、Runtime、Runtime Host、Project、Build 身份，并提供 Runtime State Hash 与 Runtime Host Snapshot Hash。
- 共享壳支持按钮/触控和 Enter、Space、数字键等价路径；触控目标不小于 52px，CSS 包含 safe-area 与 reduced-motion 规则。
- 对话显示名从 Canonical Character 映射；Runtime snapshot 保留 stable speaker ID，UI 不泄露技术 ID。

## 3. 真实预期—首次实际—修正

| 检查 | 冻结预期 | 首次实际 | 差异与修正 | 复测 |
|---|---|---|---|---|
| Benchmark 正式启动 | 两个 Direction 经 Host 后到首句旁白 | 首次进入 `error`：`MISSING_VARIABLE promise_state` | 旧 S0 Fixture migration 不带变量；测试/演示装配显式把旧 Fixture 变量恢复成 Canonical Variable Document，不放宽 Compiler | 首句 `benchmark_opening_narration_text`，Host operations `2` |
| 错误工程 | fail closed，含 `MISSING_ENTRY_SCENE` | 实际同时返回 5 条完整结构诊断 | 测试改为要求包含关键诊断，不错误要求数组只有一项 | `buildId=null`，错误页通过 |
| React 集成 | 单一 React 19.2.8 | 首次壳测试出现 duplicate React / invalid hook call | 壳依赖由 19.2.4 对齐仓库 19.2.8；补 Vite CSS 与 jest-dom 类型 | `2 files / 7 tests` 通过 |
| 手机角色名 | 显示“绫” | 首次 production screenshot 显示 `benchmark_aya` | 从 Canonical Character `displayName` 映射，保留 ID 作为缺失显示名回退 | 实际显示“绫” |
| 桌面 16:9 | 默认舞台 16:9、无横溢出 | 1280×720 下舞台 `1180×663.75`，overflow `0` | 零差异 | PASS |
| 390×844 | 安全区、无横溢出、触控 ≥44px | 舞台 `390×844`；开始 `180×52`；选择 `362×56`；对话 `362×188`；overflow `0` | 零差异 | PASS |
| 指针路线 | 开始→14 个可读边界→Choice→第一路线 | 状态序列 14 个 `presenting` 后 `waiting-choice`；点击第一项进入 departure 对白 | 零差异 | PASS |
| 键盘路线 | Enter/Space/数字键与指针同构 | Enter 开始、14 次 Space 到 Choice、数字 2 进入 platform 对白 | 零差异 | PASS |
| 可访问性/console | 标题、区域、按钮、Choice group 有名称；0 warn/error | DOM snapshot 名称完整，console `[]` | 零差异 | PASS |

## 4. 定向测试与构建实际值

- `npm run audit:n50-player-core`：`2 files / 7 tests`，覆盖 Core 正式身份、双路线、确定性 Hash、Benchmark Host、Compiler fail-closed、非法 Choice、壳指针/键盘输入。
- `npm run typecheck`：通过。
- `npm run audit:architecture`：`95 portable / 4 adapter files` 通过；新增 Player Core 同源保证。
- Player Shell production build：HTML `0.47/0.30 kB`、CSS `5.98/2.04 kB`、JS `283.90/89.16 kB`（raw/gzip）。这是工程壳体积，不是 N80 发布包预算结论。
- 完整单链首次在 ordinary `test:parallel` 得到 `138/139 files`、`786/787 tests`：唯一既有 N41 测试为 `5.35s >5s` 超时；同文件隔离原命令 `2/2`、测试 `2.87s`，完整 ordinary 原命令第二次 `139/139 files`、`787/787 tests` 通过，未修改 5 秒 timeout。
- storage 在累计链首次未于 5 秒 wait 窗口出现 `已恢复 · s3`，总测试 `14.42s`；隔离原命令 `1/1` 通过，总测试 `5.73s`，预算未放宽。
- 冻结 VM 在累计链首次核心 `92.761s >90s`；隔离原命令 `5/5`，核心 `78.80s <90s`。10,000 seeds/20,000 replays/40 chunks 与 digest 均未改变；远端 Windows / Node 22 仍须最终裁决。
- 其余本机门：Runtime `59/59`，正式 corpus 总墙钟 `24.977s`；N43 模型 `10/25` 与七项集成、App `45/45`；全部 production build、`95 portable / 4 adapter` 架构、Script `13/13`、Route `9/9`、Asset `4/4` 均通过。
- 性能实际：Route 编辑 P95 `343.75ms <500ms`，Lazy Route `331.95ms <500ms`，Global Lazy Index `333.90ms <500ms`；Dicing Atlas `2071.74ms <3000ms`、总计 `3581.52ms <5000ms`、净节省 `85.83%`。
- 远端 Windows / Node 22 证据在本分支提交后记录；未完成前 E1 只保持候选状态。

## 5. 需求对齐与未解除门

本步直接纠正“正式 Runtime 已存在但正式 Player 不存在”的长期偏移，使 REQ-RUNTIME、N32 跨宿主前置和 N50 Goal 开始进入产品链。它没有转向新的剧情模型，反而通过 package dependency、架构扫描、身份 snapshot 和错误项目证明旧平行解释器不能成为正式 Player。

仍未解除：N21 `0/1`、N23 `0/2`、全部 Product Acceptance、Editor↔Player 媒体视觉 Golden、真实媒体 Adapter、Save/History/Settings 玩家 UI、Web/Windows/Android 正式宿主、APK/AAB、签名、安装、M1 Stable 与 Public Release。自动化和开发者浏览器操作不计真人验收。

## 6. 下一步

远端完整门绿色后关闭 E1 Engineering。N50 后续必须继续在同一 Player Core 上切片，不得另建宿主剧情逻辑；下一切片优先补齐正式 Stage/Media presentation adapter 与 Player 可见 Effect 生命周期，再继续标题/继续/错误恢复等 Shell 能力。N51 Gal Settings 仍禁止开始。
