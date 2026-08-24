# 产品落地能力审计

> 审计日期：2026-08-14
> 审计基线：`c9038b19709e1400f4b3f1ad6bbd1d1a1117e7b9`
> 审计对象：PRD、产品特色规格、N00–N21 交付节点、CL-03/CL-04 Spike 及 M1 发布要求
> 结论：当前分支已经从固定样例原型推进为可创建、打开、编辑、保存、重开和导入导出任意受支持源工程的创作开发版；但没有正式 Compiler、Runtime/Player 和三端构建链，仍不能生成、运行和发布可玩的游戏，因此不是已经落地的游戏引擎。

## 1. 审计目的

本审计只回答三个产品问题：

1. 文档承诺的特色功能是否已经成为用户可操作的产品能力；
2. 编辑器、编译器、运行时、玩家、资源、QA 和构建是否使用同一工程语义并形成闭环；
3. 创作者是否能从空项目开始，完成并发布一部可交付的游戏。

代码行数、测试数量、Spike 数量和单独算法通过，不再单独计为产品进度。产品进度必须同时具备入口、数据、行为、失败恢复、自动化测试和真实产物。

## 2. 统一状态定义

| 状态 | 定义 |
|---|---|
| 未实现 | 没有可调用代码，或只有需求/架构文档 |
| 隔离原型 | 算法或技术契约存在，但没有接入创作主流程 |
| 局部可用 | 有 UI 和局部数据闭环，但只覆盖固定样例、单视图或单平台 |
| 纵向贯通 | 任意受支持项目可从编辑进入运行时/构建，并有端到端测试 |
| 发布完成 | 在目标设备、安装包、升级、签名、性能和作品验收中全部通过 |

任何需求只有达到“纵向贯通”才能称为功能完成；M1 需求必须达到“发布完成”。

## 3. 当前可操作边界

### 3.1 已经可以操作

- 从 Project Home 新建、打开、最近访问、示例、导入和导出任意受支持的 Canonical 源工程；
- 在 File System Access/OPFS 以及 Node 目录适配器上保存、自动保存、备份、恢复，并处理外部修改冲突；
- 创建、删除和排序章节与场景，管理角色和类型化变量，分析并迁移稳定 ID 引用；
- 使用完整 P0 Story Language 编辑对白、旁白、选择、条件、变量、跳转、调用、演出和结束语句；
- 在 Writer/Sequence 中插入、复制、删除、移动、批量选择和折叠全部 P0 卡片，并通过类型化 Inspector 编辑；
- 导入资源，生成缩略图、Sidecar 和 Dicing 派生产物，使用基础 BG/CHAR/AUDIO 派生预览；
- 搜索实体和脚本引用，并验证保存、关闭、重开后数据与稳定 ID 不变；
- 通过确定性 ZIP 完成源工程离线交换。上述能力是源项目创作能力，不等同于可玩构建能力。

### 3.2 当前不能完成

- 完成 N21 的 20 分钟非程序用户真实创作任务；工程门已绿，但产品验收仍未通过；
- 使用 N22 所要求的真实资源 Stage/媒体预览，以及 N23 的五分钟可玩纵向切片；
- 使用完整 Route、Sequence、Stage、Debugger、QA、本地化、Gal 和 Optimization 工作区；
- 从当前项目编译正式 Runtime IR；
- 让编辑器预览运行正式 Narrative VM；
- 生成可玩的 Web、Windows 或 Android 玩家；
- 生成 Windows/Android 编辑器安装包；
- 完成一个 20–30 分钟作品并交给玩家运行。

### 3.3 关键代码约束

