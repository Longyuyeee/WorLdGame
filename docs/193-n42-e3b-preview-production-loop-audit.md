# N42-E3b Preview 任务层级与关键帧生产闭环审计

> 日期：2026-08-25  
> 直接基线：`3eb1c87`（N42-E3a UI 壳层收敛）  
> 分支：`codex/n42-e3b-preview-production-loop`  
> 授权边界：`RA-N21-007` 仍只覆盖 N42 Engineering；未进入 N43 七模式、正式 Player、Android 或三端发布  
> 判定：右侧 Preview 的任务层级已收敛，基本角色关键帧首次取得“生产浏览器编辑→自动保存→刷新重开→正式 Runtime/Stage”完整可见证据；N42 完整时间线和 Product Acceptance 仍未关闭

## 1. 目标与偏移审计

本切片冻结两个目标：

1. 修复 Preview 将 Runtime 诊断、构建导出和播放控制永久纵向堆叠造成的“摊大饼”；
2. 补齐 N42-E3 过去缺少的生产浏览器保存、重开和正式 Runtime 可见证据。

实现没有新增平行状态：关键帧仍由 Sequence 生成 canonical stable-ID Move，Preview 与 Formal Runtime 继续消费同一权威 Script。UI 只重新安排既有能力：舞台、逐句前后步进、运行和倍率成为常驻任务；Runtime 诊断与构建导出按需披露，启动正式 Runtime 时诊断自动展开。

## 2. 预期—首次实际—修正—当前实际

| 检查 | 冻结预期 | 首次实际 | 修正 | 当前实际 |
|---|---|---|---|---|
| Preview 信息层级 | 舞台和核心播放常驻；专业诊断/构建按任务展开 | 旧页面把 Inspector、导出、Transport、Playback 永久串成单列 | 核心控制移到舞台后并形成 sticky dock；Runtime/Build 改为独立 disclosure | 默认两项均关闭；核心控制在真实 1280×720 页面可见；Runtime 启动后诊断自动打开 |
| 原生折叠标题 | 关闭时仍显示 46 px 可操作摘要 | React/jsdom 通过，但真实 Chromium 中 `<details>` 在 flex 父级下高度仅 2 px，摘要被 `overflow:hidden` 裁掉 | 为 disclosure 冻结 `flex:0 0 auto` 与 48 px 最小高度，并保留原生 summary 语义 | 实测两个关闭面板均为 48 px，summary 46 px；打开 Runtime 后高度 286.69 px |
| 关键帧写入 | 从现有 Move 生成下一 stable-ID Move | N42-E3 只有自动化/模型证据 | 在真实 N42 媒体工程输入 X=72、Y=84、scale=1.05、650ms、ease-out | 轨道由 6 步变 7 步，新步骤完整语义与输入一致 |
| 保存重开 | 自动保存后刷新可恢复同一稳定语义 | 自动保存达到 `s1`；首次刷新短暂出现旧 Writer Lease conflict | 保留 fencing/互斥，新增到期自动重试，不绕过真实活跃写入者 | 刷新重开显示“已恢复 · s1”，第 4 步仍为相同 Move；过期租约自动恢复已有测试 |
| 正式 Runtime | 从新语句启动，Inspector/Stage 与 stable ID 对齐 | 过去没有生产浏览器证据 | 重开后选中新关键帧并执行“从当前语句运行” | Runtime 当前 `direction · stmt_ui_1`、`media_stage / stmt_ui_1 #3`；Sequence 同步高亮；Stage DOM x=72、y=84、easing=ease-out |
| 预览画幅 | 默认 16:9，其他预设不受影响 | 无差异 | 不修改 viewport profile | 真实 DOM 比例 1.778；默认仍为 1920×1080 / 16:9 |
| 浏览器错误 | 真实流程 console error 为 0 | 无产品错误 | 无需掩盖或过滤 | 项目打开→编辑→保存→刷新→重开→Runtime 全链为 `[]` |
| Writer Lease 回归 | 短暂过期租约自动恢复，活跃租约仍不能被抢占 | 原来只能等待并手动点重试 | acquisition held 时按 holder expiry 安排一次受控重试；cleanup 清理 timer | 新增组件测试证明 conflict 文案和到期自动恢复；既有 fencing/store 测试保持绿色 |

## 3. 自动化、构建与性能证据

- 定向回归：`playable-preview-app.test.tsx` + `writer-lease-unmount.test.tsx`，2 files / 9 tests 全绿；
- 普通全仓首次由 `npm run check` 以 4 workers 运行：118 files / 747 tests 通过，`App.test.tsx` 的既有 Route 键盘移动用例在 5.326 秒超时；没有断言失败；
- 差异修正验证：失败文件单 worker 37/37；普通全仓 2 workers 为 119 files / 748 tests 全绿，175.51 秒；未提高 5 秒 timeout；
- 存储门 1/1，11.87 秒；VM conformance 5/5，83.07 秒，未放宽 90 秒门；
- 治理、需求、风险、真人记录 fail-closed、交付基线、PR 追踪、Golden、N30、N31 corpus、N41 scale/lazy/exit、TypeScript、架构审计均通过；
- Script 性能 10/10、Route 性能 9/9、Asset 性能 4/4 全部在冻结预算内；Dicing 总耗时 3267.71 ms < 5000 ms；
- 14 workspace production build 通过；Editor CSS 95.03 kB / gzip 17.59 kB，JS 866.46 kB / gzip 244.35 kB；既有 `>500 kB` 拆包债没有关闭；
- `npm run check` 单命令因上述一次 4-worker UI timeout 退出 1；后续按同一门槛、较低并发分拆复核全部通过。此差异保留，不伪报单命令绿色；
- `git diff --check` 在提交前执行。

## 4. 需求对齐判定

本切片直接改善“现代化、极简、动效多、平滑过渡、色彩丰富、表达清晰”和“方便编辑且保持 Naninovel/Utage 级专业性”：极简通过任务优先级实现，专业 Runtime 状态、变量、栈、诊断和离线构建没有被删减。默认 16:9、可调尺寸、逐句前后移动和倍率控制仍存在。

方向没有发生替换性偏移，但商业完成度不能上调：

- 当前仅关闭基本角色 Move 关键帧生产闭环，不等于完整多轨时间线、路径、镜头、模板或复杂转场；
- 当前 Runtime 证据仍位于 Editor，不能冒充正式 Web/Windows/Android Player；
- N21/N23 真人记录仍为 0/1、0/2；用户已说明真人无法参与，本轮只增加开发者真实浏览器证据，不替代产品验收；
- N42 Product Acceptance、N43、M1 Stable 和 Public Release 继续由 `RA-N21-007` 阻断。

## 5. 下一步

下一切片继续从冻结的 N42 Implementation 中选取最小纵向闭环，优先在“多轨 playhead/时间标尺”与“路径/镜头”之间按依赖选择，不再向同一页面无条件增加永久卡片。每一步继续执行：冻结预期 → 实现 → 自动化 → 真实工程/真实浏览器 → 记录差异并修正 → 全门 → 文档 → 推送。
