# 当前开发情况综合审计（2026-08-16）

> 后续节点更新：N31-E11 Runtime Session Save 的实现、真实测试与本机性能差异见 [N31-E11 审计](137-n31-e11-runtime-session-save-audit.md)。本文件保留 2026-08-16 的综合基线快照。

> 审计日期：2026-08-16
> 代码基线：`1572796418dcd365a900199b8bb8291330b5212c`（N31-E10 最终远端绿色头）
> 审计分支：`agent/current-development-audit-2026-08-16`
> 上游交付：Draft PR #45，基于 `agent/n31-runtime-e9-exit-audit`
> 本审计交付：Draft PR #46，基于 `agent/n31-runtime-e10-formal-vm-parity`；审计提交 `9c68d55a4b0817c60ff516b7382a48af9f683e52`
> 审计范围：真实代码、工作区边界、需求矩阵、产品闭环、自动化证据、GitHub 集成状态和后续顺序
> 权威边界：需求状态仍以 [M1 需求与验收追踪矩阵](90-m1-requirement-traceability.md)为准，执行顺序仍以 [游戏引擎产品落地开发计划](89-engine-product-delivery-plan.md)为准。本文件是面向当前决策的综合快照，不用自动化通过替代真人验收或发布验收。

## 1. 审计结论

当前仓库已经具备一个可以创建、编辑、持久化并导出独立 HTML 的 Web 创作开发版，也已经建立正式 Compiler 和部分正式 Runtime；它不再只是平台或算法原型。

但它还不是可发布的完整游戏引擎。当前最重要的断点是：用户可见的编辑器试玩/单文件 HTML 闭环已经存在，正式 `@world-studio/project-compiler` 和 `@world-studio/runtime` 也已分别落地，但二者还没有经 N32/N50 接入同一套 Editor Preview / Player / Build 产品链。Windows/Android 正式编辑壳、正式 Player、Web/PWA、安装包、APK/AAB、签名和发布材料也未落地。

因此当前应使用以下判定：

| 问题 | 审计答案 |
|---|---|
| 能否创建并继续编辑真实源工程 | **能，工程候选可用** |
| 能否保存、关闭、重开、导入和导出工程 | **能，Web 候选链已验证** |
| 能否在编辑器跑通一个故事并得到结局 | **能，已有真实浏览器双路线证据** |
| 能否产生可离线运行的落地产物 | **能产生自包含单文件 HTML 候选**，但不是正式 Player/Build 产物 |
| 正式 Compiler 是否存在 | **存在，N30 Engineering 出口候选** |
| 正式 Runtime 是否完成 | **未完成**；VM-01–15 完整 12、未对齐 3 |
| 正式 Runtime 是否已接入编辑器和发布 Player | **没有**；N32 与 N50 尚未开始 |
| Windows/Android/Web 是否达到正式发布 | **没有** |
| 产品验收是否通过 | **没有**；N21 0/1、N23 0/2、M1 0/27 |
| 当前默认分支是否包含这些能力 | **没有**；候选头比 `main` 领先 200 个提交 |

总判定：**可运行创作闭环候选已经形成，正式引擎执行与发布闭环尚未形成；N31 Engineering 和所有产品/发布门均不得宣告通过。**

## 2. 真实代码构成

机器审计识别 12 个 workspace：1 个产品、6 个 portable candidate、1 个 adapter、1 个 spike、3 个 conformance。

| 层 | 当前实现 | 版本/角色 | 审计判断 |
|---|---|---|---|
| 产品界面 | `@world-studio/editor` | `0.0.0-s0.41`，唯一 product workspace | 已承载项目入口、实体、Writer/Sequence、资源/Stage 和候选试玩流程；不是正式三端产品 |
| 项目领域 | `@world-studio/project-domain` | `0.4.0-n13` | Canonical Project、事务命令和稳定 ID 基线存在 |
| 项目持久化 | `project-persistence` + Node adapter | portable + isolated adapter | Web/Node 存储边界存在；Android SAF 和正式桌面宿主未交付 |
| 故事语言 | `story-core` + `story-language` | `story-language 0.1.0-n20` | P0 语句、解析、诊断、语言服务和稳定 Patch 已落地 |
| 正式编译 | `@world-studio/project-compiler` | `0.2.0-n30` | Runtime IR、Source Map、CFG/SCC、Catalog、Debug/Release 输入已形成工程候选 |
| 正式执行 | `@world-studio/runtime` | package `0.9.0-n31`；协议常量仍为 `RUNTIME_VERSION = 0.6.0` | E1–E10 已落地，但 Session Save、Monotonic Meta、10k-step 尚缺 |
| 先行证据 | Narrative VM / Windows shell spike 与 conformance apps | spike/conformance | 只能作为正式实现的对照和迁移证据，不能视为产品交付 |

