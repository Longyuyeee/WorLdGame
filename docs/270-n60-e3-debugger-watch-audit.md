# N60-E3 Watch 与变量来源/变化审计

> 日期：2026-09-02  
> 分支：`codex/n60-e1-debugger-session`  
> 直接基线：N60-E2 换机交接头 `0c803ed7756e01333504388b354f2603bce4e0a3`  
> 状态：N60-E3 Engineering 已实现并完成本地真实路径证据；N60 总 Engineering、全部 Product Acceptance 与 N61 仍未完成

## 1. 开发目标与权威边界

E3 的用户结果限定为：创作者在正式调试会话中添加/移除 Watch，看到表达式当前值、类型、前后变化、依赖变量变化，以及 Compiler IR / Source Map 对应的变量写入语句；无效表达式给出明确错误但不破坏会话。

实现没有在 React 中建立第二套表达式解释器：

- Story Language 的 `parseTypedExpression` 是唯一语法与类型解析入口；
- Runtime 新增只读 `evaluateRuntimeExpressionV1`，并让正式 `set/condition` 执行也调用该公开入口，因此执行与观察共享原有 evaluator；
- Runtime History checkpoint 提供真实当前/上一可观察状态；
- Compiler IR 的 `set` 指令和 Source Map 提供稳定的变量写入来源。

这里的“来源”诚实定义为静态写入来源集合，不猜测运行时最后写入者；“变化”来自正式 History 前后状态。Watch 最多 32 项、单项 256 字符、去空白后去重，当前仅为调试工作区会话状态，不宣称跨工作区重开持久化。

## 2. 预期—首次实际—修正后实际

| 真实路径 | 预期 | 首次实际 | 修正后实际 |
|---|---|---|---|
| E3 产品红测 | 真实 App 中可以输入 Watch | `0/1`，精确失败为找不到可访问文本框“Watch 表达式” | Watch 添加、求值、变化、来源、错误和移除路径通过 |
| Runtime 只读求值 | 与正式执行共用 evaluator，且不修改变量 | 旧 Runtime 只有私有 `evaluate`，产品层无法合法复用 | 新只读 API 返回 typed scalar/结构化错误；正式 `set/condition` 同样改走该 API；输入变量保持不变 |
| Watch 值与变化 | 初始 `score + 1 = 1`，执行 `score = score + 1` 后为 `2` | E1/E2 只有变量快照，没有表达式结果或前后差异 | App 自动化显示 `1 → 2`，依赖 `score` 显示 `0 → 1` |
| 来源定位 | 显示稳定 Scene/Statement 写入来源 | E1/E2 没有变量写入来源 | Compiler IR + Source Map 返回 `scn_watch / stmt_score_set`；production 示例为 `scn_school_gate / stmt_ui_1` |
| 非法表达式 | 明确错误且会话继续 | 无 Watch 路径 | `missing + 1` 显示 `Unknown variable: missing`，Runtime 状态仍为 `presenting` |
| production 数据类型 | 新建 number 变量后正式 Runtime 可启动 | 新插入 set 默认表达式实际为 `true`，Runtime 正确报 `Set expression type boolean does not match number` | 将真实语句改为 `1` 后启动成功；该差异不是用测试夹具绕过 |
| production desktop | 真实示例工程完成 Watch 单步且不横溢出 | 无 E3 UI | 1440×900 document `1440/1440`；Watch 初值 `1`、单步后 `2`、变量 `0 → 1`、来源 stable ID 正确 |
| production mobile | 390×844 无横溢出，新增交互至少 44px | 无 E3 UI | 请求 390×844、实际根宽 `375/375`；输入与添加按钮 `44px`，移除按钮 `44px`，Watch 容器位于根宽内 |
| 控制台 | 真实交互无未处理错误 | 无 E3 路径 | production browser `0 error` |

production 验证运行 production build，并在真实校园示例工程中从项目结构新增 number 变量、在 Sequence 插入并修正 set、进入 Debug & QA、从入口启动、添加 Watch、单步、添加非法 Watch。它不是静态截图或只检查元素存在。

## 3. 自动化与本地门

