# 当前开发情况审计（N31-E5 Runtime History 候选）

> 审计日期：2026-08-15
> 本轮实现基线：`f0f94aed57157c21ad2163c36e1466814ed8697c`（N31-E4 最终远端绿色头）
> 审计分支：`agent/n31-runtime-e5`
> 当前 PR：待本轮本地完整门通过后创建 Draft PR
> 审计范围：仓库实现、自动化门、需求追踪、交付节点、Golden Project 与 GitHub 集成状态
> 权威边界：本文件是当前审计快照；节点状态仍以 [M1 需求与验收追踪矩阵](90-m1-requirement-traceability.md)为准。`RA-N21-001/002` 已关闭，`RA-N21-003` 仅允许工程候选推进至 N31，不改变 N21/N23/N30/N31 产品未通过事实，也不授权 N32。

## 1. 执行结论

当前代码已经具备一个可实际使用的“源项目创作开发版”：创作者可以新建或打开任意受支持工程，管理章节、场景、角色和变量，编辑完整 P0 故事语言与 Writer/Sequence 卡片，并保存、关闭、重开、导入和导出工程。

当前代码已能在编辑器中执行最小故事流程并构建独立 HTML。N30-E1/E2 形成 portable Compiler；N31-E1–E5 又建立不依赖 Spike 的正式 Runtime 执行、确定状态、Effect/Barrier、canonical Save/Load 与 History，会话支持 Back/Forward、成功分支原子截断、input tombstone 及 Barrier Back 阻断。它仍不是完整游戏引擎：正式 Runtime 尚缺 Auto/Skip、完整 Source Map 诊断与正式大规模 Corpus，Editor/Player 也尚未接入，更没有玩家存档槽、资源构建和三端发布包。

- 源项目能否落地：**能，在当前候选分支上可完成真实创建、编辑和持久化**；
- 编辑器内流程能否运行：**能，真实浏览器已完成两条路线并到达两个结局**；
- 独立试玩项目能否落地：**能，当前故事可下载为自包含离线 HTML 并运行到结局**；
- 正式编译数据能否落地：**能，N30-E1/E2 四类 Golden 已产生稳定 IR，Compiler 工程出口条件已形成候选；但 N30 Product Acceptance 仍被真人门阻断**；
- 正式 Runtime 数据流能否落地：**局部能，N31-E1–E5 已执行真实 Compiler IR、形成可哈希确定状态，并实现 Effect/Barrier、canonical Save/Load 与 History/Back/Forward；但调度、History 存档封装、玩家槽位和完整宿主接入未完成**；
- 可发布游戏能否落地：**不能，Runtime → Player → Build 链仍未贯通**；
- M1 是否完成：**不能，27 条发布验收仍为 `0/27` 完整通过**；
- 当前执行位置：**N20 已通过；N21 真人 0/1；N22 工程门通过；N23 真人 0/2；N30-E1/E2 为工程出口候选；N31-E1–E5 为工程候选，N32 被阻断**；
- GitHub 是否已集成：**指定集成分支与 Draft PR #32 已建立且远端全检通过，但 N00–N21 与例外仍未进入 `main`**。

## 2. 审计证据基线

| 审计对象 | 基线结果 | 判定 |
|---|---:|---|
| Workspace 边界 | 12 个 workspace；4 个计划产品边界 | 审计通过 |
| 需求登记 | 50 条：10 USP、13 P0 模块、27 AC；6 个 owner | 审计通过 |
| Golden Project | 7 类：Benchmark、Branching、CJK、Media、Recovery、Size、Tiny | 审计通过 |
| N23 内容量门 | 2 条路线：366/370 秒；各 27 可读节点；Wait 贡献 0 秒 | 审计通过 |
| N23 产品验收门 | `N23-PA-01`；2 个参与者槽位、6 个任务、编辑器/独立 HTML 各 2 条路线 | 协议通过，真人记录 `pending-participants`（0/2） |
| N23 验收启动门 | Windows 双击入口、固定 `127.0.0.1:43123`、生产 HTML/JS/CSS HTTP 拉取 | 烟测通过；不等同 Windows 安装包 |
| 常规测试 | 98 个并行测试文件、619 项测试；另有 1 项串行存储测试 | 本轮完整门通过 |
| VM 重型门 | 5 项 | 最近完整门通过 |
| N31 Runtime 定向门 | 31 项 | 本轮通过；真实浏览器 Worker 正式向量 `data-runtime=passed`、完整 Worker `data-status=passed` |
| 构建 | 12 个 workspace | 本轮完整门通过 |
| 架构门 | 79 个 portable 模块、4 个 Node adapter | 本轮通过 |
| 性能门 | Script 10 项、Asset 4 项 | 最近完整门通过 |
| Editor bundle | 636.67 kB，gzip 183.52 kB | 构建成功，五分钟源随产品入口进入 bundle；仍存在超过 500 kB 的体积警告 |
| GitHub CI | E4 最终头 `f0f94aed57157c21ad2163c36e1466814ed8697c` 的 `product-baseline` run `31887473521` 通过；E5 待推送 | 基线通过；本轮远端门待执行 |

