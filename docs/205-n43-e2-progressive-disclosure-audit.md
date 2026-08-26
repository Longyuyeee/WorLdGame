# N43-E2 Beginner/Pro 可逆渐进披露审计

> 日期：2026-08-26
> 分支：`codex/n43-e2-progressive-disclosure`
> 直接基线：`codex/n43-e1b-workspace-context`
> GitHub：Draft PR #77（base `codex/n43-e1b-workspace-context`）
> 授权：`RA-N21-008`，仅覆盖 N43 Engineering
> 状态：实现、自动化、真实 Chrome、构建、架构与性能门通过；本机单链负载差异保留给远端 Windows / Node 22 裁决
> 判定：E2 Engineering 完成；N43 总体、Product Acceptance、N50+、M1 Stable 与发布仍阻断

## 1. 冻结目标与禁止范围

Beginner/Pro 是同一工程、同一 Canonical Story、同一 Selection/Context 上的可逆布局披露，不是两种工程格式或能力阉割版。

- Beginner 保留场景、对白卡、基础对白操作、Inspector 和 16:9 Preview；收起全局搜索、资源/工程状态卡、批量结构工具、Runtime trace 与复杂 Stage Track。
- Beginner 只展示 Writer、Director、Quick Start 和 Sequence；如果用户切换前已经位于 Flow/Script，则当前高级模式/视图继续可见且保持激活，不强制跳转或丢失上下文。
- Pro 恢复全部 7 个模式身份、3 个编辑视图和专业工具；Production、Debug & QA、Mobile Focus 仍然 disabled。
- 高级面板在 Beginner 下由生产 CSS 隐藏而非卸载，切回 Pro 后局部 UI 状态不因披露切换销毁。
- `experienceLevel` 作为 E1b 工作区上下文的向后兼容可选字段保存；旧快照缺失字段时安全恢复为 Pro，未知值 fail safe。Project schema 不提升。

## 2. 实现与自动化证据

- `apps/editor/src/experience-level.ts`：两级身份与“基础集合 + 当前高级上下文”可见性策略。
- `apps/editor/src/App.tsx`：现代分段开关、模式/视图过滤、上下文保存重开；切换不 dispatch Story transaction。
- `apps/editor/src/styles/app.css`：Beginner 生产显隐和桌面/移动布局；高级组件保持挂载。
- `apps/editor/src/experience-level.test.ts`：策略正反例。
- `apps/editor/src/workspace-context.test.ts`：旧上下文默认 Pro、未知 level 拒绝、字段保存。
- `apps/editor/src/n43-progressive-disclosure-app.test.tsx`：同一语句在 Beginner 编辑、Pro 恢复、Script 高级上下文保留。
- `apps/editor/src/n43-workspace-context-app.test.tsx`：Beginner 保存、租约释放、重开精确恢复，存储 UI 明确预算 5 秒。
- `npm run audit:n43-workspace-modes`：策略 `3 files / 9 tests`、两个产品闭环各 `1/1`、完整 App `45/45`，合计 `6 files / 56 tests`。

## 3. 真实预期—实际—差异—修正

真实 Chrome `151.0.7922.170` 走产品首页、示例工程、天台对白、Director、Beginner 编辑、Pro 恢复、Script 高级上下文、Beginner 保存 s2、整页重载和最近工程重开；不是测试专页或 jsdom 视觉替代。

