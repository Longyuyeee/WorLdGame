# M1 需求与验收追踪矩阵

> 生效日期：2026-08-13
> 用途：本文件是 M1 功能状态的唯一权威。需求文档定义“要什么”，[产品落地计划](89-engine-product-delivery-plan.md)定义“怎样做”，本文件记录“做到哪里、证据在哪”。
> 更新规则：实现、测试和证据必须在同一 PR 更新；没有证据路径时状态不得为“通过”。
> 集成边界：当前 N00–N21 能力仍未进入 `main`；[M1 N21 指定集成基线](101-m1-n21-integration-baseline.md)已在 Draft PR #32 成为 Authoritative。N22 工程门已完成；`RA-N21-002` 只允许 N23 可运行纵向切片工程实现，N21/N23 产品验收与 M1 仍被阻断。

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

最近按产品顺序通过的节点仍是 `N20`；N22 工程门已通过，但它不跨越 N21 产品门。N23 当前仅进入可运行纵向切片工程实现，不能登记产品通过。N21 真人任务已增加“试玩到结局”前提，权威记录仍为 `pending-participant`。`RA-N21-002` 在 2026-09-14 到期并持续阻断 N21/N23 产品验收、M1 Stable 与发布。

| ID | 需求 | 交付节点 | 当前状态 | 当前证据 | 完成证据 |
|---|---|---|---|---|---|
| USP-01 | One Story, Many Views | N40–N43 | 实现中 | 固定样例 Writer/Script/Flow/Preview | 任意工程四视图+Preview+Debugger 同源 E2E |
| USP-02 | Mobile First Editor | N91 | 未开始 | CL-02 契约 | AND-L/AND-R 完整创作任务 |
| USP-03 | Narrative Intelligence | N30/N60 | 未开始 | 基础引用诊断 | QA Golden、Solver/Debugger、源码跳转 |
| USP-04 | Local First / No Lock-in | N10–N13 | 实现中 | 固定 IndexedDB 保存/恢复 | 通用工程离线导入导出、Git diff、外部编辑 |
| USP-05 | Local Multi-platform Build | N80–N83 | 未开始 | 开发构建不计 | Windows 本地三端正式产物 |
| USP-06 | Professional Studio | N41–N43/N100 | 实现中 | 三模式视觉原型 | 七模式、商业演出、Benchmark Episode |
| USP-07 | Budget-driven Optimization | N70–N72 | 实现中 | Dicing/调度/预测原型 | Center、三端报告、可回退构建变体 |
| USP-08 | Gal Automation | N62 | 未开始 | 简单 Route 投影 | 自动 Catalog、玩家附加页、三端一致 |
| USP-09 | Skip / History / Back | N31/N52 | 实现中 | VM Spike | Editor/Player/三端状态一致 |
| USP-10 | Lossless Dicing | N72 | 集成中 | Web/Node 算法和重建测试 | 三端综合收益与无接缝 Golden |

## 3. P0 模块需求

| REQ | P0 范围摘要 | 主节点 | 依赖 | 当前状态 | 当前缺口 | 通过证据 |
|---|---|---|---|---|---|---|
| REQ-PRJ | 新建/打开/最近/示例、保存恢复、章节场景、搜索、桌面/手机工作区、导入导出、离线 | N10–N13/N90/N91 | N00 | 实现中 | N23-E2 已证明空工程内容写回 Canonical、保存重开和文档 ZIP round-trip；资源 Blob 尚未随 ZIP 自包含，仍缺 Android SAF、正式壳、统一七模式搜索与强杀恢复 | [N23-E2 审计](116-n23-e2-blank-project-flow-audit.md)、Project E2E、Recovery Golden、双端任务 |
| REQ-ROUTE | 完整自动图、布局、局部加载、诊断、路线高亮、进入 Sequence | N40 | N20/N30 | 实现中 | 仅简单 Choice 场景图 | 10k Route Golden、跨视图 E2E |
| REQ-SEQ | P0 语句块、排序/复制/批量/折叠、Inspector、跨视图定位 | N21/N41 | N21 | 实现中 | N23-E2 已证明 Writer 从空工程创建选择、变量、条件、演出和双结局并保存重开；`N21-HV-01` 仍为 `pending-participant`，N41 完整 Sequence 与 Stage 跨视图联动未完成 | [N23-E2 审计](116-n23-e2-blank-project-flow-audit.md)、[N21 真人执行包](114-n21-human-validation-execution-kit.md) |
| REQ-SCRIPT | 高亮/补全/诊断/定义/引用、稳定 ID、格式化/重构、双向同步、外部编辑 | N20/N41 | N20 | 实现中 | N20 语言内核与规模门通过；仍缺 N41 正式编辑器呈现、全视图集成和外部编辑 E2E | 100k/round-trip/external edit Golden |
| REQ-STAGE | 画布、安全区、变换、模板、多轨、关键帧、缓动、三视图同步 | N22/N42 | N20/N31 | 实现中 | N22 最小 Stage 工程门已通过：真实 Blob 预览、Canvas 2D/DOM 边界、几何/安全区/DPR/输入等价、Move/Hide/Show/Fade、四类音轨计划及真实 WAV 播放均有证据；Pixi/WebGL 高性能后端、镜头/复杂关键帧/UI 模板与正式 Runtime 同步仍归后续节点 | [N22 退出审计](113-n22-exit-condition-audit.md)、N42 正式 Stage、AC-13 |
| REQ-UX | 设计 Token、七模式、Beginner/Pro、统一语义、连续动效、60 FPS、减少动效、多模态状态 | N43/N101 | N21/N40–42 | 实现中 | 仅三模式，未用户验证 | D1 任务报告、交互性能、可访问性审计 |
| REQ-ASSET | 图像/音频/视频/字体、标签/引用、拖放/选择器、报告、Dicing/Atlas/平台变体 | N70/N72 | N10/N83 | 实现中 | 缺完整类型、引用 UI、平台变体 | Asset/Dicing Golden、三端构建报告 |
| REQ-RUNTIME | 确定执行、剧情/媒体、Save/History/Auto/Skip/Back、输入、源码错误 | N31/N32/N50/N52 | N20/N30 | 实现中 | Editor 验证运行时已从空工程跑通资源、变量、条件、选择、跨场景和双结局；正式 VM 与 Editor/Player 仍分离 | [N23-E2 审计](116-n23-e2-blank-project-flow-audit.md)、VM Golden、三宿主 State Hash、玩家 E2E |
| REQ-L10N | 语言、稳定文本 ID、CSV/XLSX、状态、运行切换、CJK/Ruby | N61 | N10/N30/N50 | 未开始 | 仅稳定 `textId` | CJK Golden、三端语言切换 |
| REQ-QA | 任意入口运行、断点/单步、状态检查、结构错误、循环、源码跳转 | N30/N60 | N31/N32/N40 | 未开始 | 无产品模块 | QA Golden、Debugger E2E |
| REQ-BUILD | Web/PWA、Windows、APK/AAB、签名、日志、Profile、元数据、校验、可复现和发布材料 | N80–N83/N110 | N30/N50/N70 | 未开始 | 无正式 Player/Build | 三端 Artifact Manifest、安装/签名报告 |
| REQ-GAL | 可搜索设置、继承/撤销/预览、完整 Gal P0、附加页模板、六类音量、三平台 Profile | N51/N52/N62 | N10/N31/N50 | 未开始 | 只有规格 | Settings Schema/E2E、三端配置 Golden |
| REQ-OPT | 联合预算、Profile、去重、报告、依赖、加载调度、稳定性诊断、可解释回退 | N71/N72/N102 | N70/N83 | 实现中 | 算法分散，无 Center/真机 | Optimization Golden、三端性能报告 |

