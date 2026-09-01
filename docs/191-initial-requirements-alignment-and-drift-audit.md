# 最初需求对齐与开发偏移审计（N42-E3 时点）

> 审计日期：2026-08-24
> 审计分支：`codex/n42-e3-character-keyframe-authoring`
> 审计头：`e04824508128750830ec52d10a3110a25c843278`
> 远端状态：本地与远端一致；Draft PR #69 最终头 Windows / Node 22 CI 绿色
> 审计基准：[产品战略](02-product-strategy.md)、[PRD](03-prd.md)、[路线图](08-roadmap.md)、[视觉与商业制作基准](10-visual-and-production-bar.md)、[Gal 基础与自动化](11-gal-foundation-and-automation.md)、[容量/性能/稳定性](12-size-performance-stability.md)
> 总判定：**产品方向未被替换，架构没有偏离；存在明显的交付重心偏斜和产品闭环滞后，当前不能宣称商业级、M1 或可发布。**

## 1. 审计口径

本次不以“有代码”代替“产品完成”，也不以自动化代替真人、设备或生产浏览器证据。每项最初需求按四级判断：

- **对齐并形成工程闭环**：实现、真实数据和正式链证据均存在，但不自动等于 Product Acceptance；
- **部分对齐**：核心或底层能力存在，用户产品面、平台或发布证据仍缺；
- **未开始**：只有规格、接口储备或技术 Spike；
- **偏移**：实现改变原始目标、建立平行权威模型或越过明确边界。

## 2. 最初需求逐项对齐

| 最初要求 | 当前实际 | 判定 | 主要缺口 |
|---|---|---|---|
| Windows 与 Android 均可完整编辑 | 当前 Web Editor 已有正式 Project/Route/Sequence/Script/Stage 工程链；Windows 只有壳与存储契约证据，Android 编辑器尚未开始 | **未形成产品闭环** | 正式 Windows Editor、Android Editor、SAF/触屏/软键盘/低内存、双端同工程任务 |
| 发布 Web、Windows、Android 玩家软件 | 有确定性离线 Web 试玩候选和 Windows host conformance，但候选仍未消费完整正式 Player 链；APK/AAB、签名和安装链未完成 | **未形成产品闭环** | 正式 Player Adapter、PWA、Windows 包、APK/AAB、签名、安装/升级/卸载、三端一致性 |
| 不需要账户、离线本地优先 | IndexedDB、备份、确定性 ZIP、资源 Blob 自包含迁移均已实现；没有引入账户、云同步或云构建依赖 | **对齐** | 正式双端壳离线 E2E 与强杀恢复仍缺 |
| 基础 Gal 相关全部配置 | 已有剧情语言、角色/背景/音频演出、Preview/Runtime、速度与历史内核；统一 Gal Settings Schema、可搜索设置中心、六类音量、消息窗/存档/自动页模板尚未开始 | **明显滞后** | N51/N52/N62 产品能力，当前 `REQ-GAL` 仍是未开始 |
| 自动切图、相似区域去重和压缩 | Lossless Dicing 已有候选发现、逐像素重建、Atlas、PNG delivery、Worker、Editor 报告和 Runtime Loader 验证 | **部分对齐且技术较强** | Optimization Center、三端平台变体、真实综合收益/显存/Draw Call、无收益回退构建 E2E |
| 可调整快进速度 | 正式 Runtime 已覆盖 Normal、5/10/20/40/Instant、Skip Read、Hold/Toggle 和停止点；Editor Preview 有速度控件 | **部分对齐** | 正式 Player 设置、语音/视频策略、三端真实计时与用户验收 |
| 每句/每步后退和前进 | 正式 Runtime checkpoint、分支截断、Session Save、永久 Meta、portable Host compensation/replay 已实现；Editor 有 Back/Forward | **部分对齐** | 正式 Player 控件、存档槽、三端状态一致和真人任务 |
| 自动路线图 | N40 Engineering 已关闭自动图、10k/64 窗口、诊断、结局审阅、Runtime 高亮和 Choice 修复闭环 | **工程闭环，对齐** | Product Acceptance、玩家流程图和 N62 自动附加页 |
| 自动 Gallery/Replay/Music/Ending | Compiler 已生成 Catalog，Runtime 已记录 Gallery/Ending 永久 Meta | **底层部分对齐** | 覆盖配置、Gallery/Replay/Music/Ending 玩家 UI、解锁规则和三端一致性 |
| 减少容量、提升速度和稳定性 | 已有内容哈希、Blob 去重、Dicing、资源预测/调度、原子保存恢复、Runtime corpus、规模/性能门 | **部分对齐** | 统一 Optimization Center、平台 Profile、实体设备、2 小时 Soak、弱网/磁盘/损坏包、正式报告 |
| 现代、极简、多彩、强动效、表达清晰 | 已有设计 Token、多彩语义轨道、平滑面板/视图反馈、16:9 默认 Preview、可调尺寸与部分 reduced-motion CSS | **视觉方向对齐，产品覆盖不足** | 目前只有 Sequence/Script/Flow 三模式；七模式、Beginner/Pro、三级动效、60 FPS/可中断任务证据仍缺 |
| 保持 Naninovel/Utage 级专业性 | canonical schema、稳定 ID、Compiler/Runtime/Host、Source Map、诊断、事务撤销和失败关闭方向正确 | **架构对齐** | 完整导演时间线、设置/模板、正式 Player、插件与真实商业生产任务尚未形成 |
| 制作商业级 20–30 分钟校园短篇 | 有校园示例与约五分钟验收候选，可验证部分创作/运行路径 | **未达到原要求** | 20–30 分钟 Benchmark Episode、完整音画/UI、三端正式包、商业参照评分与发布材料 |

