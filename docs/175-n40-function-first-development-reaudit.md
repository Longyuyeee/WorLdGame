# N40 功能优先开发现状与后续计划复审

> 日期：2026-08-24
> 审计头：`00acf94c6b37c84717008197f34389e873bd39b9`
> 分支：`codex/n40-e1-route-graph-core`，Draft PR #59
> 目的：纠正 E8k 之后继续优先建设缓存增量或外部宿主的偏移，把后续开发重新锚定到创作者能直接操作、观察和验证的 Route Map 功能闭环
> 判定：N40 核心技术底座已足以继续交付产品功能；下一节点不得继续以 topology cache、外部 host、平台包装或发布工程为主。N40 Product Acceptance、N41+、M1 Stable 与发布状态不变，仍 fail closed。

## 1. 审计方法与实际证据

本次先执行远端同步和代码审计，再对实际产品路径运行定向测试：

```text
git fetch origin
git rev-list --left-right --count @{upstream}...HEAD  -> 0 0
npm exec -- vitest run \
  packages/route-graph/src/route-graph.test.ts \
  apps/editor/src/route-map-app.test.tsx \
  apps/editor/src/trusted-route-overview.test.ts \
  apps/editor/src/lazy-sequence-editor.test.tsx \
  apps/editor/src/lazy-scene-session.test.ts \
  packages/project-domain/src/project-structure.test.ts
```

结果为 `6 files / 46 tests` 全部通过。审计头的 GitHub Windows / Node 22 full check 为 run `32656571546` / job `97236118339`，用时 `5m07s`，完整成功；普通测试基线为 `113 files / 710 tests`。因此下列结论来自当前代码、当前远端和实际测试，不以计划文档代替实现。

## 2. 当前已经形成的真实功能

| 用户结果 | 当前代码能力 | 判定 |
|---|---|---|
| 打开真实工程并保存 | Canonical Project、Project Service、Lifecycle、事务型受管 workspace、ZIP 导入导出 | 已有工程能力 |
| 从故事自动得到 Route | 正式 Compiler 结果投影章节、场景、Choice 连接、结局、控制流事实和诊断，不维护第二份剧情逻辑 | 已形成 |
| 大型 Route 可导航 | 10k 场景真实图、64 节点窗口、搜索、章节/节点类型/视觉分组过滤 | 已形成 |
| 整理 Route 画布 | Layout sidecar、坐标、拖拽、键盘/触控移动、分组、折叠、视口与重开 | 已形成 |
| 查看实际运行路线 | Formal Runtime History 投影当前场景、已访问场景和已走 Choice 连接；Back/Forward 同步撤销和恢复 | 已形成 |
| 从 Route 进入内容 | 选中场景进入同 stable ID 的 Sequence/Script；局部页只读取所需 scene/script/layout | 已形成 |
| 从空白工程建立最小内容 | narration 前插/后插/移动/删除经过 Compiler/Route 双证明、原子保存、重建与重开 | 最小闭环已形成 |
| Route 局部读取 | 100 场景首窗 `[1,1,64,64]`；10k Windows `301.56 ms < 500 ms` | 已形成 |
| 启动与完整回归 | Vite/HTTP 实际启动已通过；最终完整本地与 Windows CI 通过 | 工程证据成立 |

这些能力说明项目已经不是静态界面原型：核心 Project → Language → Compiler → Runtime → Route → 局部 Sequence → Save/Rebuild 链路能够运行。但它仍不是完整可交付游戏引擎，不能把底座通过换算为完整创作、Player 或三端发布完成。

## 3. 当前最重要的功能缺口

对照 PRD Route Map P0 与当前 `FlowView`，仍有以下直接面向用户的缺口：

1. **指定结局路线**：现有高亮只表示 Runtime 已经走过的历史；没有从入口选择某个结局、计算候选路线并高亮节点/连接的静态审阅功能。
2. **诊断定位**：Compiler 诊断目前只是文本列表；不能点击后锚定包含问题的 Route window、选中 scene，并在存在 statementId 时进入对应 Sequence/Script 位置。
3. **直接进入场景**：PRD 要求双击 Route 节点进入 Sequence；当前只有 Inspector 内按钮，节点双击没有产品行为。
4. **目标导航与补全**：搜索能命中 label/target facts，但没有面向创作者的跳转目标导航和自动补全闭环。
5. **修改后路线复核**：已有 narration 最小编辑与保存，但尚无“选择结局路线 → 定位问题 → 修改内容/目标 → 保存 → Compiler/Route 重建 → Preview 实际走通”的单一产品流程。
6. **完整 Sequence/Stage/Player**：其他 P0 结构事务、Choice options、类型化 Inspector、完整 Stage 导演能力和正式 Runtime Player 仍属于后续节点，不能在 N40 文档中提前宣称完成。

## 4. 已发现的方向和文档偏移

### 4.1 下一步优先级偏移

E8k 审计和当前状态文档把 N40-E8l 倾向写成 topology/derived artifact 增量更新或外部 trusted host 对齐。这些工作有工程价值，但不会先给创作者新增可见能力；在上述 Route P0 缺口仍存在时继续优先推进，会重复用户已经指出的“平台/底层先于软件自身功能”问题。