这些数据只证明工程候选的可重复性，不把孤立测试、Spike 或构建成功换算为产品完成比例。

## 3. 交付节点审计

| 节点 | 当前状态 | 已获得的结果 | 尚欠门禁 |
|---|---|---|---|
| N00 | 工程通过 | 产品边界、依赖方向和迁移纪律 | 交付栈尚未合入 `main` |
| N01 | 工程通过 | 需求登记、Golden 与证据协议 | 交付栈尚未合入 `main` |
| N10 | 工程通过 | Canonical Project 基线 | 产品发布链仍未建立 |
| N11 | 工程通过 | Source Session 与存储边界 | 正式桌面/移动宿主待后续节点 |
| N12 | 工程通过 | 新建、打开、最近、样例、导入导出、冲突处理 | Android SAF 与正式壳待 N91/N90 |
| N13 | 工程通过 | 章节/场景/角色/变量、引用迁移、保存重开 | 七工作区统一实体体验待后续节点 |
| N20 | 通过 | 完整 P0 Story Language、语言服务、稳定 ID Patch、100k 门 | 正式编辑器与 Runtime 接入待 N41/N30+ |
| N21 | 工程通过，产品验收中 | 完整 P0 卡片、类型化 Inspector、批量事务、键盘/触屏等价；主持人预演已修复空工程非法角色/变量/资源引用插入，协议与数据模型重新对齐 | 权威记录仍为 `pending-participant`，真实非程序用户 20 分钟 T01–T08 尚未执行 |
| N22 | 工程验收通过 | 原候选能力全部保留；真实媒体、舞台、播放态、过渡和浏览器证据完整 | Pixi/WebGL、复杂镜头/关键帧/模板与正式 Runtime 归后续节点 |
| N23 | E1–E7 工程/验收就绪候选 | 五分钟作品可打开、编辑、保存、重开、运行和导出；双参与者协议已冻结；生产验收环境可双击启动并经 HTTP 烟测 | 权威记录仍为 `pending-participants`（0/2），两名非实现者尚未执行 |
| N30 | E1/E2 工程退出候选 | portable Compiler、Runtime IR v1、语句 CFG/SCC、双 Hash 场景缓存、六文件 Debug/五文件 Release、完整 Catalog、发布输入、四类 IR Golden | 本地与远端完整门通过；N21/N23 产品门仍阻断 N30 Product Acceptance |
| N31 | E1–E5 工程候选 | 正式 Runtime、确定 State、PRNG、Scene/Audio/Meta、Effect/Barrier、canonical Save/Load/History、严格身份/Hash 拒绝、pending Effect 恢复、Back/Forward、分支截断、tombstone、Barrier 阻断与跨 Worker 向量 | 仍缺 Auto/Skip、Save migration、History 存档封装、正式 10k Corpus、完整 Source Map 诊断与 Editor/Player 接入；Product Acceptance 被阻断 |
| N32 及以后 | 未开始或仅有前置 Spike | 已有 VM/平台算法证据可复用 | `RA-N21-003` 明确阻断正式接入、Player、QA、构建与发布 |

“工程通过”表示当前候选提交的自动化证据成立；只有节点产物、用户任务、远端门和集成状态同时满足，才可宣告产品节点通过。

## 4. 当前真实能力矩阵

