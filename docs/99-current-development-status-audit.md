# 当前开发情况审计（N30-E2 Project Compiler 工程退出候选）

> 审计日期：2026-08-15
> 本轮实现基线：`5150465226c8adbdd61d5fc494a31e6b1a4c7fdc`（变更前基线）
> 审计分支：`agent/n30-project-compiler-e2`
> 当前 PR：Draft PR #35（基于 N30-E1 分支）
> 审计范围：仓库实现、自动化门、需求追踪、交付节点、Golden Project 与 GitHub 集成状态
> 权威边界：本文件是当前审计快照；节点状态仍以 [M1 需求与验收追踪矩阵](90-m1-requirement-traceability.md)为准。`RA-N21-001` 已关闭，`RA-N21-002` 仅允许工程候选推进至 N30，不改变 N21/N23 产品未通过事实，也不授权 N31。

## 1. 执行结论

当前代码已经具备一个可实际使用的“源项目创作开发版”：创作者可以新建或打开任意受支持工程，管理章节、场景、角色和变量，编辑完整 P0 故事语言与 Writer/Sequence 卡片，并保存、关闭、重开、导入和导出工程。

当前代码已能在编辑器中执行最小故事流程，并把当前故事构建为独立单文件 HTML。N30-E1/E2 又形成独立 portable Project Compiler，可把 Canonical Project 编译为版本化 Runtime IR、Source Map、Asset Manifest、完整 Catalog 与发布输入，并具备语句 CFG、循环诊断和可校验增量缓存。它仍不是完整游戏引擎：正式 Runtime 尚未消费该 IR，也没有存档恢复、Player、资源构建和 Web/Windows/Android 发布包。因此必须同时保留以下判定：

- 源项目能否落地：**能，在当前候选分支上可完成真实创建、编辑和持久化**；
- 编辑器内流程能否运行：**能，真实浏览器已完成两条路线并到达两个结局**；
- 独立试玩项目能否落地：**能，当前故事可下载为自包含离线 HTML 并运行到结局**；
- 正式编译数据能否落地：**能，N30-E1/E2 四类 Golden 已产生稳定 IR，Compiler 工程出口条件已形成候选；但 N30 Product Acceptance 仍被真人门阻断**；
- 可发布游戏能否落地：**不能，Compiler 已起步，Runtime → Player → Build 链仍未建立**；
- M1 是否完成：**不能，27 条发布验收仍为 `0/27` 完整通过**；
- 当前执行位置：**N20 已通过；N21 真人 0/1；N22 工程门通过；N23 真人 0/2；N30-E1/E2 为工程出口候选，N30 未整体验收，N31 被阻断**；
- GitHub 是否已集成：**指定集成分支与 Draft PR #32 已建立且远端全检通过，但 N00–N21 与例外仍未进入 `main`**。

## 2. 审计证据基线

| 审计对象 | 基线结果 | 判定 |
|---|---:|---|
| Workspace 边界 | 11 个 workspace；5 个计划产品边界 | 审计通过 |
| 需求登记 | 50 条：10 USP、13 P0 模块、27 AC；6 个 owner | 审计通过 |
| Golden Project | 7 类：Benchmark、Branching、CJK、Media、Recovery、Size、Tiny | 审计通过 |
| N23 内容量门 | 2 条路线：366/370 秒；各 27 可读节点；Wait 贡献 0 秒 | 审计通过 |
| N23 产品验收门 | `N23-PA-01`；2 个参与者槽位、6 个任务、编辑器/独立 HTML 各 2 条路线 | 协议通过，真人记录 `pending-participants`（0/2） |
| N23 验收启动门 | Windows 双击入口、固定 `127.0.0.1:43123`、生产 HTML/JS/CSS HTTP 拉取 | 烟测通过；不等同 Windows 安装包 |
| 常规测试 | 97 个并行测试文件、588 项测试；另有 1 项串行存储测试 | 本轮完整门通过 |
| VM 重型门 | 5 项 | 最近完整门通过 |
| 构建 | 11 个 workspace | 本轮完整门通过 |
| 架构门 | 69 个 portable 模块、4 个 Node adapter | 本轮完整门通过 |
| 性能门 | Script 10 项、Asset 4 项 | 最近完整门通过 |
| Editor bundle | 636.67 kB，gzip 183.52 kB | 构建成功，五分钟源随产品入口进入 bundle；仍存在超过 500 kB 的体积警告 |
| GitHub CI | PR #23–#34 最近 Windows CI 均成功；Draft PR #35 交付头 `4c2ab3c` 的 `product-baseline` run `31876073223` 通过 | 远端 Windows / Node 22 完整门通过 |

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
| N30 | E1/E2 工程退出候选 | portable Compiler、Runtime IR v1、语句 CFG/SCC、双 Hash 场景缓存、六文件 Debug/五文件 Release、完整 Catalog、发布输入、四类 IR Golden | E2 本地完整门已通过，等待远端完整门；N21/N23 产品门仍阻断 N30 Product Acceptance |
| N31 及以后 | 未开始或仅有前置 Spike | 已有 VM/平台算法证据可复用 | 正式 Runtime、Player、QA、构建与发布均未贯通 |

“工程通过”表示当前候选提交的自动化证据成立；只有节点产物、用户任务、远端门和集成状态同时满足，才可宣告产品节点通过。