## 4. M1 纵向验收

| AC | 验收摘要 | 主节点 | 当前状态 | 阻塞项 | 必需证据 |
|---:|---|---|---|---|---|
| AC-01 | Windows/Android 打开工程 | N90–N92 | 未开始 | REQ-PRJ、双端编辑器 | 同工程双端打开录像和 Hash |
| AC-02 | 两端编辑对白/角色/选择/条件 | N91/N92 | 未开始 | N13/N21 | 双端任务 E2E |
| AC-03 | Route/Sequence/Script/Stage 同源 | N40–N43 | 实现中 | 通用 Project、完整视图 | ChangeSet/Hash 对照 |
| AC-04 | 任一视图修改 500 ms 同步 | N43 | 实现中 | 视图不全 | P95 测量和 E2E |
| AC-05 | 任意语句预览和变量 | N32/N60 | 未开始 | Compiler/Runtime | Debugger E2E |
| AC-06 | 不可达结局和缺失资源 | N30/N60 | 未开始 | Story QA | QA Golden 报告 |
| AC-07 | 三端结局/Save/Back 一致 | N31/N80–N82/N92 | 未开始 | 三端 Player | State/Save Hash 0 差异 |
| AC-08 | 导出后无账户离线重开 | N12/N90/N91 | 验收中 | Web/Windows 基础链与远端 Windows CI 通过；尚待正式壳/设备证据 | 离线导出导入 E2E |
| AC-09 | 崩溃恢复到自动保存 | N12/N90/N91 | 实现中 | 正式宿主未贯通 | 真实强杀恢复矩阵 |
| AC-10 | 键盘完整操作、手机替代拖拽 | N21/N43/N91 | 实现中 | 完整任务和 Android | 键盘/触屏任务报告 |
| AC-11 | 七模式修改同一语句 | N43 | 未开始 | 仅三模式 | 七模式 E2E |
| AC-12 | 动效不阻塞且有减少动效 | N43 | 实现中 | 完整交互未覆盖 | 帧时间/可中断/减少动效测试 |
| AC-13 | 镜头/角色/转场/BGM/Voice/SFX | N42/N50 | 未开始 | 正式 Stage/Runtime | Media Golden 三端快照 |
| AC-14 | 编辑器和玩家设备预算 | N90–N92/N102 | 未开始 | 实体设备 | WIN-L/AND-L/AND-R 报告 |
| AC-15 | Auto 和四种 Skip 正确 | N31/N52 | 实现中 | 玩家未接入 | 玩家输入向量和 State Hash |
| AC-16 | 每句 Back/Forward 和分支截断 | N31/N52 | 实现中 | 玩家未接入 | History Golden |
| AC-17 | 脚本自动生成创作者 Route | N40/N62 | 实现中 | 图语义不全 | Branching Golden |
| AC-18 | 自动 Gallery/Replay/Music/Ending | N62 | 未开始 | Catalog/Player UI | Catalog 和玩家 E2E |
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
