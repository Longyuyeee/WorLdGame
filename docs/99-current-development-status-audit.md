# 当前开发情况审计（N52-E4b Shell Auto real clock candidate）

> 审计日期：2026-08-31
> 当前分支：`codex/n52-e4b-shell-auto-real-clock`；直接基线为 E4a 最终绿色头 `7c430d3`
> 权威基线：N41 集中 Authority `codex/m1-integration-n41-governance`，节点提交 `11bf31313edcc380ff9db03e3286b710e0a65679`，Draft PR #61，尚未合入 `main`
> 当前授权：**RA-N21-011 checkpoint 窄范围修订**允许仅为 N52 checkpoint 修改 N20/N30/N31/Save 契约；2026-09-27 16:00:00（UTC+8）到期
> 最新节点证据：[N52-E4b Shell Auto real clock](251-n52-e4b-shell-auto-real-clock-audit.md)、[N52-E4a Player Core Scheduler bridge](250-n52-e4a-player-core-scheduler-bridge-audit.md)、[N52-E4 Auto/Skip 入口审计](249-n52-e4-auto-skip-entry-audit.md)
> 权威功能状态：[M1 需求与验收追踪矩阵](90-m1-requirement-traceability.md)

## 1. 当前结论

2026-08-31 纠偏结论是：**产品目标和架构没有发生替换性偏移。E4a 已把 N31 正式 Scheduler 接入 Player Core，且没有建立第二套循环；Forward History、checkpoint、资源不可用和结构化 stop snapshot 已有真实代码证据。Shell 的 auto-save、普通 allowHold 和手动 waitForVoice 仍不能冒充播放 Auto/Skip。Shell 真实 clock/voice、Skip 控件/媒体/embed、真实强杀、Windows/Android 正式宿主与商业 Benchmark 仍明显滞后。** 当前 RA-011 只准入 N52 Engineering，禁止换算成商业完成度。

Editor 的完整流程试玩已把 Canonical Project 交给 N30 Project Compiler，再把 IR 交给 N31 Runtime；E7 又把 Editor 私有 Effect Host 收敛为 portable `@world-studio/runtime-host`，并由真实浏览器 Worker 与 Node 比较同一 receipt/snapshot Golden。五分钟 Benchmark 首次按正式链实测时暴露旧 Direction 和缺失变量，本轮已修正；两条结局路线与 Back/Forward 均在 production browser 真实通过。

N32 的历史出口复审发生在正式 Player 建立之前；其中“Player 不存在”只描述当时事实。N50-E1–E6 现已补上正式 Core、真实媒体 adapter 与 Web 嵌入边界，但旧 `playable-web-export` 独立解释器仍不能冒充新 Player，N32/N50 Product Acceptance 也不会因此自动通过。