当前架构审计覆盖 83 个 portable 文件和 4 个 Node adapter 文件并通过。正式 Compiler 只依赖项目领域/故事语言；正式 Runtime 只依赖 Compiler，不依赖 Spike、Editor、文件系统、墙钟或环境随机源。这一依赖方向是正确的。

## 3. 功能对齐审计

### 3.1 已形成闭环的候选能力

- 从空工程建立章节、场景、角色、变量和故事内容；
- 使用 P0 Writer/Sequence 卡片及类型化 Inspector 编辑、排序、复制和批量修改；
- 保存、关闭、重开、导入、导出 Canonical 工程及源资源；
- 在 Web 编辑器中运行最小故事流程并到达两个结局；
- 从当前故事生成自包含、可离线打开的单文件 HTML；
- 使用真实 PNG/WAV 预览基础背景、角色、音频和 Move/Hide/Show/Fade；
- 编译四类 Golden 工程为稳定 Runtime IR；
- 在正式 Runtime 中执行确定 State、PRNG、Effect/Barrier、State Save、History、Scheduler、Generated Corpus、Source Diagnostic 和 Story Outcome。

这些能力足以说明“至少存在一个能运行的流程”，但只是开发候选。尤其是单文件 HTML 仍是 N23 验收产物，不应冒充 N50 正式 Player 或 N80–N83 正式构建产物。

### 3.2 尚未对齐的核心产品能力

| 缺口 | 当前事实 | 直接影响 |
|---|---|---|
| N31 Runtime Session Save | State Save 与 History Session 分离，Load 后不能恢复同一 Cursor/Back/Forward 链 | VM-11、AC-07、正式存档闭环被阻断 |
| N31 Monotonic Meta | Back 会恢复旧 checkpoint 中的 `metaProgress`，缺独立 Meta Hash | VM-13、已读/CG/结局永久进度语义被阻断 |
| N31 10k-step | 有 10,000 seeds corpus，但没有单次 10,000-step 有界批次向量 | VM-14、N31 Engineering 出口被阻断 |
| Editor 正式 Runtime 接入 | 当前试玩链尚未由 N32 统一接入正式 Compiler/Runtime | 任意语句预览、统一状态、诊断跳转和最终产品语义未闭环 |
| 正式 Player | N50 未开始 | 当前 HTML 不能代表玩家槽、正式媒体宿主、Save/Back/Auto/Skip 产品体验 |
| Route/Sequence/Stage 完整形态 | Route 仍是简单派生图；完整 Sequence、镜头、复杂关键帧、模板和高性能渲染后端待 N40–N42 | 特色编辑体验未完全对齐 |
| QA/Debugger | 后端 CFG/SCC、Source Map 和 Runtime Diagnostic 已有，Debugger/Solver UI 未落地 | 任意入口、断点、单步、变量检查和产品化错误呈现未完成 |
| 资产/本地化/Gal | 资产基础链和 Catalog 已有，完整类型/平台变体、翻译工作流、Gal 设置/附加页仍缺 | 13 个 P0 模块未全部完成 |
| 三端产品与构建 | 正式 Windows/Android 壳、PWA、安装/签名、APK/AAB、Artifact Manifest 未落地 | 不能发布或进行设备级验收 |

## 4. 需求与验收门

需求机器登记本轮重算通过：50 条需求，包含 10 条 USP、13 个 P0 模块、27 条 M1 Acceptance Criteria，由 6 个 owner 负责。登记完整不表示实现完成。

| 门 | 当前状态 | 结论 |
|---|---|---|
| 最近严格按产品顺序通过节点 | N20 | N22/N23/N30/N31 的工程证据不能跨越 N21 产品门 |
| N21 真人 Writer 验收 | `pending-participant`，0/1 | 未通过 |
| N23 双参与者闭环验收 | `pending-participants`，0/2 | 未通过 |
| N30 Product Acceptance | 被真人门阻断 | 未通过 |
| N31 Engineering | 12/15 VM 完整，3 项未对齐 | 未通过 |
| N31 Product Acceptance | 被真人门和工程门共同阻断 | 未通过 |
| M1 Acceptance Criteria | 0/27 完整通过 | 未通过 |
| N32 Engineering / M1 Stable / Public Release | 被 `RA-N21-003` 明确阻断 | 不得进入/不得宣告 |

当前唯一活动风险接受 `RA-N21-003` 于 2026-09-14 23:50（UTC+8）到期，只允许工程候选推进至 N31。它持续阻断 N21 Product Acceptance、N23 Acceptance、N30/N31 Product Acceptance、N32 Engineering、M1 Stable 和 Public Release。

## 5. 自动化与质量证据

本轮在精确基线 `1572796` 上重新执行 `npm run check`，结果为通过：

