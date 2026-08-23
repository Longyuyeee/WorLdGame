# 游戏引擎产品落地开发计划

> 生效日期：2026-08-13
> 目标版本：M1 Stable
> 上游需求：[PRD](03-prd.md)、[Gal 基础系统](11-gal-foundation-and-automation.md)、[优化规格](12-size-performance-stability.md)
> 状态权威：[M1 需求与验收追踪矩阵](90-m1-requirement-traceability.md)
> 当前审计：[N32 Engineering 出口复审](151-n32-engineering-exit-reaudit.md)；N32→N40 准入依据为 [治理检查点](152-n32-n40-governance-checkpoint.md)。`RA-N21-001/002/003/004` 已关闭；`RA-N21-005` 只授权 N40 Route Map Engineering，不改变 N21/N23/N30/N31/N32/N40 产品验收与 M1/发布仍被阻断的事实，也不授权 N41、正式 Player 或以后节点。N31 集中基线仍未合入 `main`。
> 核心原则：进度以“能否制作并交付真实游戏”衡量，不以平台 Spike、代码行数或孤立测试衡量。

## 1. 最终交付定义

M1 必须交付一套实际可用的视觉小说游戏引擎：

1. 创作者在 Windows 和 Android 上可以创建、打开和编辑同一个本地工程；
2. 工程包含角色、场景、资源、对白、选择、条件、变量、演出、配置、本地化和 QA 数据；
3. Route、Sequence、Script、Stage、Preview 和 Debugger 是同一 Canonical Project 的不同投影；
4. Compiler 将工程确定性编译为版本化 Runtime IR、Catalog 和资源 Manifest；
5. 同一 IR 在 Web、Windows、Android 玩家中产生一致剧情状态；
6. Windows 编辑器能够生成可正式分发的 Web、Windows、Android 产物；
7. 使用该引擎完成并发布一部 20–30 分钟的 Benchmark Episode；
8. 编辑器、玩家、工程和存档均通过恢复、性能、安装、升级、安全和发布审核。

在第 7 项完成前，项目只能称为开发版本，不能称为“引擎已落地”。

## 2. 执行规则

### 2.1 节点完成规则

每个节点必须同时具备：

- `Goal`：唯一、可验证的用户或引擎目标；
- `Scope`：明确包含和排除；
- `Inputs`：依赖的 Schema、模块、设计和前序节点；
- `Implementation`：具体代码、数据、UI 和迁移任务；
- `Artifacts`：可检查的工程、程序包、报告或截图；
- `Tests`：单元、契约、集成、E2E、故障和性能中适用的层级；
- `Acceptance`：可重复命令和用户任务；
- `Stop conditions`：出现何种事实必须停止扩展并修正设计。

缺任一项时节点状态最多为“进行中”。

### 2.2 状态流

`未开始 → 设计冻结 → 实现中 → 集成中 → 验收中 → 通过`

- “设计冻结”必须有 Schema/接口和验收用例；
- “实现中”不能对外宣称功能可用；
- “集成中”要求 UI 到 Domain 已连接，但尚未形成产物；
- “验收中”要求端到端链已贯通；
- “通过”要求证据已进入追踪矩阵。

### 2.3 主分支纪律

- 产品主分支只接收当前交付节点需要的变更；
- 技术实验使用可抛弃分支，必须声明服务的产品节点；
- 禁止继续堆叠不面向主线的 Spike；
- 每个 PR 只关闭一个可描述的产品/引擎结果；
- PR 描述必须列出 `REQ-*`、`AC-*`、失败路径和复现命令；
- 功能 PR 必须同时更新追踪矩阵；
- 不允许通过放宽超时、删除断言或降低设备门槛使节点变绿。

## 3. 交付拓扑

```mermaid
flowchart LR
    R0["R0 重建产品基线"] --> R1["R1 通用工程载体"]
    R1 --> R2["R2 最小创作闭环"]
    R2 --> R3["R3 正式 Compiler 与 Runtime"]
    R3 --> R4["R4 多视图专业编辑"]
    R3 --> R5["R5 玩家与 Gal 基础"]
    R4 --> R6["R6 QA、本地化与自动页面"]
    R5 --> R6
    R2 --> R7["R7 资源与 Optimization"]
    R3 --> R8["R8 三端玩家构建"]
    R6 --> R9["R9 Windows/Android 编辑器"]
    R7 --> R9
    R8 --> R9
    R9 --> R10["R10 Benchmark Episode"]
    R10 --> R11["R11 M1 稳定与发布"]
```

R1–R3 是最短可玩链。它们完成前，不新增资源高级算法、平台极端恢复或 P1/P2 能力。

## 4. 里程碑总览

| 里程碑 | 用户可见结果 | 进入条件 | 退出条件 |
|---|---|---|---|
| R0 重建产品基线 | 团队知道每个需求在哪里、怎样完成 | 本计划获批 | 追踪矩阵、Repo 主线、Golden 项目和 E2E 骨架存在 |
| R1 通用工程载体 | 可创建、保存、导出、重新打开任意工程 | R0 | 空项目和示例项目都可 round-trip，无固定项目假设 |
| R2 最小创作闭环 | 可制作一个 5 分钟分支短篇 | R1 | 角色/场景/对白/选择/条件/演出/预览/保存完整 |
| R3 Compiler 与 Runtime | 编辑内容可由正式 VM 运行 | R2 | Editor → Compiler → VM → Save/Load/Back 闭环 |
| R4 专业多视图 | Route/Sequence/Script/Stage 同源编辑 | R3 | 四视图和跨视图定位/撤销/同步通过 |
| R5 玩家与 Gal 基础 | 作品具有完整视觉小说玩家体验 | R3 | 玩家 UI、配置、历史、Auto、Skip、Save、输入可用 |
| R6 制作自动化 | QA、本地化、画廊/回想/音乐室自动生成 | R4+R5 | 特色生产功能端到端通过 |
| R7 Optimization | 优化结果可解释、可回退并进入构建 | R2 | 预算/Profile/资源变体/报告贯通 |
| R8 三端玩家 | 同一工程生成三端可玩产物 | R3 | Web/Windows/Android 固定路线状态一致 |
| R9 双端编辑器 | Windows/Android 完整创作 | R4+R6+R7+R8 | 双端核心任务和工程交换通过 |
| R10 验收作品 | 20–30 分钟真实游戏完成 | R9 | 三端分发包、用户测试、设备性能通过 |
| R11 M1 Stable | 可对外发布的引擎与玩家 | R10 | AC-01–AC-27 全通过且 Release Assurance 通过 |

## 5. R0：重建产品基线

### N00 产品主线与仓库基线

> 状态：通过。实现、自审、本地完整门、推送与 Draft PR Windows CI 均完成；证据见[《N00 产品主线与仓库基线审计》](91-n00-product-baseline-audit.md)。

- **Goal**：形成一个可连续集成的产品主分支，结束堆叠实验分支代替产品主线的状态。
- **Inputs**：S0.41 Web 原型、CL-03/04 已有证据、当前依赖锁。
- **Implementation**：
  1. 选择包含全部已审计代码的基线；
  2. 将实验宿主标记为 `spikes/` 或 `conformance/`，与正式应用隔离；
  3. 建立 `apps/editor`、`apps/player-web`、`apps/player-windows`、`apps/player-android`、`packages/project-domain`、`packages/project-compiler`、`packages/runtime`、`packages/build-core` 的目标边界；
  4. 为每个 workspace 定义 owner、稳定性等级和允许依赖方向；
  5. 建立产品主线 CI：format、typecheck、unit、integration、E2E、architecture、build。
- **Artifacts**：仓库结构 ADR、依赖图、绿色基线 CI。
- **Acceptance**：全新 checkout 一条命令安装、测试并启动编辑器。
- **Stop conditions**：正式包依赖 Spike App；同一语义存在两个不兼容模型；无法从干净环境复现。

### N01 需求追踪与演示工程

> 状态：通过。50 项 M1 追踪审计、七类 Golden Seed、PR 更新纪律、每周空目录演示、本地完整门和 Draft PR Windows CI 均完成。证据见[《N01 需求追踪与 Golden 基线审计》](92-n01-requirement-golden-baseline.md)。