## 3. 当前阶段与量化事实

- 当前工程阶段是 **N42-E3 Stage Engineering**，已完成基础角色关键帧编排；不是完整 N42 时间线，更不是 M1；
- M1 27 项纵向验收：**完整通过 0/27；实现中 16/27；验收中 1/27；未开始 10/27**；
- P0 13 模块均已登记，但 `REQ-GAL` 仍未开始；Build、Android、自动附加页和 Optimization Center 尚未形成产品闭环；
- 本地最近完整门为 **753/753**；最终分支头远端 `product-baseline` run `32709478632` / job `97377623697` 绿色；这些是工程质量证据，不是 M1 Product Acceptance；
- N21/N23 真人证据仍为 `0/1` 与 `0/2`；本轮 N42-E3 生产浏览器因隔离环境无法访问宿主服务，明确没有登记为通过；
- Authority 尚未合入 `main`：main-target Draft PR #61 仍 open/draft；N42 #65–#69 是连续、clean、open 的证据链。当前没有代码冲突，但长期堆叠会增加审阅与集成风险。

## 4. 是否发生开发偏移

### 4.1 没有发生的偏移

- 没有把产品改成仅 Windows、仅 Web 或必须联网；Android M1 目标仍在；
- 没有引入账户、收费、云同步、云构建或 iOS，符合冻结边界；
- 没有用第二套时间线或 UI 私有状态取代 canonical Script；Stage 关键帧仍投影为 stable-ID Move；
- 没有用 Demo 解释器冒充正式 Compiler/Runtime；相关文档持续失败关闭；
- 没有为了测试变绿降低 corpus、规模、性能预算或删除反例。

### 4.2 已出现的偏斜与风险

1. **工程基础领先、用户产品链滞后（黄色）**：N30–N42 的 Compiler/Runtime/Route/Sequence/Stage 证据密集，但 Gal Settings、Player、Gallery UI、Android 与发布链仍弱；继续只做底层切片会扩大差距。
2. **集成链过长（黄色）**：#61、#65–#69 均为 Draft 且未进入 `main`。虽然 merge state 当前均为 CLEAN，但审阅、回归定位和换机接续成本持续上升。
3. **真实产品证据不足（黄色）**：自动化很强，真人为零，实体 Android 为零，当前生产浏览器回归又受环境阻断。不能把 753/753 换算成“可生产”。
4. **视觉目标只覆盖局部（黄色）**：当前界面方向正确，但只有三模式，强动效、手机任务模式和商业作品 UI 还没有系统验收。
5. **包体债开始显现（黄色）**：Editor 当前主 JS 约 865.01 kB、gzip 243.94 kB，构建保留 `>500 kB` 警告；尚未越过冻结门，但与容量/低端设备目标存在未来冲突。
6. **追踪文档发生轻微滞后（已修正）**：USP-01 仍写 Stage 未进入、USP-04 低估 ZIP/Blob 搬迁、USP-08 把 Catalog 底层误写为未开始、REQ-SCRIPT 仍写缺 N41 正式呈现，99 的顶部 Authority 仍停留在 N31/#51。本轮已按代码和审计证据纠正为 N41/#61。