- 当前工程节点：**N40 Route Map、N41 Sequence、N42 Stage、N43 七模式、N50 Player Shell 与 N51 Gal Settings Engineering 出口已通过；N50/N51 Product Acceptance 仍被实体 Host、跨节点和真人证据阻断**；
- N21 真人：**0/1，pending-participant**；
- N23 真人：**0/2，pending-participants**；
- N30/N31：**Engineering 已有退出证据，Product Acceptance 未通过**；
- N32 Product Acceptance：**被阻断**；
- N40/N41/N42/N43/N50 Engineering：**出口已通过**；**N51 Engineering 已关闭**；N52 Engineering：**E1–E3c4、E4 入口与 E4a 已关闭，E4b Shell Auto real clock 为 candidate**；精确远端门后下一代码切片为 E4c；全部 Product Acceptance、N60+、M1 Stable、Public Release：**被阻断**；
- N52-E1 本地完整门：普通 `149/890`、N50 `41/41`、N51 `96/96`、N52 `31/31`、VM `28.69s`、Route P95 `72.55ms`、Asset dicing `1667.44ms`，全部未调整预算；桌面/390×844 cold production-browser overflow/console 均为 0；
- N52-E2 已建立 Core Session Save/Load bridge、三个严格手动槽位、独立 IndexedDB Host、embed API `1.1.0` 和 Load-only rehydrate；本机最终完整门普通 `150/898`、N52 `51/51`、VM `28.30s`、Route P95 `56.82ms`、Asset dicing `1482.87ms`，Autosave 测试体 `4.35s <5s`（长链总时长 `6.40s`、隔离总时长 `2.81s`）；冷 production browser 跨刷新、双视口、overflow/console 与 44px 触控门通过；实现头 `bdb3c73` 已推送至 Draft PR #99，同头 Windows / Node 22 run `33180215962` / job `98879258847` 用时 `12m48s` 绿色，远端普通 `150/898`、N52 `51/51`、Runtime corpus `66.643s <90s`；E2 Engineering 关闭；
- N52-E3 入口契约已按实际代码冻结：v1 不静默扩展，v2 使用 copy-on-write；chapter/scene 取正式 Canonical，route/custom 在正式来源前 fail closed；截图归 Host compositor 且 Blob 与元数据分离；manual 12/每页 6、auto 5 环形、quick 1、checkpoint 3 但等待 build-authored marker。入口头 `3c319da` 已推送至 Draft PR #100，同头 Windows / Node 22 run `33183970309` / job `98892048310` 用时 `12m40s` 绿色，远端普通 `150/898`、N52 `51/51`、VM `63.321s <90s`；入口只关闭设计与审计前置，不代表 v2、截图、分页或自动/快速保存已实现；下一代码切片为 E3a；
- N52-E3a v2 元数据与截图 Engineering 已关闭：Store 2.0/DB2 严格兼容 v1 并在下次成功保存 copy-on-write；chapter/scene 只取 Canonical + cursor，route/custom fail closed；12 个手动槽每页 6 个且覆盖二次确认；Host compositor 提供的合规 PNG/WebP 与元数据同事务写入并做 SHA-256 校验，可见槽位延迟读 Blob，捕获失败仍提交明确无预览的有效 Session。Web Host 不伪造截图；Product Acceptance 未开始；
- N52-E3b Auto / Quick Engineering 已关闭：auto 5 槽空槽优先/最旧轮转，Build+scene 同身份合并；quick 固定 1 槽；所有写入经单 FIFO 串行，失败保留旧槽且不堵塞后续写；Player 提供快速存取及三类槽视图。最终头 `86f053c` 的 Draft PR #102 Windows run `33193037698` / job `98923083117` 用时 `13m35s` 绿色；
- **N52-E3c1 Recovery / Migration Museum Engineering 已关闭**：DB3 新增隔离 `recovery-sessions` 且 DB2 正式槽无损保留；稳定可呈现 State Hash 写最新恢复，启动必须显式恢复/清除；Session/Build/State/scene/presentation/title 校验、FIFO 失败保留、损坏隔离及五个 Museum 原始向量已有证据。实际代码没有 build-authored checkpoint marker，故 checkpoint 转入 E3c2 跨节点入口合同。本地完整门普通 `153/919`、Runtime corpus `14.621s`、VM `28.75s` 全绿；实现头 `2130c49` 的 Draft PR #103 Windows run `33257145099` / job `99112755230` 用时 `10m17s` 绿色，远端普通 `153/919`、Runtime corpus `21.109s`、VM `51.864s`、Route P95 `102.52ms`、Asset dicing `3666.92ms`。真实强杀与 Product Acceptance 未完成；
- **N52-E3c2 checkpoint 入口合同已关闭**：最初 Gal/CL-04 需求和 VM Spike 的 `checkpoint(stepId)` 已核实，正式链路遗漏已登记为实现偏移；冻结显式 `checkpoint @id(statementId)`、IR `1.1.0`、非表现 marker event、Save v3 严格迁移与 checkpoint 3 槽策略。现有 RA-011 不覆盖 Story Language/Compiler/Runtime IR/Save schema 修改，故本步未改产品代码；入口头 `65f7879` 的 Draft PR #104 Windows run `33259082765` / job `99117811154` 用时 `13m0s` 绿色；E3c3 等待产品负责人明确扩展跨层授权；
- **E3c3 跨层授权已建立并完成审计**：产品负责人在获知精确授权条件后要求从该接续点继续；RA-011 仅增加 checkpoint 所需的 Story Language、Compiler IR 1.1、Runtime 双读/非表现事件和 Save v3/三槽权限，最大节点仍为 N52，其他语义与全部产品门继续阻断。治理头 `59b975e` 的 Draft PR #105 Windows run `33260853201` / job `99122426648` 用时 `13m2s` 绿色；
- **N52-E3c3 checkpoint marker Engineering 已关闭**：正式 Story 语法、Compiler IR 1.1/Source Map、Runtime 1.0/1.1 双读与非表现事件、Player 精确 Session candidate/继续播放/History 跳过已贯通，并由 PR #106、run `33263549231` / job `99129464102` 证明；Save 仍严格保持 v2 且没有 checkpoint 槽，下一步为独立 E3c4；
- **N52-E3c4 Save v3 + 三 checkpoint 槽 Engineering 已关闭**：在既有 DB3 正式槽中增加 strict schema v3，v1/v2 只读归一且成功事务后 copy-on-write；三个 checkpoint 槽空槽优先、满槽按时间/槽 ID 替换，同 Build+step 合并；Shell 消费 E3c3 精确 candidate 并列出/读取，失败保留且剧情继续，读档不反向再写。Migration Museum v2 七向量与定向 `6 files / 66 tests` 已通过；1440×900 与 390×844 production browser 三槽/Save 3.0/44px/overflow/console 门通过；本地完整门普通 `153 files / 929 tests`、Runtime corpus `10,000 seeds / 20,000 replay`、VM `5/5`、Route P95 `61.74ms`、Asset dicing `1543.68ms` 全绿。实现头 `612578e` 已推送至 Draft PR #107，同头 Windows / Node 22 run `33266310582` / job `99136878399` 用时 `13m20s` 绿色；
- **N52-E4 Auto/Skip 入口合同已关闭**：真实代码确认 N31 Scheduler 已有 Normal/Auto/Skip Read/All、Hold/Toggle、5/10/20/40/Instant 与 stop reason，但 Player Core intent/State/Snapshot、Shell 控件和 embed observation 均未接线。机器合同冻结 Runtime/Core/Shell/Host/Playback Policy 所有权、Forward History、真实语音时长、媒体分类和停止清理。首次审计预期只缺四份文档，实际恰为四项且无额外代码偏差；Runtime `61/61`、10k corpus、N52 `67/67` 通过。两次本地完整门分别暴露 App 5 秒与 Asset 3/3/5 秒累积负载差异，同规模同预算隔离复跑为 App `1.31s`、Dicing/Atlas/总计 `1261.79/1857.91/3119.70ms` 并通过。入口头 `e7bd5cc` 的 Draft PR #108 Windows run `33351442390` / job `99365490775` 用时 `14m06s` 全绿，关闭本机差异；入口不登记播放功能完成，下一唯一代码切片为 E4a；
- **N52-E4a Player Core Scheduler bridge Engineering 已关闭**：Player Core `0.5.0` 直接复用 N31 Scheduler，policy 是 canonical Runtime policy 别名，snapshot 发布 mode/activation/speed/stop/count/delay；Forward History 返回 `history` 且 State/History/presentation 不变，内部 checkpoint candidate 可真实加载，不可用 Stage effect 不提交 Host operation。首轮预期旧 15 通过、新 3 因 API 缺失失败，实际完全一致；修正和扩展后 Core `20/20`。完整门两次检出 90 文档旧 required token 回归，按全部 N52 合同枚举恢复后第三轮全绿。实现头 `ed37edd` 的 Draft PR #109 Windows run `33355351685` / job `99376310859` 用时 `13m32s` 绿色：普通 `153/934`、N52 `72/72`、Runtime corpus `10,000/20,000`、VM `67.53s <90s`、Route P95 `141.4ms`、Asset 总计 `3282.46ms`。下一步接续 E4b，不提前登记 Shell Auto 或 AC-15；
- **N52-E4b Shell Auto real clock 为 candidate**：Web Shell 新增 Playback Policy `1.0.0` 和独立 Auto，真实 `window.setTimeout` 只调用 E4a Core bridge；文字揭示、实际 voice duration/currentTime/tail、metadata/ended、手动输入及 Host suspend/resume 均进入清理状态机。首轮预期旧 `30/30`、新 `0/4`，实际完全一致；修正无障碍 status 冲突与 React 两阶段观测后 Shell `34/34`，含策略定向 `42/42`。cold production 1440×900/390×844 证明约 7.4 秒真实推进、暂停 4 秒零推进、恢复 fresh delay、`terminal/stopped`、44/48px、overflow/console 0。首次完整门发现旧 E4 入口审计错误固化“控件 absent”和 90 required token 回归，改为 baseline snapshot + E4b 合同接管后第二轮全绿：普通 `154/946`、N50 `64/64`、N51 `109/109`、N52 `76/76`、VM `76.12s <90s`、Route P95 `177.64ms`、Asset 总计 `2640.13ms`。等待精确远端 Windows 证据，不提前关闭 Engineering 或 AC-15；
- E3a 提交前复审补回 Preview SHA-256 写前/读取校验与 Blob 篡改反例；最终本地完整门普通 `150/905`、N52 `58/58`、VM `24.48s`。实现头 `2f3e7b2` 已推送至 Draft PR #101，同头 Windows run `33188226007` / job `98906671499` 用时 `13m51s` 绿色：远端普通 `150/905`、N52 `58/58`、Runtime corpus `30.995s`、Route P95 `159.77ms`、Asset `3277.93ms`、build/architecture 均通过；
- 暂停点：治理提交 `568da54` 已推送至 Draft PR #97；run `33158924466` 在暂停快照时仍为 `in_progress`，N52 产品代码为零改动；恢复时先收束治理同头 CI，再进入 E1；
- M1 纵向验收：**0/27 完整通过**；
- GitHub 集成：**N00–N41 集中 Authority 在 main-target Draft PR #61，尚未合入 `main`；N43-E1a–E7 分别由堆叠 Draft PR #75–#82 承载，N50 治理由 Draft PR #83 承载，N50-E1 与 E2 分别由 Draft PR #84、#85 承载。#85 的 Windows / Node 22 完整门 run `33035133175` / job `98396096516` 用时 `11m5s` 并绿色。不得把堆叠 PR、本地/远端绿门换算为 main 已集成**。
- N50-E3 由 Draft PR #86 承载；Windows / Node 22 run `33038517971` / job `98406610224` 用时 `11m23s` 绿色，普通回归 `140/796`，Route P95 `138.75ms`，两个本机长链性能首红项远端为 `311.47/260.58ms <500ms`。这仍不等于 `main` 已集成或 Product Acceptance 通过。
- N50-E4 由 Draft PR #87 承载；实现头 `3901da4` 的 Windows / Node 22 run `33041221691` / job `98415037714` 用时 `9m6s` 绿色，普通回归 `141/801`、N50 `19/19`、VM `5/5`、autosave `2.703s`，Route P95 `112.88ms <500ms`。这只关闭 E4 Engineering，不等于实体输入设备、`main` 集成或 Product Acceptance 通过。
- N50-E5 由 Draft PR #88 承载；实现头 `8137784` 的 Windows / Node 22 run `33043581781` / job `98422396914` 用时 `11m58s` 绿色，普通回归 `141/804`、N50 `22/22`、VM `67.313s <90s`、autosave `4.153s`、Route P95 `133.25ms <500ms`。这只关闭 E5 Engineering，不等于 Windows/Android 正式宿主、`main` 集成或 Product Acceptance 通过。
- N50-E6 由 Draft PR #89 承载；实现头 `001a92f` 与最终头 `6580b34` 的 Windows / Node 22 完整门均绿色。普通回归 `142/808`、N50 `26/26`、VM `53.581s <90s`、Route P95 `122.31ms <500ms`。范围消歧后 N50 Engineering 通过，但 `main` 未集成、三宿主 Product Acceptance 仍失败。
- N50→N51 治理由 Draft PR #90 承载；治理实现头 `649fc08` 的 Windows / Node 22 完整门 run `33050123723` / job `98443305419` 用时 `12m14s` 绿色，普通回归 `142/808`、VM corpus `68.403s <90s`、Route P95 `146.72ms <500ms`。这只关闭 N51 Engineering 准入检查点，不表示 N51 功能已经实现。
- N51-E1 由 Draft PR #91 承载；实现头 `963ee1b` 建立 23 字段 portable typed core，default/project/platform 继承、来源、reset、严格解析和序列化专门门 `12/12`。本机完整门普通 `143/820`、VM `69.80s <90s`、Route P95 `122.07ms <500ms`；远端 run `33053868990` / job `98455699350` 用时 `12m9s` 绿色，VM `64.544s`、Route P95 `129.30ms`。E1 Engineering 关闭，不等于完整 N51 或 Product Acceptance。
- N51-E2 已实现 23 字段 runtime-frozen catalog、Basic `16`/Advanced `23`、双语/NFKC 搜索和原子 editing service；本机最终完整门普通 `144/832`、N51 `24/24`，修改前同切片 VM 精确计时 `53.33s <90s`，最终代码第二轮同预算门通过；证据复核 Route P95 `223.74ms <500ms`、Asset dicing `3458.41ms <5000ms`。实现头 `e4fa4b5` 的 Draft PR #92 Windows / Node 22 run `33058884556` / job `98472432704` 用时 `11m28s` 绿色，普通 `144/832`、VM `66.876s <90s`、Route P95 `134.46ms <500ms`、Asset dicing `3374.89ms <5000ms`；E2 Engineering 关闭。
- N51-E3 已把 typed settings 接入 Canonical Project 文件、Project Service ChangeSet 与 Undo/Redo；缺文件/精确空旧 v1 可升级，非空旧数据、损坏和 future schema 失败关闭；Node Directory 与 Web IndexedDB 保存重开、stale writer 和字节保持已通过。本地完整门普通 `145/841`、N51 `43/43`、Compiler `29/29`、VM `27.14s`、Route P95 `70.68ms`、Asset dicing `2122.83ms`；实现头 `8bae1b8` 的 Draft PR #93 Windows / Node 22 run `33088005806` / job `98572871025` 用时 `11m42s` 绿色，远端普通 `145/841`、N51 `43/43`、Compiler `29/29`、VM `63.76s <90s`、Route P95 `148.65ms <500ms`、Asset dicing `3382.11ms <5000ms`。E3 Engineering 关闭。
- N51-E4 已提供现代 Settings UI：Basic 16 / Advanced 23、NFKC 搜索、五分区、项目/Windows/Web/Android、来源与覆盖、原子 ChangeSet、恢复、Undo/Redo 和完整 Canonical 保存桥。真实 UI→IndexedDB→Lifecycle 重开通过；冷 production browser 在 1440×900 与 390×844 完成保存重开、16:9、触控 ≥44px、overflow 0、focus/reduced-motion 和 console 0。首次 36px 恢复按钮、10px 顶栏溢出与固定返回按钮遮挡均按实际纠正。本地完整门普通 `147/847`、N51 `49/49`、VM `27.09s`、Route P95 `60.06ms`、Asset dicing `1745.71ms` 全绿；实现头 `9828208` 的 Draft PR #94 Windows / Node 22 run `33093375273` / job `98591846616` 用时 `12m39s` 绿色，远端普通 `147/847`、N51 `49/49`、VM `27.68s`、Route P95 `153.19ms`、Asset dicing `3310.15ms`。E4 Engineering 关闭。
- N51-E5 新增唯一 portable settings application v1，Editor Preview 与正式 Player Core/Host 共用平台解析、显示/DPR、文字时长、六类音量、voice ducking 与四类推进输入；纠正了 settings 纳入 canonical hash 后会错误重置 Player Core 的偏移。23 项 v1 设置均可 Host 热应用，剧情内容变化仍重建 Core。保存重开、平台差异、pointer/touch、keyboard/gamepad、allow-hold、实际 voice wait 与音量均有测试；冷 Player production browser 在 1440×900 热切 16:9→9:16 时保持 `presenting` 与对白，pointer 关闭后拒绝推进，390×844 stage `390×693`、overflow 0、console 0。本地完整门普通 `149/856`、N51 `69/69`、Player/Core `31/31`、VM `30.38s`、Route P95 `57.55ms`、Asset dicing `1544.16ms` 全绿；实现头 `c018602` 的 Draft PR #95 Windows / Node 22 run `33097845390` / job `98607353801` 用时 `12m47s` 绿色，远端普通 `149/856`、N51 `69/69`、Player/Core `31/31`、VM `66.13s`、Route P95 `143.09ms`、Asset dicing `3280.23ms`。E5 Engineering 关闭；正式 Windows/Android Host 和完整 P0 仍阻断。
- N51-E6 入口审计已把规格 2.1–2.9 与真实 23 字段、严格 v1 parser、Catalog controls、Canonical Project、Editor Preview 和 Player application 逐项比较。首次实际发现两项不能直接编码的差异：原始范围中播放控制、本地化生产、自动附加页和构建发布分别归 N52/N61/N62/N80–N83；严格 v1 旧读取器会拒绝新增 unknown field，不能在同一 schemaVersion 下静默扩字段。入口提交 `ec35570` 的 Draft PR #96 Windows / Node 22 完整门 run `33133914830` / job `98729511942` 用时 `12m5s` 绿色：autosave `3.744s <5s`、VM `64.00s <90s`、普通 `149/856`、Route P95 `133.34ms`、Asset dicing `3255ms`，关闭本机负载差异。下一代码切片冻结为 v1→v2 默认升级、确定性 round-trip、future schema 拒绝、Node/IndexedDB 保存重开和 settings-only Core 保持；字段实现尚未开始，详见[#229](229-n51-e6-p0-gap-matrix-and-entry-audit.md)。
- N51-E6a 已把 Settings 当前写入版本提升为 v2，合法 v1/v2 经同一严格校验后统一为 v2，v3+ 失败关闭。首次冻结测试为 5 files / 52 tests，实际 45 通过、7 项按预期因旧 parser 失败；修正后 52/52，N51 聚合门 10 files / 74 tests。真实 Node 临时目录与 IndexedDB 均验证非空 v1 打开、保存、重开和二次字节幂等；Player 验证 schema-only 迁移保持活跃 choice Core。类型门首次发现只读测试夹具写入并改为复制注入后通过。完整门和同头远端证据待补，详见[#230](230-n51-e6a-settings-schema-v2-migration-audit.md)。
- E6a 本机完整门首次因旧 Compiler Build ID Golden 停止，修正后 29/29；第二次从头运行在 N41 长链累积负载下出现 3 个 5s/10s 超时，两个受影响文件原门限隔离复跑 16/16。后半门中普通回归的 4 个 source identity Golden 已按“语义不变、身份更新”冻结，2 个 Preview 超时连同身份项隔离复测 3 files / 22 tests 全绿；Build、architecture、Script 13/13、Route 9/9（P95 `194.16ms`）、Asset 4/4（Dicing `3313.33ms`）均通过。单次本机完整门仍不记绿，等待同头 Windows / Node 22 裁决。
- 实现头 `1b21508` 的 Draft PR #96 Windows / Node 22 完整门 run `33136866897` / job `98738665580` 用时 `11m50s` 并绿色：普通 `149/861`、N51 `74/74`、Player/Core `32/32`、Runtime corpus `27.946s`、autosave `3.642s <5s`、VM `63.71s <90s`、Route P95 `130.55ms <500ms`、Asset dicing `3363.87ms <5000ms`。相同规模和预算关闭本机累积负载差异，E6a Engineering 关闭；N51 Product Acceptance 与 E6b+ 仍未完成。
- N51-E6b 新增 `text.revealMode/lineHeight/letterSpacingEm` 与 `accessibility.highContrast/reduceMotion/reduceFlashing`，Settings 当前写入 schema 提升为 v3，Catalog 达到 Basic `20` / Advanced `29`。冻结 6 files / 57 tests 首次实际为 47 通过、10 项按预期暴露旧 v2/parser/catalog/application 缺口；修正后 N51 聚合 10 files / 80 tests。编译器 Golden 首次只改变四个 Build ID，四个 Story IR Hash 不变；正式 Preview 的路线、结局、定位和 History 等价断言保持。冷 Editor production browser 完成 Web Audio+Accessibility 两个分区 ChangeSet `r1→r2`、IndexedDB 保存重开、高对比计算样式，Basic 20；冷 Player production browser 在活跃对白中热应用即时显示、2.0 行高、0.08em 字距、高对比、0.01ms 减动效和 dissolve→fade，Core/对白保持，1440×900 与 390×844 overflow 0、console 0。完整门与同头 CI 尚待本切片后续补证，详见[#231](231-n51-e6b-text-accessibility-entry-contract.md)。
- E6b 首次本机完整门在通过前序治理、Compiler/Runtime/corpus 与 N41 多项门后，既有 `App.test.tsx` 2/45 项于累计负载下超过冻结 5s；未修改 timeout，原命令隔离复跑整个文件 45/45。该次完整门保持红色，等待第二次从头运行与同头 Windows / Node 22 裁决。
- E6b 第二次本机完整门穿过 App 红点并通过普通回归 `149/867`、N51 `80/80`、Player/Core `32/32`、autosave，但固定重型 VM corpus 为 `95.93s > 90s`；原命令隔离复跑 `5/5`、`70.84s <90s`。后续 17 workspace build、architecture 100/4、Script `13/13`、Route `9/9`（P95 `111.15ms`）、Asset `4/4`（dicing `2344.23ms`）通过。预算未放宽，本机仍不记单次完整门绿色，等待同头 Windows / Node 22 裁决。
- E6b 实现头 `7d8bac1` 的 Draft PR #96 Windows / Node 22 完整门 run `33140441747` / job `98749884222` 用时 `12m33s` 绿色：普通 `149/867`、N51 `80/80`、Player/Core `32/32`、autosave `4.041s <5s`、VM `65.67s <90s`、Runtime shard `30.222s`、Route P95 `157.41ms`、Asset dicing `3246.27ms`。同规模同预算关闭本机累积负载差异，E6b Engineering 关闭；N51 Product Acceptance 和 E6c+ 仍未完成。
- N51-E6c 新增 `stage.defaultDurationMilliseconds/defaultEasing` 与 `audio.resumeAfterInterruption`，Settings 当前写入 schema v4，Catalog 达到 Basic `21` / Advanced `32`。冻结 9 files / 82 tests 首次实际 68 通过、14 项准确暴露旧 schema/catalog/Preview/Player 缺口；首轮修正后 81/82，旧 300ms fallback 按统一 360ms 契约纠正；代码复审再补 Canvas easing 真实执行反例，最终 83/83；N51 聚合 10 files / 87 tests。四个 Build ID 更新而 Story IR Hash 完全不变。冷 Editor production browser实际编辑 Web master+resume 两字段、保存 `s1`、释放并重开恢复；冷 Player production browser 热应用 `360/linear/true → 720/ease-out/false` 且活跃对白/Core 保持。双端 1440×900/390×844 overflow 0、console 0。首次全门另暴露 6 个 source identity 并修正，第二次全门仅既有 App 5s 累积负载超时；预算未放宽，等待同头 CI 裁决，详见[#232](232-n51-e6c-stage-audio-default-policy-contract.md)。
- E6c 实现头 `3a1cbed` 的 Draft PR #96 Windows / Node 22 完整门 run `33143471100` / job `98759295354` 用时 `12m33s` 绿色：普通 `149/876`、App `45/45`、N50 `34/34`、N51 `87/87`、autosave `1/1`（`5.095s`）、VM `65.93s <90s`、Route P95 `132.69ms`、Asset dicing `3272ms`。同规模同预算关闭本机累积负载差异，E6c Engineering 关闭；N51 Product Acceptance、N52 与 E6d+ 仍未完成。
- N51-E6d 把 Choice 编号/响应式布局与 UI 默认 Textbox/输入提示贯通 schema v5、Catalog、Canonical、Editor 与 Player；Advanced 36 / Basic 23。首次 79/88，修正扩展后 101/101；双 production browser 验证保存重开、同 Core、桌面/移动布局与 ADV→bubble。实现头 `6d99928` 的 Windows 完整门 run `33147113913` 绿色，E6d Engineering 关闭。
- N51-E6e 冻结 Settings/Runtime/Compiler Profile 所有权，WebPlayerHost 类型与运行时固定为 Web，嵌入观察值公开 `settingsPlatform: web`。首次 22/24，修正后 24/24；Chrome 151 production 9/9 快照为 Web。实现头 `b7d7c5c` 的 Windows 完整门 run `33151182320` 用时 13m01s 绿色，E6e Engineering 关闭。
- N51-E6f 新增机器可读出口合同与根级审计，逐项核验 schema v5、36/23、application v1、Web Host、双 production evidence 和 N52/N61/N62/N70–N72/N80–N83 所有权。首次代码事实全部通过，仅 5 项权威文档状态滞后；实现头 `40c14a4` 的 Windows / Node 22 完整门 run `33155226168` / job `98796294530` 用时 `14m18s` 绿色：普通 `149/886`、N51 `95/95`、Autosave `4.788s < 5s`、VM `69.85s < 90s`、Route P95 `186.04ms < 500ms`、Asset dicing `3323.81ms < 5000ms`。N51 Engineering 关闭；N51 Product Acceptance、AC-19、REQ-GAL、N52+、M1 Stable 与 Public Release 继续阻断。

最新 E8n 远端证据为 `product-baseline` run `32684809412` / job `97307842092`，Windows / Node 22 用时 `4m56s`，实现头 `7857ca9` 全绿；本机冻结 VM 因当前资源负载为 `102.1s >90s`，预算未放宽，远端同门为 `61.81s`。

## 2. 当前真实能力

| 能力 | 当前可用 | 仍缺 |
|---|---|---|
| Project | Canonical 工程、新建/打开/最近、保存恢复、确定性 ZIP、无账户本地工作 | Android SAF、正式双端壳与设备验收 |
| Story | P0 语言、正式 Sequence/Script、Compiler IR/Source Map；Sequence 已有全部 P0 插入、类型化 Inspector、搜索/复制/移动/批量/折叠、跨视图定位与 Formal Runtime statement 高亮；1,000 次全 P0 Sequence/Script 互改和 84 项退出矩阵已通过；N40/N41 Engineering 出口均通过 | N21/N23 真人、N40/N41 Product Acceptance、完整 Stage/Player 仍阻断；Route-first lazy 控制流是后续大型工程增强，不是 N41 出口缺口 |
| Preview | Entry/Scene/Statement Fresh Run；变量/栈/位置/诊断；Continue、Step Over、Back/Forward、Run to Cursor；awaited/cancel/Barrier；portable Host receipt/hash；安全热更新 | 断点/Watch、正式 Player Adapter 与 Editor↔Player 画面 Golden |
| Stage/Media | Editor 既有 16:9/真实 Blob/Canvas/路径/Camera/转场/模板；N50-E3 已增加同源结构差分、slot/bus channel、左右角色+BGM/Voice 实测与缺资源显式恢复 | 像素级视觉矩阵、SFX/Ambient/UI、视频、网络/超时/损坏策略、三端媒体策略 |
| Runtime | VM-01–VM-15 正式 portable Runtime；共享 presentation Host；State/History/Save/Back/Forward/调度/诊断；Effect 默认 channel 已按 slot/bus 隔离 | 完整媒体故障策略、玩家控制 UI 与三端一致性 |
| Player/Build | N50 portable Core/媒体/输入/lifecycle/embed；N51 Settings；N52-E1 History；E2 Save/Load；E3a–E3c4 已完成 v2/v3 元数据/截图、auto 5、quick 1、隔离恢复、Migration Museum、build-authored marker 与三个 checkpoint 槽 | 真实 Windows/Android compositor、真实强杀、History 页面、播放 Auto/Skip、Gallery、正式宿主与发布材料仍缺 |
| Optimization | Production 已接入真实资源检查、血缘、Dicing 候选、Atlas/Loader/内存/剧情预测/资源编译流水线；资源表与手机状态卡可见 | 正式 Optimization Center、平台变体、真机收益报告、构建联合预算和包体闭环 |

N43-E2 增加 Beginner/Pro 可逆披露：Beginner 只展示 3 个任务模式与 Sequence，收起复杂轨道/搜索/批量工具但不卸载；Pro 恢复 7 个模式身份、3 个编辑视图和全部专业工具。真实 Chrome 在 Beginner 修改 `stmt_rooftop_001` 为 r1、切回 Pro、保留已开 Script、保存 s2 并整页重开后零漂移；390px Preview `352×198`、横溢出 0。Production、Debug & QA、Mobile Focus 继续禁用。详见[#205](205-n43-e2-progressive-disclosure-audit.md)。

N43-E3 增加完整/简化/静止三级动效与系统 reduce 优先级；静止全局 computed animation/transition `0.01ms`，选择、焦点和诊断均有 ARIA/文字/符号。真实页面三级 P95 为 `12.30/12.20/6.20ms`，390px 请求下横溢出 0、Preview 精确 16:9、console 0。真实 OS 媒体设置与目标设备矩阵仍待 Product Acceptance。详见[#206](206-n43-e3-motion-state-semantics-audit.md)。

N43-E4 冻结七类键盘/指针触屏等价路径；真实浏览器对白提交 `r0→r1`，Sequence→Script/Preview layout commit `26.20ms <500ms`，stable ID 保持 `stmt_gate_001`。390×844 请求下实际 client 375，路线触控按钮首次仅 `32×29px`，已修正为 `44×44px`，X `648→624`、横溢出 0。N43 聚合门 `12 files / 70 tests`；本机全仓单链退出 0，普通回归 `134 files / 774 tests`，冻结 VM `54.33s <90s`。实现头远端 run `32929525731` / job `98058928262` 用时 `11m30s` 绿色，VM `67.15s`。Editor build CSS `111.08/20.48 kB`、JS 本地 `918.23/256.59 kB`、远端 `918.31/256.59 kB`，分包债保留。出口矩阵仍因三模式 disabled 与真人缺失失败。详见[#207](207-n43-e4-input-sync-and-exit-audit.md)。

N43-E5 开放 Production 的真实资源任务：中央区直接读取 Asset Index/Lifecycle/Dicing，显示四段生产流水线、下一动作和资源映射批量表；真实 N42 媒体工程为 `3` 资源、Index `r3`、`3/3` 检查通过、2 张 Dicing 候选。390px 首测桌面表仍需内部横向滚动，已改为六字段状态卡并隐藏无关视图栏；按钮 `351×48px`、文档 `375/375`。组合过滤、3 项真实流水线、Dicing 可用、console 0；保存 `s3→s4` 重开恢复 `production / media_background / 3/3`。当前 5/7，Debug & QA 与 Mobile Focus 仍 disabled。详见[#208](208-n43-e5-production-workspace-audit.md)。

N43-E6 开放 Debug & QA 的正式诊断任务：当前工程、草稿诊断、Compiler、Runtime 与 Source Map 形成单一检查链，错误草稿 fail closed，问题可返回同一 stable ID 修复。真实浏览器对 `stmt_gate_bg` 得到 0/0、Source Map ready、Runtime presenting；390px 主按钮 `351×48px`、定位按钮 `317×44px`、横溢出 0，保存 `s1` 后从 Recent 重开恢复 `debug-qa / stmt_gate_bg`，console 0。首次截图发现定位按钮浅色实心层级不符，修正后 computed 为紫色 `.09/.36` 描边。当前 6/7，仅 Mobile Focus disabled。详见[#209](209-n43-e6-debug-qa-workspace-audit.md)。

N43-E7 开放 Mobile Focus：项目对白按 stable ID 投影，中文 IME 组合期不提交，输入明确提交/放弃，未提交时锁住模式与前后句导航；fake-indexeddb 完成 `r0→r1→s1→释放租约→重开`。真实 390×844 浏览器首测 overflow 0、入口 48px，但模式滚动条和历史操作过密，收敛后 textarea `240.25px`、提交/放弃/前后句均 48px。七模式 Engineering 达到 7/7；响应式 Web 不等于 Android/N91。详见[#210](210-n43-e7-mobile-focus-and-engineering-exit-audit.md)。

E7 实现头 `3eff0d4` 的远端 Windows / Node 22 完整门 run `32943861705` / job `98100313426` 用时 `11m15s` 并绿色：普通回归 `137/780`、storage `1/1`、冻结 VM `65.596s <90s`；Route P95 `131.84ms <500ms`、Global Lazy Index `264.93ms <500ms`、Dicing `3370.61ms <5000ms`；Editor CSS `126.46/22.88 kB`、JS `937.07/261.38 kB`，大包债保持。

E6 实现头 `7c83ca5` 的远端 Windows / Node 22 完整门 run `32938398390` / job `98084137349` 用时 `9m31s` 并绿色：普通回归 `136/778`，冻结 VM `54.367s <90s`，Route P95 `125.24ms <500ms`，Lazy Index `222.61ms <500ms`；Editor CSS `121.79/22.05 kB`、JS `931.75/259.72 kB`，大包债保持。

E5 本机第二次完整门退出 0：普通回归 `135 files / 776 tests`，N43 `14/73`，storage `1/1`，冻结 VM `70.20s <90s`，14 workspace、架构和 Script/Route/Asset 性能均绿；Editor CSS `116.98/21.44 kB`、JS `925.46/258.19 kB`。首次完整门仅一个既有 Stage 测试在累积负载下 `6.21s >5s`，保持预算后原样复跑 `2.68s`、第二次全门通过；没有隐藏该差异或放宽 timeout。

Draft PR #80 实现头 `afc095d` 的 Windows / Node 22 完整门 run `32933485910` / job `98070145468` 用时 `11m37s` 并绿色：普通回归 `135/776`，冻结 VM `72.77s <90s`，Route P95 `135.91ms <500ms`；Editor CSS `116.98/21.44 kB`、JS `925.54/258.17 kB`，大包债保持。

## 3. N32-E1–E6 证据与差异

| 检查 | 预期 | 实际 | 判定 |
|---|---|---|---|
| 定向 Editor | 正式流程与旧兼容均不回归 | 4 files / 40 tests | 通过 |
| 双路线 State | 路线/Source Map/Hash 固定 | N51-E6c source identity 后：广播室 `b9f122e8…e2fc4`；天台 `5a7da5a5…7a861` | 通过 |
| 编译失败 | fail closed，不回退 | `MISSING_LABEL` | 通过 |
| 生产浏览器 | 两路线正确 Ending、console 0 error | 入口至 Choice 3 次 Continue；两分支各 2 次；两个结局正确；0 error | 通过 |
| 工作区/架构/风险/需求 | 当前节点 N32 且不越权 | 四项审计 PASS；RA-N21-004 唯一 active | 通过 |
| Runtime 10k | 10,000 seeds / 20,000 replays / 40 chunks / 原 digest；单 shard ≤90 秒 | Windows / Node 22 总墙钟 30.868 秒；shard 26.558–27.107 秒；digest `20e9a842…92ef2` | 通过；未减 corpus、未改 digest、未放宽门 |
| GitHub CI | 纠偏实现头 Windows / Node 22 完整门绿色 | Draft PR #52，run `32457615078` / job `96697835514`，4 分 8 秒 | 通过 |
| Editor production build | 成功并报告体积 | 682.24 kB，gzip 196.33 kB，仍有 >500 kB warning | 构建通过，体积未达优化目标 |
| E2 定向 | 观察契约、结构化负例和 UI 回归 | 2 files / 6 tests | 通过 |
| E2 生产浏览器 | r1/r4 位置、真实变量、console 0 error | `direction #0`→`choice #3`；产品 UI 新增 Number 后显示 2；0 error | 通过 |
| E2 本机全仓 | 普通回归全绿；串行 autosave ≤5 秒 | 98 files / 592 tests 通过；autosave 约 23.10 秒仍“保存中…” | 功能通过；已知主机负载差异保留给远端裁决 |
| E2 production build | 成功并报告增量 | 692.05 kB，gzip 198.42 kB；较 E1 约 +9.7/+2.1 kB | 构建通过，拆包债保留 |
| E2 GitHub CI | Windows / Node 22 完整门绿色 | Draft PR #53，run `32459445287` / job `96703241983`，4 分 16 秒；autosave 3.086 秒 | 通过；本机负载差异关闭 |
| E3 定向 | 精确目标、Fresh State、结构化负例和 UI 路径 | 2 files / 9 tests；N51-E6c source identity 后 Scene Hash `869bd36b…b951e`；Statement Hash `719d1729…5fdda` | 通过 |
| E3 全仓与构建 | 普通回归、串行 storage、审计和 production build 通过 | 98 files / 595 tests；storage 1/1；JS 694.55 kB / gzip 199.03 kB | 通过；>500 kB 拆包债保留 |
| E3 生产浏览器 | Scene/Statement 精确位置、同目标重启、console 0 error | `stmt_radio_bg #0`、`stmt_radio_001 #1`；结局后重启仍为 `#1`；`[]` | 通过 |
| E3 GitHub CI | Windows / Node 22 完整门绿色 | Draft PR #54，run `32461345815` / job `96708731870`，4 分 16 秒；98/595；autosave 3.049 秒；Runtime corpus 32.593 秒 | 通过；E3 Engineering 关闭 |
| E4 定向 | History/Scheduler 控制、内部光标、调用栈、阻断和 fork | 2 files / 14 tests；N51-E6c source identity 后 History Hash `184f619b…17266` | 通过 |
| E4 本机全仓 | 普通回归、串行 storage、审计和 production build | 98 files / 600 tests；storage 1/1（5.18 秒）；JS 721.30/205.42 kB | 通过；拆包债扩大并保留 |
| E4 生产浏览器 | Cursor/Back/Forward/Choice/fork/布局/console | h2/2 transient；h1/2↔h2/2；Choice h3/3→h4/4；route fork h5/5；352×46；`[]` | 通过 |
| E4 GitHub CI | Windows / Node 22 完整门绿色 | Draft PR #55，run `32464584207` / job `96718382563`，4 分 15 秒；98/600；autosave 2.961 秒；Runtime corpus 30.334 秒 | 通过；E4 Engineering 关闭 |
| E5 定向 | Host intent、awaited/cancel、Barrier、checkpoint/compensation/replay 与产品按钮 | 3 files / 21 tests | 通过 |
| E5 本机完整门 | 治理、普通/存储/重型 VM、12 workspace、架构与性能 | 99 files / 607 tests；storage 1/1；VM 5/5；Runtime corpus 26.938 秒；85 portable / 4 adapters | 通过 |
| E5 production build | awaited/Barrier 决策与 Back/Forward channel 实际值 | awaited `true→false / last cancel`；Barrier `true→false / last execute`；Back `1→0 active`；Forward `0→1 / last replay` | 通过；首测 pure channel 残留已修正 |
| E5 production 体积 | 成功并报告增量 | CSS 78.38/14.99 kB；JS 727.60/206.71 kB | 构建通过；>500 kB 拆包债保留 |
| E5 GitHub CI | Windows / Node 22 完整门绿色 | Draft PR #56，run `32467211148` / job `96726246321`，4 分 9 秒；99/607；autosave 2.855 秒；Runtime corpus 28.603 秒 | 通过；E5 Engineering 关闭 |
| E6 定向 | 安全迁移、rewound future、结构/编译/transient/Effect 反例与产品路径 | 4 files / 25 tests | 通过 |
| E6 production browser | 文案更新保持状态；语义变化保留旧会话；仅明确操作后重启 | `h4/4`→安全更新仍 `h4/4` 且新 prompt/label 可见；结构更新仍 `h4/4` 并显示 `OLD SESSION PRESERVED`；重启后 `h1/1` | 通过；与预期零差异 |
| E6 本机普通/存储/构建 | 新功能全回归；真实 IndexedDB；12 workspace 可构建 | 100 files / 611 tests；storage 1/1；CSS 79.65/15.18 kB；JS 734.30/208.23 kB；架构与 Script 性能通过 | 功能通过；>500 kB 拆包债保留 |
| E6 本机冻结性能 | 既有 Spike 10k ≤90 秒；Dicing 3s/3s/5s | Node 25 Spike 实际约 180.5 秒；Dicing 两次分别 3.35+3.21=6.56 秒、2.36+4.13=6.49 秒 | 本机完整门红；不改规模/digest/预算，等待 Windows / Node 22 裁决 |
| E6 GitHub CI | Windows / Node 22 完整门裁决本机性能差异 | Draft PR #57，run `32470326283` / job `96735561264`，4 分 20 秒；100/611；autosave 1/1；VM 5/5（68.68 秒）；Runtime corpus 30.635 秒；Dicing 1.47/1.78/3.25 秒 | 通过；本机环境差异关闭，E6 Engineering 关闭 |
| E6 时点 N32 出口审计 | 6 项 Implementation 与跨宿主 Acceptance 全对齐 | 当时为 5 项完整；共享 Host 未实现；现有单文件 Web 候选仍直接解释 StoryStatement | 历史判定保留；由下方 E7 后复审取代当前状态 |
| E7 定向与 Benchmark | 共享 Host 正反例；正式 Compiler/Runtime 两路线到结局 | Host/Editor `3 files / 22 tests`；Benchmark/adapter `2 files / 6 tests`；两结局正确 | 通过；首测发现旧 Direction 与缺失变量后已纠偏 |
| E7 本机完整门 | 治理、Runtime corpus、常规/存储/重型 VM、13 workspace、架构/性能 | `npm run check` 退出码 0；100 files/617 tests；storage 1/1；VM 5/5；88 portable / 4 adapters | 通过 |
| E7 Worker production | Node↔浏览器 Host receipt/hash 零差异 | `data-status/runtime/runtime-host=passed`；console `[]` | 通过；测试宿主不是 Player |
| E7 Editor production | 五分钟工程两路线、History 与错误日志 | 16 Continue 到分支；两路线各 14 Continue 到正确结局；Back/Forward 回到同一结局；console `[]` | 通过 |
| E7 GitHub CI | 干净 Windows / Node 22 完整门验证实现头 | Draft PR #58，提交 `c93514e`，run `32505981631` / job `96846121361`，4 分 16 秒；locked install 与 full check 均成功 | 通过；此前 `dist` 入口红灯的真实根因已关闭 |
| E7 后出口复审 | Implementation 6/6 且 Acceptance 1/1 | `完整 5 / 部分 1 / 未对齐 0`；Acceptance `0/1` | 总出口失败；正式 Player/视觉差分仍缺 |

## 4. 需求方向审计

方向没有偏离已冻结产品目标：正式 Compiler/Runtime 取代产品平行解释器，是后续专业 Debugger、路线状态、Save/Back/Forward、三端一致性和商业级 QA 的必要基础。E6 的安全迁移严格由新 IR 重放和语义快照裁决，没有为了“看起来实时”直接改 State 或静默重启。现代化 UI、图形化编辑、多彩表达、16:9 默认预览及可调尺寸仍保留。

需要防止五类偏移：

1. 不得让旧 `playable-preview-runtime.ts` 重新成为 Editor 完整流程权威；
2. 不得把安全文案热更新扩大成任意 IR/State 原地修改，也不得把 Editor Host receipt 冒充共享 Player Host；
3. 不得用 jsdom 或代理浏览器替代 N21/N23 真人任务；
4. 不得因生产构建成功就宣称包体优化、正式 Player 或三端发布完成。
5. 不得把 `playable-web-export.ts` 的独立解释器或其自测冒充正式 Runtime Web Player 与跨宿主差分证据。

## 5. 下一步顺序

1. N43-E7 已完成 Mobile Focus，远端完整门绿色，七模式 Engineering 7/7 出口通过；
2. 保持 N43 Product Acceptance 与所有前置真人门为 blocked/pending，不把 Engineering 结果换算为产品通过；
3. 真人不可参与的事实继续 fail closed，不能用自动化冒充真人或 Android 实体设备；
4. `RA-N21-011` 只准入 N52 Engineering，并通过 checkpoint 窄范围修订允许 E3c3 必需的 N20/N30/N31/Save 合同变化；同时由维护者审阅 main-target Draft PR #61 及堆叠 PR 合并策略；
5. N50-E6 与范围消歧已关闭 N50 Engineering；N50 Product Acceptance 保持 `0/1`；
6. N52-E1/E2/E3a/E3b/E3c1 Engineering 已关闭，E3c2 checkpoint 入口合同已关闭；入口不等于 marker 或三槽已实现；
7. N52-E4b Shell Auto real clock 已完成本地定向与 cold production 证据，当前先收束完整门和精确远端 CI；成功后下一唯一代码切片是 E4c Skip 控件/速度/媒体清理/embed observation。N60+ 与全部 Product Acceptance 阻断不变。

每个切片继续执行：冻结目标 → 实现 → 自动化反例/正例 → 生产浏览器实际值 → 差异修正 → 文档/需求矩阵 → 全仓门 → 推送。任何真人或产品门仍按权威记录 fail closed。