| 能力 | 当前分支可用 | 产品边界 |
|---|---|---|
| 项目入口 | 新建、打开、最近、示例、导入、导出 | 正式 Windows/Android 壳未完成 |
| 本地源工程 | Canonical 源文件、Asset Index 与源 Blob 的确定性自包含 ZIP、File System Access/OPFS、Node 目录适配；Writer 内容已写回同一生命周期工程 | 派生资源按可重建缓存排除；移动 SAF 与安装产品未完成 |
| 内容实体 | 章节、场景、角色、类型化变量、稳定 ID 引用迁移 | 字体、本地化、Gal 等完整产品模块未完成 |
| Story Language | P0 语句、解析、诊断、补全、定义/引用、重构、增量处理；N30 已编译为 Runtime IR v1，N31-E1–E5 正式 Runtime 已消费基础语义、维护确定状态并形成 Effect/Barrier、Save 与 History 协议 | 调度、完整宿主协议及 Editor 接入仍缺 |
| Writer/Sequence | 全 P0 卡片、类型化 Inspector、增删复制排序、批量、折叠、保存重开 | N21 真人任务未通过；完整专业 Sequence 待 N41 |
| 资源/Stage | 真实 Blob 导入与释放、BG/多角色/四路音频状态预览、角色几何、安全区、DPR、输入等价、错误回退、Render Host v2、Canvas 2D 场景层、基础 Move、Hide/Fade 与角色层 Show 单语句过渡、真实 PNG/WAV Media Golden 运行链、浏览器导入/重开与视觉基线 | Canvas 2D 仍是编辑器 Preview 后端；Pixi/WebGL、镜头、复杂关键帧、模板和正式 Runtime 归后续节点 |
| Route | Choice 的简单派生图 | 完整节点/边、诊断、布局、局部加载未完成 |
| Compiler/Runtime | N30 Compiler 已产出稳定 IR；N31-E1–E5 正式 Runtime 已执行控制流、Choice、Wait、结局，维护可哈希 State，处理 Effect/Barrier，canonical 保存/加载，并通过独立 History Session 回退、前进和分支；Editor Playable Preview 与独立 HTML 仍可运行原最小控制流 | 正式 Runtime 尚无调度，Editor/Player、媒体宿主协调、History 存档与玩家槽未接入；不能把 E5 或 VM Spike 当完整 Runtime |
| Player 与 Build | N23 单文件离线试玩候选可下载、确定性生成并运行双路线 | 正式 Web/PWA、Windows/Android 可玩包、资源构建、签名、安装、升级和发布均无 |

## 5. P0 需求对齐

| P0 模块 | 审计判定 | 关键缺口 |
|---|---|---|
| REQ-PRJ | 局部可用 | 自包含资源 ZIP 已通过；仍缺 Android SAF、正式壳、七工作区恢复与发布验收 |
| REQ-ROUTE | 隔离原型 | 完整 Route 语义、诊断、布局、跨视图入口 |
| REQ-SEQ | 局部可用 | N21 真人门、N41 完整 Sequence 与 Stage/Script 联动 |
| REQ-SCRIPT | 局部可用 | 正式代码编辑器呈现、全视图集成、外部编辑 E2E |
| REQ-STAGE | 局部可用 | N42 正式高性能渲染宿主、镜头、复杂关键帧、UI 模板、正式 Runtime 与三端同步 |
| REQ-UX | 局部可用 | 七模式、Beginner/Pro、真机与非程序用户验收 |
| REQ-ASSET | 局部可用 | 源 Blob/Index 迁移已通过；仍缺视频/字体、引用 UI、平台变体、构建报告接入 |
| REQ-RUNTIME | 工程候选 | N31-E1–E5 已贯通 Compiler IR、确定状态、Effect/Barrier、canonical Save/Load/History、Back/Forward、分支截断与跨 Worker Hash；仍缺调度、migration、History 存档封装、玩家槽位与共享 Editor Preview/Player |
| REQ-L10N | 局部实现 | 已有稳定 Localization Catalog/CJK IR；仍缺导入导出、状态、运行切换、Ruby、字体和语音映射 |
| REQ-QA | 局部实现 | 已有编译期 CFG/SCC 诊断/Source Map；仍缺 Debugger、Story Solver、断点/单步、源码 UI 跳转 |
| REQ-BUILD | 隔离原型 | 已有单文件试玩候选；仍缺正式 Player、资源构建、三端打包、签名、校验和发布材料 |
| REQ-GAL | 未实现 | 配置中心、继承/撤销/预览、自动附加页 |
| REQ-OPT | 隔离原型 | Optimization Center、设备测量、构建变体和可解释回退 |

27 条 M1 AC 中没有任何一条同时完成编辑器、正式运行时、目标设备、可发布产物和审核证据，因此总判定保持 `0/27`，不得用“部分”累计为完成百分比。

## 6. GitHub 交付与集成审计

当前 N31-E5 分支以 N31-E4 最终远端绿色头 `f0f94aed57157c21ad2163c36e1466814ed8697c` 为直接基线。N00–N21 对应 Draft PR #23–#30，例外与指定集成基线对应 #31–#32，N22/N23 工程链对应 #33，N30-E1/E2 对应 #34–#35，N31-E1–E4 对应 #36–#39；E5 Draft PR 待本轮推送后登记。这些开发链仍没有进入默认分支。

