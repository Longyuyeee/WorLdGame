# M1 需求与验收追踪矩阵

> 生效日期：2026-08-13
> 用途：本文件是 M1 功能状态的唯一权威。需求文档定义“要什么”，[产品落地计划](89-engine-product-delivery-plan.md)定义“怎样做”，本文件记录“做到哪里、证据在哪”。
> 更新规则：实现、测试和证据必须在同一 PR 更新；没有证据路径时状态不得为“通过”。
> 集成边界：当前开发链仍未进入 `main`；N00–N41 Authority 对应 main-target Draft PR #61，仍等待维护者审阅与合并。N40/N41 Engineering 出口不得换算成 Product Acceptance；`RA-N21-007` 只准入 N42 Stage Engineering，持续阻断 N42 Product Acceptance、N43 及以后、M1 Stable 与发布。

## 1. 状态和证据规则

状态只允许：`未开始`、`设计冻结`、`实现中`、`集成中`、`验收中`、`通过`。

每项通过必须填写：

- UI 或 CLI 入口；
- Domain/Compiler/Runtime/Host 代码位置；
- 自动化测试位置；
- Golden Project 或设备；
- 可执行命令；
- 产物 Hash/截图/报告；
- 审核人和日期。

## 2. 产品支柱

最近按产品顺序通过的节点仍是 `N20`；后续工程门不跨越 N21 产品门，不能登记对应产品通过。N21 与 N23 真人记录分别为 `pending-participant`（0/1）和 `pending-participants`（0/2）。N41 Engineering 出口完成后，产品负责人在获知 RA-006 截止于 N41 后于 2026-08-24 再次明确要求进入下一步骤并逐步实测、审计和推送，因此关闭 `RA-N21-006`，建立 2026-09-24 到期的 `RA-N21-007`：只允许推进 N42 Stage Engineering，并持续阻断 N21/N23/N30/N31/N32/N40/N41/N42 产品验收、N43 及以后、M1 Stable 与发布。

| ID | 需求 | 交付节点 | 当前状态 | 当前证据 | 完成证据 |
|---|---|---|---|---|---|
| USP-01 | One Story, Many Views | N40–N43 | 实现中 | N41 Engineering 出口已通过：Sequence/Script/Compiler/Route/IndexedDB 重开同源，1,000 次全 P0 互改不漂移，Formal Runtime statement 已投射到 Sequence；N42-E1–E3 已接入 Stage placement、Move easing 与基本角色关键帧；完整时间线、Debugger 与七模式仍未完成 | 任意工程四视图+Preview+Debugger 同源 E2E |
| USP-02 | Mobile First Editor | N91 | 未开始 | CL-02 契约 | AND-L/AND-R 完整创作任务 |
| USP-03 | Narrative Intelligence | N30/N60 | 实现中 | N30 Compiler 已有语句级 CFG/SCC、结构/资源/表达式诊断与 Source Map；Solver/Debugger 仍待 N60 | [N30-E2 审计](124-n30-e2-compiler-completion-audit.md)、QA Golden、Debugger |
| USP-04 | Local First / No Lock-in | N10–N13 | 实现中 | IndexedDB 保存/恢复、备份，以及 Canonical 文档/Asset Index/源 Blob 的确定性 ZIP 自包含迁移与重载已通过 | 正式双端壳离线导入导出、Git diff、外部编辑与强杀恢复 |
| USP-05 | Local Multi-platform Build | N80–N83 | 未开始 | 开发构建不计 | Windows 本地三端正式产物 |
| USP-06 | Professional Studio | N41–N43/N100 | 实现中 | 三模式视觉原型 | 七模式、商业演出、Benchmark Episode |
| USP-07 | Budget-driven Optimization | N70–N72 | 实现中 | Dicing/调度/预测原型 | Center、三端报告、可回退构建变体 |
| USP-08 | Gal Automation | N62 | 实现中 | N40 已有自动创作者 Route；Compiler 已生成 Gallery/Music/Ending 等 Catalog，Runtime 已记录 Gallery/Ending 永久 Meta | 覆盖配置、玩家 Gallery/Replay/Music/Ending 页面与三端一致 |
| USP-09 | Skip / History / Back | N31/N52 | 实现中 | N31 已形成正式 History/调度/reconciliation/Session Save/永久 Meta；E4/E5 接入 Editor 控制，E7 又把 checkpoint、compensation/replay、cancel receipt 收敛到 portable Host，并在 Benchmark production 实跑 Back/Forward。正式 Player 控件和三端证据仍缺 | [N32-E7](150-n32-e7-shared-runtime-host-audit.md)、[N31-E5](130-n31-e5-runtime-history-audit.md)、Editor/Player/三端状态一致 |
| USP-10 | Lossless Dicing | N72 | 集成中 | Web/Node 算法和重建测试 | 三端综合收益与无接缝 Golden |