- **Goal**：所有 P0 和 27 条验收均有 owner、实现节点、测试和证据位置。
- **Implementation**：
  1. 使用 `REQ-*` 和 `AC-*` 标识；
  2. 建立 Tiny、Branching、Media、CJK、Recovery、Size、Benchmark 七类 Golden Project；
  3. 每个 Golden Project 保存源工程、期望 IR Hash、关键状态 Hash 和构建 Manifest；
  4. 建立每周“空目录到 Web Build”演示脚本；
  5. 所有功能 PR 更新追踪矩阵。
- **Artifacts**：`fixtures/projects/*`、追踪矩阵、E2E 测试入口。
- **Acceptance**：CI 能验证追踪表无未知 REQ/AC、每项通过状态都有证据链接。

## 6. R1：通用工程载体

### N10 Canonical Project Schema

> 状态：通过。正式 `project-domain`、`.world` v1 多文件格式、S0/七类 Golden 迁移、任意工程 Editor Session 适配、本地完整门和 Draft PR Windows CI 均完成。证据见[《N10 Canonical Project Schema 审计》](93-n10-canonical-project-schema.md)。

- **Goal**：移除 `campusStoryProject` 固定假设，定义任意项目的权威数据边界。
- **Scope**：Project、Chapter、Scene、Character、Variable、Asset、Localization、Settings、UI、Plugin、Test Route、稳定 ID 和版本。
- **Implementation**：
  1. 新建平台无关 `project-domain`；
  2. 将 Project Manifest、脚本、角色/资源清单、布局 Sidecar 分为源文件；
  3. 冻结 JSON Schema 与 `.world` 文件版本；
  4. 稳定 ID 采用可生成、可校验、重命名不变的策略；
  5. 所有派生缓存可删除重建；
  6. 实现从 S0 固定快照到通用 Schema 的一次性迁移。
- **Tests**：Schema、重复 ID、未来版本只读、迁移幂等、未知字段保留、Git diff Golden。
- **Acceptance**：两个结构不同的工程可加载、保存、重载并保持语义 Hash。
- **Stop conditions**：项目语义仍从 UI state 推断；新增场景需要修改 TypeScript 常量；未知字段静默丢失。

### N11 Project Service 与事务命令

> 状态：通过。统一 Project Service、全实体事务命令、ChangeSet、Revision 冲突、批处理、Undo/Redo、提交版本保存门、SourceSession 适配、本地完整门和 Draft PR Windows CI 均完成。证据见[《N11 Project Service 与事务命令审计》](94-n11-project-service.md)。

- **Goal**：所有视图通过同一命令修改项目，不直接写文件或维护第二份数据。
- **Implementation**：
  1. 定义 Create/Rename/Delete/Move Chapter/Scene/Character/Variable/Asset 命令；
  2. 定义 Insert/Update/Delete/Move Story Statement 命令；
  3. 命令包含 `commandId`、`expectedRevision`、稳定实体 ID 和结构化错误；
  4. 建立 ChangeSet、Undo/Redo、批处理和语义冲突；
  5. 将现有 SourceSession/patch 能力收敛为 Project Service 适配器；
  6. 保存只接收已提交 Project Revision。
- **Tests**：幂等、撤销重做、批处理原子性、陈旧 Revision、跨文件引用更新和故障注入。
- **Acceptance**：用命令从空 Project 创建两场景分支故事，撤销到空项目，再重做到相同 Hash。

### N12 项目首页与文件生命周期

> 实施状态（2026-08-13）：通过；本地完整门与 Draft PR #27 Windows CI 均成功。证据见[《N12 项目首页与文件生命周期审计》](95-n12-project-lifecycle.md)。

- **Goal**：用户可以管理真实工程，而不是自动进入固定样例。
- **Implementation**：
  1. 新建、打开、最近、示例、导入、导出入口；
  2. 项目模板只提供默认值，不锁定结构；
  3. Windows 使用目录选择器；Web 使用 File System Access/OPFS；Android 后续接 SAF；
  4. 显示项目位置、Schema、脏状态、恢复状态和只读原因；
  5. 完整工程 ZIP 导入/导出防 Zip Slip；
  6. 外部文件变化检测、增量重载和三方冲突界面；
  7. 最近项目只保存引用和权限句柄，不复制权威内容。
- **Artifacts**：可下载/可 Git 管理的工程目录。
- **E2E**：新建 → 保存 → 关闭 → 重开；导出 → 清空本地状态 → 离线导入 → 重开。
- **Acceptance**：AC-08 在 Web/Windows 基础链通过；不存在固定项目 ID。

### N13 章节、场景、角色和变量管理

> 实施状态（2026-08-13）：通过；本地完整门与 Draft PR #28 Windows CI 均成功。证据见[《N13 章节、场景、角色和变量管理审计》](96-n13-entity-management.md)。

- **Goal**：创作者可以建立故事骨架和引用对象。
- **Implementation**：
  1. 章节/场景树的创建、删除、排序、重命名和入口设置；
  2. 角色、显示名、颜色、立绘槽位和默认表达式；
  3. Boolean/Number/String 变量、默认值、作用域和引用；
  4. 删除前引用分析和安全迁移；
  5. 手机不依赖拖拽的等价操作；
  6. 全局搜索覆盖新实体。
- **Acceptance**：从空项目建立 1 章、3 场景、2 角色、3 变量，保存重开后引用不变。

## 7. R2：最小创作闭环

### N20 Story Language P0

> 状态：通过。P0 CST/AST、安全表达式、语言服务、通用 Patch、100k 增量门、本地完整门、推送与 Draft PR #29 Windows CI 均完成；证据见[《N20 Story Language P0 审计》](97-n20-story-language-p0.md)。

- **Goal**：脚本能够表达 M1 最小可玩故事。
- **Scope**：Dialogue、Narration、Choice、Label、Jump、Call/Return、Set、Condition、Wait、End、Background、Character、Audio。
- **Implementation**：
  1. 冻结语法和 CST/AST；
  2. 未知命令、注释、稳定 ID 和有效未知参数往返保留；
  3. 类型化表达式，不允许任意 JavaScript；
  4. 建立引用解析、补全、诊断、定义和引用索引；
  5. 实现所有 P0 节点的结构 Patch；
  6. Formatter 不改变语义或 ID。
- **Tests**：10 万行增量、1,000 次跨视图改写、未知插件、CJK/Ruby、嵌套条件和冲突。
- **Acceptance**：Branching Golden Project parse → edit → format → parse Hash 不变。

### N21 最小 Writer/Sequence 编辑

> 实施状态（2026-08-15）：工程实现门通过；本地完整门和 Draft PR #30 Windows CI 完成，等待 20 分钟非程序用户实测。主持人预演发现并修复了空工程对白非法角色引用，T02 已与角色前置需求对齐，详见 [N21 真人验收就绪预演审计](118-n21-human-readiness-rehearsal-audit.md)；权威记录仍为 `pending-participant`。旧 `RA-N21-001` 已关闭，`RA-N21-002` 不把 N21 标记为通过。

- **Goal**：非程序用户能完成对白、选择、条件和基础演出。
- **Implementation**：
  1. 语句卡覆盖 N20 全部 P0 类型；
  2. 插入菜单、快捷键、复制、删除、排序、批量选择、折叠；
  3. Inspector 使用类型化参数，不解析显示字符串；
  4. Choice 选项和 Condition 分支可视化编辑；
  5. 角色/变量/资源/场景引用使用稳定 ID 选择器；
  6. 错误不污染最后有效语义；
  7. 每个操作有键盘和触屏替代。
- **E2E**：创建对白 → 添加两选项 → 设置变量 → 条件进入两个结局 → 加入背景/BGM。
- **Acceptance**：不了解脚本语法的测试者能在 20 分钟内完成任务。

### N22 最小 Stage 与媒体预览

