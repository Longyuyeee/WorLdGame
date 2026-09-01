# N60-E1 正式调试会话与开发节奏纠偏审计

> 日期：2026-09-01  
> 分支：`codex/n60-e1-debugger-session`  
> 基线：N52 main-target 集成候选头 `6ad912e02843c080f5c482dd4a075110e96a3cfd`  
> 状态：N60-E1 Engineering 已实现并完成本地证据；N60 总 Engineering、全部 Product Acceptance 与 N61 仍未完成

## 1. 本轮产品决定

产品负责人取消了刚开始的 T01 探索操作，明确要求当前不要记录该操作、不要记录操作时间，也不要在功能和整体 UI 尚未完成时过早接入真人。仓库因此没有生成 T01 完成证据或计时数据；N21/N23 仍分别真实保持 `0/1` 与 `0/2`。

N21-HV-01 同步改为“任务结果与实际摩擦”模型：未来真人阶段记录任务是否完成、阻塞、误操作、求助、保存重开和产物，不再把 20 分钟或任何操作时长当作通过代理。自动化与开发者操作仍不能冒充真人验收。

RA-N21-011 只扩展到 N60 Debugger / Story QA Engineering，持续阻断 N60 Product Acceptance、N61 Engineering、M1 Stable 与发布。

## 2. 需求与真实代码断点

PRD 3.10 要求从入口、场景或语句运行，支持断点、单步、继续，并观察当前位置、变量、调用栈和可见对象；Story QA 还要求不可达、无出口、悬空跳转、缺失资源和非交互循环等问题可回到源码。

实现前的真实代码并非空白：

- `formal-preview-runtime.ts` 已把 Canonical Project 交给正式 Compiler、Runtime、Runtime History、Runtime Host 与 Source Map，并已有 Entry/Scene/Statement、Advance、Step Over、Back/Forward、Run to Statement；
- `DebugQaWorkspace.tsx` 已能运行 Compiler/Runtime 正式检查并把诊断返回 Sequence；
- 但工作区没有可见调试会话、启动按钮、断点、调试控制和观察器，用户只能执行一次 QA 检查。

因此 E1 不创建第二套解释器或调试状态，而是把已有正式运行链产品化。

## 3. E1 实现

- 在 Debug & QA 工作区增加“从入口启动”和“从当前语句启动”；现有正式 API 也继续支持场景入口；
- 当前选中稳定 statement 可设置单个断点；Continue 使用正式 `runFormalPreviewToStatement` 到达并暂停；
- 增加 Step Back、Step Forward、Step、Step Over 与 Continue；历史游标仍由 Runtime History 所有；
- 展示状态、当前 Scene/Statement、Opcode、State Revision、逻辑时间、History 游标和断点；
- 展示正式 Runtime 变量、调用栈，以及 Runtime Host 活动通道/最近操作；
- 保留既有 QA 诊断筛选和返回 Sequence 源位置，不复制 Compiler 诊断。

## 4. 预期—首次实际—修正后实际

