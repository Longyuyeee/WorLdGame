# N32-E3 从场景/语句 Fresh Run 审计

> 日期：2026-08-21
> 分支：`codex/n32-e3-run-from-target`
> 直接基线：N32-E2 最终证据头 `fe8f07950424cded107ffdeff492bbd74e3086f3`
> 授权：`RA-N21-004`，最大节点 N32
> 远端交付：Draft PR #54；实现头 `5a57385`；Windows / Node 22 run `32461345815` / job `96708731870`，4 分 16 秒绿色
> 当前判定：N32-E3 Engineering 通过；N32 Product Acceptance、N40、M1 与发布继续阻断

## 1. 冻结目标与语义

E3 只实现正式 Preview 从 Entry、Scene 或 Statement 启动。Scene 定位到该场景第一条 Compiler IR；Statement 通过 Statement Source Map 定位到精确 IR。三种入口都使用 **Fresh Run**：变量恢复 Canonical Project 默认值，调用栈为空，不伪造目标之前的事件、History 或执行副作用。

直接从 `return` 指令启动需要不存在的调用上下文，因此必须 fail closed，并返回 `PREVIEW_START_REQUIRES_CALL_CONTEXT`。不存在的场景/语句、空场景和无效 Source Map 也必须给出明确结构化原因。本步不包含 E4 的 Step Back/Forward/Over、Continue/Run to Cursor，不包含 Effect Host、热更新或共享 Player Host。

## 2. 实现与安全约束

- `FormalPreviewStartTarget` 将 `entry`、`scene`、`statement` 建模为显式判别联合，Preview State 保留本次启动目标；
- `startFormalPreview()` 先调用正式 Project Compiler，再构造全新的 Runtime State；只有目标解析和 State V1 校验均通过后才执行；
- Scene 使用编译后 IR 的第一条指令，Statement 使用编译后的 Source Map，不从 Writer 展示文本猜测位置；
- 从目标重新启动保持同一目标语义；退出后仍可改选场景/语句并重新 Fresh Run；
- UI 以紧凑、多彩、可降级动效的启动条表达“变量恢复默认值、调用栈为空”，避免把 Fresh Run 误解为保留现场的 Debug Continue；
- Entry 的既有双路线与结构化 Compiler/Runtime 诊断路径保持不变。

## 3. 固定向量

| 启动目标 | 预期首个 Runtime 位置 | 固定 State Hash |
|---|---|---|
| Scene `scn_broadcast_room` | `direction · stmt_radio_bg · #0` | `2658ce4949954097987d9bacd66895f32f8e6a95afb661b1d2bcff4fdaba1ef6` |
| Statement `stmt_rooftop_001` | `dialogue · stmt_rooftop_001 · #1` | `62babbde92a8ea5ef2ba6e4a46f3f34ce4bc4d928cd5040fc72d57e0f35c69e6` |

两个向量均从全新 State 开始，验证变量默认值与空调用栈；缺失 scene、缺失 statement 和直接 `return` 各有独立负例。

## 4. 预期—实际与修正

| 检查 | 预期 | 首次实际 | 修正/判定 |
|---|---|---|---|
| TypeScript 契约 | 启动目标属于 Preview State | `startTarget` 误放到 observation，产生 6 个类型错误 | 移回 `FormalPreviewState`，同一类型门通过 |
| Scene 固定向量 | 精确落到广播室首条 IR | 实际 Hash 为 `2658ce49…1ef6` | 核对 IR/Source Map/状态语义后冻结，位置正确 |
| Statement 固定向量 | 精确落到天台对白 | 实际 Hash 为 `62babbde…69e6` | 核对精确 Statement/IR 后冻结，位置正确 |
| UI 目标选择 | 测试通过稳定产品语义定位对白 | 初版用视觉文案查询，实际可访问名称为“选择对白：…” | 改用既有 `aria-label`，不耦合序号和装饰文本 |
| 既有 Entry 回归 | 原 5 秒等待不退化 | 高负载并行运行有 1 次测试超时 | 未提高 timeout；隔离复跑通过，完整回归随后通过 |
| 定向自动化 | 目标解析、负例与 UI 路径全绿 | 2 files / 9 tests，13.16 秒 | 通过 |
| 全仓普通回归 | 无功能回归 | 98 files / 595 tests，65.20 秒 | 通过 |
| 串行 storage conformance | 自动保存真实路径通过 | 1/1，通过；测试 5.30 秒、总计 10.09 秒 | 通过 |
| 生产构建 | 成功并报告体积 | CSS 75.57 kB / gzip 14.53 kB；JS 694.55 kB / gzip 199.03 kB | 通过；JS 较 E2 +2.50/+0.61 kB，>500 kB 拆包债保留 |
| 远端构建差异 | Windows / Node 22 与本地同量级 | CSS 75.57/14.53 kB；JS 694.76/199.07 kB，比本地 +0.21/+0.04 kB | 构建通过；记录环境产物差异，不把近似体积写成 bit-identical |