## 4. 当前真实能力矩阵

| 能力 | 当前分支可用 | 产品边界 |
|---|---|---|
| 项目入口 | 新建、打开、最近、示例、导入、导出 | 正式 Windows/Android 壳未完成 |
| 本地源工程 | Canonical 源文件、Asset Index 与源 Blob 的确定性自包含 ZIP、File System Access/OPFS、Node 目录适配；Writer 内容已写回同一生命周期工程 | 派生资源按可重建缓存排除；移动 SAF 与安装产品未完成 |
| 内容实体 | 章节、场景、角色、类型化变量、稳定 ID 引用迁移 | 字体、本地化、Gal 等完整产品模块未完成 |
| Story Language | P0 语句、解析、诊断、补全、定义/引用、重构、增量处理；N30-E1/E2 已编译为 Runtime IR v1 并完成语句 CFG/SCC 诊断 | 仍缺正式 Runtime 消费 |
| Writer/Sequence | 全 P0 卡片、类型化 Inspector、增删复制排序、批量、折叠、保存重开 | N21 真人任务未通过；完整专业 Sequence 待 N41 |
| 资源/Stage | 真实 Blob 导入与释放、BG/多角色/四路音频状态预览、角色几何、安全区、DPR、输入等价、错误回退、Render Host v2、Canvas 2D 场景层、基础 Move、Hide/Fade 与角色层 Show 单语句过渡、真实 PNG/WAV Media Golden 运行链、浏览器导入/重开与视觉基线 | Canvas 2D 仍是编辑器 Preview 后端；Pixi/WebGL、镜头、复杂关键帧、模板和正式 Runtime 归后续节点 |
| Route | Choice 的简单派生图 | 完整节点/边、诊断、布局、局部加载未完成 |
| Compiler/Runtime | N30 Compiler 工程候选已产出稳定 IR、Source Map、Catalog、增量缓存和双 Profile；Editor Playable Preview 与独立 HTML 可运行最小控制流 | N31 正式共享 Runtime/Player 未建立，也无存档/历史；不能把 VM Spike 当正式包 |
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
| REQ-RUNTIME | 工程候选 | N30 Compiler 工程项已对齐；仍缺共享 Editor Preview/Player、Save/History 状态链 |
| REQ-L10N | 局部实现 | 已有稳定 Localization Catalog/CJK IR；仍缺导入导出、状态、运行切换、Ruby、字体和语音映射 |
| REQ-QA | 局部实现 | 已有编译期 CFG/SCC 诊断/Source Map；仍缺 Debugger、Story Solver、断点/单步、源码 UI 跳转 |
| REQ-BUILD | 隔离原型 | 已有单文件试玩候选；仍缺正式 Player、资源构建、三端打包、签名、校验和发布材料 |
| REQ-GAL | 未实现 | 配置中心、继承/撤销/预览、自动附加页 |
| REQ-OPT | 隔离原型 | Optimization Center、设备测量、构建变体和可解释回退 |

27 条 M1 AC 中没有任何一条同时完成编辑器、正式运行时、目标设备、可发布产物和审核证据，因此总判定保持 `0/27`，不得用“部分”累计为完成百分比。

## 6. GitHub 交付与集成审计

本轮实现头 `1125b68` 上，当前 N30-E2 分支相对已抓取的 `origin/main` 为 172 个提交领先、0 个提交落后，差异规模为 595 个文件、69,049 行新增、165 行删除。N00–N21 对应 Draft PR #23–#30，例外与指定集成基线对应 #31–#32，N22/N23 工程链对应 #33，N30-E1 对应 #34，N30-E2 对应 #35；#23–#34 已各自取得至少一次绿色 Windows CI，#35 正在复验，但这些开发链仍没有进入默认分支。

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
| #35 | N30-E2 | 基于 #34 分支 | Draft、实现头 `1125b68`；交付头 `4c2ab3c` CI 绿 |

这形成四项现实风险：

1. `main` 不是当前产品能力的权威代码，任何从默认分支拉取的人都得不到审计中的能力；
2. 169 个提交和 594 个文件的长期堆叠提高了评审遗漏与集成冲突概率；
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
- 正常路径仍要求 G1、G2、G3 同时通过；旧 `RA-N21-001` 已关闭，`RA-N21-002` 只接受当前缺失真人证据的延期，不把 G1 记为完成，也不解除 G2 集成要求；
- N22 目标必须是实际资源驱动的 Stage/媒体编辑与预览，而不是继续扩展平台内容；N23 验收前必须关闭例外。

## 8. 本轮审计决定

1. 不把 N21 工程绿色误报为产品通过；
2. `RA-N21-002` 生效期间只允许完成至 N30 Compiler 的工程候选；不新增无关平台 Spike，不进入 N31；
3. N21 人类创作门保持未完成；指定集成基线已成为 Authoritative 并关闭 G2，但不得把它误报为 `main` 已合并；
4. N30-E2 完整门通过后不再开启 Compiler 功能扩展；下一动作是 N21 真人任务，再执行 N23 两名非实现者任务，两门通过并关闭例外前不进入 N31；
5. 每一步都必须同时更新需求状态、自动化证据、人工验收和 GitHub 集成事实。