| 路径 | 预期 | 首次实际 | 修正后实际 |
|---|---|---|---|
| 新产品路径红测 | 当前语句启动、五个调试控制、三类观察器、断点 Continue 可见且工作 | `0/1`；精确失败为找不到“从当前语句启动”按钮 | 新测试通过；与既有 Debug QA 回归合计 `3 files / 4 tests` |
| 当前语句启动 | 从 `stmt_gate_bg` Fresh Run，位置可见 | 实现前无产品入口 | production browser 为 `scn_school_gate / stmt_gate_bg`，状态 `presenting` |
| 断点 Continue | 从 Entry 继续到选中 statement 并暂停 | 实现前无断点 | 状态 `paused`，位置仍为 `stmt_gate_bg` |
| History 单步 | Step 到下一 statement，Back 回原 statement | 实现前无 UI | `stmt_gate_bg → stmt_gate_001 → stmt_gate_bg` |
| Desktop UI | 调试区不横溢出，控制可操作 | 无调试区 | 1440×900：document/debugger overflow 均 `0`，控件最小高度 `40px` |
| Mobile UI | 调试区单列、触控按钮至少 44px、页面无横溢出 | 第一次调试区 overflow `0`、按钮 `44px`，但旧 workspace header 使 document overflow `10px`；首次修正后按根 clientWidth 重测实际为 `25px` | 追到 header 的 `114px + 264px` 固定列后，在 420px 以下收为单列；390×844 实际 client/scroll 均 `375`、overflow `0`、调试按钮最小 `44px`、console error `0` |
| 治理回归 | 当前 N60 授权通过，历史 N52 审计继续可复验 | 风险审计通过；旧 N52 checkpoint 审计因硬编码“N60 Engineering 必须阻断”而失败；首次用普通 Vitest 配置运行治理测试又得到“未发现测试文件” | 历史审计兼容 N52/N60 当前节点，正确 governance 配置 `3 files / 23 tests`、两个 N52 历史审计均 PASS |
| 本机完整门 | 不改既有 5 秒预算，仓库全链通过 | 首轮在 N41 Sequence 聚合第 1 个用例 `5030ms` 超时；单文件复跑时原用例通过、另一个用例因 transform/import 约 31 秒的主机负载在 `5953ms` 超时 | 未改 timeout；同一单文件再次冷复跑 `2/2`。第二轮完整门的 N41 聚合 `49/49`、首个 App `45/45` 已通过，随后 N42 再次运行同一 App 时两个既有 Stage 用例分别在 `5955ms`、`20376ms` 超时。功能断言没有稳定失败，完整本机门仍记红并交由干净 Windows CI 裁决 |
| Windows CI 首轮 | 完整门识别当前 N60 授权，同时保留 N52 历史合同 | run `33485571617` / job `99784733897` 在 `4m36s` 明确失败：`audit:n52-e4d-build-stop-point-source` 仍要求 active authority 最大节点精确等于 N52 | 只放宽历史审计对当前 registry 的读取为 `N52` 或有界 `N60`，没有修改 E4d 历史合同、功能或通过证据；E4d→E5b 与 N60 定向审计本地全部 PASS，推送后由新 head CI 重跑 |

生产浏览器测试运行的是 production build 和真实示例工程，不是静态截图或仅 jsdom 代理。移动端溢出差异没有通过扩大 viewport、隐藏根滚动或放宽触控标准处理，而是修正真正超宽的 header/navigation 布局。

## 5. 需求状态与未完成边界

E1 关闭的是“正式调试会话核心入口和观察面”，不是 N60 总出口：

- `USP-03`、`REQ-QA`、`AC-05` 仍为“实现中”；
- E1 只有当前稳定 statement 的单断点，尚无多断点列表、启停和持久化；
- Continue 目前在输入、Effect/Barrier、Ending、Error 等真实边界停下，但 Choice/Effect 的调试交互与明确原因呈现仍需产品化；
- Watch 表达式、变量来源/变化、路线 Solver、覆盖率和完整 QA 报告尚未完成；
- Compiler 已有不可达、无出口、悬空、缺失资源和非交互循环诊断，但 N60 仍需把这些组织成可筛选、可解释、可修复的 Story QA 产品流程；
- 正式 Windows/Android Host、实体设备和真人 Product Acceptance 均未完成。

## 6. 精确接续点

下一切片为 **N60-E2 断点集合与运行边界产品化**：在不改变 Runtime 权威的前提下，实现多断点列表、启停/移除、当前位置与命中原因；把 Choice、awaited Effect、Barrier、Ending 和 Error 的 Continue 停止原因明确呈现，并从停止点稳定返回 Source。随后再进入 Watch/变量来源和 Story Solver/QA 报告。

每个切片继续执行：冻结用户任务与预期 → 用当前真实路径取得首次实际 → 修正差异 → production desktop/mobile 验证 → 更新文档与需求矩阵 → 完整门与 Windows CI → 推送。真人阶段延后到功能与整体 UI 整理完成之后，届时按任务结果审查，而不是按操作时间审查。