> 准入状态（2026-08-15）：旧 `RA-N21-001` 已关闭；`RA-N21-002` 在指定权威集成基线上允许推进 N23 可运行纵向切片，但不关闭 N21 真人门，不替代 Draft PR 集成，也不允许通过 N23。
> 实施状态（2026-08-15）：N22 工程验收通过。前十切片及真实 PNG/WAV Media Golden 已覆盖计划中的最小 Stage/Preview 边界；退出审计又补齐真实 WAV `paused=false`、播放时间前进、重开后继续播放和自动播放受限回退证据，并以组件测试与 Golden 登记审计固化。当前主后端为 `canvas-2d-v1`，不宣称 Pixi/WebGL、复杂关键帧或正式 Player Runtime 已实现；完整对齐见[N22 退出条件审计](113-n22-exit-condition-audit.md)。`RA-N21-002` 仍阻断 N21/N23 Product Acceptance、M1 Stable 与 Public Release。

- **Goal**：创作者看到真实资源驱动的基础舞台结果。
- **Implementation**：
  1. Pixi/Canvas 场景层与 DOM 文本/UI 分离；
  2. 背景、角色槽位、表情、位置、缩放、旋转、锚点、层级；
  3. BGM/Voice/SFX/Ambient 基础播放和停止；
  4. Fade/Move/Show/Hide 基础过渡；
  5. 设计分辨率、横竖屏、安全区；
  6. 缺失/不可信资源安全占位；
  7. 当前语句、Stage 对象和 Sequence 卡同步选中。
- **Tests**：资源生命周期、Object URL 释放、错误解码、切场景、DPR、触摸命中和视觉 Golden。
- **Acceptance**：Media Golden Project 在 Preview 中正确显示和播放，不使用 CSS 假素材替代导入资源。

### N23 五分钟可玩切片 Gate

> 实施状态（2026-08-15）：E1 可运行流程、E2 空工程创作闭环、E3 自包含资源 ZIP、E4 独立离线试玩 HTML、E5 五分钟内容量、E6 双参与者协议与 E7 一键验收启动器已贯通，详见 [N23 产品验收执行包](121-n23-product-acceptance-execution-kit.md)及 [N23-E7 审计](122-n23-e7-acceptance-launcher-audit.md)。真人状态仍为 N21 `0/1`、N23 `0/2`，N23 产品验收未通过；风险例外仅允许继续 N30 Compiler 工程候选，N31/N50 仍被阻断。

- **Goal**：第一次证明引擎主体，而不是局部组件。
- **Required artifact**：从空工程制作的 5 分钟、3 场景、2 角色、2 结局作品。
- **Required flow**：一键启动生产验收环境 → 新建 → 资源导入 → 角色/变量 → 对白/选择/条件 → 演出 → 保存 → 关闭重开 → 预览完整路线 → 构建并运行独立 HTML。
- **Acceptance**：先完成 N21，再由两名不同的非实现者各自按 `N23-PA-01` 完成编辑、保存重开、编辑器双路线、独立 HTML 构建与双路线；Severity 0/1 为 0；哈希证据有效；工程不包含硬编码样例引用。
- **Gate**：N23 未通过，不进入 R4/R6/R7 的功能扩展。

## 8. R3：正式 Compiler 与 Runtime

### N30 Project Compiler

> 实施状态（2026-08-15）：E1 最小内核与 E2 工程退出切片已形成完整工程候选。独立 portable package、Runtime IR v1、语句级 CFG/SCC 诊断、双 Hash 场景缓存、完整 Catalog、Debug/Release Artifact 差异、licenses/SBOM 输入和 Tiny/Branching/Media/CJK IR Golden 均已建立，本地完整门及 Draft PR #35 Windows / Node 22 跨机器复验均通过。`RA-N21-002` 仍阻断 N30 Product Acceptance 与 N31 Engineering，故不把工程候选登记为产品通过。详见 [E1 审计](123-n30-e1-project-compiler-audit.md)、[E2 审计](124-n30-e2-compiler-completion-audit.md)与[顺序门交接审计](125-n30-exit-human-gate-handoff-audit.md)。

- **Goal**：将权威工程确定性编译为玩家可执行数据。
- **Implementation**：
  1. Project AST → 校验后的 Story IR；
  2. 生成 Source Map、Asset Manifest、Localization Catalog、Ending/Gallery/Replay/Music Catalog；
  3. 编译不可达、悬空引用、缺失资源和无出口诊断；
  4. 所有输出排序、版本和 Hash 确定；
  5. 增量编译按场景/资源失效；
  6. Debug 与 Release Profile 分离。
- **Artifacts**：`manifest.json`、`story.ir`、`source-map.json`、Catalog、licenses、SBOM 输入。
- **Tests**：同工程跨机器 Hash、一字符变更最小失效、错误源码定位、未来 Opcode 拒绝。
- **Acceptance**：Tiny/Branching/Media/CJK 工程均生成稳定 IR。

### N31 正式 Narrative Runtime

> 实施状态（2026-08-20）：E1–E14 已完成 N31 Engineering。[E14 复审](140-n31-e14-runtime-engineering-exit-reaudit.md)逐项得到 VM-01–VM-15 `完整 15 / 部分 0 / 未对齐 0`；Draft PR #50 的 Windows / Node 22 完整门 run `32349504993` / job `96365349584` 用时 4 分 01 秒绿色。本机 Node 25 完整 check 因既有 10,000-seed 107.871 秒超过 90 秒而保持红色，没有放宽门槛，并作为非权威 CI 环境性能差异保留；根 `engines` 实际声明为 `>=22.12.0`，不能写成 Node 25 不受支持。`RA-N21-004` 继续阻断 N31 Product Acceptance，但只解除 N32 Engineering 前置，不解除任何产品、N40+、M1 或发布门。

- **Goal**：把 VM Spike 收敛成受支持的 Runtime 包。
- **Implementation**：
  1. 将 VM-01–VM-15 契约迁入正式包；
  2. 版本化 State、PRNG、Call Stack、Scene State、Meta Progress；
  3. Effect 请求、取消、Barrier 和宿主响应协议；
  4. Save/Load、Checkpoint、History、Back/Forward；
  5. Normal/Auto/Skip Read/Skip All/Instant 调度；
  6. 结构化诊断映射到 Source Statement ID；
  7. 移除正式包对 Spike Harness 的依赖。
- **Tests**：固定向量、10k corpus、损坏/未来 Save、异步竞态、Barrier、分支截断。
- **Acceptance**：同一 IR/输入在 Node 与 Web Worker State Hash 零差异，全套测试在预算内稳定通过。
- **Exit audit**：E14 复审确认 VM-01–VM-15 全部对齐，独立 Windows / Node 22 完整门绿色，N31 Engineering 通过。最终判定以 [N31-E14](140-n31-e14-runtime-engineering-exit-reaudit.md)为准；Engineering 通过不等于 Product Acceptance，也不授权进入 N32。

### N32 Editor Preview 接入正式 Runtime

> 准入状态（2026-08-20）：[N31→N32 治理与集成检查点](141-n31-n32-governance-integration-checkpoint.md)已通过，集中 Draft PR #51 的 Windows / Node 22 完整门绿色；`RA-N21-004` 只允许本节点 Engineering。N32 Product Acceptance、N40 及以后仍被阻断。

> E1 实施状态（2026-08-21）：Editor 的“完整流程试玩”已停止直接遍历 `StoryStatement`，改为从 Canonical Project 调用 N30 Project Compiler，再由 N31 Runtime 执行 IR；Choice、结局与当前语句定位来自 Runtime Event/State 和 Source Map。两条生产浏览器路线和编译失败关闭均通过。[稳定性纠偏](143-n32-e1-runtime-corpus-stability-audit.md)在不减少 10,000 seeds/20,000 replays/40 chunks/负例、不改变 digest 且不放宽 90 秒门的前提下完成；Draft PR #52 纠偏头 run `32457615078` 用时 4 分 8 秒并通过完整门，E1 Engineering 关闭。Run from Scene/Statement、状态检查器、Back/Forward/Over、热更新与共享 Player Host 仍属于 E2+。