| 检查 | 结果 |
|---|---:|
| Workspace / Requirements / Risk / Human Gate / Delivery / Golden 审计 | 全部通过 |
| N30 Compiler 定向测试 | 20/20 |
| N31 Runtime 定向测试 | 49/49 |
| 常规并行测试 | 97 个文件、588 项 |
| 串行存储一致性 | 1/1 |
| 重型 VM 一致性 | 5/5 |
| TypeScript | 通过 |
| 构建 | 12/12 workspace |
| 架构门 | 83 portable / 4 Node adapter |
| Script 性能门 | 10/10 |
| Asset 性能门 | 4/4 |
| Editor 生产包 | 636.67 kB，gzip 183.52 kB；构建通过但存在大于 500 kB 警告 |

同一基线已经由 Draft PR #45 的 `product-baseline` run `31894928407`、job `95036669462` 在 Windows / Node 22 上通过。自动化说明当前候选可重复构建和回归，不证明真人易用性、三端设备兼容、正式安装或发布质量。

本审计文档提交 `9c68d55a4b0817c60ff516b7382a48af9f683e52` 又由 Draft PR #46 的 `product-baseline` run `31896050807`、job `95039421206` 复验通过，完整 Windows / Node 22 job 用时 4 分 12 秒。这证明新增审计与入口更新没有破坏工程基线；仍不改变任何产品门状态。

## 6. GitHub 集成审计

这是当前最高的交付风险之一：

- `origin/main` 仍为 `60121d35dfdf509b190f1576475acaf5d40003df`，提交日期为 2026-08-10；
- 当前 E10 绿色头相对 `main` 领先 200 个提交，`main` 没有领先提交；
- PR #1–#45 当前全部仍为开放 Draft，产品主线由连续堆叠 PR 承载；
- PR #32 只把 `agent/m1-integration-n21` 登记为 authoritative baseline，并不等于代码已经合入默认分支；
- PR #33–#45 又在其上继续承载 N22/N23/N30/N31 候选。

因此“GitHub 已推送”成立，“已集成到默认分支”不成立。继续无限增加堆叠 PR 会提高复核、合并、回退和基线漂移成本；N31 工程出口复审后应建立明确的集成检查点，由仓库负责人决定保留堆叠合并、压缩合并或重建审阅链，不能在没有授权和评审的情况下由开发过程自行改写 `main`。

## 7. 后续严格执行顺序

后续不得转去新增平台展示或平行特色功能，应按现有需求门逐项关闭：

1. **N31-E11 Runtime Session Save**：保存/加载完整 History Session、Cursor、checkpoint chain、tombstone 和一致性 Hash；损坏、未来版本和错误 Build 必须 fail closed；关闭 VM-11。
2. **N31-E12 Monotonic Meta boundary**：将剧情可回滚 State 与只增 Meta Progress 分离；Back/Load 不回退 read/CG/ending；提供独立 Meta Hash；关闭 VM-13。
3. **N31-E13 Bounded 10k-step conformance**：建立正式 10,000-step 单流程、固定预算让步、批次数、最终 State/Outcome Hash 和 Node/Worker 零差异；关闭 VM-14。
4. **N31-E14 Engineering exit re-audit**：逐项复核 VM-01–VM-15、10k seeds、10k steps、Node/Worker、全仓门和文档；只有 15/15 后才可登记 N31 Engineering 出口候选。
5. **GitHub 集成检查点**：审阅并收敛 #1–#45 的堆叠交付链，确认默认分支合并策略和可回退点；不得把“远端存在分支”写成“已集成”。
6. **完成 N21 与 N23 真人验收**：先 1 名非程序用户完成 N21-HV-01，再由 2 名不同非实现者完成 N23-PA-01；记录 Severity、任务结果和产物 Hash。
7. **解除门禁后再进入 N32**：把正式 Compiler/Runtime 接入 Editor Preview；随后才进入正式 Player、QA/Debugger、资产构建、Windows/Android/Web 发布链。

每个节点继续遵循固定闭环：需求条目与冻结语义确认 → 代码/测试 → 本地完整门 → 独立审计文档 → 明确提交 → 推送 Draft PR → 远端 Windows 全检 → 回写提交/run/job 证据 → 下一节点。任何一步失败都停留在当前节点，不用后续功能掩盖缺口。

## 8. 当前禁止宣称的内容

- 不得称 M1、N31 或任一三端发布节点已完成；
- 不得把 Spike/conformance harness 称为正式 Runtime 或正式平台壳；
- 不得把 N23 单文件 HTML 称为正式 Player 或正式 Web/PWA 构建；
- 不得把自动化协议 `PASS` 称为 N21/N23 真人验收通过；
- 不得把 Draft PR 或 authoritative branch 称为已经合入 `main`；
- 不得在 `RA-N21-003` 下进入 N32 Engineering 或 Public Release。

下一开发节点保持为 **N31-E11 Runtime Session Save**。