纠偏决定：topology 增量写、缓存局部更新、外部 trusted host 和平台包装降为后置工程项。只有某个功能闭环被真实 I/O、性能或安全问题阻断时，才允许把对应最小底层修复纳入该功能节点。

### 4.2 README 状态过期

README 仍写成 N40-E4/E6d 阶段，并把已经完成的路线高亮、10k 局部编辑和 500 ms 门列为未完成。该信息与当前实现头、状态审计和 CI 不一致。本次同步更新，但不改写历史审计记录。

### 4.3 范围边界

E8g–E8j 为了形成 Route-first 可编辑落地流程，已实现一部分 Sequence 能力；这些结果可保留，但下一步不能顺势把 N41 全部 Sequence 偷渡进 N40。N40 只继续补 Route Map 自身的审阅、定位、导航和同源闭环。

## 5. 功能优先的后续开发顺序

### N40-E8l：指定结局路线审阅

> 2026-08-24 更新：实现、本地全门、10k 性能、desktop/mobile production browser 与远端 Windows / Node 22 full check 已通过，详见 [E8l 审计](176-n40-e8l-ending-route-review-audit.md)；后续转入 E8m。

**用户目标**：创作者选择一个结局，立即看到从入口抵达它的权威场景/连接路线，并能在大型图中逐段查看。

**实现边界**：

- portable Route Graph 提供确定性、循环有界的入口→结局路线查询；
- 明确无路线、悬空边、循环和多个候选路线的结果，不伪造可达；
- Flow 增加结局选择、候选路线切换和节点/连接高亮；
- 高亮可跨 64 节点窗口锚定，不一次挂载 10k 节点；
- 不修改 Canonical 剧情，不引入第二份路线语义。

**完成证据**：红测；分支、无路、循环、悬空和多路线 Golden；真实 10k 有界性能；产品 UI 测试；本地全门；实现推送和 Windows CI。

### N40-E8m：诊断定位与直接导航

> 2026-08-24 更新：本地实现、真实 Project/Compiler UI 正反例、10k 性能、desktop/mobile production browser 与全仓门已通过，详见 [E8m 审计](177-n40-e8m-diagnostic-navigation-audit.md)。合法目标只读导航已完成；目标编辑/自动补全写回因必须经过正式结构事务，保留给 E8n 的最小修复闭环或 N41。远端 Windows 门待本次推送后登记。

**用户目标**：点击不可达、悬空、循环等 Compiler 诊断即可看到出错节点，并进入对应内容位置修复。

**实现边界**：

- 诊断点击锚定 Route window、选中 scene，并携带 statementId；
- 节点双击进入同 scene 的 Sequence；诊断有 statementId 时继续定位对应卡片/Script；
- label/jump/choice 合法目标提供直接导航；目标编辑/补全写入不得绕过正式 Story Language/Project Service/Compiler；
- 目标不存在、revision 漂移或 Compiler 拒绝时失败关闭。

**完成证据**：诊断→Route→Sequence/Script 稳定 ID E2E；键盘与鼠标路径；保存/重开；本地全门和 Windows CI。

### N40-E8n：Route 驱动的创作修复闭环

**用户目标**：在一个可运行流程中完成“选择结局路线 → 找到问题 → 进入内容修改 → 保存 → 图更新 → Preview 走通目标结局”。

**实现边界**：优先复用已安全开放的 narration 和内容 patch；只为闭环补最小必要的目标编辑，不扩张到 N41 全量 Sequence。保存后必须重建 Compiler、Route overview 和 Lazy Edit Index，再从新 revision 重开并由 Formal Runtime 实际运行。

**完成证据**：真实 fake-IndexedDB 工程闭环、Compiler/Route/Runtime exact assertions、故障和 revision race 反例、软件启动、production browser 可用时复验、Windows CI。

### N40 出口复审

E8l–E8n 后逐项对照 N40 Goal/Implementation/Tests/Acceptance。只有 Route P0 功能完整且证据一致，才能登记 N40 Engineering 出口候选。真人记录、production browser 和 `RA-N21-005` 未关闭时，N40 Product Acceptance、N41 及以后仍不得开启。

## 6. N40 之后的产品主线

1. **N41 Sequence**：全部 P0 块、Choice options、类型化 Inspector、复制/批量/折叠、跨视图定位和 1,000 次 Script/Sequence 互改不漂移；
2. **N42 Stage**：多轨、关键帧、镜头、角色/背景/音频、基础转场及 Stage 操作生成语义命令；
3. **N43 多视图统一**：Route/Sequence/Script/Stage/Preview 同源同步和 500 ms 用户闭环；
4. **N50+ 正式 Player 与构建**：统一 Formal Runtime Host 后再进入 Web、Windows、Android 产物，不再维护平行解释器。

当前阶段不新增账户、云同步、市场、AI、营销平台或发布包装。开发顺序固定为：用户结果 → 红测 → 最小正式契约 → 产品 UI → 保存/重建/运行闭环 → 全量实测 → 实现推送/Windows CI → 文档与需求同步。