- `StudioMode` 只有 `writer | script | flow`；
- Project Home 和通用 Canonical 工程已经存在，但核心内容 UI 仍集中在 Writer、Script、Flow 三种模式；
- `StoryProject` 已覆盖完整 P0 语句，Canonical Schema 也已扩展；Project Service 与 Source Session 仍需在正式七工作区协议中收敛；
- Editor 没有依赖 `narrative-vm-spike`，预览只是语句索引和派生舞台状态；
- 仓库没有正式 Player、项目 Compiler、Build Adapter、本地化工作区、Gal 配置中心或 Debugger 应用；
- N00–N21 交付仍位于 8 个串联 Draft PR 中，尚未合入默认分支；远端 CI 通过只证明候选分支工程门，不等于发布集成完成。

## 4. 产品支柱对齐审计

| ID | 产品支柱/特色 | 文档目标 | 当前事实 | 状态 | 主要缺口 |
|---|---|---|---|---|---|
| USP-01 | One Story, Many Views | Route、Sequence、Script、Stage、Preview、Debugger 共享语义 | 任意受支持源工程可在 Writer/Sequence、Script、Flow 与派生 Preview 间共享 P0 Story Language | 局部可用 | 缺完整 Route、Stage、Debugger、正式 Runtime Preview 和全部跨视图命令覆盖 |
| USP-02 | Mobile First Editor | Android 手机完成项目管理、写作、演出、预览和构建 | 无 Android 编辑器产品 | 未实现 | 缺壳、移动 IA、IME/文件/生命周期和真机任务测试 |
| USP-03 | Narrative Intelligence | 不可达、死路、循环、变量、结局、路线覆盖 QA | 只有基础引用校验与 VM 测试 | 隔离原型 | 缺 Compiler 图、Story Solver、Debugger 和错误跳转 |
| USP-04 | Local First / No Lock-in | 无账户、离线、可导入导出、可 Git 管理 | 通用工程可离线创建/打开/保存，支持确定性 ZIP、目录适配器和外部修改冲突 | 局部可用 | 缺正式桌面/Android 文件宿主、完整 Git 工作流与发布级恢复验收 |
| USP-05 | Local Multi-platform Build | Windows 本机构建 Web/Windows/Android | 无正式玩家或 Build Adapter | 未实现 | 缺 Compiler、Player、打包、签名和构建 UI |
| USP-06 | Professional Studio | 七工作模式、商业演出、专业密度 | Project Home、三模式 Web 编辑器、完整 P0 Writer/Sequence 卡片和基础演出轨道 | 局部可用 | 缺七工作模式、完整时间线、UI Composer、可访问性和 N21 真人验证 |
| USP-07 | Budget-driven Optimization | 以包体、内存、加载、帧时间联合决策 | Dicing、资源调度、缓存算法较完整 | 隔离原型 | 缺 Optimization Center、平台格式、真机收益和构建接入 |
| USP-08 | Gal Automation | 自动 Route、画廊、回想、音乐室、结局页 | 简单 Choice 场景图 | 隔离原型 | 缺 Compiler Catalog、解锁元进度、页面生成和三端一致性 |
| USP-09 | Adjustable Skip / History | 四种快进、可调速度、每句后退/前进 | VM Spike 有契约；Editor 未接入 | 隔离原型 | 缺玩家控制、持久已读状态、Barrier UI 和实际媒体策略 |
| USP-10 | Lossless Dicing | 自动分组、无损重建、收益门和回退 | Web/Node 算法和资源生命周期已实现 | 局部可用 | 缺三端解码、显存/Draw Call/包体证据和 Optimization UI |

## 5. P0 模块对齐审计