> E2 实施状态（2026-08-21）：正式 Preview Session 已提供变量、调用栈、当前 IR/Statement、revision、逻辑时间与结构化 Compiler/Runtime/Source Map 诊断观察；现代化状态检查器在生产浏览器中实际显示 r1/r4 精确位置和经产品 UI 创建的 Number 初值 2，console error 为 0。Draft PR #53 的 Windows / Node 22 完整门 run `32459445287` / job `96703241983` 用时 4 分 16 秒并绿色，E2 Engineering 关闭。Run from Scene/Statement 明确保留给 E3，详见 [N32-E2 审计](144-n32-e2-preview-session-observability-audit.md)。

> E3 实施状态（2026-08-21）：正式 Preview 已可从所选 Scene 第一条 IR 或所选 Statement 的 Source Map 精确位置 Fresh Run；变量恢复工程默认值、调用栈为空，直接从 `return` 启动会以明确调用上下文诊断关闭。真实生产浏览器的 Scene/Statement/同目标重启路径和 console 0 error 已通过；Draft PR #54 的 Windows / Node 22 完整门 run `32461345815` / job `96708731870` 用时 4 分 16 秒并绿色，E3 Engineering 关闭，详见 [N32-E3 审计](145-n32-e3-run-from-target-audit.md)。

> E4 实施状态（2026-08-21）：Editor Preview 已直接接入正式 Runtime History/Scheduler，提供 Continue、Step Over、Back/Forward 和执行前 Run to Cursor；内部指令 transient、Choice 阻断、调用栈 Step Over、recorded future 与分支 fork 均有正反例及真实生产浏览器证据。Draft PR #55 的 Windows / Node 22 完整门 run `32464584207` / job `96718382563` 用时 4 分 15 秒并绿色，E4 Engineering 关闭，详见 [N32-E4 审计](146-n32-e4-preview-debug-controls-audit.md)。

> E5 实施状态（2026-08-21）：Editor Preview 已建立正式 Effect / Stage Host receipt，消费 Runtime Effect Intent，并提供 awaited 完成/安全取消、Barrier 原因与明确批准、Back checkpoint 通道恢复、reversible compensation 和 Forward replay；未批准时 Stage 明确保持未提交。生产 build 已真实验证 awaited、cancel、Barrier approve 与 pure Effect Back/Forward 差异修正。Draft PR #56 的实现头 `dcfe084` 已通过 Windows / Node 22 完整门 run `32467211148` / job `96726246321`，用时 4 分 9 秒，E5 Engineering 关闭，详见 [N32-E5 审计](147-n32-e5-preview-effect-host-audit.md)。E5 不包含热更新、复杂 GPU 渲染或共享 Web Player Host。

> E6 实施状态（2026-08-21）：Preview 已新增受约束热更新：仅对白/旁白正文与 Choice prompt/label 在稳定 ID、控制流、Source Map 和运行语义不变时，以记录输入重放到新 IR 并保持 State、History、分支位置与 Host receipt；Direction、变量、控制流、等待、待决 Effect/Barrier、transient 光标或编译失败均保留旧 Session，并要求用户明确重启。自动化与 production browser 已验证 `h4/4` 安全迁移、结构变化仍为 `h4/4`、明确重启后回到 `h1/1`。Draft PR #57 实现头 `34dfbf1` 的 Windows / Node 22 完整门 run `32470326283` / job `96735561264` 用时 4 分 20 秒绿色；本机 Node 25 性能差异未通过放宽门槛掩盖，E6 Engineering 关闭，详见 [N32-E6 审计](148-n32-e6-preview-hot-update-audit.md)。

> E7 实施状态（2026-08-22）：新增 portable `@world-studio/runtime-host`，Editor 正式 Preview 与真实浏览器 Worker 验证宿主已消费同一 Effect receipt/reconciliation reducer 和确定性 SHA-256 快照；Editor 私有 Host 已删除。实测同时发现并修正 N23 Benchmark 的四条旧式 Direction 与缺失 `promise_state` 声明，两条正式 Compiler/Runtime 路线均在 production browser 跑到正确结局，Back/Forward 可返回同一结局。纠偏提交 `c93514e` 已通过 Draft PR #58 的 Windows / Node 22 完整门 run `32505981631` / job `96846121361`，用时 4 分 16 秒；此前干净安装暴露的 `dist` 入口问题已按真实日志关闭。详见 [N32-E7 审计](150-n32-e7-shared-runtime-host-audit.md)。

> 出口复审状态（2026-08-22）：[N32 出口复审](151-n32-engineering-exit-reaudit.md)为 Implementation `完整 5 / 部分 1 / 未对齐 0`，Acceptance `0/1`。共享 Host 工程前置已建立，但 `apps/player-web` 仍不存在，旧“构建试玩 HTML”仍是独立 `StoryStatement` 解释器；因此不能把测试宿主称作 Player，也没有 Editor↔正式 Player 画面 Golden。N32 Engineering 总出口仍未通过。

> 顺序纠偏（2026-08-22）：正式 Player Shell 位于 N50、正式 Web 构建位于 N80，不能为了补 N32 的跨宿主 Acceptance 直接跳过 N40–N43。N32 产品门继续挂起；`RA-N21-005` 只允许按计划进入 N40 Route Map Engineering，详见 [N32→N40 治理检查点](152-n32-n40-governance-checkpoint.md)。

- **Goal**：编辑器中看到的结果就是玩家 Runtime 的结果。
- **Implementation**：
  1. Preview 只消费 Compiler 输出，不直接遍历 StoryStatement；
  2. Run from Entry/Scene/Statement；
  3. 当前变量、调用栈、语句、Effect 和舞台状态可见；
  4. Step Back/Forward/Over、Continue、Run to Cursor；
  5. 热更新保留安全状态，结构变更时明确重启；
  6. Preview 和 Player 共用渲染/音频 Host Adapter。
- **Acceptance**：Editor Preview 与 Web Player 对固定输入产生相同状态和画面关键快照。

## 9. R4：专业多视图编辑

### N40 Route Map

> E1 实施状态（2026-08-22）：已建立 portable `@world-studio/route-graph`，从 Canonical Project 调用正式 Compiler 投影场景、控制流事实、连接与诊断；Editor 已实际跑通搜索、选择、进入 Sequence，以及通过 Project Service 改名后 Route/Writer/Script 保持同一稳定 ID。完整 10k 图、布局 Sidecar、分组/折叠/局部加载、路线高亮、可撤销图编辑和 500 ms 增量门仍未完成，详见 [N40-E1 审计](153-n40-e1-route-graph-core-audit.md)。

> E2 实施状态（2026-08-22）：真实 10k 二叉分支 Canonical Project 已经正式 Compiler 投影为 10,000 节点/9,999 边/0 诊断；Route Index 与 Editor 固定窗口将 DOM 限制为 64 节点/256 相关边，并实测分页和搜索。该能力是编译后有界查询，不是存储层 lazy loading；布局 Sidecar、10k 局部编辑和 500 ms 同步仍未完成，详见 [N40-E2 审计](154-n40-e2-10k-route-window-audit.md)。

> E3 实施状态（2026-08-22）：Canonical `layouts/*.json` 已从空壳 `JsonObject[]` 收紧为 `nodeId/x/y` 坐标契约，并新增 Project Service `layout.node.set` / `layout.reset`、确定性自动布局、Editor 坐标编辑和真实工程保存/重开。自动化与 production browser 均证明布局删除重建不改脚本/Compiler 图、场景脚本改名后坐标保持。分组/折叠、视口、拖拽、存储级 lazy loading、10k 局部编辑和 500 ms 门仍未完成，详见 [N40-E3 审计](155-n40-e3-route-layout-sidecar-audit.md)。

> E4 实施状态（2026-08-22）：Canonical Layout 已加入严格分组、折叠与视口契约；创建/更新/删除分组、节点归组、折叠和视口保存全部经 Project Service，分组删除和元数据承载场景删除具备一致性处理。Editor 支持原生拖拽，并提供 `Alt+方向键` 与显式触控方向按钮作为等价可访问路径。自动化、production build 和真实工程刷新恢复均通过；浏览器自动化没有把未成功合成的原生 DnD 手势冒充通过，拖放事件路径由真实 DOM 事件测试覆盖。存储级 lazy loading、高级过滤、运行路线高亮、10k 局部编辑和端到端 500 ms P95 仍未完成，详见 [N40-E4 审计](156-n40-e4-route-layout-interaction-audit.md)。

