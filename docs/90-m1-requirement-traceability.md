# M1 需求与验收追踪矩阵

> 生效日期：2026-08-13
> 用途：本文件是 M1 功能状态的唯一权威。需求文档定义“要什么”，[产品落地计划](89-engine-product-delivery-plan.md)定义“怎样做”，本文件记录“做到哪里、证据在哪”。
> 更新规则：实现、测试和证据必须在同一 PR 更新；没有证据路径时状态不得为“通过”。
> 集成边界：当前开发链仍未进入 `main`；N00–N41 Authority 对应 main-target Draft PR #61，N52 tip 现已证明完整包含该 Authority 与 PR #1–#121 全部开放 head，并由直接面向 main 的 Draft PR #122 聚合。N40–N61 Engineering 出口不得换算成 Product Acceptance；**RA-N21-011 的 Localization 窄范围修订**已完成 N61 Engineering，但持续阻断 N61 Product Acceptance、N62 Engineering、M1 Stable 与发布。N21/N23 真人仍为 `0/1`、`0/2`，延后到功能与整体 UI 就绪后执行。

> 历史节点索引（机器可追溯）：**RA-N21-011 checkpoint 窄范围修订**、**N52-E3 入口契约**、**N52-E3a v2 元数据与截图**、**N52-E3b Auto / Quick Engineering 已关闭**、**N52-E3c1 Recovery / Migration Museum Engineering 已关闭**、**N52-E3c2 checkpoint 入口合同已关闭**、**N52-E3c3 checkpoint marker**、**N52-E3c4 Save v3 + 三 checkpoint 槽**、**N52-E4 Auto/Skip 入口合同**、**N52-E4a Player Core Scheduler bridge**、**N52-E4b Shell Auto real clock**、**N52-E4c Skip / media / embed**、**N52-E4d build-authored Stop Point**、**N52-E4e Player video**、**N52-E4f 移动端出口**、**N52-E5a History 入口**。这些 token 保留历史合同身份，不改变上方当前状态。

> N52-E4d build-authored Stop Point（2026-08-31）：`@stop()` 已由正式 Source 投影到稳定 statement identity，Compiler 输出独立 policy v1，Shell Auto 与四种 Skip 消费同一列表并由既有 N31 Scheduler 返回 `stopPoint`；Runtime IR 1.1、Save checkpoint 和 golden build identity 边界未漂移。首次 `77/84`、竞态修正前 `81/84`、最终 `84/84`，cold production Auto/Toggle Skip Read/All 同停 history 2。该项由 blocked 转 complete；E4 仍因 video policy 与 390×844 证据为 blocked，接续 N52-E4e，全部 Product Acceptance 不变。