| PR | 节点 | 基线关系 | 状态 |
|---:|---|---|---|
| #23 | N00 | `codex/product-delivery-plan` | Draft、CI 绿 |
| #24 | N01 | 基于 N00 | Draft、CI 绿 |
| #25 | N10 | 基于 N01 | Draft、CI 绿 |
| #26 | N11 | 基于 N10 | Draft、CI 绿 |
| #27 | N12 | 基于 N11 | Draft、CI 绿 |
| #28 | N13 | 基于 N12 | Draft、CI 绿 |
| #29 | N20 | 基于 N13 | Draft、CI 绿 |
| #30 | N21 | 基于 N20 | Draft、CI 绿 |
| #31 | RA-N21-001 | 基于 N21 | Draft、受限例外 |
| #32 | N21 指定集成基线 | 汇总 #23–#31 | Draft、Authoritative、CI 绿 |
| #33 | N22 | 基于 #32 | Draft、CI 绿 |
| #34 | N30-E1 | 基于 #33 分支 | Draft、实现头 `7793b67` CI 绿 |
| #35 | N30-E2 | 基于 #34 分支 | Draft、实现头 `1125b68`；审计头 `63e0886` CI 绿 |
| #36 | N31-E1 | 基于 #35 分支 | Draft、实现头 `98c49bf`；交付头 `d33d240` CI 绿 |
| #37 | N31-E2 | 基于 #36 分支 | Draft、实现头 `8465ae9`；最终头 `a9ee618` 的 run `31885355335` CI 绿 |
| #38 | N31-E3 | 基于 #37 分支 | Draft、实现头 `271d869`；最终头 `72e93f3` 的 run `31886404690` CI 绿 |
| #39 | N31-E4 | 基于 #38 分支 | Draft、最终头 `f0f94ae` 的 run `31887473521` CI 绿 |

这形成四项现实风险：

1. `main` 不是当前产品能力的权威代码，任何从默认分支拉取的人都得不到审计中的能力；
2. 176 个提交和 603 个文件的长期堆叠提高了评审遗漏与集成冲突概率；
3. 上游 PR 的改动会级联影响所有下游 PR，CI 绿色不能替代按顺序评审与合并；
4. “已经推送”不能表述为“已经交付”，发布与回退基线仍未建立。

## 7. 严格执行顺序

### G1：关闭 N21 产品门

- 由真实非程序用户从新建工程开始，完成至少 20 分钟 Writer/Sequence 任务；
- 记录真实开始/结束时间、求助次数、阻塞点、输入设备和最终工程快照；
- 保存、关闭、重开并验证文本、稳定 ID、排序、选择和 Inspector 数据；
- 失败时修复 N21，不得以演示者代操作或自动化测试替代真人证据。

### G2：建立权威集成基线

- 状态：已关闭；`agent/m1-integration-n21` 与面向 `main` 的 Draft PR #32 承载 N00–N21 及 `RA-N21-001` 完整祖先链；
- 结构化祖先审计、策略测试与 GitHub Actions run `31765547145` 已通过；
- 指定分支是 N22 唯一工程起点，但仍未替维护者合并 `main`，串联 Draft PR 的关闭或替代标记继续由维护者处理。

### G3：再验证与例外准入

- 在权威集成基线上运行 `npm run check`、workspace/requirements/Golden 审计和 `git diff --check`；
- 将命令、提交、CI run、产物或截图回填 N21 与追踪矩阵；
- 正常路径仍要求 G1、G2、G3 同时通过；`RA-N21-001/002` 已关闭，`RA-N21-003` 只接受当前缺失真人证据的延期，不把 G1 记为完成，也不解除 G2 集成要求；
- N22 目标必须是实际资源驱动的 Stage/媒体编辑与预览，而不是继续扩展平台内容；N23 验收前必须关闭例外。

## 8. 本轮审计决定

1. 不把 N21 工程绿色误报为产品通过；
2. `RA-N21-003` 生效期间只允许完成 N31 Runtime 工程候选；不新增无关平台 Spike，不进入 N32；
3. N21 人类创作门保持未完成；指定集成基线已成为 Authoritative 并关闭 G2，但不得把它误报为 `main` 已合并；
4. N31 已按 E1 基础执行 → E2 State/PRNG/Hash → E3 Effect → E4 Save → E5 History/Back 顺序推进；下一步严格执行 E6 调度，再完成正式 Corpus/诊断出口，真人资源一旦可用仍优先执行 N21、再执行 N23，两门通过并关闭例外前不进入 N32；
5. 每一步都必须同时更新需求状态、自动化证据、人工验收和 GitHub 集成事实。