> E5 实施候选状态（2026-08-22）：Route Window 已支持章节、节点类型和视觉分组 P0 组合过滤，并在过滤后再应用 64 节点窗口。需求审计同时纠正文档口径：PRD P0 只要求过滤，按角色/变量/覆盖过滤属于 P1，不能偷带为当前 N40 完成条件。定向、全仓与 production build 已实际通过；production browser 三次被管理员安全校验拒绝，故 E5 尚未关闭。详见 [N40-E5 审计](157-n40-e5-route-filtering-audit.md)。

> E6a Engineering 状态（2026-08-22）：`ProjectWorkspace` 已新增受限选择性读取能力，Web adapter 通过文件句柄读取计数证明未读取无关文件，Node adapter 在真实临时目录中读取指定切片并拒绝真实目录联接逃逸；本地全仓、production build 与远端 Windows / Node 22 完整门通过。这只是宿主按需读取基础，Route 打开/换窗仍走完整 Canonical Project；后续 E6b 审计又确认必须先补缓存失效所需的无正文 inventory。详见 [N40-E6a 审计](158-n40-e6a-selective-project-read-audit.md)。

> E6b Engineering 状态（2026-08-22）：真实代码审计否决了“无失效依据直接信任 Route 派生缓存”的原顺序。Web/Node workspace 现可在不读取 JSON 正文时枚举源文件 path/size/modified stamp；Web 正文计数保持 0，Node 真实目录修改会改变 inventory version，私有缓存被排除且目录联接继续拒绝；本地与远端 Windows / Node 22 完整门通过。stamp 仅是快速失效提示，不是内容 Hash；E6c 必须补缓存内容校验与全量回退，E6d 才接入 Launcher/Route。详见 [N40-E6b 审计](159-n40-e6b-project-file-inventory-audit.md)。

> E6c Engineering 状态（2026-08-22）：Web/Node 已隔离 `.world-cache` 并在源保存前失效，Node 真实目录联接的缓存读/写/清理全部拒绝。Project Compiler cache artifact 冻结 schema/compiler/IR/inventory、逐源 SHA-256 与 envelope Hash；实际测试证明 miss 全编译、hit 全复用，以及同 inventory 正文篡改时 `source-mismatch` 全量重建。本地全仓及远端 Windows / Node 22 完整门已通过（run `32582972218`）。当前 workspace 编译入口仍全量读取源完成 Hash 校验，且尚未接入 Launcher/Route，不能登记为冷启动 lazy loading。详见 [N40-E6c 审计](160-n40-e6c-verified-compiler-cache-audit.md)。

> E6d 实施候选状态（2026-08-23）：Studio Launcher 的创建/打开/Recent/示例/导入/保存已统一进入 verified workspace Compiler lifecycle；Route 在项目 Hash 对齐时消费该次正式 Compiler 结果，并显示 miss/hit/rebuild 与 compiled/reused 数，未保存改动明确降级为内存临时全量编译。实际自动化证明首次 miss、重开 hit、保存后 miss/rebuild、再重开 hit，future-schema 不调用当前 Compiler；本地完整门与远端 Windows / Node 22 重跑已通过（run `32584113370` / job `97058322039`）。production browser 三次在页面加载前被管理员安全校验拒绝，因此 E6d 尚未关闭。当前仍全量读取源，且打开阶段有 lifecycle probe 与 workspace compile 两次读取，不能登记为冷启动 lazy loading。详见 [N40-E6d 审计](161-n40-e6d-launcher-route-cache-integration-audit.md)。

> E6e Engineering 状态（2026-08-23）：已纠正 E6d 的“未保存改动临时全量编译”路径。Project Compiler 新增不生成发布产物的权威增量分析入口；只有经 Project Service 确认、且 cache 已由宿主验证或当前进程生成的场景局部变更，才可跳过 9,999 个未变场景的依赖 Hash 重算，场景集合变化自动回退完整校验。Route/Sequence/Script 的局部动作已登记变更场景；Project Service 的 ChangeSet 改为独立 SHA-256 事务修订链，工程语义 Hash 继续只负责持久化/Compiler 对齐。完整负载下 10k 单场景改名到 Route 锚点窗口 20 样本 P95 `64.10 ms`（预算 `<500 ms`），1 编译 / 9,999 复用；完整 `npm run check` 退出 0。production browser 仍被管理员策略阻止，冷启动正文局部读取与运行路线高亮仍未完成，故不关闭 N40 Product Acceptance。详见 [N40-E6e 审计](162-n40-e6e-route-edit-sync-performance-audit.md)。

> E7 Engineering 状态（2026-08-23）：Formal Runtime 现在从 active History cursor 投影当前场景、已访问场景和精确 `choiceSelected.optionId`；Flow Route Map 只读消费该轨迹，Back 会撤销未来连接高亮，Forward 会恢复，Runtime 当前场景跨出 64 节点窗口时自动重新锚定。定向 `2 files / 21 tests`、全量 `104 files / 658 tests`、10k/20k Runtime corpus、全部构建/架构/性能门均通过；最终复跑 Route 编辑 P95 `62.14 ms < 500 ms`。Windows CI 两次暴露 65 场景整应用 UI 用例的 5 秒负载敏感 timeout；未放宽门，而是保留三场景整应用产品链，并用真实 65 节点 Compiler 图独立验证窗口锚点，边界用例连续三次为 `11–13 ms`。稳定化提交 `bae2b75` 的 run `32589014554` / job `97069769247` 在 3m40s 完整通过。Vite 实际启动，但 production browser 两次被管理员安全策略阻止在页面加载前，故 browser 与 N40 Product Acceptance 不关闭；冷启动正文局部读取仍缺可信协议。详见 [N40-E7 审计](163-n40-e7-runtime-route-highlight-audit.md)。

> E8a Engineering 状态（2026-08-23）：真实调用链审计发现 Launcher 先由 Lifecycle 全量读源，再由 Workspace Compiler 全量读源，cache hit 只减少编译而没有减少两次正文扫描。本轮先选择性读取 manifest 探测 schema；current schema 只执行一次保留逐源 SHA-256 与 inventory 稳定检查的正式 Compiler 读取，并从同一结果建立 Lifecycle Session；future schema 只读 manifest，不扫描 scene/script/layout 或调用 Compiler。Browser Handle 实测 current miss/hit 的 `[manifest, script, layout]` 均为 `[2,1,1]`，future 为 `[1,0]`；全量 `104 files / 661 tests`、Route P95 `59.05 ms` 和远端 run `32589909573` / job `97071987355` 均通过。current cache hit 仍全量读源，故冷启动局部正文读取与 N40 Product Acceptance 不关闭；下一协议必须落地可信原子 source snapshot identity 或内容寻址不可变目录。详见 [N40-E8a 审计](164-n40-e8a-single-project-read-audit.md)。

> E8b Engineering 状态（2026-08-23）：新浏览器受管工程已迁移到事务型 IndexedDB workspace。source bodies、按 path 排序且带逐文件 SHA-256 的 trusted commit 与派生缓存失效在同一 strict transaction 发布；单调 generation、commit Hash、expected-version 冲突拒绝及正文损坏闭锁均有实际测试。Studio Launcher 的新建、示例、五分钟验收、ZIP 导入和 Recent 重开已接入，历史 OPFS 与外部目录保持兼容但不被错误升级为 trusted。定向 `5 files / 17 tests`、全量 `106 files / 665 tests`、Route P95 `59.28 ms` 及 GitHub Windows / Node 22 run `32643998215` / job `97205305615` 均通过；浏览器仍被管理员安全策略阻断。Compiler/Route 尚未消费 trusted commit，故 E8b 只关闭可信宿主前置，不关闭正文局部读取或 N40 Product Acceptance；E8c 继续建立受信 cache hit 与完整回退。详见 [N40-E8b 审计](165-n40-e8b-atomic-source-commit-audit.md)。