> 换机接续（2026-08-31）：[交接 #255](255-n52-e4d-cross-device-development-handoff.md)冻结实现头 `663f317`、PR #113、首次差异、第三次完整门和暂停时仍运行的精确头 CI。新电脑必须先关闭最新文档头的远端证据，再进入 E4e；旧 run 不得跨 head 复用。

> N52-E4e Player video（2026-08-31）：正式 Player 现按 Canonical MIME 渲染现有 background awaited Effect 中的 video；Playback Policy `1.2.0` 固定 Auto 等 ended、Skip 取消并继续，Host suspend/resume、错误 fail closed 与媒体清理均已接线。Compiler→Policy→Shell 定向 `96/96`，cold production 真实 Blob WebM 覆盖 Auto、两种 Skip 与 Host 生命周期，console/overflow 0。该项由 blocked 转 complete；E4 仅余 390×844 E4c cold production 复验，接续 N52-E4f，AC-15 与全部 Product Acceptance 不变。

> N52-E4f 移动端出口（2026-08-31）：真实 390×844 production 已覆盖 Auto、Toggle/Hold × Skip Read/All；首次发现两个 select 高度 `30px`，纠偏至 `48px` 后全部交互控件至少 `44px`，五向量 stop reason、overflow `0`、console `0`。E4 七项矩阵全部 complete，N52-E4 Engineering 出口关闭。响应式 Web 不等于 Android 真机；AC-15、N52 Product Acceptance、N60+ 均保持阻断。

> N52 总出口治理复审（2026-09-01）：[checkpoint #258](258-n52-engineering-exit-and-n60-governance-checkpoint.md)确认 Runtime 分支改变只保留输入 tombstone、旧 Forward entries 不可查看；Core 没有条目/归档/Barrier 原因投影和定点导航；Shell 只有 Back/Forward 控件而没有可选行 History 页面；History Forward 项目策略也未实现。因此 USP-09、REQ-RUNTIME 与 AC-16 继续为“实现中”，N52 总 Engineering 出口 fail closed；唯一接续为 N52-E5 Player History / Barrier，N60 不准入。

> N52-E5a History 入口（2026-09-01）：[审计 #259](259-n52-e5a-history-contract-authority-audit.md)按实际 strict schema 冻结 Gal Settings v6 History Forward 策略、Runtime History/Session Save v2 只读归档与 v1 dual-read；Player Save v3/DB3、Runtime State/IR/Scheduler 均明确不变。E5a 只关闭跨层授权与兼容合同，功能仍未实现；接续 E5b Runtime branch archive，USP-09、REQ-RUNTIME、AC-16 与全部产品门状态不变。

> N52-E5b Runtime History v2（2026-09-01）：[审计 #260](260-n52-e5b-runtime-history-v2-audit.md)已实现 Runtime 所有的确定性只读 branch archive、active+archive 10,000 总界限、活动链唯一导航，以及 Session Save v2 新写 / strict v1-v2 双读；旧 v1 必须先按旧域验 hash 再归一，Player Save v3/DB3 不变。10k corpus 七类计数与 State/Outcome 金标不变，History v2 使汇总 digest 合法更新为 `01556a8c…63a9`。实现头 `78a19ec` 与交接头 `1a39394` 的 Windows 完整门均成功，E5b Engineering 已关闭；E5c/E5d/E5e、USP-09、REQ-RUNTIME、AC-16、Product Acceptance 与 N60 继续阻断。

> 产品目标对齐与交付节奏纠偏（2026-09-01）：[审计 #262](262-product-goal-alignment-and-delivery-correction.md)确认产品功能语义仍对齐最初 PRD，但 Engineering 子门、合同和证据更新已取代用户任务成为主要进度代理。后续主要判据改为真实用户路径、目标环境与预期/首次实际/修正后差异；E5c Settings/Core 与 E5d Shell 共同构成一个 Player History 纵向切片，在桌面和 390×844 完成旧分支查看、选行回退、Barrier 解释、Forward 项目策略与保存重开以前，不登记 History 产品完成。E5e 后优先收束 main-target 集成与长期欠缺的 N21/N23 真人任务，不以新增 N60 工程切片回避产品验证。

> N52-E5c Settings/Core（2026-09-01）：[实现审计 #263](263-n52-e5c-gal-history-policy-player-core-projection-audit.md)已把 Gal Settings 升至 strict v6，仅增加默认 true 的 `history.allowForwardAfterBack` 并保持 v1–v5 读取；Core 从 Runtime 单一权威投影活动主线、只读 archive、稳定 ID、Barrier 原因/距离并提供定点回退与 Forward 策略执行。实现前新路径 `0/5` 按预期失败，修正后受影响范围 `147/147`、Core `25/25`、TypeScript 通过。实现头 `cce203b` 的 Draft PR #119 Windows run `33465730199` / job `99725069881` 用时 `13m38s` 成功，E5c Engineering 已关闭；Shell、桌面/390×844、完整用户任务、USP-09、REQ-RUNTIME、AC-16 与全部产品门仍阻断。

> N52-E5d Player History Shell（2026-09-01）：[实现审计 #264](264-n52-e5d-player-history-shell-production-audit.md)已实现活动/旧分支页面、稳定 ID 选行回退、Barrier 原因/距离、Forward true/false 与热应用反馈及真实 IndexedDB 保存刷新读取。实现前新增 `0/3`，修正与扩展后 E5d `6/6`、N52 `101/101`、N51 `131/131`；1440×900 与 390×844 production overflow `0`、控件 `44/48px`、console `0`。实现头 `08bfb5c` 的 Draft PR #120 Windows run `33468762702` / job `99734003643` 用时 `9m26s` 成功，E5d Engineering 已关闭；下一步 E5e 总出口复审，USP-09、REQ-RUNTIME、AC-16 与全部产品门仍不得提前登记通过。

> N52-E5e History 总出口（2026-09-01）：[复审 #265](265-n52-e5e-history-engineering-exit-reaudit.md)确认 Runtime 只读 archive、Core 稳定 ID/Barrier/策略投影、Shell 可选行页面及保存重开已共同关闭 E5 前四项缺口；七项 N52 工程矩阵均 complete，N52 Engineering 已关闭。候选头 `9ea1666` 的 Draft PR #121 Windows run `33471267182` / job `99741333074` 用时 `10m21s` 成功。USP-09、REQ-RUNTIME 与 AC-16 仍保持“实现中”，因为 Windows/Android 正式 Host、实体设备、真人 Product Acceptance 与 main 集成尚未完成；N60 不准入。

> N52 main-target 集成候选（2026-09-01）：[审计 #266](266-n52-main-target-integration-candidate-audit.md)记录 main/N41 Authority 祖先检查、behind `0`、121 个开放 PR head 全部纳入，以及追加候选审计文档前 N52-E5e 基线 `463 commits / 972 files / +114135/-173` 的真实聚合审阅面；后续文档提交不冒充固定产品规模。Draft PR #122 只作为 main-target 总入口；候选头 `3ce53f5` 的 Windows run `33473899313` / job `99749040172` 用时 `12m55s` 成功，现有分片 PR 继续作为逐段索引，仍没有登记“已合入”。N21-HV-01 仍 `pending-participant 0/1`，N23-PA-01 仍 `pending-participants 0/2` 且必须等待 N21 pass；全部 Product Acceptance 与 N60 不变。

> N60-E1 正式调试会话（2026-09-01）：[审计 #267](267-n60-e1-debugger-session-audit.md)复用正式 Compiler/Runtime/History/Host/Source Map，增加 Entry/当前语句启动、当前 statement 断点、Back/Forward/Step/Step Over/Continue，以及变量、调用栈和可见 Host 通道观察。新路径首次 `0/1` 精确证明产品入口缺失，修正后相关 `3 files / 4 tests`；production desktop/mobile 实测断点暂停与单步历史，移动端首次 document overflow `10px`、按真实根宽重测为 `25px`，修正 header 后为 `0`、调试按钮最小 `44px`。N21 协议取消计时通过代理且保持 `0/1`；N60 总 Engineering、全部 Product Acceptance 与 N61 不变。

> N60-E2 断点集合与运行边界（2026-09-01）：[审计 #268](268-n60-e2-breakpoint-boundary-audit.md)以 stable Scene/Statement ID 实现多断点新增、启停、定位和移除；Continue 继续复用正式 Runtime/History/Source Map，并明确投影 Breakpoint、Choice、awaited Effect、Barrier、Ending 与 Error 停止原因。新增产品路径首次 `0/1`，修正中又以“预期 Choice、实际重复命中当前断点”发现并修复 transient History resume 语义；定向最终 `3 files / 19 tests`。production 真实示例工程证明命中下一断点后继续到 Choice，1440×900 与 390×844 均无横向溢出，E2 移动交互为 `44px`。本机全链仅既有 VM 10k 在 90 秒门限下为 `94.671s`、隔离 `96.507s`；未改预算，精确实现头 `4e29559` 的 Windows run `33491890189` / job `99805042362` 用时 `14m36s` 全绿，VM `69.36s`，关闭环境差异。N60 仍为实现中，下一步 E3 Watch/变量来源；Product Acceptance、N61 与真人状态不变。

> N60-E3 Watch 与变量来源/变化（2026-09-02）：[审计 #270](270-n60-e3-debugger-watch-audit.md)让 Story Language parser、正式 Runtime evaluator、History checkpoint 与 Compiler IR/Source Map 共同驱动 Watch，不在 UI 建立第二求值器。产品红测首次 `0/1` 精确暴露 Watch 输入缺失；修正后聚合 `7 files / 87 tests`，production 真实工程显示表达式 `1 → 2`、依赖变量 `0 → 1`、stable 写入来源，并让非法表达式保持会话可用。390×844 根宽 `375/375`、新增交互 `44px`、console `0 error`。本机 autosave/VM 冻结门保持红色后，精确实现头 `9d5d597` 的 Windows run `33580208407` / job `100092698639` 用时 `10m17s` 全绿：autosave `2.312s < 5s`、VM `40.656s < 90s`、普通回归 `157/985`。下一步先完成 PRD 3.10 P0 Story QA 产品闭环；Solver/覆盖率为 P1，不抢跑。

> N60-E4 P0 Story QA（2026-09-02）：[审计 #271](271-n60-e4-p0-story-qa-product-closure-audit.md)复用 N30 Compiler/Source Map，把不可达、无出口、悬空引用、缺失资源、非交互循环投影为五类产品总览、组合筛选和 stable source 修复入口。真实 App 红测首次 `0/1` 精确暴露分类 UI 缺失；修正后 N60 `8 files / 88 tests`，故障 Golden 五类均检出，正常校园工程五类均为 0。production 1440×900 与 390×844 横向 overflow `0`、console error/warning `0`。下一步是 N60 Engineering 总出口复审，不直接把 E4 换算为 Product Acceptance，也不抢跑 P1。

> N60-E5 当前场景启动（2026-09-02）：[审计 #272](272-n60-e5-scene-debugger-start-audit.md)确认模型层 Scene Fresh Run 已存在但 Debug & QA 产品入口缺失；真实 App 路径首次 `0/1` 精确失败于找不到“从当前场景启动”，修正后可停在 `scn_school_gate / stmt_gate_bg`，并继续复用正式 Runtime 的结构化失败恢复。N60 聚合 `8 files / 88 tests`、TypeScript 均通过。该项只关闭 PRD“从任意入口运行”的 Scene UI 缺口；N60 总 Engineering、Product Acceptance、N61 与 P1 仍未关闭。

> N60-E6 诊断抑制与总出口（2026-09-02）：[审计 #273](273-n60-e6-diagnostic-suppression-and-engineering-exit-audit.md)新增工程内 stable finding ID + 必填理由抑制，活动报告即时重算，Canonical 重开保留且可恢复。真实 App `0/1→1/1`，N60 `8 files / 88 tests`、TypeScript 和 production 双视口通过。PRD 3.10 P0、本节点 Implementation 与 Golden Engineering 证据已逐项完整，N60 Engineering 出口关闭；“完整报告”无权威 P0 来源，P1、Product Acceptance、N61、M1 与发布继续阻断。

> N61-E1 本地化生产入口与状态闭环（2026-09-02）：[审计 #274](274-n61-e1-localization-production-audit.md)复用 Production、Canonical localization、Story 稳定 ID 和 Compiler Catalog，完成源/目标语言、五种翻译状态、非法代码恢复、保存重开及源文过期。真实 App `0/1→1/1`，受影响回归 `3 files / 4 tests`，生产双视口无溢出。N61 仍为实现中，下一步 CSV/XLSX 往返；Product Acceptance 不提前换算。

> N61-E2 CSV/XLSX 翻译交换（2026-09-02）：[审计 #275](275-n61-e2-localization-csv-xlsx-exchange-audit.md)以真实工作簿完成导出、外部编辑后导入、差异预览、重复/未知键与过期源文整批阻断、确认写入和 Canonical 重开；格式 round-trip 保留逗号、引号、换行和稳定 ID。首次产品路径 `1/2` 精确失败于入口缺失，修正后定向 `2 files / 3 tests`，生产窄屏无溢出。REQ-L10N 仍为实现中，下一步 N61-E3 Runtime 语言选择/回退。

> N61-E3 Runtime 语言切换与回退（2026-09-02）：[审计 #276](276-n61-e3-runtime-localization-switch-audit.md)由正式 Player Core 消费 Compiler catalog，在不改变 Runtime/History/Save 的前提下即时投影当前画面和历史；缺失、非法、空白及源文过期译文回退源语言，Web 按工程恢复语言偏好。产品红测 `0/1→1/1`，受影响 `4 files / 81 tests`，production 手机 select 由 44px 修正至 48px。下一步 N61-E4 CJK/Ruby/禁则与字体回退。

> N61-E4 CJK/Ruby/禁则与字体回退（2026-09-02）：[审计 #277](277-n61-e4-cjk-ruby-font-fallback-audit.md)在正式 Player 显示层把 `｜基底《注音》` 渲染为语义 Ruby，对对白、Choice、Ending、History 应用语言字体栈和严格 CJK 换行，并在项目字体加载失败时继续阅读且显示回退。产品红测 `0/1→1/1`、受影响 `4 files / 60 tests`、TypeScript/production build 通过；1280×720 production 禁止行首/行尾与 overflow 均为 `0`，字体提示拥挤已按真实截图纠偏；390×844 实际断行仍待闭合，故 N61 保持实现中。

> N61-E5 语言媒体与 Voice Asset 映射（2026-09-02）：[审计 #278](278-n61-e5-localized-media-voice-mapping-audit.md)让正式 Player 按 `localeVariantOf + locale` 选择图片/视频变体、按 `voiceTextId + locale` 选择配音；缺失目标资源时回退源语言并明确数量，不改变剧情状态。真实产品路径 `0/1→1/1`、受影响 Player/Localization `5 files / 61 tests`、production build 通过；1280×720 以真实 PNG/SVG/WAV 跑通 `en → zh-Hans → ja`，日语回退 2 项且提示不与控件相交。REQ-L10N 保持实现中，下一步 N61-E6 Production 绑定/状态闭环。

> N61-E6 Production 语言媒体与配音（2026-09-02）：[审计 #279](279-n61-e6-localized-media-production-audit.md)让创作者在正式 Production 中把已检查的真实资源按 stable text ID/基础 Asset ID 绑定到 locale，维护草稿/已审阅/已锁定状态，失效绑定显示缺失并可恢复，Canonical 保存重开不漂移。真实 App 在四项 PNG/WAV 导入后 `0/1→1/1`，受影响 `5 files / 8 tests`、TypeScript/build 通过，production 桌面与实际 375×844 overflow 0。REQ-L10N 保持实现中，下一步 N61-E7 验证同一 Canonical 的 Compiler/Player 交付并复审 Engineering。

> N61-E7 / Engineering 出口（2026-09-02）：[审计 #280](280-n61-e7-localization-engineering-exit-audit.md)直接把 Editor Production 保存的 Canonical 与 IndexedDB 真实 Blob 交给 Compiler/Player，首次 `1/1` 即证明 Asset Manifest、Localization Catalog、`en → zh-Hans → ja` 媒体/Voice 选择和缺失回退无断点；E4 390×844 production 的 5 行禁则、Ruby、overflow、44px 与 console 证据同步闭合。受影响 `4 files / 4 tests`、双端 TypeScript/build 通过。N61 Engineering 关闭，REQ-L10N 转为验收中；Windows/Android 和三端 Product Acceptance 仍阻断。

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
| USP-03 | Narrative Intelligence | N30/N60 | 实现中 | N60 Engineering 已关闭：正式调试、Entry/Scene/Statement、状态与 Watch/变量来源、五类 P0 QA、stable source、故障/正常 Golden，以及有理由且可恢复的工程内诊断抑制已贯通。Product Acceptance 与 P1 Solver/覆盖率仍缺 | [N60-E6](273-n60-e6-diagnostic-suppression-and-engineering-exit-audit.md)、[N60-E4](271-n60-e4-p0-story-qa-product-closure-audit.md)、[N30-E2](124-n30-e2-compiler-completion-audit.md) |
| USP-04 | Local First / No Lock-in | N10–N13 | 实现中 | IndexedDB 保存/恢复、备份，以及 Canonical 文档/Asset Index/源 Blob 的确定性 ZIP 自包含迁移与重载已通过 | 正式双端壳离线导入导出、Git diff、外部编辑与强杀恢复 |
| USP-05 | Local Multi-platform Build | N80–N83 | 未开始 | 开发构建不计 | Windows 本地三端正式产物 |
| USP-06 | Professional Studio | N41–N43/N100 | 实现中 | N43-E1–E4 建立统一上下文、Beginner/Pro、Motion 与输入/同步；E5–E7 依次开放 Production、Debug & QA 与 Mobile Focus，Engineering 真实任务达到 7/7。Utage 级本地化/配音批量列、真人与商业 Product 门仍缺 | [N43-E7](210-n43-e7-mobile-focus-and-engineering-exit-audit.md)、商业演出、Benchmark Episode |
| USP-07 | Budget-driven Optimization | N70–N72 | 实现中 | Dicing/调度/预测原型 | Center、三端报告、可回退构建变体 |
| USP-08 | Gal Automation | N62 | 实现中 | N40 已有自动创作者 Route；Compiler 已生成 Gallery/Music/Ending 等 Catalog，Runtime 已记录 Gallery/Ending 永久 Meta | 覆盖配置、玩家 Gallery/Replay/Music/Ending 页面与三端一致 |
| USP-09 | Skip / History / Back | N31/N52 | 实现中 | N52 Engineering 已关闭：Auto/Skip、可选行 History、只读旧分支、Barrier 原因/距离和 Forward 项目策略已在 Web 玩家闭环；Windows/Android 正式宿主、实体设备、真人与 Product Acceptance 仍未完成 | [N52-E5e 总出口](265-n52-e5e-history-engineering-exit-reaudit.md)、三端状态一致 |
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
| REQ-RUNTIME | 确定执行、剧情/媒体、Save/History/Auto/Skip/Back、输入、源码错误 | N31/N32/N50/N52 | N20/N30 | 实现中 | N52 Engineering 已关闭：Save/Back/Forward、Auto/Skip、Stop Point、video、截断分支 archive、可选行 History、Barrier 原因和项目策略已接正式 Web Player；Windows/Android 正式宿主、实体设备与真人 Product Acceptance 仍缺 | [N52-E5e 总出口](265-n52-e5e-history-engineering-exit-reaudit.md)、[N31-E6](131-n31-e6-runtime-scheduler-audit.md) |
| REQ-L10N | 语言、稳定文本 ID、CSV/XLSX、状态、运行切换、CJK/Ruby | N61 | N10/N30/N50 | 验收中 | N61 Engineering 已关闭：E1–E7 完成文本生产/交换、状态、Player 即时切换、CJK/Ruby/字体回退、语言媒体/Voice 生产消费，以及同一 Canonical/Blob 的 Editor→Compiler→Player 交付；仍缺 Windows/Android 正式 Host、实体设备和三端语言状态一致性 | [N61-E7 出口审计](280-n61-e7-localization-engineering-exit-audit.md)、[N61-E6 审计](279-n61-e6-localized-media-production-audit.md)、三端语言切换 |
| REQ-QA | 任意入口运行、断点/单步、状态检查、结构错误、循环、源码跳转 | N30/N60 | N31/N32/N40 | 实现中 | N60 Engineering 已关闭：Entry/Scene/Statement、调试控制、状态/Watch、五类 P0 QA、故障/正常 Golden、stable source，以及必填理由、工程持久化和恢复的诊断抑制均完成。“完整报告”不属于权威 P0；Product Acceptance 与 P1 仍缺 | [N60-E6](273-n60-e6-diagnostic-suppression-and-engineering-exit-audit.md)、[N60-E4](271-n60-e4-p0-story-qa-product-closure-audit.md)、[N43-E6](209-n43-e6-debug-qa-workspace-audit.md) |
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
| AC-05 | 任意语句预览和变量 | N32/N60 | 实现中 | Editor 正式执行、Fresh Run、Effect/Barrier Host、安全热更新、当前语句启动、多断点、状态观察、Watch/变量来源及五类 QA source return 已完成；仍缺 N60 总出口、像素视觉矩阵与产品验收 | [N60-E4](271-n60-e4-p0-story-qa-product-closure-audit.md)、[N60-E3](270-n60-e3-debugger-watch-audit.md)、[N50-E6](218-n50-e6-player-embed-api-audit.md) |
| AC-06 | 不可达结局和缺失资源 | N30/N60 | 实现中 | N30 Compiler 已拒绝不可达结局、无出口、无交互闭环和缺失资源；仍缺 N60 产品 QA 呈现、抑制与 Solver | [N30-E2 审计](124-n30-e2-compiler-completion-audit.md)、QA Golden 报告 |
| AC-07 | 三端结局/Save/Back 一致 | N31/N80–N82/N92 | 实现中 | Web 已证明 Session Save/load-only rehydrate、12 manual、auto 5、quick 1、截图 Blob 与隔离恢复；E3c3/E3c4 又关闭 build-authored marker、strict v1/v2→v3、三个 checkpoint 槽和新版 Museum。Web 默认没有正式 compositor；真实强杀与 Windows/Android Host/设备仍未完成 | [N52-E3c4](247-n52-e3c4-save-v3-checkpoint-slots-audit.md)、[N52-E3c3](246-n52-e3c3-checkpoint-marker-audit.md)、[N31-E11](137-n31-e11-runtime-session-save-audit.md)、三端 Session Save/Outcome Hash 0 差异 |
| AC-08 | 导出后无账户离线重开 | N12/N90/N91 | 验收中 | Web 新工作区资源自包含导入、运行和重载已通过；尚待正式 Windows/Android 壳、断网设备和远端 CI 证据 | [N23-E3 审计](117-n23-e3-portable-resource-bundle-audit.md)、离线导出导入 E2E |
| AC-09 | 崩溃恢复到自动保存 | N12/N90/N91 | 实现中 | E3c1 Engineering 已在 Web Player 建立与正式槽隔离的稳定边界恢复记录、显式恢复/清除和损坏 fail-closed；尚无真实浏览器/进程强杀、Windows/Android 正式宿主与设备矩阵，不能登记通过 | [N52-E3c1](243-n52-e3c1-recovery-migration-museum-audit.md)、真实强杀恢复矩阵 |
| AC-10 | 键盘完整操作、手机替代拖拽 | N21/N43/N91 | 实现中 | E4 冻结七类输入等价；E7 Mobile Focus 增加 IME 组合保护、明确提交/放弃和 48px 前后句/提交触控路径。Android 实体触摸/系统 IME、全纯键盘真人任务仍缺，不能以 Web 响应式代替 N91 | [N43-E7](210-n43-e7-mobile-focus-and-engineering-exit-audit.md)、N91 设备与真人任务报告 |
| AC-11 | 七模式修改同一语句 | N43 | 实现中 | E5–E7 已使七模式具备真实中央任务；Mobile Focus 对同一 stable ID 写入，Debug & QA 返回同一 ID，Production 操作同一工程资源。Engineering 为 7/7，但 Production 的任务语义不是字面修改对白，完整 Product E2E 与真人仍未通过 | [N43-E7](210-n43-e7-mobile-focus-and-engineering-exit-audit.md)、七模式 E2E |
| AC-12 | 动效不阻塞且有减少动效 | N43 | 实现中 | E3 已建立完整/简化/静止三级、系统 reduce 强制静止、全局 `0.01ms` 中断、非颜色状态和真实页面 1.2s rAF 门；完整/简化/静止 P95 `12.30/12.20/6.20ms` 均通过。内嵌浏览器不能模拟真实 OS 媒体设置，目标设备/OS 矩阵和真人任务仍缺 | [N43-E3](206-n43-e3-motion-state-semantics-audit.md)、目标设备 Motion 矩阵 |
| AC-13 | 镜头/角色/转场/BGM/Voice/SFX | N42/N50 | 验收中 | N50-E3 已把 Editor↔Player Media Golden 结构差分和左右角色/BGM/Voice 多 channel 写成可执行 contract，并实测缺媒体恢复。短 Voice 在采样前自然结束，故只证明独立 bus/解码/音量，不虚报同时播放。仍缺 SFX/Ambient/UI 全矩阵、三端目标设备和 Product Acceptance | [N50-E3](215-n50-e3-player-media-parity-recovery-audit.md)、[N50-E2](214-n50-e2-player-stage-media-presentation-audit.md)、Media Golden 三端快照 |
| AC-14 | 编辑器和玩家设备预算 | N90–N92/N102 | 未开始 | 实体设备 | WIN-L/AND-L/AND-R 报告 |
| AC-15 | Auto 和四种 Skip 正确 | N31/N52 | 实现中 | Web Engineering 已覆盖 Auto、Skip Read/All × Hold/Toggle、五档速度、作者 Stop Point、现有媒体、正式 video 与 390×844 cold production；Windows/Android、实体设备与真人未完成，不能登记产品通过 | [N52-E4f 出口](257-n52-e4f-mobile-cold-production-and-e4-exit-audit.md)、玩家输入向量和 State Hash |
| AC-16 | 每句 Back/Forward 和分支截断 | N31/N52 | 实现中 | Web Engineering 已证明 State/Host 精确恢复、分支改选、旧分支只读查看、稳定 ID 选行回退、不可逆原因/距离、Forward true/false 与保存重开；Windows/Android 正式 Host、实体设备、真人和三端一致性仍缺 | [N52-E5e 总出口](265-n52-e5e-history-engineering-exit-reaudit.md)、三端玩家 History E2E |
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