| REQ | PRD 模块 | 当前状态 | 已有资产 | 必须补齐的产品闭环 |
|---|---|---|---|---|
| REQ-PRJ | 项目与工作区 | 局部可用 | N12 真实工程生命周期；N13 章节/场景/角色/变量管理、引用迁移、实体搜索与保存重开 | Android SAF、正式桌面/手机工作区、统一七模式搜索和强杀恢复验收 |
| REQ-ROUTE | Route Map | 隔离原型 | Choice 派生简单场景图 | 完整节点/边语义、局部加载、布局 Sidecar、诊断、路线高亮、双击进入 Sequence |
| REQ-SEQ | Sequence | 工程完整、验收待定 | N41 Engineering 已覆盖全部 P0 卡片、插入/复制/排序/多选/折叠、类型化 Inspector、搜索与跨视图定位；1,000 次 Sequence/Script stable-ID 互改、正式 Runtime statement 高亮和保存重开自动化门通过 | 20 分钟非程序用户实测与 N41 Product Acceptance；Stage 属于 N42 |
| REQ-SCRIPT | Script | 局部可用 | N20 P0 CST/AST、安全表达式、诊断/补全/定义/引用、重构、通用 Patch、100k 增量门；原有文本编辑 | N41 正式代码编辑器呈现、所有视图集成和外部编辑 E2E |
| REQ-STAGE | Stage / UI Composer | 局部可用 | 基础预览和 BG/CHAR/AUDIO 轨 | 画布操控、变换、镜头、关键帧、文本模板、安全区、Stage/Sequence/Runtime 同步 |
| REQ-UX | 视觉与工作模式 | 局部可用 | Token、基础动效、三模式 | 七模式、Beginner/Pro、减少动效、触屏替代、60 FPS 目标和 D1 验证 |
| REQ-ASSET | 资源管理 | 局部可用 | 导入、哈希 Blob、缩略图、Dicing、生命周期 | 视频/字体、标签/引用、重命名、平台变体、报告、系统选择器和构建接入 |
| REQ-RUNTIME | 运行时基础 | 隔离原型 | Narrative VM Spike 01–14 | 正式 IR/Compiler、Editor Preview 接入、渲染/音频、玩家 UI、Save/History/Skip/Back |
| REQ-L10N | 本地化与配音 | 未实现 | 稳定 `textId` | CSV/XLSX、状态、运行时切换、CJK/Ruby、字体与语音映射 |
| REQ-QA | Debugger / Story QA | 未实现 | 基础 Project Diagnostics、VM 诊断 | 入口运行、断点/单步、变量/栈/舞台、不可能路线、死循环和源位置跳转 |
| REQ-BUILD | 构建与发布 | 未实现 | Vite 开发构建、壳验证宿主 | Web/PWA、Windows、APK/AAB、签名、日志、校验、SBOM、Provenance 和回退 |
| REQ-GAL | Gal 配置中心 | 未实现 | 配置规格 | 可搜索设置、继承层、实时预览、文本/保存/音频/输入/路线/附加页模板 |
| REQ-OPT | Optimization Center | 隔离原型 | Dicing、调度、预测、缓存 | 预算 UI、Profile、联合成本报告、解释/撤销/锁定、平台产物对比 |

P1/P2 不得用于替代任何 P0 缺口。协作、插件市场、AI、实时多人和云服务保持愿景池，M1 完成前不得进入主计划。

## 6. 27 条 M1 验收审计