> E8c Engineering 状态（2026-08-23）：调用链审计纠正了“只读 manifest/选中场景即可进入当前完整编辑器”的超前计划，因为同步 `ProjectLifecycleSession`、App 与 Project Service 仍要求完整 Canonical Project/baseFiles。Compiler disposable cache 已显式升级为 v2，包含 exact source snapshot、逐源 Hash、正式 scene cache 与 envelope Hash；只有自行验证 trusted commit schema/generation/path/size/Hash/version，且前后 revision 稳定时，warm reopen 才从 snapshot 恢复并保持 `fullReads=1`。损坏 cache 会使计数增至 2 并重建；伪造 commit、外部目录和旧宿主继续 full verified read。定向 `5 files / 20 tests`、全量 `106 files / 669 tests`、Route P95 `60.81 ms` 及 GitHub Windows / Node 22 run `32645089657` / job `97208020611` 均通过；production browser 仍被管理员安全策略阻断。E8c 关闭重复 source-store 正文读取，不减少 cache 总正文体积，场景级 lazy loading 必须先引入 Lazy Project Session，N40 Product Acceptance 不关闭。详见 [N40-E8c 审计](166-n40-e8c-trusted-warm-reopen-audit.md)。

> E8d Engineering 状态（2026-08-23）：Project Domain 已冻结 `ProjectStructureIndex`，并把严格解码拆为 manifest → chapters → scenes 三阶段；受管 workspace 可在 trusted commit 前后同 revision、逐正文 size/SHA-256 复核下，只读取这三类结构文件。300 scene 按 `[1,1,256,44]` 遵守 256 path 上限，revision race、同版本正文篡改和真实 fake-IndexedDB 都有失败/成功实测；`fullReads=0` 且不读取 script/layout/global。定向 `6 files / 43 tests`、全量 `107 files / 674 tests`、Route P95 `59.61 ms` 与 GitHub Windows / Node 22 run `32646157815` / job `97210628628` 均通过。该 API 尚未接入 Launcher/Route/可编辑 Session，不能登记为场景正文 lazy loading；E8e 必须让 Route 首屏消费结构与 Compiler 图，再按窗口/选中 scene 补读 layout/script。详见 [N40-E8d 审计](167-n40-e8d-lazy-project-structure-audit.md)。

> E8e Engineering 状态（2026-08-23）：调用链审计证明 cache v2 含完整 source snapshot，不能直接冒充局部 Route 首屏；实现改为无源正文 `.world-cache/route-overview-v1.json`，绑定 trusted commit、严格验证图与结构签名。受管 Recent 已增加只读 Route 首屏，100 scene 首屏 selected batches `[1,1,100,64]`、`166 files / 64 layouts / fullRead=false`，第二窗口只读 36 layouts；script/global 不读取。真实 fake-IndexedDB Launcher 路径、损坏/伪造/版本漂移反例、定向 `7 files / 38 tests`、全量 `108 files / 678 tests`、Route P95 `57.64 ms` 与 GitHub Windows / Node 22 run `32647435399` / job `97213728178` 均通过。完整编辑器只在明确点击后加载；场景内容编辑、结构/topology 分页和 production browser 尚未关闭。详见 [N40-E8e 审计](168-n40-e8e-trusted-route-first-overview-audit.md)。

> E8f Engineering 状态（2026-08-23）：真实调用链审计发现局部读取若继续调用整工程 `writeFiles()` 会删除未加载文件，因此先冻结受管 IndexedDB selected atomic write，再接 Route → 单场景 Script。scene page 具备 `unloaded/loading/ready/dirty/error/stale` 六态，只读所选 `script+layout`、`fullReads=0`，复用正式 Story Language 诊断与 Undo/Redo；保存集合精确为 script，expected-version 冲突零覆盖，并在同一 strict transaction 使 Compiler/Route 派生失效。产品 E2E 已完成 Route 修改 ending → 原子保存 → 完整工程重编译 → Script 重读同一修改。因局部页尚无全局 ID/引用索引，E8f 安全限制为既有语句内容编辑，结构/ID/引用变化失败关闭。定向 `4 files / 14 tests`、全量 `109 files / 682 tests`、Route P95 `60.73 ms` 与 GitHub Windows / Node 22 run `32648653153` / job `97216734611` 均通过；完整 Sequence、结构/topology 分页、外部宿主和 production browser 仍缺。详见 [N40-E8f 审计](169-n40-e8f-lazy-scene-edit-loop-audit.md)。

> E8g Engineering 状态（2026-08-23）：现有完整 Writer 依赖全工程 scenes/characters/variables/assets，不能直接复用而保持 lazy read；实现改为从同一 Lazy Scene `ScriptSourceSession` 投影安全内容 Sequence。Script/Sequence 共用稳定 ID 选择、dirty、诊断、history/future 与保存边界；dialogue/narration、choice 文本、wait 和 ending 可通过正式 patch 编辑，其余结构/引用字段只读。150 statements 实际分页 `64/64/22`，1,000 次 Script/Sequence 交替修改保持同一 statement ID 与 0 error diagnostics；Route→Sequence→Script→Undo/Redo→保存→完整重读产品 E2E 通过。复审还把可能携带全局变量引用的 set/condition expression 收紧为只读。定向 `4 files / 13 tests`、全量 `110 files / 687 tests`、Route P95 `109.57 ms` 与 GitHub Windows / Node 22 run `32649874611` / job `97219677591` 均通过。完整 Sequence 结构编辑、全局 edit index、外部宿主和 production browser 仍缺。详见 [N40-E8g 审计](170-n40-e8g-lazy-sequence-projection-audit.md)。

> E8h Engineering 状态（2026-08-24）：完整 Compiler 成功后发布独立 `.world-cache/lazy-edit-index-v1.json`，覆盖全局 project/chapter/scene、character/variable/asset、statement/option/text 及扩展声明和反向引用；artifact 绑定 trusted source version、Envelope Hash、严格 owner/reference 关系。Route-first scene 读取索引不访问 source bodies，并与当前真实 script IDs 精确交叉校验；保存后旧索引随派生失效并从 page 移除。定向 `5 files / 20 tests`、全量 `111 files / 692 tests`、本地 10k 索引 `140.49 ms`、Windows `308.36 ms`（预算 500 ms）与纠偏后 GitHub run `32651592837` / job `97223944981` 均通过。首次 run `32651352033` 因在并行 jsdom 重复执行性能断言得到 `517.66 ms` 失败，已收敛到专用 Node 性能门，预算未放宽。结构命令仍等待 index + Compiler/Route 语义事务，不能称为完整 Sequence。详见 [N40-E8h 审计](171-n40-e8h-trusted-lazy-edit-index-audit.md)。

> E8i Engineering 状态（2026-08-24）：Route-first Sequence 已开放首个失败关闭结构事务：在非终止锚点后新增一条 narration。事务用 E8h 索引验证 statement/text ID 全局唯一，以正式 Story Language P0 命令生成候选，由 portable Compiler 精确证明“仅新增该旁白”、Route 证明 facts/edges 不变，并在 apply/save 两次校验后执行 expected-version selected atomic write。真实 fake-IndexedDB 已完成插入→保存→完整 Compiler/Route/索引重建→局部重开；缺索引、重复 ID、终止锚点、额外变更和 revision race 均拒绝。全量 `113 files / 699 tests`，本地/Windows 10k 双预检 `4.37/10.25 ms < 500 ms`，GitHub run `32652926653` / job `97227196050` 4 分 59 秒绿色。默认空白工程仅有 end，首部/终止前插入及删除/移动仍待 E8j；不能登记为完整 N41。详见 [N40-E8i 审计](172-n40-e8i-lazy-narration-structural-transaction-audit.md)。

