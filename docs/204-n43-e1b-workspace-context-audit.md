# N43-E1b 统一工作区上下文与保存重开审计

> 日期：2026-08-26
> 分支：`codex/n43-e1b-workspace-context`
> 直接基线：`codex/n43-e1-workspace-modes`
> 授权：`RA-N21-008`，仅覆盖 N43 Engineering
> Draft PR：#76，base `codex/n43-e1-workspace-modes`
> Windows CI：run `32920741797` / job `98033699049`，6 分 49 秒，绿色
> 状态：实现、自动化、真实 Chromium、本地工程门与远端 Windows / Node 22 完整门均通过
> 判定：治理 #201 定义的 N43-E1 Engineering 已关闭；N43 总体、Product Acceptance、N50+、M1 Stable 与发布仍阻断

## 1. 冻结目标与事实边界

E1b 只关闭一个问题：工作模式和编辑视图切换后，当前场景、当前 stable-ID 语句、Inspector 对象和创作态 Runtime 位置必须来自同一份可保存、可恢复的工作区上下文。它不新增第二份 Story、Selection、Runtime 或 Revision，也不把编辑器定位状态冒充正在播放的 Runtime 会话。

版本化上下文 `worldStudioWorkspaceContext` 保存：

- `workspaceMode` 与 `editorView`；
- `sceneId` 与 `statementId` 两个 Canonical stable ID；
- 协议版本 `1`。

Selection、Inspector 与创作态 Runtime 投影均由这四项事实派生。上下文写入 `ProjectSnapshot.preservedFields`，不提升工程 schema，并保留其他插件/未来扩展字段。恢复遇到不存在的 Scene/Statement、损坏数据或尚未开放的未来模式时 fail safe，回到当前工程的安全默认上下文。

Production、Debug & QA、Mobile Focus 继续 disabled；E1b 没有为它们创建空壳页面。保存重开也不宣称恢复进行中的 Playable Runtime 栈、History、媒体播放头或 transient effect。

## 2. 实现与自动化证据

- `apps/editor/src/workspace-context.ts`：创建、持久化、验证、恢复和单源投影；缺失 stable ID 与未来模式有显式负例。
- `apps/editor/src/App.tsx`：普通保存和备份恢复均应用统一上下文；模式、视图、Selection、Inspector、创作态 Runtime 位置暴露为可测试状态。
- `apps/editor/src/workspace-context.test.ts`：插件字段保留、三种投影同源、缺失 ID 回退、未来模式拒绝。
- `apps/editor/src/n43-workspace-context-app.test.tsx`：真实 IndexedDB 语义下完成模式/语句选择、保存、卸载、重开和精确 stable-ID 恢复。
- `tools/run-n43-workspace-context-browser.mjs`：启动真实 Vite 与本机 Chrome/Chromium，使用隔离用户目录和 CDP 真实 DOM 输入，走产品首页而非测试专页；证据写入 `evidence/n43/`。
- `npm run audit:n43-workspace-modes`：`4 files / 51 tests` 通过。

## 3. 真实预期—实际—差异—修正

最终真实路径是：产品首页 → 打开校园示例 → 进入工程结构 → 进入内容编辑器 → 选择天台对白 → 切换 Director → 保存 s1 → 整页重载回产品首页 → 从最近工程重开 → 再进入内容编辑器。浏览器为 Chrome `151.0.7922.170`、Protocol `1.3`。