因此，本次判定不是“方向错误”，而是：**架构方向正确，开发顺序受治理约束，但交付重心已经偏向工程底座；必须在 N42 最小出口后转向用户可见纵向产品闭环，禁止无限延长基础设施。**

## 5. 纠偏路线

1. **保持当前授权边界**：`RA-N21-007` 只允许 N42 Engineering；未获新治理授权前不越级实现 N43/N50/N51/N62/N80/N90。
2. **收紧 N42 剩余范围**：只做完整时间线出口必需的最小多轨投影、角色/镜头/转场语义和真实 Preview/Runtime 一致性，不继续扩张高级编辑器愿景。
3. **补回产品实测证据**：优先恢复可访问的生产浏览器环境，完成关键帧保存重开、Preview、正式 Runtime/Host 的可见闭环；真人不可参与时继续明确阻断 Product Acceptance。
4. **在 N42 出口建立新治理检查点**：下一授权应优先选择 N43 七模式/手机任务模式，随后以 N50–N52 正式 Player+Gal Settings、N62 自动附加页、N70–N72 Optimization、N80–N83 三端构建、N90–N92 双端编辑器形成用户闭环。
5. **控制集成风险**：由维护者审阅并决定 #61 与后续堆叠 PR 的合并策略；自动化代理不得擅自合并或关闭。
6. **商业级声明继续阻断**：只有 AC-01–AC-27、20–30 分钟 Benchmark、Windows/Android 编辑器、Web/Windows/Android 正式玩家包、实体设备与发布审核全部具备后，才允许声明 M1 Stable 或商业级完成。

## 6. 本次审计结论

最初需求仍然完整保留，核心技术选择也在为专业 Gal 编辑器服务，没有发生目标替换或架构旁路。当前最大的偏移风险不是“做错功能”，而是“底座越做越深、产品闭环推迟”。文档、门禁和失败关闭机制成功阻止了虚假完成声明；下一阶段必须用同样严格的标准，把工程能力转换为用户可见、可安装、可发布、可跨端验证的产品。

## 7. 预期—实际—修正与验证

| 审计项 | 预期 | 首次实际 | 修正/处置 | 最终实际 |
|---|---|---|---|---|
| Git 同步 | 本地审计基线等于远端 | `HEAD` 与 upstream 均为 `e048245`，工作区干净 | 无需纠正 | 本轮文档提交前基线一致 |
| 最初目标保留 | Windows/Android 编辑、三端发布、无账户、Gal/优化/商业样片均可追踪 | 所有目标仍在 02/03/08/10/11/12 与 90 中，未被删改为较低目标 | 新增本审计逐项映射 | 目标未丢失，但完成度明确失败关闭 |
| 状态文字准确 | 追踪矩阵与当前状态页反映最新代码证据 | USP-01/04/08、REQ-SCRIPT 四处滞后，99 顶部仍指向 N31/#51 | 同步 Stage E1–E3、ZIP/Blob、Catalog/Meta、N41 Script 与 N41/#61 Authority | `audit:requirements`：50 requirements / 10 USP / 13 P0 / 27 AC，PASS |
| 架构不偏移 | 不出现 UI/平台依赖倒灌或平行 Runtime | 代码仍保持 portable Compiler/Runtime/Host 与 Project Service 边界 | 无需代码修正 | `audit:architecture`：93 portable / 4 adapters，PASS |
| 集成基线可追踪 | Authority 与节点祖先完整 | #61 仍是 open Draft，N42 为 #65–#69 堆叠链 | 登记为集成风险，不擅自合并/关闭 | `audit:delivery-baseline` PASS；#61、#65–#69 当前均 CLEAN |
| PR 文档同步 | 产品状态变化必须更新需求矩阵 | 本轮只修改文档，但仍需满足同一追踪规则 | 同步 89/90/99 与本审计 | `audit:pr-traceability` PASS |
| 商业完成声明 | 未满足 27 项前必须阻断 | 0/27 完整通过，Android/Player/Build/Benchmark 缺失 | 保持 N42 Product Acceptance、N43+、M1/发布阻断 | 没有把 753/753 或 CI 绿色换算成商业级完成 |

本轮是只读代码/远端事实审计与文档纠偏，没有修改产品代码。产品实现基线已由最终头 `e048245` 的本地 753/753 与远端完整 `product-baseline` 绿色覆盖；本次文档提交推送后仍必须由新的远端完整门验证最终头。