> E8j Engineering 状态（2026-08-24）：Story Language 新增显式 before-anchor 命令且不改变旧 append 语义，Compiler narration 结构预检扩展为精确前插/后插/删除/移动联合；Route-first Sequence 可在所选语句前新增旁白，并对旁白执行上移、下移、删除。真实 fake-IndexedDB 已从默认仅含 `end` 的空白工程完成首条旁白→保存→完整 Compiler/Route/索引重建→重开→再插入→移动→删除闭环；apply/save 双预检、同 revision index、expected-version selected write 与失败关闭保持不变。红测为 `4 failed / 19 passed`，最终全量 `113 files / 704 tests`；本地/Windows 10k 前插/移动/删除为 `4.01/2.44/2.38 ms` 与 `9.12/7.24/7.35 ms`，均 `<500 ms`；GitHub run `32654253484` / job `97230449299` 4 分 54 秒绿色。当前只关闭 narration 最小结构闭环；其他 P0、跨实体引用、structure/topology 分页、production browser 与 N41 仍缺。详见 [N40-E8j 审计](173-n40-e8j-lazy-narration-structure-flow-audit.md)。

> E8k Engineering 状态（2026-08-24）：Route-first 现在只读取 manifest、全部 chapter topology、当前最多 64 个 scene 与对应 layout；100 场景首窗由 `[1,1,100,64]` 收敛为 `[1,1,64,64]`（166→130 源文件），第二窗 `[1,1,36,36]`，零匹配 `[1,1]`，Script/全局正文/full read 均为 0。审计纠正了从文件名猜 scene ID 的隐含假设，Route graph 与 artifact v2 使用 Canonical scene 顺序和权威 scenePaths，自定义路径及重签篡改均有失败关闭测试。首次 Windows run `32655628393` 暴露 `644.88 ms > 500 ms` 后未放宽预算；紧凑 artifact 和移除 trusted adapter 已完成校验的重复 30k commit Hash 后，本地全门为 `157.27 ms`，Windows run `32656159511` / job `97235137319` 为 `301.56 ms`，5 分 01 秒绿色。最终全量 `113 files / 710 tests`。这关闭 Route structure/topology scene/layout 分页，不等于完整 Lazy Project Session、增量 topology 写、N40 Product Acceptance 或 N41。详见 [N40-E8k 审计](174-n40-e8k-trusted-route-topology-page-audit.md)。

- **Goal**：大型故事结构可理解、可定位、可诊断，但不维护第二份剧情逻辑。
- **Implementation**：章节、场景、标签、选择、条件、跳转、调用、结局自动投影；布局 Sidecar；分组/折叠/搜索/过滤/局部加载；不可达/悬空/循环；路线高亮；双击进入 Sequence。
- **Tests**：真实 10k 分支图，不使用线性轨道替代；布局删除不丢剧情；脚本增量更新保留布局。
- **Acceptance**：10k Route 在目标预算内局部编辑，修改 Script 后图在 500 ms 内同步。

### N41 Sequence

- **Goal**：提供场景内部完整的可视化语义编辑。
- **Implementation**：全部 P0 块、类型化 Inspector、运行高亮、搜索插入、批量、折叠、跨视图定位；复杂条件允许进入 Script 但不得丢失。
- **Acceptance**：Sequence 和 Script 连续互改 1,000 次，语义和稳定 ID 不漂移。

### N42 Stage 与基础时间线

- **Goal**：导演能操控镜头、角色、背景、音频和基础特效。
- **Implementation**：多轨、关键帧、缓动、运动轨迹、镜头、基础转场；Stage 操控生成语义命令；当前 Runtime 状态与时间线同步；ADV/NVL/气泡模板。
- **Acceptance**：AC-13 样例在 Editor Preview 和 Player 中一致。

### N43 七工作模式与跨视图协议

- **Goal**：Writer、Director、Flow、Production、Debug & QA、Mobile Focus、Quick Start 修改同一工程。
- **Implementation**：模式是布局/工具优先级，不是独立数据；Beginner/Pro 可逆；统一语义色/图标；减少动效；选中/上下文同步协议。
- **Acceptance**：AC-03、04、10、11、12 全部在桌面通过，移动任务另在 N91 验收。

## 10. R5：玩家与 Gal 基础

### N50 Player Shell 与输入

- **Goal**：形成可嵌入 Web/Windows/Android 的正式玩家。
- **Implementation**：标题、开始/继续、对话、选择、历史、设置、存读档、错误页；鼠标/键盘/触摸/基础手柄；响应式安全区；无障碍语义。
- **Acceptance**：同一 Player Core 被三宿主使用，不复制剧情逻辑。

### N51 Gal 配置中心

- **Goal**：所有 P0 Gal 行为可配置、可继承、可预览。
- **Implementation**：Basic/Advanced、搜索、恢复默认；默认/项目/平台层；显示、文本、推进、Auto、Skip、Save、History、Back、画面、音频、选择、路线、输入；Master/BGM/Voice/SFX/Ambient/UI；Windows/Web/Android Profile。
- **Tests**：继承优先级、撤销、非法组合、序列化、运行时热应用、平台覆盖。
- **Acceptance**：REQ-GAL 全部 P0 字段可从 UI 修改并影响 Preview/Player。

### N52 Save、History、Auto、Skip、Back/Forward

- **Goal**：特色播放控制成为玩家功能而非 VM 测试。
- **Implementation**：存档槽、自动/快速保存、截图和元数据；历史；独立 Auto 策略；四种 Skip；玩家速度；媒体分类策略；Stop Point；已读集合；分支改变截断 Forward；Barrier 解释。
- **Acceptance**：AC-15、16 在 Web Player 通过，随后在三端复用同一向量。

## 11. R6：制作自动化、QA 与本地化

### N60 Debugger 与 Story QA

- **Goal**：创作者在发布前发现结构和状态错误。
- **Implementation**：从任意入口运行；断点、单步、继续；变量、调用栈、舞台；不可达、无出口、悬空、缺失资源、无交互循环；错误跳源码；诊断抑制需有理由。
- **Acceptance**：QA Golden Project 必须检出预置错误且无误报阻断正常路线。

### N61 本地化与配音

- **Goal**：同一稳定文本 ID 支持多语言生产和运行切换。
- **Implementation**：源/目标语言、CSV/XLSX、missing/draft/reviewed/outdated/locked、运行时切换、CJK/Ruby/禁则、字体回退、Voice Asset 映射。
- **Acceptance**：CJK Golden 在导出/导入后换行和 ID 不变，三端切换语言状态一致。

### N62 自动 Route、Gallery、Replay、Music、Ending Catalog

- **Goal**：把核心差异化自动化真正接入 Compiler 和 Player。
- **Implementation**：从资源标签、故事引用和解锁条件生成 Catalog；允许标题/排序/封面/剧透/本地化覆盖；Scene Replay 使用隔离 Checkpoint；退出恢复原状态；缩略图缺失诊断；玩家流程图只显示已发现内容。
- **Acceptance**：AC-17、18、20；Catalog 不要求维护第二份手工列表。

## 12. R7：资源与 Optimization Center

### N70 完整 Asset Pipeline

- **Goal**：源素材安全、可追踪并可为构建生成平台变体。
- **Implementation**：图像/音频/视频/字体导入；MIME/魔数/容量安全；标签/搜索/引用计数；重命名；缺失/未使用/超规格；Source/Derivative DAG；平台变体；删除派生后重建。
- **Acceptance**：Asset Golden 在备份、恢复、重命名、GC、重建后引用和内容 Hash 正确。

### N71 Optimization Center

- **Goal**：优化以下载、安装、内存、加载、帧时间和稳定性联合预算驱动。
- **Implementation**：Quality First/Balanced/Small Download/Low Memory/Custom；预算面板；体积排行；重复资源；First Playable/章节/语言/语音依赖；优化解释、撤销、锁定和原始回退。
- **Acceptance**：每个建议显示输入证据、预计收益、实际收益和回退操作，不以源文件大小冒充综合收益。

### N72 Dicing 和平台资源变体集成

- **Goal**：把现有强算法转成可发布收益。
- **Implementation**：Dicing Group/Atlas/编码/Runtime Loader 接入 Build；三端格式/解码/显存/Draw Call 测量；无收益回退；差异热图和逐像素验证。
- **Acceptance**：AC-21、22、23；Golden Dicing 三端无接缝、可重建、报告完整。

## 13. R8：三端玩家与构建

### N80 Web Build

- **Goal**：一键生成可离线托管的 Web/PWA 玩家。
- **Implementation**：Release IR、资源、Service Worker、压缩、许可证、版本、Hash、调试映射策略；本地预览服务器；无网络运行。
- **Acceptance**：从空 checkout 构建，产物在两种主流浏览器离线运行固定路线。