| 检查 | 预期 | 首次实际 | 修正后实际 | 判定 |
|---|---|---|---|---|
| 产品入口 | 从真实 Launcher 打开/重开，不直达编辑器 | Harness 误设应用直接进入编辑器 | 改走“打开示例→结构→内容”和“最近工程→结构→内容” | PASS |
| React 输入 | 搜索并选择天台对白 | 直接赋 DOM value 未触发 React | 改用 Chrome `Input.insertText` 与真实 input/change 事件 | PASS |
| 可访问定位 | 使用稳定产品语义定位搜索框 | 误以为输入框自带 aria-label | 按 `<label for>` 的真实控件 ID 定位 | PASS |
| 页面断言 | 重开后确认产品/结构/编辑器标题 | 只检查第一个 `h2`，无法覆盖完整页面结构 | 检查全部标题并等待目标状态 | PASS |
| 单源上下文 | 保存前后三个投影完全相等 | 保存前 Inspector/Runtime 与 Selection 均为 `scn_rooftop / stmt_rooftop_001` | 重开后仍完全相同；`restoreStatus=restored`，Director 与 Sequence 恢复 | PASS |
| Revision | 模式切换不提交 Story 事务 | `r0` | 保存为 `s1`，Story Revision 仍 `r0` | PASS |
| 未来模式 | E1b 不扩大可用模式 | 3 个未来模式均 disabled | 无差异 | PASS |
| 桌面布局 | Director Preview 完整可见 | 1440×900 截图完整，无新增摊大饼 | 无差异 | PASS |
| 手机布局 | 390px 无整页横溢出，Preview 默认 16:9 | 文档宽/滚动宽 `390/390`；Preview `352×198`，比值 `1.777777…` | 无差异 | PASS |
| 浏览器错误 | console/log/exception failure 为 0 | 功能和布局通过，但 `/favicon.ico` 返回 404 | 增加内联 SVG favicon；精确复跑为 0 | PASS |
| Harness 清理 | 服务器、浏览器、临时 profile 可重复清理 | 首轮 Windows profile 清理触发 `EBUSY` 并掩盖产品结果 | 先发 `Browser.close`、等待进程，再重试删除 | PASS |

版本化证据：

- `evidence/n43/workspace-context-browser.json`；
- 桌面截图 SHA-256：`7b692b58a25466251b0639dd5f2f86b9750fdc7c6ecc10a7881ac04e75b6cb6c`；
- 手机截图 SHA-256：`fe72215fe0ca19c82756f658da0904e51da0e34a3119335836af571e7aa29c82`。

## 4. 完整工程门

2026-08-26 本地实际结果：

- N41 出口：`9 files / 49 tests`，随后 App `45/45`；
- N42 出口：`15 files / 148 tests`，随后 App `45/45`；
- N43：`4 files / 51 tests`；TypeScript project references 通过；
- 全量：通用池 `130 files / 761 tests`、App `45/45`、storage `1/1`、VM `5/5`；
- 14 workspace production build、架构审计 `93 portable / 4 adapters`、Script/Route/Asset 性能门全部通过；
- Editor build：CSS `106.64 kB / gzip 19.79 kB`，JS `910.96 kB / gzip 254.49 kB`。`>500 kB` 分包告警继续作为产品体积债，未关闭。

首次完整链在 N41 汇总中有两个用例超过固定 5 秒：`n41-sequence-mode` 与 `route-map-app`。失败只有 timeout，没有断言差异；相同代码和参数隔离复跑为 `2 files / 16 tests` 全过，随后完整 `audit:n41-sequence-exit` 为 `9/49 + App 45/45`。没有增加 timeout、删断言或缩小样本，记录为同机连续重门下的负载差异。

## 5. 需求对齐与边界

- `USP-01` / `AC-03`：E1b 关闭“模式/视图→同一 stable-ID→保存重开→Selection/Inspector/创作态 Runtime 同源”的子门；完整四视图时间同步、Debugger 和其余三模式仍未完成。
- `REQ-UX`：统一上下文和桌面/390px 真实重开进入集成；Beginner/Pro、减少动效、帧时间、键盘/触屏等价仍缺。
- `AC-11`：当前仍只有 4/7 模式可用；E1b 证明可用模式中的上下文恢复，不等于七模式均完成修改任务。
- N21/N23 真人仍分别为 `0/1`、`0/2`；开发者真实 Chromium 不能替代真人 Product Acceptance。
- M1 仍为 `0/27` 完整通过，不得宣称商业级、M1 Stable 或可发布。

## 6. 下一步

N43-E2 已于 2026-08-26 完成 Beginner/Pro 可逆渐进披露，见 [#205](205-n43-e2-progressive-disclosure-audit.md)。下一步为 E3 Motion/State 语义；Production、Debug & QA、Mobile Focus 在各自拥有真实任务闭环前保持 disabled。
