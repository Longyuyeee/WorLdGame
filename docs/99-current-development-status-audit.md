# 当前开发情况审计（N40 准入，产品门仍阻断）

> 审计日期：2026-08-22
> 当前分支：`codex/n40-e1-route-graph-core`；直接基线为 N32-E7 最终头 `3b0b426e9804f9ed3842d05abd01171e9393655b`
> 权威基线：N31 集中基线 `143c05f1d1fcf84844a5f3122e217e4283afd15b`，Draft PR #51，尚未合入 `main`
> 当前授权：`RA-N21-005` 只允许 N40 Route Map Engineering；2026-09-22 到期
> 最新节点证据：[N32→N40 治理检查点](152-n32-n40-governance-checkpoint.md)、[N40-E1 Route Graph](153-n40-e1-route-graph-core-audit.md)–[N40-E7 Runtime Route Highlight](163-n40-e7-runtime-route-highlight-audit.md)、[N40-E8a Single Project Read](164-n40-e8a-single-project-read-audit.md)–[N40-E8g Lazy Sequence](170-n40-e8g-lazy-sequence-projection-audit.md)
> 权威功能状态：[M1 需求与验收追踪矩阵](90-m1-requirement-traceability.md)

## 1. 当前结论

Editor 的完整流程试玩已把 Canonical Project 交给 N30 Project Compiler，再把 IR 交给 N31 Runtime；E7 又把 Editor 私有 Effect Host 收敛为 portable `@world-studio/runtime-host`，并由真实浏览器 Worker 与 Node 比较同一 receipt/snapshot Golden。五分钟 Benchmark 首次按正式链实测时暴露旧 Direction 和缺失变量，本轮已修正；两条结局路线与 Back/Forward 均在 production browser 真实通过。

E1–E7 已覆盖 Entry/Scene/Statement Fresh Run、状态观察、调试、portable Host 和受约束热更新。但出口复审只能得到 `完整 5 / 部分 1`：共享 Host contract 存在，正式 Player 与真实渲染/音频 Adapter 不存在，当前“构建试玩 HTML”仍使用独立 `StoryStatement` 解释器。因此 E7 通过不等于 N32 Engineering 总出口通过。

- 当前工程节点：**N32-E7 本地 Engineering、产品闭环实测及远端 Windows / Node 22 完整门通过；N32 Engineering 总出口仍未通过**；
- N21 真人：**0/1，pending-participant**；
- N23 真人：**0/2，pending-participants**；
- N30/N31：**Engineering 已有退出证据，Product Acceptance 未通过**；
- N32 Product Acceptance：**被阻断**；
- N40 Route Map Engineering：**E1–E7 已形成 Compiler 图、10k/64 窗口、Layout/过滤、可校验缓存、`<500 ms` 局部编辑和 Runtime 路线高亮；E8a–E8f 建立 trusted Route-first 与可保存 Script scene page；E8g 已从同一 source 投影 64 卡 Sequence，并跑通安全内容 Inspector、共享选择/历史/dirty、1,000 次互改和完整重建。结构/topology 仍全量，完整 Sequence 结构与跨实体 lazy 编辑、全局索引、外部宿主和 production browser 待完成**；N40 Product Acceptance、N41、M1 Stable、Public Release：**被阻断**；
- M1 纵向验收：**0/27 完整通过**；
- GitHub 集成：**N31 authority 在 Draft PR #51，未合入 `main`；N32-E1 为其下游开发分支**。

## 2. 当前真实能力

