# 当前开发情况审计（N32-E3 Engineering 候选）

> 审计日期：2026-08-21
> 当前分支：`codex/n32-e3-run-from-target`；Draft PR 待创建
> 权威基线：N31 集中基线 `143c05f1d1fcf84844a5f3122e217e4283afd15b`，Draft PR #51，尚未合入 `main`
> 当前授权：`RA-N21-004` 只允许 N32 Editor Preview Engineering；2026-09-20 到期
> 最新节点证据：[N32-E3 从场景/语句 Fresh Run 审计](145-n32-e3-run-from-target-audit.md)
> 权威功能状态：[M1 需求与验收追踪矩阵](90-m1-requirement-traceability.md)

## 1. 当前结论

项目已从“编辑器自带平行故事解释器”向正式产品执行链迈出第一步：Editor 的完整流程试玩现在把 Canonical Project 交给 N30 Project Compiler，再把 IR 交给 N31 Runtime；Choice、结局和当前 Statement 通过 Runtime Event/State 与 Source Map 对齐。校园短故事两条路线已在生产浏览器中真实运行到正确结局，编译错误会关闭试玩而不会回退旧解释器。

这只是 N32-E3 Engineering 候选，不是 N32 完成。变量、调用栈、当前 IR/Statement 和结构化诊断已经可见；Entry、Scene 与 Statement 可构造合法 Fresh Run。仍没有 Step Back/Forward/Over、Run to Cursor、热更新、正式媒体 Effect Host 或与 Web Player 共用 Host。正式 Windows/Web/Android Player、构建、签名、安装与发布也尚未进入授权范围。

- 当前工程节点：**N32-E3 Engineering 本地候选；远端完整门待取得**；
- N21 真人：**0/1，pending-participant**；
- N23 真人：**0/2，pending-participants**；
- N30/N31：**Engineering 已有退出证据，Product Acceptance 未通过**；
- N32 Product Acceptance：**被阻断**；
- N40、M1 Stable、Public Release：**被阻断**；
- M1 纵向验收：**0/27 完整通过**；
- GitHub 集成：**N31 authority 在 Draft PR #51，未合入 `main`；N32-E1 为其下游开发分支**。

## 2. 当前真实能力

| 能力 | 当前可用 | 仍缺 |
|---|---|---|
| Project | Canonical 工程、新建/打开/最近、保存恢复、确定性 ZIP、无账户本地工作 | Android SAF、正式双端壳与设备验收 |
| Story | P0 语言、Writer 卡片、Script、基础 Flow、稳定 ID、Compiler IR/Source Map | N41 完整 Sequence、N40 专业 Route、N60 QA/Debugger |
| Preview | Entry 全流程经 Compiler→Runtime；Choice/Ending mapping；变量/栈/当前 IR/Statement/结构化诊断观察；Scene/Statement Fresh Run | 调试推进、保留上下文的任意位置启动、热更新、正式媒体 Host |
| Stage/Media | 16:9 默认预览、可调尺寸、真实 Blob、Canvas 2D、基础 BG/角色/音频和安全占位 | 正式 Runtime Effect 接入、复杂镜头/关键帧、Pixi/WebGL 与共享 Host |
| Runtime | VM-01–VM-15 正式 portable Runtime、State/History/Save/Back/Forward/调度/诊断 | Editor 控件产品化、Player 槽位、三端一致性 |
| Player/Build | N23 独立单文件 HTML 候选 | 正式 Web/PWA、Windows、APK/AAB、签名、安装、升级与发布材料 |
| Optimization | Dicing/资源分析原型与预算测试 | Optimization Center、平台变体、真机收益报告和包体闭环 |

## 3. N32-E1–E3 证据与差异

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
| E3 GitHub CI | Windows / Node 22 完整门绿色 | Draft PR 与 run/job 待取得 | 待远端裁决，E3 尚未关闭 |

## 4. 需求方向审计

方向没有偏离已冻结产品目标：正式 Compiler/Runtime 取代产品平行解释器，是后续专业 Debugger、路线状态、Save/Back/Forward、三端一致性和商业级 QA 的必要基础。现代化 UI、图形化编辑、强动效、多彩表达、16:9 默认预览及可调尺寸仍保留；E1 没有用新增视觉外壳替代执行一致性工作。

需要防止四类偏移：

1. 不得让旧 `playable-preview-runtime.ts` 重新成为 Editor 完整流程权威；
2. 不得把 Fresh Run 等同保留调用上下文/副作用的任意语句调试，AC-05 仍只能是实现中；
3. 不得用 jsdom 或代理浏览器替代 N21/N23 真人任务；
4. 不得因生产构建成功就宣称包体优化、正式 Player 或三端发布完成。

## 5. 下一步顺序

1. 取得 N32-E3 Draft PR 的 Windows / Node 22 完整门并关闭 Engineering 证据；
2. N32-E4：Continue、Step Over、Back/Forward、Run to Cursor 对接正式 History；
3. N32-E5：正式 Effect/Stage Host 与安全取消/Barrier；
4. N32-E6：热更新与结构变更重启策略；
5. N32 出口复审：Editor Preview 与未来 Web Player 固定输入 State/Outcome/画面关键快照一致。

每个切片继续执行：冻结目标 → 实现 → 自动化反例/正例 → 生产浏览器实际值 → 差异修正 → 文档/需求矩阵 → 全仓门 → 推送。任何真人或产品门仍按权威记录 fail closed。
