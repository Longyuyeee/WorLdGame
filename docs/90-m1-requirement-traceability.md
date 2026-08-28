# M1 需求与验收追踪矩阵

> 生效日期：2026-08-13
> 用途：本文件是 M1 功能状态的唯一权威。需求文档定义“要什么”，[产品落地计划](89-engine-product-delivery-plan.md)定义“怎样做”，本文件记录“做到哪里、证据在哪”。
> 更新规则：实现、测试和证据必须在同一 PR 更新；没有证据路径时状态不得为“通过”。
> 集成边界：当前开发链仍未进入 `main`；N00–N41 Authority 对应 main-target Draft PR #61，仍等待维护者审阅与合并。N40–N51 Engineering 出口不得换算成 Product Acceptance；`RA-N21-011` 只准入 N52 Player Control Engineering，持续阻断 N52 Product Acceptance、N60 及以后、M1 Stable 与发布。N51 Engineering 已关闭；N52 只完成治理准入，产品功能尚未开始。

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

最近按产品顺序通过的节点仍是 `N20`；后续工程门不跨越 N21 产品门，不能登记对应产品通过。N21 与 N23 真人记录分别为 `pending-participant`（0/1）和 `pending-participants`（0/2）。N50 E1–E6 完成 Core/媒体/输入/生命周期/嵌入，[范围消歧 #220](220-n50-n52-scope-reconciliation.md)把 Settings 唯一归 N51、播放控制唯一归 N52；N51 E1–E6f 随后关闭 Settings Engineering。产品负责人在获知 RA-010 截止 N51、N52 仍被阻断后于 2026-08-28 再次明确要求进入后续步骤，因此关闭 RA-010，建立 2026-09-27 到期的 `RA-N21-011`：只允许 N52 Player Control Engineering，并持续阻断全部 Product Acceptance、N60+、M1 与发布。证据见[治理 #236](236-n51-n52-governance-checkpoint.md)。

| ID | 需求 | 交付节点 | 当前状态 | 当前证据 | 完成证据 |
|---|---|---|---|---|---|
| USP-01 | One Story, Many Views | N40–N43 | 实现中 | N43-E1b 冻结统一上下文，E5/E6 让 Production 与 Debug & QA 消费同一权威工程；E7 Mobile Focus 又以同一 stable ID 和 `patch-dialogue` 完成手机专注写入、前后句往返和保存重开。完整时间写入与 Product E2E 仍缺 | [N43-E7](210-n43-e7-mobile-focus-and-engineering-exit-audit.md)、任意工程七模式+Preview+Debugger 同源 E2E |
| USP-02 | Mobile First Editor | N91 | 未开始 | CL-02 契约 | AND-L/AND-R 完整创作任务 |
| USP-03 | Narrative Intelligence | N30/N60 | 实现中 | N30 Compiler 已有语句级 CFG/SCC、结构/资源/表达式诊断与 Source Map；Solver/Debugger 仍待 N60 | [N30-E2 审计](124-n30-e2-compiler-completion-audit.md)、QA Golden、Debugger |
| USP-04 | Local First / No Lock-in | N10–N13 | 实现中 | IndexedDB 保存/恢复、备份，以及 Canonical 文档/Asset Index/源 Blob 的确定性 ZIP 自包含迁移与重载已通过 | 正式双端壳离线导入导出、Git diff、外部编辑与强杀恢复 |
| USP-05 | Local Multi-platform Build | N80–N83 | 未开始 | 开发构建不计 | Windows 本地三端正式产物 |
| USP-06 | Professional Studio | N41–N43/N100 | 实现中 | N43-E1–E4 建立统一上下文、Beginner/Pro、Motion 与输入/同步；E5–E7 依次开放 Production、Debug & QA 与 Mobile Focus，Engineering 真实任务达到 7/7。Utage 级本地化/配音批量列、真人与商业 Product 门仍缺 | [N43-E7](210-n43-e7-mobile-focus-and-engineering-exit-audit.md)、商业演出、Benchmark Episode |
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
| REQ-STAGE | 画布、安全区、变换、模板、多轨、关键帧、缓动、三视图同步 | N22/N42 | N20/N31 | 验收中 | N42 Engineering `8/8` 保持通过；N50-E3 已对同一 Media Golden 冻结 Editor↔Player background/character/audio/camera/textbox 结构差分，并实测左右角色与 BGM/Voice 独立 channel。仍缺像素级视觉矩阵、完整 SFX/Ambient/UI、三端 Adapter 与 Product Acceptance | [N50-E3](215-n50-e3-player-media-parity-recovery-audit.md)、[N50-E2](214-n50-e2-player-stage-media-presentation-audit.md)、AC-13 |
| REQ-UX | 设计 Token、七模式、Beginner/Pro、统一语义、连续动效、60 FPS、减少动效、多模态状态 | N43/N101 | N21/N40–42 | 实现中 | E7 补齐 Mobile Focus，手机头部收敛无关操作，390×844 文档 overflow 0、textarea `240.25px`、四操作均 48px，七模式 Engineering 7/7。真实 OS/目标设备与真人证据仍未完成 | [N43-E7](210-n43-e7-mobile-focus-and-engineering-exit-audit.md)、[N43-E4](207-n43-e4-input-sync-and-exit-audit.md) |
| REQ-ASSET | 图像/音频/视频/字体、标签/引用、拖放/选择器、报告、Dicing/Atlas/平台变体 | N70/N72 | N10/N83 | 实现中 | 源 Blob/Index 自包含迁移已通过；仍缺完整类型、引用 UI、平台变体和构建报告 | [N23-E3 审计](117-n23-e3-portable-resource-bundle-audit.md)、Asset/Dicing Golden、三端构建报告 |
| REQ-RUNTIME | 确定执行、剧情/媒体、Save/History/Auto/Skip/Back、输入、源码错误 | N31/N32/N50/N52 | N20/N30 | 实现中 | VM-01–VM-15 为 15/15；N50-E4/E5 已统一输入与 Web lifecycle，E6 又以 v1 mount/update/suspend/unmount API 和独立 embed 页冻结宿主边界。持久存档/历史/控制 UI、真实设备和 Windows/Android 宿主仍缺；N50/N52 重复范围待治理消歧 | [N50-E6](218-n50-e6-player-embed-api-audit.md)、[N50 出口复审](219-n50-engineering-exit-reaudit.md)、三宿主 Golden、玩家 E2E |
| REQ-L10N | 语言、稳定文本 ID、CSV/XLSX、状态、运行切换、CJK/Ruby | N61 | N10/N30/N50 | 实现中 | Compiler 已生成稳定 Localization Catalog 并冻结 CJK IR；导入导出、翻译状态、运行切换、Ruby/字体仍未实现 | [N30-E2 审计](124-n30-e2-compiler-completion-audit.md)、三端语言切换 |
| REQ-QA | 任意入口运行、断点/单步、状态检查、结构错误、循环、源码跳转 | N30/N60 | N31/N32/N40 | 实现中 | Compiler/Runtime 已有 CFG/SCC、Source Map 与结构化诊断；N43-E6 已提供当前 stable ID 的正式检查、错误草稿阻断、严重级别筛选和 Sequence 定位修复闭环。仍缺断点管理、Watch、Solver、覆盖率和完整 Debugger E2E | [N43-E6](209-n43-e6-debug-qa-workspace-audit.md)、QA Golden、Debugger E2E |
| REQ-BUILD | Web/PWA、Windows、APK/AAB、签名、日志、Profile、元数据、校验、可复现和发布材料 | N80–N83/N110 | N30/N50/N70 | 实现中 | N50-E6 已生成消费正式 Compiler/Runtime/Player Core 的双入口 Web 工程产物并以冷 production preview 通过独立 embed 页；这不是 PWA、Windows/APK/AAB 发布包。两名参与者证据、资源构建、安装、签名和发布材料均缺 | [N50-E6](218-n50-e6-player-embed-api-audit.md)、[N23-E4 审计](119-n23-e4-independent-playable-web-audit.md)、三端 Artifact Manifest、安装/签名报告 |
| REQ-GAL | 可搜索设置、继承/撤销/预览、完整 Gal P0、附加页模板、六类音量、三平台 Profile | N51/N52/N61/N62/N80–N83 | N10/N31/N50/N51 | 实现中 | N51 Engineering 已关闭：schema v5、Basic 23/Advanced 36、Project/UI/application/Web Host 与双 production evidence 完成，Profile 所有权已冻结。REQ-GAL 是跨节点产品需求；Player 控制=N52、本地化=N61、自动页=N62、Optimization=N70–N72、正式 Windows/Android Host 与构建=N80–N83，仍未完成 | [N51-E6 入口 #229](229-n51-e6-p0-gap-matrix-and-entry-audit.md)、[N51-E6f 出口 #235](235-n51-e6f-engineering-exit-reaudit.md)、配置追踪全覆盖 |
| REQ-OPT | 联合预算、Profile、去重、报告、依赖、加载调度、稳定性诊断、可解释回退 | N71/N72/N102 | N70/N83 | 实现中 | 算法分散，无 Center/真机 | Optimization Golden、三端性能报告 |

## 4. M1 纵向验收

| AC | 验收摘要 | 主节点 | 当前状态 | 阻塞项 | 必需证据 |
|---:|---|---|---|---|---|
| AC-01 | Windows/Android 打开工程 | N90–N92 | 未开始 | REQ-PRJ、双端编辑器 | 同工程双端打开录像和 Hash |
| AC-02 | 两端编辑对白/角色/选择/条件 | N91/N92 | 未开始 | N13/N21 | 双端任务 E2E |
| AC-03 | Route/Sequence/Script/Stage 同源 | N40–N43 | 实现中 | N43-E1b 保存统一上下文，E5/E6 投影同一资源与诊断；E7 Mobile Focus 以同一 `stmt_gate_001` 写入、前后句往返并保存重开。完整时间写入仍未关闭 | [N43-E7](210-n43-e7-mobile-focus-and-engineering-exit-audit.md)、ChangeSet/Runtime 对照 |
| AC-04 | 任一视图修改 500 ms 同步 | N43 | 实现中 | E6e 10k Route P95 `64.10ms`；N43-E4 又以真实浏览器实测对白 `r0→r1` 到 Script/Preview layout commit `26.20ms`，stable ID 不变。这里只关闭一个高频文本任务子门，不外推为任意视图/目标设备全部通过 | [N43-E4](207-n43-e4-input-sync-and-exit-audit.md)、[N40-E6e](162-n40-e6e-route-edit-sync-performance-audit.md)、完整跨视图/设备 E2E |
| AC-05 | 任意语句预览和变量 | N32/N60 | 实现中 | Editor 正式执行、状态观察、Fresh Run、Effect/Barrier Host 与安全热更新已完成；N50-E1–E6 又建立正式 Player、媒体结构差分和公开嵌入观察值。仍缺断点/Watch、完整 Debugger E2E、像素视觉矩阵与产品验收 | [N50-E6](218-n50-e6-player-embed-api-audit.md)、[N32-E7](150-n32-e7-shared-runtime-host-audit.md)、Debugger E2E |
| AC-06 | 不可达结局和缺失资源 | N30/N60 | 实现中 | N30 Compiler 已拒绝不可达结局、无出口、无交互闭环和缺失资源；仍缺 N60 产品 QA 呈现、抑制与 Solver | [N30-E2 审计](124-n30-e2-compiler-completion-audit.md)、QA Golden 报告 |
| AC-07 | 三端结局/Save/Back 一致 | N31/N80–N82/N92 | 实现中 | E11 已恢复完整 Session；E12 已证明 Back/Forward 和旧 State/Session Save 不回退 read/CG/ending，原存档 artifactHash 仍可验证，并取得远端完整门绿色。三端 Player、设备与存档槽仍未完成 | [N31-E4](129-n31-e4-runtime-save-load-audit.md)、[N31-E5](130-n31-e5-runtime-history-audit.md)、[N31-E10](135-n31-e10-formal-vm-parity-audit.md)、[N31-E11](137-n31-e11-runtime-session-save-audit.md)、[N31-E12](138-n31-e12-monotonic-meta-audit.md)、三端 Session Save/Outcome Hash 0 差异 |
| AC-08 | 导出后无账户离线重开 | N12/N90/N91 | 验收中 | Web 新工作区资源自包含导入、运行和重载已通过；尚待正式 Windows/Android 壳、断网设备和远端 CI 证据 | [N23-E3 审计](117-n23-e3-portable-resource-bundle-audit.md)、离线导出导入 E2E |
| AC-09 | 崩溃恢复到自动保存 | N12/N90/N91 | 实现中 | 正式宿主未贯通 | 真实强杀恢复矩阵 |
| AC-10 | 键盘完整操作、手机替代拖拽 | N21/N43/N91 | 实现中 | E4 冻结七类输入等价；E7 Mobile Focus 增加 IME 组合保护、明确提交/放弃和 48px 前后句/提交触控路径。Android 实体触摸/系统 IME、全纯键盘真人任务仍缺，不能以 Web 响应式代替 N91 | [N43-E7](210-n43-e7-mobile-focus-and-engineering-exit-audit.md)、N91 设备与真人任务报告 |
| AC-11 | 七模式修改同一语句 | N43 | 实现中 | E5–E7 已使七模式具备真实中央任务；Mobile Focus 对同一 stable ID 写入，Debug & QA 返回同一 ID，Production 操作同一工程资源。Engineering 为 7/7，但 Production 的任务语义不是字面修改对白，完整 Product E2E 与真人仍未通过 | [N43-E7](210-n43-e7-mobile-focus-and-engineering-exit-audit.md)、七模式 E2E |
| AC-12 | 动效不阻塞且有减少动效 | N43 | 实现中 | E3 已建立完整/简化/静止三级、系统 reduce 强制静止、全局 `0.01ms` 中断、非颜色状态和真实页面 1.2s rAF 门；完整/简化/静止 P95 `12.30/12.20/6.20ms` 均通过。内嵌浏览器不能模拟真实 OS 媒体设置，目标设备/OS 矩阵和真人任务仍缺 | [N43-E3](206-n43-e3-motion-state-semantics-audit.md)、目标设备 Motion 矩阵 |
| AC-13 | 镜头/角色/转场/BGM/Voice/SFX | N42/N50 | 验收中 | N50-E3 已把 Editor↔Player Media Golden 结构差分和左右角色/BGM/Voice 多 channel 写成可执行 contract，并实测缺媒体恢复。短 Voice 在采样前自然结束，故只证明独立 bus/解码/音量，不虚报同时播放。仍缺 SFX/Ambient/UI 全矩阵、三端目标设备和 Product Acceptance | [N50-E3](215-n50-e3-player-media-parity-recovery-audit.md)、[N50-E2](214-n50-e2-player-stage-media-presentation-audit.md)、Media Golden 三端快照 |
| AC-14 | 编辑器和玩家设备预算 | N90–N92/N102 | 未开始 | 实体设备 | WIN-L/AND-L/AND-R 报告 |
| AC-15 | Auto 和四种 Skip 正确 | N31/N52 | 实现中 | N31-E6 正式内核已证明 Normal、5/10/20/40/Instant 最终 State/History Hash 一致、Skip Read 未读停止、Hold/Toggle 策略同构、Auto 延迟不入 State，以及 Choice/Effect/Barrier/资源/Stop Point 停止；Player 控件、真实计时/语音/媒体策略、三端与真人证据仍缺 | [N31-E6 审计](131-n31-e6-runtime-scheduler-audit.md)、玩家输入向量和 State Hash |
| AC-16 | 每句 Back/Forward 和分支截断 | N31/N52 | 实现中 | 正式 Runtime checkpoint/截断/tombstone/reconciliation/Session Save/永久 Meta 保持有效；E7 共享 Host Golden 覆盖 compensation/replay，Benchmark production 实际 Back 后 Forward 返回同一结局。正式 Player/三端和真人证据仍缺 | [N32-E7](150-n32-e7-shared-runtime-host-audit.md)、玩家 History E2E |
| AC-17 | 脚本自动生成创作者 Route | N40/N62 | 实现中 | N40 Engineering 已通过：E1–E8n 建立自动图、10k/64 窗口、缓存、Runtime 高亮、trusted Route-first、全局索引、narration 结构事务、topology 分页、结局审阅、诊断/目标导航及 Choice 修复闭环。N40 Product Acceptance 仍阻断，N62 玩家自动图未开始 | [N40-E1](153-n40-e1-route-graph-core-audit.md)–[N40-E7](163-n40-e7-runtime-route-highlight-audit.md)、[N40-E8a](164-n40-e8a-single-project-read-audit.md)–[N40-E8n](178-n40-e8n-route-repair-loop-audit.md)、[N40 出口复审](179-n40-engineering-exit-reaudit.md) |
| AC-18 | 自动 Gallery/Replay/Music/Ending | N62 | 实现中 | Compiler 已生成四类 Catalog；Runtime E2 记录 Gallery/Ending，E12 又确保 Back/Forward 与旧存档加载不回退该永久 Meta。覆盖配置、隔离 Replay、Music 解锁规则与 Player UI 仍待 N62 | [N30-E2 审计](124-n30-e2-compiler-completion-audit.md)、[N31-E2 审计](127-n31-e2-runtime-deterministic-state-audit.md)、[N31-E12 审计](138-n31-e12-monotonic-meta-audit.md)、Catalog 和玩家 E2E |
| AC-19 | Gal 配置中心覆盖 P0 | N51 | 实现中 | N51 Engineering 已关闭：36/23 字段、继承/撤销/预览、Canonical 保存、Editor/Player production Web 与 Profile 边界均有自动证据。AC-19 Product Acceptance 仍缺正式 Windows/Android Host、跨节点附加页/控制/本地化/构建及真人验证，不能登记通过 | [N51-E6a #230](230-n51-e6a-settings-schema-v2-migration-audit.md)–[N51-E6f #235](235-n51-e6f-engineering-exit-reaudit.md)、配置追踪全覆盖 |
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