## 3. P0 模块需求

| REQ | P0 范围摘要 | 主节点 | 依赖 | 当前状态 | 当前缺口 | 通过证据 |
|---|---|---|---|---|---|---|
| REQ-PRJ | 新建/打开/最近/示例、保存恢复、章节场景、搜索、桌面/手机工作区、导入导出、离线 | N10–N13/N90/N91 | N00 | 实现中 | N23-E3 已证明 Canonical 文档、Asset Index 与源 Blob 随确定性 ZIP 搬到新工作区并在重载后运行；仍缺 Android SAF、正式壳、统一七模式搜索与强杀恢复 | [N23-E3 审计](117-n23-e3-portable-resource-bundle-audit.md)、Project E2E、Recovery Golden、双端任务 |
| REQ-ROUTE | 完整自动图、布局、局部加载、诊断、路线高亮、进入场景内容 | N40 | N20/N30 | 实现中 | N40 Engineering 出口已通过：E1–E8n 完成 Compiler 图、10k/64 窗口、Layout/交互、缓存、Runtime 高亮、trusted Route-first、局部内容、全局索引、narration 结构闭环、topology 分页、结局审阅、诊断/目标导航与 Choice 目标修改→保存复读→Compiler/Route 重建→Formal Runtime 新结局闭环。出口复审 Goal `1/1`、Implementation `11/11`、Tests `3/3`、Acceptance `2/2`；10k 同步 P95 `164.88 ms <500 ms`。Route 双击进入当前 Writer 图形内容入口，不等于 N41 完整 Sequence。Product Acceptance 仍被当前 `RA-N21-007` 阻断；完整 Lazy Project/增量 topology、外部目录和高级过滤后置 | [N40-E1](153-n40-e1-route-graph-core-audit.md)–[N40-E7](163-n40-e7-runtime-route-highlight-audit.md)、[N40-E8a](164-n40-e8a-single-project-read-audit.md)–[N40-E8n](178-n40-e8n-route-repair-loop-audit.md)、[N40 出口复审](179-n40-engineering-exit-reaudit.md) |
| REQ-SEQ | P0 语句块、排序/复制/批量/折叠、Inspector、跨视图定位 | N21/N41 | N21 | 验收中 | N41 Engineering 出口 Goal `1/1`、Implementation `8/8`、Acceptance `1/1`：全部 P0、类型化 Inspector、搜索/插入、复制/移动/批量/折叠、跨视图定位、statement 级 Runtime 高亮和 1,000 次同源互改均通过。Route-first lazy narration/dialogue 是大型工程增强，不再误列为完整 Sequence 出口前置。N21 真人 `0/1`，Product Acceptance 仍阻断 | [N41 出口复审](185-n41-engineering-exit-reaudit.md)、[N41-E1](181-n41-e1-formal-sequence-mode-audit.md)–[N41-E3](184-n41-e3-lazy-dialogue-structure-audit.md)、[N21 真人执行包](114-n21-human-validation-execution-kit.md) |
| REQ-SCRIPT | 高亮/补全/诊断/定义/引用、稳定 ID、格式化/重构、双向同步、外部编辑 | N20/N41 | N20 | 实现中 | N20 语言内核与规模门通过；N41 已完成正式 Script/Sequence 双向同源、诊断、稳定 ID、1,000 次互改与规模测试；仍缺高级补全/定义/引用、统一七模式集成和外部编辑 E2E | 100k/round-trip/external edit Golden |
| REQ-STAGE | 画布、安全区、变换、模板、多轨、关键帧、缓动、三视图同步 | N22/N42 | N20/N31 | 实现中 | E1–E3b 已关闭真实媒体 Stage、Move easing 和基本角色关键帧生产闭环；E4 又从 canonical Direction/Wait/Preview pacing 派生 TIME/BG/CHAR/AUDIO/STORY 标尺，编辑 scrub 选择 stable ID，Formal Runtime statement 接管播放头。真实 7 步工程为 5.200s 且重开不漂移；10k 投影 10.89ms。独立时间写入、路径、镜头、模板仍缺 | [N42-E4](194-n42-e4-derived-timeline-playhead-audit.md)、[N42-E3b](193-n42-e3b-preview-production-loop-audit.md)、[N42-E3](190-n42-e3-character-keyframe-authoring-audit.md)、[N42-E2](189-n42-e2-stage-move-easing-audit.md)、[N42-E1b](188-n42-e1b-production-media-stage-audit.md)、AC-13 |
| REQ-UX | 设计 Token、七模式、Beginner/Pro、统一语义、连续动效、60 FPS、减少动效、多模态状态 | N43/N101 | N21/N40–42 | 实现中 | E3a 已修正首页原生控件、内部 fixture 抢占首层和桌面整页纵向摊大饼；E3b 把 Preview 改为“舞台/核心控制常驻，Runtime/Build 按任务展开”，并用真实 Chromium 修正 flex `<details>` 仅 2 px 的首次实现差异。1280×720 下默认 16:9 比例 1.778、console error 0；仍仅三模式，七模式和真人证据未完成，N21 `0/1`、N23 `0/2` | [N42-E3b](193-n42-e3b-preview-production-loop-audit.md)、[N42-E3a](192-n42-e3a-ui-shell-convergence-audit.md)、[N23-E7](122-n23-e7-acceptance-launcher-audit.md)、[N21 执行包](114-n21-human-validation-execution-kit.md)、[N23 执行包](121-n23-product-acceptance-execution-kit.md)、D1 任务报告 |
| REQ-ASSET | 图像/音频/视频/字体、标签/引用、拖放/选择器、报告、Dicing/Atlas/平台变体 | N70/N72 | N10/N83 | 实现中 | 源 Blob/Index 自包含迁移已通过；仍缺完整类型、引用 UI、平台变体和构建报告 | [N23-E3 审计](117-n23-e3-portable-resource-bundle-audit.md)、Asset/Dicing Golden、三端构建报告 |
| REQ-RUNTIME | 确定执行、剧情/媒体、Save/History/Auto/Skip/Back、输入、源码错误 | N31/N32/N50/N52 | N20/N30 | 实现中 | VM-01–VM-15 为 15/15；E1–E7 已完成 Editor 正式执行、观察、Fresh Run、调试、安全热更新和 portable Host，Node↔Worker receipt/hash Golden 通过，Benchmark 两路线正式执行到结局。正式 Player 仍不存在，单文件试玩仍是独立 `StoryStatement` 解释器；玩家槽、视觉差分和三端媒体策略仍缺 | [N32-E7](150-n32-e7-shared-runtime-host-audit.md)、[N32 出口复审](151-n32-engineering-exit-reaudit.md)、三宿主 Golden、玩家 E2E |
| REQ-L10N | 语言、稳定文本 ID、CSV/XLSX、状态、运行切换、CJK/Ruby | N61 | N10/N30/N50 | 实现中 | Compiler 已生成稳定 Localization Catalog 并冻结 CJK IR；导入导出、翻译状态、运行切换、Ruby/字体仍未实现 | [N30-E2 审计](124-n30-e2-compiler-completion-audit.md)、三端语言切换 |
| REQ-QA | 任意入口运行、断点/单步、状态检查、结构错误、循环、源码跳转 | N30/N60 | N31/N32/N40 | 实现中 | Compiler/Runtime 已有 CFG/SCC、Source Map 与结构化诊断；N32-E3–E5 已支持 Fresh Run、调试控制与 Effect/History Host 边界；E6 对可迁移和必须重启的编辑给出可审计产品反馈。仍缺断点管理、Watch、Solver 和完整 Debugger E2E | [N30-E2 审计](124-n30-e2-compiler-completion-audit.md)、[N31-E8 审计](133-n31-e8-runtime-source-map-diagnostics-audit.md)、[N32-E3](145-n32-e3-run-from-target-audit.md)–[N32-E6](148-n32-e6-preview-hot-update-audit.md)、QA Golden、Debugger E2E |
| REQ-BUILD | Web/PWA、Windows、APK/AAB、签名、日志、Profile、元数据、校验、可复现和发布材料 | N80–N83/N110 | N30/N50/N70 | 实现中 | N23 有确定性单文件离线试玩候选，但其运行脚本未消费正式 Compiler IR/Runtime，只能保留为验收候选，不能登记为正式 Player。两名参与者证据、PWA、资源构建、安装、签名和发布材料均缺 | [N23-E4 审计](119-n23-e4-independent-playable-web-audit.md)、[N32 出口审计](149-n32-engineering-exit-alignment-audit.md)、[N23 执行包](121-n23-product-acceptance-execution-kit.md)、三端 Artifact Manifest、安装/签名报告 |
| REQ-GAL | 可搜索设置、继承/撤销/预览、完整 Gal P0、附加页模板、六类音量、三平台 Profile | N51/N52/N62 | N10/N31/N50 | 未开始 | 只有规格 | Settings Schema/E2E、三端配置 Golden |
| REQ-OPT | 联合预算、Profile、去重、报告、依赖、加载调度、稳定性诊断、可解释回退 | N71/N72/N102 | N70/N83 | 实现中 | 算法分散，无 Center/真机 | Optimization Golden、三端性能报告 |