| 能力 | 当前可用 | 仍缺 |
|---|---|---|
| Project | Canonical 工程、新建/打开/最近、保存恢复、确定性 ZIP、无账户本地工作 | Android SAF、正式双端壳与设备验收 |
| Story | P0 语言、Writer/Script、Compiler IR/Source Map；Route 有 10k/64 窗口、Layout/过滤、可校验缓存、`<500 ms` 局部编辑及 Formal Runtime 路线高亮；受管工程可从 Recent 无 full read 进入 Route，按 scene 补读 script/layout，在同源 Script/64 卡 Sequence 编辑安全内容、共享 Undo/Redo、原子保存后完整重建 | 结构/topology 全量；局部页尚无结构/ID/跨实体引用与完整演出 Inspector、多 dirty page和全局 edit index；production browser、外部宿主、N41/N60 仍缺 |
| Preview | Entry/Scene/Statement Fresh Run；变量/栈/位置/诊断；Continue、Step Over、Back/Forward、Run to Cursor；awaited/cancel/Barrier；portable Host receipt/hash；安全热更新 | 断点/Watch、正式 Player Adapter 与 Editor↔Player 画面 Golden |
| Stage/Media | 16:9 默认预览、可调尺寸、真实 Blob、Canvas 2D、基础 BG/角色/音频、安全占位；正式 Runtime Effect 提交时机 | 复杂镜头/关键帧、Pixi/WebGL、三端媒体策略与共享 Host |
| Runtime | VM-01–VM-15 正式 portable Runtime；共享 portable presentation Host；State/History/Save/Back/Forward/调度/诊断 | Player 槽位、真实媒体 Adapter、三端一致性 |
| Player/Build | N23 独立单文件 HTML 候选，可确定性离线打开 | 当前候选仍是平行 `StoryStatement` 解释器，不是正式 Runtime Player；正式 Web/PWA、Windows、APK/AAB、签名、安装、升级与发布材料均缺 |
| Optimization | Dicing/资源分析原型与预算测试 | Optimization Center、平台变体、真机收益报告和包体闭环 |

## 3. N32-E1–E6 证据与差异

| 检查 | 预期 | 实际 | 判定 |
|---|---|---|---|
| 定向 Editor | 正式流程与旧兼容均不回归 | 4 files / 40 tests | 通过 |
| 双路线 State | 路线/Source Map/Hash 固定 | 广播室 `7cbc2296…7909b`；天台 `72def5ef…0353` | 通过 |
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
| E3 定向 | 精确目标、Fresh State、结构化负例和 UI 路径 | 2 files / 9 tests；Scene Hash `2658ce49…1ef6`；Statement Hash `62babbde…69e6` | 通过 |
| E3 全仓与构建 | 普通回归、串行 storage、审计和 production build 通过 | 98 files / 595 tests；storage 1/1；JS 694.55 kB / gzip 199.03 kB | 通过；>500 kB 拆包债保留 |
| E3 生产浏览器 | Scene/Statement 精确位置、同目标重启、console 0 error | `stmt_radio_bg #0`、`stmt_radio_001 #1`；结局后重启仍为 `#1`；`[]` | 通过 |
| E3 GitHub CI | Windows / Node 22 完整门绿色 | Draft PR #54，run `32461345815` / job `96708731870`，4 分 16 秒；98/595；autosave 3.049 秒；Runtime corpus 32.593 秒 | 通过；E3 Engineering 关闭 |
| E4 定向 | History/Scheduler 控制、内部光标、调用栈、阻断和 fork | 2 files / 14 tests；History Hash `ffcbb64f…aa6594` | 通过 |
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

1. N32-E7 已完成实现、实测、推送和远端 Windows / Node 22 全仓 CI，节点证据已闭合；
2. E6e/E7 已关闭局部编辑与 Runtime 高亮，E8a–E8f 已建立可信 Route-first 与可保存 scene page，E8g 已关闭局部 Script/Sequence 内容同源、共享历史和 64 卡窗口；下一步发布绑定 trusted revision 的全局 Lazy Edit Index，再逐步开放结构与跨实体编辑。整体 lazy loading 尚未完成；安全校验恢复时补做 E5/E6d–E8g production browser；
3. 正式 Player 属于 N50/N80，不能跳过 N40–N43。N32/N40 Product Acceptance 和 N41+ 保持 fail closed；不得把 Worker 或旧 HTML 重命名为 Player Acceptance。

每个切片继续执行：冻结目标 → 实现 → 自动化反例/正例 → 生产浏览器实际值 → 差异修正 → 文档/需求矩阵 → 全仓门 → 推送。任何真人或产品门仍按权威记录 fail closed。