| 检查 | 预期 | 首次实际 | 修正后实际 | 判定 |
|---|---|---|---|---|
| Beginner 密度 | 只展示基础任务入口 | 1 个视图（Sequence）、3 个模式；Stage/Search/高级 Toolbar 均 `display:none` | 无差异 | PASS |
| 不丢能力 | 隐藏而非删除 | Stage 仍 mounted；切 Pro 后 3 视图、7 模式，Stage `block`、Search `grid`、Toolbar `flex` | 无差异 | PASS |
| 真实编辑 | Beginner 能完成对白任务 | 对 `stmt_rooftop_001` 写入“留言里的星星仍在风里发亮。”，`r0→r1` | 无差异 | PASS |
| 同源上下文 | 披露切换不漂移 | Selection/Inspector/创作态 Runtime 均保持 `stmt_rooftop_001` | 无差异 | PASS |
| 已开高级视图 | Beginner 不强制跳转 | 从 Script 切 Beginner 后仍为 Script，Sequence/Script 两个 tab 保留，Script active | 无差异 | PASS |
| 保存重开 | level、文本、模式/视图和 stable-ID 恢复 | s2 重开为 Beginner/Director/Sequence，同一文本与三个投影 | 无差异 | PASS |
| 桌面布局 | 降低摊大饼且 Preview 完整 | “场景—对白—预览”三段清晰；Pro 高密度导航无溢出 | 无差异 | PASS |
| 390px | 无整页横溢出，Preview 16:9 | `390/390`，overflow 0；Preview `352×198`，比值 `1.777777…` | 无差异 | PASS |
| 浏览器错误 | console/log/exception 0 | `[]` | 无差异 | PASS |
| jsdom 视觉 | 不用 jsdom 冒充 CSS 结果 | 首轮 `toBeVisible` 忽略生产样式而误判 Stage 可见 | 组件测试改验“保持挂载”；显隐由真实 Chrome computed style 裁决 | PASS（已纠偏） |

版本化证据：

- `evidence/n43/progressive-disclosure-browser.json`；
- 桌面 SHA-256：`872b860ecb819449d2114f26898033cc5e70dd751d3f61715c113981d121331a`；
- 手机 SHA-256：`75e8f64d3ae784ac065755275621ee829f6abe5e7faf5d4ffcd8711d18a3488d`。

## 4. 测试差异与门禁审计

真实开发机同时运行用户 Chrome、编辑器开发服务器和 Codex。连续完整门暴露两类可重复性问题：

1. N43 IndexedDB 产品闭环在共享 Vitest 进程或双 worker 池中无法稳定满足 Testing Library 隐式 1 秒查询窗，但单文件及真实 Chrome 保存/重开成功。修正为每个 IndexedDB 闭环独立进程，并把保存、租约释放、重开明确约束为与正式 storage gate 一致的 5 秒 UI 预算；总用例 30 秒不变，实际隔离测试体约 2.15 秒。
2. 双 worker 通用池的旧 N13/N41/Launcher/App 用例发生漂移的 5 秒 timeout。未删测试或提高 timeout；通用池收紧为单 worker后 `130 files / 764 tests` 全过。三个旧 App timeout 用例按原 5 秒分别隔离为约 3.00、1.68、4.09 秒并通过。

最终本机组件结果：N41 `9/49 + App 45/45`、N42 `15/148 + App 45/45`、N43 `6/56`、typecheck 通过；通用 `130/764`、N43 两闭环各 `1/1`、App `45/45`、storage `1/1`。冻结 VM 在连续链为 `90.751s >90s`，保持 10k seeds、digest 与 90 秒门不变后隔离 `5/5`、核心约 `64.37s`。

因此本机不伪报单次 `npm run check` exit 0；功能/规模/预算门分别通过，最终单链由远端干净 Windows / Node 22 裁决。

14 workspace build、架构 `93 portable / 4 adapters`、Script/Route/Asset 性能全部通过。Editor build 为 CSS `108.38 kB / gzip 20.06 kB`、JS `912.48 kB / gzip 254.91 kB`；`>500 kB` 拆包债继续保留。

## 5. 需求对齐与未完成边界

- `REQ-UX`：Beginner/Pro 从“缺失”进入 Engineering 集成；渐进披露不制造第二工程格式。
- `USP-06`：专业模式保持完整工具密度，Beginner 提供清晰基础创作路径；商业作品视觉验收仍缺。
- `AC-03/AC-11`：披露切换、编辑和保存重开保持同一 stable-ID；仍只有 4/7 工作模式可用。
- `AC-12`：本切片只为新开关补 `prefers-reduced-motion`；全局可中断动效、帧时间和减少动效验收未关闭。
- N21/N23 真人仍为 `0/1`、`0/2`，M1 仍为 `0/27` 完整通过。

## 6. 下一步

进入 N43-E3：冻结全局 Motion/State 语义，完成 `prefers-reduced-motion`、可中断过渡、焦点/运行/诊断状态的非颜色单一表达和真实帧时间证据。Production、Debug & QA、Mobile Focus 在真实任务闭环前继续 disabled；E3 不扩张新面板。