- `n60-debugger-watch-app.test.tsx` 从真实 App 入口覆盖添加、值/类型、单步变化、stable source、无效表达式和移除；
- `runtime.test.ts` 证明公开只读 evaluator 与正式 Runtime 共享，并验证缺失变量错误和输入不变；
- `audit:n60-debugger-session` 已纳入 Runtime、E1/E2/E3 App、formal preview、QA model 与既有 Debug & QA 回归；当前结果为 `7 files / 87 tests`；
- TypeScript build graph、50 项 requirements、risk acceptance 与 governance `3 files / 23 tests` 均通过；
- 完整 `npm run check` 在通过治理、Compiler/Runtime、N41/N42/N43、N50/N51/N52/N60、TypeScript、普通回归 `157 files / 985 tests` 和 Editor 主 App `45/45` 后，被既有 autosave 恢复的冻结 5 秒门阻断：预期 `已恢复 · s3`，实际测试体 `18.38s` 仍未出现；两次独立进程原命令复跑仍为 `16.65s`、`21.30s`，没有提高 timeout；
- 被早停跳过的固定 VM 10k 同样在原 90 秒预算下为 `119.409s`，保持红色；没有减少 corpus、改变 digest 或放宽门；
- 其余后半段已按原脚本补跑：17 个 workspace production build、architecture、Script `13/13`、Route `9/9`、Asset `4/4` 全部通过；Route 10k 编辑 P95 `393.83ms < 500ms`，Asset Dicing 总计 `4839.99ms < 5000ms`；Editor 产物 CSS `146.69/26.02 kB`、JS `1005.20/280.96 kB`，既有 >500 kB 拆包债保留；
- 因 autosave 与 VM 两个本机冻结门失败，本机完整门诚实记红；精确提交头 Windows CI 必须在相同预算下独立裁决，不跨提交复用旧绿色。

精确实现头 `9d5d597e16ff98268cb228a07fabe70e4c699ba1` 随后由 Windows / Node 22 run `33580208407` / job `100092698639` 在 `10m17s` 内完整通过。相同预算下 autosave 实际 `2.312s < 5s`、冻结 VM 10k `40.656s < 90s`，关闭本机连续红点的环境差异；N60 `7 files / 87 tests`、普通回归 `157 files / 985 tests`、Runtime corpus `17.991s`、Route 10k 编辑 P95 `89.33ms < 500ms`、Asset Dicing 总计 `2963.54ms < 5000ms` 均为绿色。追加本段的文档头仍需自己的 CI，不跨提交复用实现头结论。

## 4. 需求与开发目标审计

E3 继续服务创作者的可观察调试任务，而不是把验证、安全或治理本身作为主要产物。它补足 Gal 5.3“按步骤查看变量变化”，并让 `USP-03`、`REQ-QA`、`AC-05` 的正式 Debugger 主干增加 Watch 与变量写入来源；这些条目仍保持“实现中”。

不能提前宣称：

- 静态写入来源集合不等于运行时 last-writer provenance；
- 当前没有可导出的步骤日志、完整 QA 报告与 QA Golden 产品路径；
- PRD 3.10 P0 的不可达、缺少出口、悬空跳转、缺失资源和无交互死循环虽已有 N30 Compiler 能力，但尚未形成 N60 完整产品闭环；
- 结局可达性 Solver、分支覆盖率、变量读写图属于 PRD P1，不应抢在剩余 P0 之前；
- N21/N23 真人仍为 `0/1`、`0/2`，N60 Product Acceptance、N61、M1 Stable 与发布继续阻断。

## 5. 精确接续点：N60-E4 P0 Story QA 产品闭环

下一切片应先关闭 PRD 3.10 P0，而不是直接进入 P1 Solver。冻结为：在 Debug & QA 中以当前 Canonical Project 运行正式 Compiler QA，集中呈现不可达、缺少出口、悬空跳转、缺失资源、无交互死循环，支持过滤、明确阻断级别并点击返回 stable Scene/Statement；用一个真实 QA Golden 工程验证预置错误全部检出、正常路线无误报阻断。

E4 仍须按以下顺序执行：冻结用户任务和每类诊断的可观察预期 → 真实 App 红测取得首次实际 → 复用 N30 diagnostics/Source Map 实现纵向路径 → production desktop/mobile 运行真实错误工程 → 按差异修正 → 更新需求与状态文档 → 完整门、提交、推送、等待精确 head Windows CI。

完成 P0 QA 产品闭环后，再单独评估 P1 的结局可达性 Solver、分支覆盖率、变量读写图和步骤日志，不把它们混入 E4。
