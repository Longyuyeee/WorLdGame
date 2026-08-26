# N43-E1 当前开发情况与最初需求对齐审计（E1a + E1b 关闭）

> 审计日期：2026-08-26
> 审计分支：`codex/n43-e1b-workspace-context`
> 审计起点：`57bccff0f0f8903673f21658305cd1df02909836`
> 远端状态：审计起点与 upstream 完全一致；Draft PR #75 最终代码头 Windows / Node 22 CI 绿色
> 审计基准：[产品战略](02-product-strategy.md)、[PRD](03-prd.md)、[产品落地计划](89-engine-product-delivery-plan.md)、[M1 追踪矩阵](90-m1-requirement-traceability.md)、[最初需求偏移审计](191-initial-requirements-alignment-and-drift-audit.md)
> 总判定：**没有发生目标替换或架构旁路；N43-E1a 模式基础与 E1b 保存重开上下文均形成真实工程闭环，治理定义的广义 E1 Engineering 已关闭。项目仍明显偏向工程底座，距离商业级 Gal 产品闭环很远。**

## 1. 当前可证实阶段

| 层级 | 当前事实 | 判定 |
|---|---|---|
| 产品主线 | 最近按产品顺序通过的节点仍为 N20；N21 真人 `0/1`，N23 真人 `0/2` | Product Acceptance 继续阻断 |
| 工程主线 | N40 Route、N41 Sequence、N42 Stage Engineering 已退出；N43-E1a/E1b 关闭广义 E1 | 工程持续推进，但不等于产品通过 |
| N43-E1a | 7 个稳定 Mode ID；Writer/Director/Flow/Quick Start 可用；其余 3 个明确禁用；模式切换保持同一对白和 `r0` | 完成 |
| N43-E1b | mode/view/scene/statement 单一上下文；Selection/Inspector/创作态 Runtime 同源；保存、整页重载和最近工程重开精确恢复 | 完成；证据见 [#204](204-n43-e1b-workspace-context-audit.md) |
| N43 广义 E1 | “模式切换→同一 stable-ID→保存重开→跨视图上下文”已有自动化与真实 Chrome 证据 | Engineering 关闭；不等于 N43 总体或 Product Acceptance |
| M1 纵向验收 | `实现中 16/27`、`验收中 2/27`、`未开始 9/27`、`通过 0/27` | 不得宣称 M1、商业级或可发布 |
| 集成 | 审计起点相对 `origin/main` 为 `0 behind / 336 ahead`；本轮文档提交会继续增加 ahead 计数；main-target Authority PR #61 仍 open Draft | 无代码分叉，但堆叠审阅风险上升 |

## 2. 最初需求重新对齐

| 最初要求 | 当前实际 | 判定 | 主要缺口 |
|---|---|---|---|
| Windows 与 Android 均可编辑 | Web Editor 工程链完整度持续提高；Windows 仍以壳/契约为主，Android Editor 未开始 | **未形成产品闭环** | Windows 正式编辑器、Android SAF/触屏/软键盘/低内存、同工程双端任务 |
| 生成 Web、Windows、Android 软件 | 有离线 Web 候选和 Windows conformance；正式 Player 未消费完整正式 Runtime，APK/AAB 不存在 | **未形成产品闭环** | N50 Player、三端 Adapter、签名/安装/升级/发布 |
| 无账户、本地优先 | Canonical Project、IndexedDB、备份、确定性 ZIP 和 Blob 搬迁存在，仍未引入账户/云依赖 | **对齐** | 正式 Windows/Android 壳离线与强杀恢复 |
| 基础 Gal 全配置 | 剧情、演出、Runtime 内核存在，但统一 Gal Settings、六类音量、消息窗/Auto/Skip/Save/History 产品 UI 未形成 | **明显滞后** | N51/N52；`REQ-GAL` 仍为唯一“未开始”的 P0 模块 |
| 相似 CG 自动切图压缩 | Dicing/Atlas/逐像素重建/Worker/预算门已具备 | **部分对齐且技术较强** | Optimization Center、三端真实收益、无收益回退和构建接入 |
| 可调快进速度 | Runtime Scheduler 已覆盖倍率与最终状态一致性 | **内核对齐、产品滞后** | 正式 Player 控件、语音/媒体策略、三端输入 |
| 每句后退和前进 | Runtime History、checkpoint、Back/Forward、分支截断已有正式内核和 Editor 实跑 | **内核对齐、产品滞后** | Player UI、存档槽、三端一致性 |
| 自动路线图 | N40 Engineering 已完成自动图、诊断、10k 窗口、编辑闭环 | **工程对齐** | Product Acceptance、玩家路线页和真人任务 |
| 自动 Gallery/Replay/Music/Ending | Compiler Catalog 与 Runtime Meta 已有 | **底层部分对齐** | N62 玩家页面、覆盖规则、Replay 隔离和三端一致性 |
| 现代、极简、多彩、强动效、图形化、专业 | N43-E1a 增加现代七模式导航；E1b 让模式/视图/对象定位可恢复，并以真实桌面/390px Chrome 复验 16:9 与无横溢出 | **方向对齐但未系统完成** | 其余三模式、Beginner/Pro、减少动效、60 FPS、任务级 UI 收敛、商业作品视觉验收 |
| 商业级生产能力 | Compiler/Runtime/Route/Sequence/Stage 底座较强 | **远未完成** | 正式 Player、Gal Settings、自动页、Optimization 产品面、三端包、双端编辑器、20–30 分钟 Benchmark、设备/发布审核 |

## 3. 偏移与风险审计

### 3.1 未发生的偏移

- 没有把目标缩减为仅 Web 或仅 Windows；Android M1 目标仍在追踪矩阵。
- 没有引入账户、收费、云同步、云构建或 iOS。
- 工作模式只改变布局和默认编辑视图；没有建立模式私有剧情或第二份 Canonical 数据。
- Compiler、Runtime、Runtime Host、Route Graph 和 Project Domain 的 portable 边界仍通过架构审计：`93 portable / 4 adapters`。
- 没有把开发者浏览器、jsdom 或 CI 冒充 N21/N23 真人证据。

### 3.2 已发现并纠正的偏移

1. **文档完成度过报（已纠正并关闭）**：#202 和 99 曾把 E1a 写成整个 E1 完成；先改为 E1a，现由 [#204](204-n43-e1b-workspace-context-audit.md)补足 stable-ID selection/context 与保存重开，广义 E1 Engineering 才正式关闭。
2. **下一步文字陈旧（已纠正）**：99 曾停在 `RA-N21-007` 和“N43 禁止进入”，后又停在 E1b；现已与 `RA-N21-008 / N43` 实际进度对齐为 E2 Beginner/Pro。
3. **产品闭环继续滞后（高风险）**：M1 `0/27`，`REQ-GAL` 未开始，正式 Player/Android/三端构建均未形成产品结果。
4. **堆叠集成风险（中高风险）**：审计起点已比 main 多 336 个提交，Authority PR #61 仍是 Draft。继续叠加会提高冲突、回归定位和维护者审阅成本。
5. **UI 摊大饼风险仍存在（中风险）**：E1a 修正顶部模式结构和两个真实布局缺陷，但大量专业工具仍集中在单页；必须通过模式任务边界、渐进披露和可恢复上下文收敛，不能仅继续增加面板。
6. **包体债（中风险）**：最近 Editor production JS 为 `910.96 kB / gzip 254.49 kB`，继续存在 `>500 kB` 警告；尚未形成按任务加载和正式 Optimization 构建闭环。

## 4. 本次真实证据

| 检查 | 预期 | 实际 | 判定 |
|---|---|---|---|
| Git 基线 | E1b 从已推送 E1a 头分出且不改写历史 | 分支直接基线为 `codex/n43-e1-workspace-modes`；E1b 以独立提交/堆叠 PR 推送 | PASS |
| 需求登记 | 50 项、10 USP、13 P0、27 AC 可审计 | `audit:requirements` PASS | PASS |
| 治理边界 | 只允许 N43 Engineering | `RA-N21-008` active，maximum N43；N50/M1/发布阻断 | PASS |
| N43 定向回归 | 七模式边界、统一上下文和保存重开不漂移 | `4 files / 51 tests` | PASS |
| N43 真实 Chrome | 产品首页→Director→保存→整页重载→最近工程重开 | `scn_rooftop / stmt_rooftop_001` 三投影零漂移；390px `352×198`，overflow 0；console 0 | PASS |
| 架构 | portable 边界无倒灌 | `93 portable / 4 adapters` | PASS |
| 远端代码头 | Windows 完整门绿色 | PR #75 最终代码头 run `32832227228` / job `97753258991`，6 分 30 秒 | PASS |
| main 集成 | Authority 已审阅合入 | PR #61 仍 open Draft；审计起点比 main 多 336 个提交 | **未完成** |
| 商业完成度 | AC-01–27 全通过 | 0/27 通过 | **未完成** |

## 5. 纠偏后的下一步

1. **N43-E2 Beginner/Pro**：冻结可逆渐进披露；Beginner 只隐藏复杂度，不改变 Canonical 能力，切回 Pro 必须无损恢复上下文与工具状态。
2. **N43 后续模式必须按真实任务开放**：Production、Debug & QA、Mobile Focus 在拥有可执行任务、负例和真实浏览器证据前继续 disabled。
3. **N43 出口停止扩张 UI 面板**：完成 Beginner/Pro、减少动效、键盘/触屏等价和跨视图 500ms 后退出；不把 Production 变成资源面板堆叠。
4. **N43 后回到用户产品闭环**：按新治理授权优先正式 Player 与 Gal Settings，再进入自动页面、Optimization 产品面、三端构建和双端编辑器。
5. **集成决策交给维护者**：请求维护者审阅 #61 与堆叠 PR 的合并策略；自动化不擅自合并或关闭。

## 6. 最终结论

当前开发没有“做成另一个产品”，核心架构仍服务于最初的专业 Gal 编辑器目标。真正的问题仍是开发重心：工程底座显著领先于玩家、Gal 配置、Android、三端交付和商业样片。N43-E1a/E1b 的现代模式导航、统一可恢复上下文、真实 16:9 Preview 和手机布局修正是正确方向，但不能把 4/7 模式和 E1 Engineering 换算成完整七模式、N43 Product Acceptance 或商业级完成。