| AC | 验收主题 | 当前判定 | 说明 |
|---:|---|---|---|
| 01 | Windows/Android 打开工程 | 未通过 | 无正式编辑器 |
| 02 | 两端编辑对白/角色/选择/条件 | 未通过 | Web 候选已支持通用工程与 P0 卡片；Windows/Android 正式产品未验收 |
| 03 | Route/Sequence/Script/Stage 同源 | 部分 | 通用工程的 Writer/Script/Flow/派生 Preview 部分同源，正式 Route/Stage 未完成 |
| 04 | 跨视图 500 ms 同步 | 部分 | 局部测试存在，视图与命令覆盖不完整 |
| 05 | 任意语句预览并查看变量 | 未通过 | 线性预览，无正式 VM/变量视图 |
| 06 | 检出不可达结局/缺失资源 | 未通过 | Story QA 缺失 |
| 07 | 三端结局、保存、回滚一致 | 未通过 | 无三端玩家 |
| 08 | 无账户离线导出重开 | 部分 | 通用打开、确定性 ZIP 与保存重开已有证据；正式双端宿主未验收 |
| 09 | 崩溃恢复自动保存 | 部分 | 浏览器通用工程有恢复证据，正式宿主未贯通 |
| 10 | 键盘与手机替代操作 | 部分 | N21 键盘/触屏等价自动化已通过；无真人完整任务和 Android 证据 |
| 11 | 七工作模式修改同一语句 | 未通过 | 仅三模式 |
| 12 | 动效不阻塞且支持减少动效 | 部分 | 视觉原型存在，完整链未验收 |
| 13 | 镜头/运动/转场/三类音频同步 | 未通过 | 缺镜头关键帧和正式 Runtime |
| 14 | 编辑器/玩家目标设备预算 | 未通过 | 实体设备未登记 |
| 15 | Auto/四种 Skip 正确 | 部分 | VM Spike 有证据，玩家未接入 |
| 16 | 每句后退/前进和分支截断 | 部分 | VM Spike 有证据，Editor/Player 未接入 |
| 17 | 脚本自动生成 Route | 部分 | 只覆盖简单 Choice 场景图 |
| 18 | 自动生成 Gallery/Replay/Music/Ending | 未通过 | 无生成链和页面 |
| 19 | Gal 配置中心 P0 | 未通过 | 无产品模块 |
| 20 | 自动页和状态三端一致 | 未通过 | 无自动页/三端玩家 |
| 21 | Optimization 联合预算 | 未通过 | 无 Center 和真实平台测量 |
| 22 | Safe Auto 可重建/回退 | 部分 | 资源原型具备部分证据，未接构建和 UI 完整工作流 |
| 23 | Golden Dicing 三端综合收益 | 部分 | 无损算法成立，三端收益未证明 |
| 24 | 低内存设备两小时稳定 | 未通过 | 无 Android 玩家/真机 |
| 25 | 弱网/损坏/磁盘不足不破坏版本 | 部分 | 局部存储故障测试，发布/下载链缺失 |
| 26 | 完成 Benchmark Episode 和三端包 | 未通过 | 已能创建任意受支持源项目，但不能生成玩家包 |
| 27 | 编辑器安装/升级/签名/发布审核 | 未通过 | 无 Stable 安装包 |

审计结果：`0/27` 完整通过。局部证据不得累计换算为通过比例。

## 7. 根因

1. P0 同时包含编辑器、引擎、三端玩家、平台编辑器、资源优化和商业发布，缺少可交付的中间纵向切片；
2. S0 以风险关闭为主线，平台和底层契约拥有清晰节点，产品功能没有同等级的节点和完成定义；
3. 固定示例曾长期阻碍项目系统、Schema 和工作流泛化；N12–N21 已移除源工程限制，但运行时与发布链仍未完成同等泛化；
4. Preview、VM、Player 分离，形成“看起来能预览”和“运行时算法已测试”两套不相连的事实；
5. 缺少需求—UI—Domain—Compiler—Runtime—Build—测试—产物的追踪表；
6. 没有每周从空项目制作可玩作品的强制演练，局部功能可以在不支持真实生产的情况下持续扩张。

## 8. 审计决议

1. 采用[《游戏引擎产品落地开发计划》](89-engine-product-delivery-plan.md)作为当前唯一开发主路径；
2. 采用[《M1 需求与验收追踪矩阵》](90-m1-requirement-traceability.md)作为功能状态权威；
3. 冻结新的独立平台 Spike，只有交付节点明确需要且会阻塞当前纵向切片时才恢复；
4. 不删除已有 CL-03/CL-04 证据，但它们只能作为对应产品节点的输入；
5. 每个交付节点必须由一份真实工程、一个可执行产物或一个用户任务结束；
6. 任何节点如果只能在固定示例上运行，不得标记为完成；
7. 任何运行时功能如果未通过 Editor → Compiler → Player 贯通，不得标记为完成；
8. 每周演示必须从空目录开始，到可玩的构建产物结束。