## 4. M1 纵向验收

| AC | 验收摘要 | 主节点 | 当前状态 | 阻塞项 | 必需证据 |
|---:|---|---|---|---|---|
| AC-01 | Windows/Android 打开工程 | N90–N92 | 未开始 | REQ-PRJ、双端编辑器 | 同工程双端打开录像和 Hash |
| AC-02 | 两端编辑对白/角色/选择/条件 | N91/N92 | 未开始 | N13/N21 | 双端任务 E2E |
| AC-03 | Route/Sequence/Script/Stage 同源 | N40–N43 | 实现中 | E1b–E3b 已证明真实 Stage、easing 与关键帧由 stable-ID Script 驱动；E4 时间尺也只投影 canonical statement，编辑播放头选择 stable ID，Formal Runtime 通过 Source Map 接管，没有第二套时间轴持久状态。完整时间线和 N43 七模式仍未关闭 | [N42-E4](194-n42-e4-derived-timeline-playhead-audit.md)、[N42-E3b](193-n42-e3b-preview-production-loop-audit.md)、ChangeSet/Runtime 对照 |
| AC-04 | 任一视图修改 500 ms 同步 | N43 | 实现中 | E6e 已测 10k 单场景 Project Service 修改→权威增量分析→Route 投影→索引→锚点窗口的 20 样本 P95 `64.10 ms`，且只编译 1、复用 9,999；这关闭 N40 Route 局部编辑性能子门，不等于 N41–N43 四视图和真实浏览器渲染均已完成 | [N40-E6e](162-n40-e6e-route-edit-sync-performance-audit.md)、N41–N43 跨视图 E2E |
| AC-05 | 任意语句预览和变量 | N32/N60 | 实现中 | E1–E7 已完成 Editor 正式执行、状态观察、Fresh Run、调试、Effect/Barrier portable Host 与安全热更新；Benchmark 缺失变量也已由正式路线测试发现并修正。断点/Watch、正式 Player、Editor↔Player 画面 Golden、完整 Debugger E2E 和产品验收仍缺 | [N32-E7](150-n32-e7-shared-runtime-host-audit.md)、[N32 出口复审](151-n32-engineering-exit-reaudit.md)、Debugger E2E |
| AC-06 | 不可达结局和缺失资源 | N30/N60 | 实现中 | N30 Compiler 已拒绝不可达结局、无出口、无交互闭环和缺失资源；仍缺 N60 产品 QA 呈现、抑制与 Solver | [N30-E2 审计](124-n30-e2-compiler-completion-audit.md)、QA Golden 报告 |
| AC-07 | 三端结局/Save/Back 一致 | N31/N80–N82/N92 | 实现中 | E11 已恢复完整 Session；E12 已证明 Back/Forward 和旧 State/Session Save 不回退 read/CG/ending，原存档 artifactHash 仍可验证，并取得远端完整门绿色。三端 Player、设备与存档槽仍未完成 | [N31-E4](129-n31-e4-runtime-save-load-audit.md)、[N31-E5](130-n31-e5-runtime-history-audit.md)、[N31-E10](135-n31-e10-formal-vm-parity-audit.md)、[N31-E11](137-n31-e11-runtime-session-save-audit.md)、[N31-E12](138-n31-e12-monotonic-meta-audit.md)、三端 Session Save/Outcome Hash 0 差异 |
| AC-08 | 导出后无账户离线重开 | N12/N90/N91 | 验收中 | Web 新工作区资源自包含导入、运行和重载已通过；尚待正式 Windows/Android 壳、断网设备和远端 CI 证据 | [N23-E3 审计](117-n23-e3-portable-resource-bundle-audit.md)、离线导出导入 E2E |
| AC-09 | 崩溃恢复到自动保存 | N12/N90/N91 | 实现中 | 正式宿主未贯通 | 真实强杀恢复矩阵 |
| AC-10 | 键盘完整操作、手机替代拖拽 | N21/N43/N91 | 实现中 | 完整任务和 Android | 键盘/触屏任务报告 |
| AC-11 | 七模式修改同一语句 | N43 | 未开始 | 仅三模式 | 七模式 E2E |
| AC-12 | 动效不阻塞且有减少动效 | N43 | 实现中 | 完整交互未覆盖 | 帧时间/可中断/减少动效测试 |
| AC-13 | 镜头/角色/转场/BGM/Voice/SFX | N42/N50 | 实现中 | E2/E3 已让真实角色 Move 几何、duration、easing 和下一关键帧进入正式链；E4 把 BG/CHAR/AUDIO/STORY 置于同一派生时间尺并同步 Runtime statement。复杂路径、镜头、真实 Player 渲染/音频 Adapter 与三端媒体宿主仍缺 | [N42-E4](194-n42-e4-derived-timeline-playhead-audit.md)、[N42-E3](190-n42-e3-character-keyframe-authoring-audit.md)、[N42-E2](189-n42-e2-stage-move-easing-audit.md)、[N32-E7](150-n32-e7-shared-runtime-host-audit.md)、Media Golden 三端快照 |
| AC-14 | 编辑器和玩家设备预算 | N90–N92/N102 | 未开始 | 实体设备 | WIN-L/AND-L/AND-R 报告 |
| AC-15 | Auto 和四种 Skip 正确 | N31/N52 | 实现中 | N31-E6 正式内核已证明 Normal、5/10/20/40/Instant 最终 State/History Hash 一致、Skip Read 未读停止、Hold/Toggle 策略同构、Auto 延迟不入 State，以及 Choice/Effect/Barrier/资源/Stop Point 停止；Player 控件、真实计时/语音/媒体策略、三端与真人证据仍缺 | [N31-E6 审计](131-n31-e6-runtime-scheduler-audit.md)、玩家输入向量和 State Hash |
| AC-16 | 每句 Back/Forward 和分支截断 | N31/N52 | 实现中 | 正式 Runtime checkpoint/截断/tombstone/reconciliation/Session Save/永久 Meta 保持有效；E7 共享 Host Golden 覆盖 compensation/replay，Benchmark production 实际 Back 后 Forward 返回同一结局。正式 Player/三端和真人证据仍缺 | [N32-E7](150-n32-e7-shared-runtime-host-audit.md)、玩家 History E2E |
| AC-17 | 脚本自动生成创作者 Route | N40/N62 | 实现中 | N40 Engineering 已通过：E1–E8n 建立自动图、10k/64 窗口、缓存、Runtime 高亮、trusted Route-first、全局索引、narration 结构事务、topology 分页、结局审阅、诊断/目标导航及 Choice 修复闭环。N40 Product Acceptance 仍阻断，N62 玩家自动图未开始 | [N40-E1](153-n40-e1-route-graph-core-audit.md)–[N40-E7](163-n40-e7-runtime-route-highlight-audit.md)、[N40-E8a](164-n40-e8a-single-project-read-audit.md)–[N40-E8n](178-n40-e8n-route-repair-loop-audit.md)、[N40 出口复审](179-n40-engineering-exit-reaudit.md) |
| AC-18 | 自动 Gallery/Replay/Music/Ending | N62 | 实现中 | Compiler 已生成四类 Catalog；Runtime E2 记录 Gallery/Ending，E12 又确保 Back/Forward 与旧存档加载不回退该永久 Meta。覆盖配置、隔离 Replay、Music 解锁规则与 Player UI 仍待 N62 | [N30-E2 审计](124-n30-e2-compiler-completion-audit.md)、[N31-E2 审计](127-n31-e2-runtime-deterministic-state-audit.md)、[N31-E12 审计](138-n31-e12-monotonic-meta-audit.md)、Catalog 和玩家 E2E |
| AC-19 | Gal 配置中心覆盖 P0 | N51 | 未开始 | Settings Schema/UI | 配置追踪全覆盖 |
| AC-20 | 自动页和状态三端一致 | N62/N92 | 未开始 | AC-18、三端 Player | Catalog/Meta Hash 0 差异 |
| AC-21 | Optimization 显示联合预算 | N71 | 未开始 | 真机/构建数据 | Center 报告 |
| AC-22 | Safe Auto 不改源、可重建回退 | N70–N72 | 实现中 | 构建未接入 | 删除派生重建和回退 E2E |
| AC-23 | Golden Dicing 三端综合收益 | N72/N102 | 实现中 | 三端 Runtime/设备 | 无损/无接缝/联合收益报告 |
| AC-24 | 低内存设备 2h 稳定 | N102 | 未开始 | Android Player | Soak 原始数据 |
| AC-25 | 弱网/损坏/磁盘不足安全 | N102/N110 | 实现中 | 下载/发布链缺失 | 故障矩阵和最后可运行版本 Hash |
| AC-26 | Benchmark Episode 三端正式包 | N100/N102 | 未开始 | 前序全部产品链 | 源工程、三端包、Manifest、录像 |
| AC-27 | 编辑器安装/升级/签名/发布审核 | N90/N91/N110 | 未开始 | 正式编辑器包 | Release Assurance Bundle |