Architecture 为 85 portable / 4 adapters，requirements 为 50 requirements / 10 USP / 13 P0 / 27 AC / 6 owners，risk 当前节点为 N32 且唯一 active authorization 为 `RA-N21-004`；三门和 `git diff --check` 均通过。

## 5. 真实生产浏览器证据

使用本次 production build 在 `127.0.0.1:4173` 真实启动并操作，而非只依赖 jsdom：

- 启动条实际可见，显示 `Fresh Run / 变量恢复工程默认值 · 调用栈为空`，场景/语句两个入口均可操作；
- 从所选广播室 Scene 启动，实际为 `r1 / direction · stmt_radio_bg / scn_broadcast_room / stmt_radio_bg #0`；
- 从所选对白 Statement 启动，实际为 `r1 / dialogue · stmt_radio_001 / scn_broadcast_room / stmt_radio_001 #1`；
- 继续运行到结局后点击重新开始，实际仍回到同一 `stmt_radio_001 #1` Fresh Run 目标，而非错误回 Entry；
- 浏览器 console error 实际为 `[]`；启动条实际尺寸 352×48，三列 162/76/76 px，11 px 圆角，青色/紫色渐变。

真实结果与冻结语义一致，不需要产品行为降级。该自动浏览器证据不替代被授权记录明确要求的 N21/N23 真人参与者证据。

## 6. 出口条件

Draft PR #54 的实现头已通过 Windows / Node 22 `npm run check`：普通回归 98 files / 595 tests（79.52 秒），autosave 1/1（3.049 秒），VM conformance 1/1（65.34 秒），Runtime corpus 10,000 seeds / 20,000 replays / 40 chunks、32.593 秒、0 failed seeds、digest `20e9a842cd1e70b012d2307b37209f63192f4e463df7e15cf5beed8c5fc92ef2`。Typecheck、production builds、architecture、requirements、risk、delivery baseline 与性能门全部绿色，N32-E3 Engineering 出口满足。

最终证据文档头仍需通过同一远端完整门；该检查只确认审计更新没有破坏仓库门，不重复宣称实现头的功能证据。下一步为 N32-E4：把 Continue、Step Over、Back/Forward 与 Run to Cursor 接入正式 Runtime History，并继续用状态 Hash、结构化失败和真实产品入口验证。E3 不提升 N32 Product Acceptance，也不解除 N40、M1 Stable 与发布阻断。

> 2026-08-27 N51-E3 演进说明：上文保留 N32-E3 当时的固定向量。Canonical source identity 纳入正式 Gal settings defaults 后，现行 Scene/Statement State Hash 分别为 `67eda61ebbd7124de768a28a80c2306334b5c635f567cd29999b11bb889fccc4` 与 `04c2d20153d9552b1ff2549c2194b0a5f1ac753eb6b790872846bc3d607d0622`；精确目标、IR 位置和 Source Map 未改变。详见[审计 #225](225-n51-e3-project-settings-transaction-audit.md)。

> 2026-08-28 N51-E6a 演进说明：Settings schema v2 进入 source identity 后，现行 Scene/Statement State Hash 为 `20eff57b48d0e2ac119b23fa4b4c5c365d96176ecb9d804fab604e747f5937ed` / `fddad8773b88cda486c5669f289a0970857bd1c91a9fa5f7b814c0f52b735dd3`；精确目标和 IR 位置不变。详见[审计 #230](230-n51-e6a-settings-schema-v2-migration-audit.md)。