### N81 Windows Player Build

- **Goal**：生成便携包和安装包，而不是复用编辑器开发壳。
- **Implementation**：轻量 Player Host、WebView Runtime 策略、图标/版本、安装/卸载、签名或可验证 Hash、崩溃日志和回退。
- **Acceptance**：干净 Windows VM 安装、运行、存档、升级、卸载通过。

### N82 Android Player Build

- **Goal**：生成可安装 APK/AAB 和可验证签名产物。
- **Implementation**：Player Host、私有存储、Asset Packaging/Delivery、方向/安全区、后台恢复、Keystore 向导、APK/AAB、签名验证。
- **Acceptance**：AND-L/AND-R 安装运行、前后台、存档、升级和固定路线通过。

### N83 Build Center 与 Release Manifest

- **Goal**：Windows 编辑器以统一界面构建三端并解释失败。
- **Implementation**：平台/Profile、应用 ID/版本/图标、Preflight、进度、取消、日志、产物目录、失败分类、可复现 Manifest、SBOM、Provenance、许可证/隐私/第三方声明/发布说明/校验值/回退说明。
- **Acceptance**：AC-07、26 的产物由同一 Revision、同一工程和可追溯流水线生成。

## 14. R9：Windows 与 Android 编辑器

### N90 Windows Editor Productization

- **Goal**：把 Web Editor 装入最终 Windows Host 并提供完整本地工程能力。
- **Inputs**：只有到此节点才恢复 CL-03 尚需的系统 picker、真实 WAL 强杀、更新、签名和 WIN-L 工作。
- **Implementation**：根据产品切片选择 Electron/Tauri；系统项目选择；安全 Bridge；安装/更新/回退；崩溃恢复；Build Center；WIN-L 测量。
- **Acceptance**：WS-01–WS-18、AC-01/02/08/09/14/27 的 Windows 部分通过。

### N91 Android Editor Productization

- **Goal**：Android 是完整编辑端，不是响应式预览器。
- **Implementation**：Mobile Focus、底部导航、任务化 Inspector、IME、SAF 导入导出、私有工作区、后台恢复、低内存策略、触屏替代；使用相同 Domain/Compiler/Runtime。
- **Acceptance**：AND-L/AND-R 上完成新建工程、写对白、添加分支、修改演出、预览、保存、导出；AI/AS 契约和 AC-01/02/10/14/27 Android 部分通过。

### N92 工程交换和三宿主一致性

- **Goal**：Windows、Android、Web 对同一工程和 Runtime 语义无漂移。
- **Implementation**：工程 ZIP/目录交换、Schema 迁移、IR/State/Save Hash 对照、平台 Capability 明确降级、冲突和失败可诊断。
- **Acceptance**：同一工程连续在 Windows/Android 编辑一周，Web/Windows/Android 固定输入状态零差异。

## 15. R10：Benchmark Episode

### N100 内容生产

- **Goal**：只使用 WorLd Studio 制作 20–30 分钟原创校园短篇。
- **Required content**：3+ 章节、8+ 场景、2+ 主路线、4+ 结局、角色/表情/CG/BGM/Voice/SFX、变量/条件、Save/History/Auto/Skip/Back、Gallery/Replay/Music/Ending、多语言样例。
- **Rule**：禁止直接修改生成 IR、Catalog 或构建产物绕过编辑器。
- **Artifacts**：完整源工程、素材许可、测试路线、三端产物。

### N101 创作者验证

- **Goal**：证明信息架构和工作流对目标用户可用。
- **Method**：至少 5 名目标创作者完成新建、写作、分支、演出、调试、构建任务；记录完成率、时间、错误和 Severity。
- **Acceptance**：核心任务至少 8/10 无指导完成；Severity 0/1 为 0。

### N102 设备、稳定性和一致性

- **Goal**：作品在目标设备真实可发布。
- **Tests**：WIN-L、AND-L、AND-R；冷启动、内存、帧时间、包体；2 小时 Soak；弱网/断网/损坏/磁盘不足；Save 升级；三端路线 Hash 和截图 Golden。
- **Acceptance**：AC-14、20、23、24、25、26 全通过。

## 16. R11：M1 Stable 与发布

### N110 Release Assurance

- **Goal**：编辑器和玩家具备可重复、可撤回的正式发布证据。
- **Implementation**：版本冻结、依赖审计、SBOM、Provenance、签名、恶意工程测试、安装/升级/卸载、隐私/许可证、崩溃符号、备份恢复演练、撤回和回退。
- **Acceptance**：AC-27 通过，无阻塞级数据损坏、安全、状态漂移或安装问题。

### N111 M1 Gate

M1 只有同时满足以下条件才能标记 Stable：

- `REQ-PRJ` 至 `REQ-OPT` 的 P0 状态全部为“发布完成”；
- `AC-01` 至 `AC-27` 全部通过；
- Benchmark Episode 三端正式包由同一 Revision 生成；
- Windows/Android 编辑器正式安装包通过升级和回退；
- 全仓 `check`、E2E、设备矩阵和 Release Assurance 全绿；
- 产品负责人、Architecture、QA、Security、Release 联合签字。

任何“部分通过”“待补真机”“仅原型”“已知红项”都不能带入 Stable。

## 17. 每周执行节奏

### 周一：节点冻结

- 只选择一个当前 Gate 的最小用户结果；
- 冻结 REQ/AC、Schema、失败路径和演示脚本；
- 明确不做项，防止横向扩张。

### 周二至周四：纵向实现

- 优先贯通 UI → Command → Domain → Compiler → Runtime/Storage；
- 测试与实现同 PR；
- 每天使用非固定工程运行一次主流程。

### 周五：作品演练

- 从空目录创建工程；
- 不使用开发者工具修数据；
- 生成当周可玩的 Web Build；
- 记录阻塞点进入下一节点，而不是用手工步骤掩盖。

### Gate 评审

- 演示真实产物，不演示测试日志代替产品；
- 随机选择一个非示例工程复验；
- 失败时回到当前节点，不开启新功能线。

## 18. 优先级与并行限制

最多并行三条线：

1. **主产品纵向线**：始终占主要资源；
2. **质量/测试线**：为当前节点建立证据；
3. **平台/风险线**：仅处理当前节点的确定阻塞。

禁止并行：P1/P2 功能、云服务、市场、AI、实时协作、iOS、复杂插件生态。它们在 M1 Gate 后重新评审。

## 19. 最近执行顺序

下一批工作严格按以下顺序：

1. N00：建立产品主线和正式包边界；
2. N10：通用 Canonical Project Schema；
3. N11：项目级 Command/Transaction；
4. N12：项目首页、新建/打开/导入/导出；
5. N13：章节/场景/角色/变量管理；
6. N20：补齐 Story Language P0；
7. N21：最小 Writer/Sequence；
8. N22：真实资源 Stage/Preview；
9. N23：五分钟可玩切片工程门 → N21 单参与者验收 → N23 双参与者产品验收；
10. N30–N32：正式 Compiler/Runtime/Preview。

在 N23 通过前，CL-02/03/04 只维护已有证据，不继续新增探索 Spike。

## 20. M1 之后的需求入口

M1 Gate 通过后才允许重新规划 P1/P2。规划顺序必须重新基于真实创作者数据，而不是直接照抄当前愿景池：

1. 汇总 Benchmark Episode、5 名创作者和首批发布作品的数据；
2. 从[追踪矩阵的 P1/P2 保留登记](90-m1-requirement-traceability.md)选择问题，不先选择技术；
3. 为候选能力建立收益、复杂度、兼容、安全和迁移评估；
4. 产品负责人重新确认 M2 范围、预算和退出条件；
5. iOS、云同步、实时协作、插件市场、AI、Storylet 和高级 3D 分别建立独立 Gate；
6. M1 工程、存档和玩家兼容不得为了后续功能被静默破坏。

因此，所有 PRD 需求均有去向：P0 进入 N00–N111，P1/P2 进入 FUTURE 登记；未排期不等于删除，也不允许提前实现扰乱 M1 主线。