## 5. P1/P2 需求保留登记

P1/P2 不属于当前 M1 交付，但必须保留可追踪入口，防止实现 M1 时封死演进路径。它们只有在 M1 Gate 通过后才能拆成执行节点。

| FUTURE | 来源模块 | 保留能力 | 当前处理 |
|---|---|---|---|
| FUT-PRJ | 项目与工作区 | 模板、批量重构、健康总览、云项目、跨设备同步、共享资源 | M1 Schema 保留版本/引用边界，不实现云能力 |
| FUT-ROUTE | Route | 自动布局、路线比较、覆盖过滤、玩家流程图增强、状态空间/Storylet | M1 Compiler/Graph API 保持可扩展 |
| FUT-SEQ | Sequence | 镜头/滤镜/视频、宏、表格、波形、时间标尺、高级曲线 | M1 语句和轨道使用版本化类型，不硬编码 UI |
| FUT-SCRIPT | Script | 多光标、片段、类型推断、Yarn/ink/Ren'Py/WebGAL 导入、LSP/扩展 | M1 Parser/AST 提供公共只读接口 |
| FUT-STAGE | Stage/UI | 完整主题编辑、响应式约束、粒子/滤镜、Live2D/Spine、3D 插件 | M1 Renderer/Effect 使用 Capability 和插件边界 |
| FUT-UX | 工作模式 | 个人布局、动态 QA 图解、高刷新率、团队主题和可安装工作区 | M1 模式不持久化独立语义数据 |
| FUT-ASSET | 资源 | 有损平台压缩、高级聚类、配音匹配、DLC、DAM/网盘/素材市场 | M1 Asset DAG 和 Profile 保持版本化扩展点 |
| FUT-RUNTIME | 运行时 | 视频/复杂特效、章节补丁、成就、无障碍增强、Storylet/网络内容 | M1 Opcode/Effect/Save 必须可版本迁移 |
| FUT-L10N | 本地化 | 翻译记忆、术语、伪本地化、多语言媒体、平台/AI/配音供应链 | M1 Catalog 不绑定单一表格工具 |
| FUT-QA | QA | 路线录制、结局求解、覆盖率、变量图、溢出截图、设备农场 | M1 Compiler Diagnostics/Trace 提供结构化接口 |
| FUT-BUILD | 构建 | iOS、云构建、Steam/itch、补丁、商店提交、私有节点 | M1 Build Adapter/Manifest 不写死三平台实现 |
| FUT-COLLAB | 协作 | 版本历史、评论、角色、语义 Diff、审批、实时协作、分支合并 | M1 Stable ID/ChangeSet 支持未来语义 Diff；不实现服务端 |
| FUT-PLUGIN | 插件 SDK | 命令/面板/导入导出、沙箱、兼容、签名、市场和授权 | M1 未知命令保留、权限模型和 ABI 版本字段预留 |
| FUT-GAL | Gal 配置 | CJK 高级、存档迁移、章节包、人物资料、无障碍和商店元数据 | M1 Settings Schema 允许新增字段和迁移 |
| FUT-OPT | Optimization | GPU/音视频/字体高级候选、遥测建议、设备农场、自定义优化器 | M1 成本报告和 Profile 使用插件化候选接口 |
| FUT-AI | 产品战略 | 可选 AI 助手、最小内容发送、明确授权和隐私 | M1 不接 AI；未来必须单独安全/隐私 Gate |

## 6. Golden Project 清单

| ID | 目的 | 最小内容 | 首次使用节点 |
|---|---|---|---|
| GP-TINY | 最短端到端 | 1 场景、20 行、1 结局 | N10 |
| GP-BRANCH | 路线/状态 | 3 场景、选择、条件、调用、循环陷阱、4 结局 | N20 |
| GP-MEDIA | 演出/资源 | 背景、角色、表情、镜头、转场、BGM/Voice/SFX | N22 |
| GP-CJK | 本地化/排版 | 中日英、Ruby、禁则、长 UI、字体回退 | N61 |
| GP-RECOVERY | 数据安全 | 保存、备份、迁移、损坏、磁盘不足、强杀 | N12 |
| GP-SIZE | 优化/分包 | 相似 CG、透明立绘、无收益背景、音视频、字体 | N70 |
| GP-BENCH | 正式验收 | 20–30 分钟完整原创作品 | N100 |

## 7. 每次更新模板

```text
REQ/AC:
状态变化:
用户入口:
实现位置:
测试位置:
Golden Project / Device:
复现命令:
产物或报告:
失败路径:
审核人和日期:
```

不允许使用“代码已写”“测试很多”“PR 已开”“文档已冻结”作为通过证据。
