# N60-E2 断点集合与运行边界审计

> 日期：2026-09-01  
> 分支：`codex/n60-e1-debugger-session`  
> 直接基线：N60-E1 证据头 `be444f7`  
> 状态：N60-E2 Engineering 已实现并完成本地真实路径证据；N60 总 Engineering、全部 Product Acceptance 与 N61 仍未完成

## 1. 开发目标与边界

E2 接续 [N60-E1](267-n60-e1-debugger-session-audit.md) 的正式调试会话，目标限定为：多断点新增、启停、定位和移除；Continue 命中下一启用断点；明确呈现 Breakpoint、Choice、awaited Effect、Barrier、Ending、Error 停止原因；从停止点返回同一 stable Scene/Statement 源码。

本轮没有创建第二套解释器、Source Map 或 History。断点只保存稳定 Scene/Statement ID 和启用状态；继续运行仍由 `formal-preview-runtime.ts` 驱动正式 Compiler、Runtime、Runtime History、Runtime Host 与 Source Map。断点持久化、Watch、Solver、覆盖率和完整 QA 报告不属于 E2。

产品负责人已明确真人验收应等功能与整体 UI 完成后再介入，本轮没有记录用户操作或操作时间，也没有把开发者自动化冒充真人证据。

## 2. 预期—首次实际—修正后实际

| 真实路径 | 预期 | 首次实际 | 修正后实际 |
|---|---|---|---|
| 产品红测 | 在真实 App 的 Debug & QA 增加选择语句断点 | `0/1`，精确失败为找不到“添加选择语句断点” | 断点产品路径与 E1 回归通过 |
| 多断点 | 同时保存 `stmt_gate_bg` 与运行位置 `stmt_gate_001`，可独立启停/移除 | E1 只能保存一个当前断点 | production 示例工程显示 `2 total`；停用 bg 后为 `1 active`，定位和移除均按 stable ID 工作 |
| Continue | 从入口越过停用 bg，命中启用的 `stmt_gate_001` | 初版产品测试通过，但正式 Runtime 扩展测试第二次 Continue 预期到 Choice、实际再次停在 `stmt_gate_001` | 修正 transient position 下错误消费 History Forward、恢复时重测当前事件的问题；第二次 Continue 到 `waiting-choice / stmt_gate_choice` |
| 运行边界 | Choice、awaited Effect、Barrier、Ending、Error 都有明确原因和实际细节 | E1 仅有 Runtime status，未形成停止原因产品层 | 用真实 Compiler/Runtime 状态构造五类边界，精确投影 Choice prompt、Effect descriptor/awaitMode、Barrier reason、ending name 与 error diagnostic；断点为第六类原因 |
| 源码返回 | 停止位置返回同一 stable ID | E1 只有既有 QA finding 定位 | stop reason 面板直接以当前 Scene/Statement 调用同一 Sequence 源码入口 |
| Desktop production | 新 UI 无横向溢出 | 无 E2 UI | 1440×900 document `1440/1440`，overflow `0`；停止原因面板 `1301/1301` |
| Mobile production | 390×844 无横向溢出，E2 操作至少 44px | 无 E2 UI | 请求 390×844、实际根宽 375；document `375/375`、overflow `0`；新增断点、Continue、源码返回、启停/定位/移除均为 `44px` |
| 本机完整门 | 沿用既有 90 秒 VM 预算，全链通过 | 普通回归 `156 files / 984 tests`、N60 `5 files / 22 tests`、构建/架构/Script/Route/Asset 均通过；但 VM 10k 长链实际 `94.671s > 90s`，完整门停止 | 不改预算；同命令隔离复跑仍为 `96.507s > 90s`，故本机完整门诚实记红，交由干净 Windows CI 裁决 |

生产测试运行 production build 与真实校园示例工程：新增两个断点、停用首个、重新启动、Continue 命中 `stmt_gate_001`，再 Continue 到 `waiting-choice`，提示为“先去哪里调查？”。这不是静态截图或只检查 DOM 是否存在。

## 3. 自动化与代码审计

- `n60-debugger-breakpoints-app.test.tsx` 从真实 App 入口执行两断点、启停、继续、移除和 Choice 边界；
- `formal-preview-runtime.test.ts` 证明 Continue 不重复命中恢复点，并用正式状态覆盖六类停止原因；
- `n60-debugger-session-app.test.tsx` 保留 E1 启动、单步、历史与观察器回归；
- 定向结果：`3 files / 19 tests`，TypeScript build graph 通过；
- `audit:n60-debugger-session` 已纳入正式 Runtime、E1/E2 App、QA model 与既有 Debug & QA 回归，避免只跑新增正例。

被完整门早停跳过的后半段已按原脚本补跑：17 个 workspace production build、architecture、Script `13/13`、Route `9/9` 与 Asset `4/4` 全部通过；Route 10k 编辑 P95 `170.46ms < 500ms`，Asset Dicing 总计 `4089.05ms < 5000ms`。这不能把完整门改记为绿色，最终裁决仍需要精确提交头的 Windows CI。

实现中还出现一次 TypeScript 实际差异：循环内 `current.program` 可能为空。修正为进入 Continue 前捕获已验证的 `program` 与 `sourceMap`，没有使用非空断言掩盖状态变化。

## 4. 需求对齐与完成审计

PRD 3.10 的“任意入口运行、断点、单步、继续、当前位置/变量/栈/可见对象、QA 源码定位”已由 E1/E2 形成可操作主干。E2 没有把验证、安全或治理本身当成交付目标：主要产物是用户可见的多断点与运行边界，测试和文档只验证该产品路径。

状态仍须 fail closed：

- `USP-03`、`REQ-QA`、`AC-05` 保持“实现中”，因为 Watch/变量来源、Solver、覆盖率、完整 QA 报告、目标宿主与产品验收尚缺；
- 断点当前是调试会话内状态，不宣称跨重开持久化；
- N21/N23 真人保持 `0/1`、`0/2`；N60 Product Acceptance、N61、M1 Stable 和发布继续阻断。

## 5. 精确接续点

下一切片为 **N60-E3 Watch 与变量来源/变化**：基于正式 Runtime observation 和 Source Map，让用户添加/移除 Watch，显示表达式结果、类型、错误、变量来源 statement 与前后变化；不得复制 Runtime 求值器。完成 E3 后再进入 Story Solver、覆盖率和完整 QA 报告。

后续每个切片继续执行：冻结用户任务与预期 → 真实路径取得首次实际 → 按差异修正 → production desktop/mobile 复验 → 更新文档与需求矩阵 → 完整门与 Windows CI → 提交推送。真人阶段继续延后，且不使用操作时间作为通过代理。
