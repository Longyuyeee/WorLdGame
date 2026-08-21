# N32-E4 Preview 调试控制审计

> 日期：2026-08-21
> 分支：`codex/n32-e4-preview-debug-controls`
> 直接基线：N32-E3 最终证据头 `f5ae68cb3c382f2e4cfb27f6b9b38ac5ccc64c24`
> 授权：`RA-N21-004`，最大节点 N32
> 远端交付：Draft PR #55；实现头 `e50c489`；Windows / Node 22 run `32464584207` / job `96718382563`，4 分 15 秒绿色
> 当前判定：N32-E4 Engineering 通过；N32 Product Acceptance、N40、M1 与发布继续阻断

## 1. 冻结目标与边界

E4 把 Editor Preview 的 Continue、Step Over、Back、Forward 与 Run to Cursor 接到正式 `@world-studio/runtime` History/Scheduler，不另建平行解释器。Continue 提交一个可观察 Runtime 边界；Back/Forward 导航已验证 checkpoint；Step Over 以开始时调用栈深度为边界，不停在更深子调用帧；Run to Cursor 在目标指令**执行前**暂停，可精确停在 label/set/call 等内部指令。

Run to Cursor 穿越到未满足的 Choice、awaited Effect、Barrier、资源或终局时必须保留可继续 Session 并给出明确阻断；每次 Run to Cursor 和 Step Over 均有 10,000 指令/边界安全上限。Back/Forward 返回 reconciliation plan，但实际 Effect 补偿/重放属于 E5；本步只在存在操作时提示 Host 协调，不能宣称媒体舞台已经回退。

## 2. 正式状态模型

- `FormalPreviewState` 同时持有 Runtime State、History Session、Scheduler Session 和最近 reconciliation plan；
- Fresh Run 在首条执行前建立 History checkpoint，所有可观察事件通过 Scheduler/History 原子提交；
- Run to Cursor 以 `instantInstructionBudget=1` 推进 Scheduler transient working State，在目标执行前暂停；临时位置不会伪造成 History checkpoint；
- 从临时光标 Back 第一次只丢弃 transient 并恢复最近 checkpoint，再次 Back 才移动 History；临时位置没有 Forward；
- rewound Choice 选择同一路线显式 Forward；改选其他路线使用新 input ID 原子截断 future，并保留旧 input tombstone；
- 访问过的场景/语句从 active History 前缀重新投影，Back 后不继续显示未来节点；
- `RUNTIME_BARRIER_BLOCKED`、History 损坏、Scheduler/State 不一致和安全上限均 fail closed 或形成非破坏控制诊断。

## 3. 固定向量与自动化

| 向量 | 冻结结果 |
|---|---|
| direction → dialogue 1 → dialogue 2 → Back → Forward | Forward State 与原第三 checkpoint Hash 完全一致 |
| 三步 History Session | `ffcbb64fbbac59f31161b0c00c457c8b2445e954be851665a02a74b7b8aa6594` |
| Run to visible `stmt_gate_choice` | 执行前 `paused`，h3/3；Continue 后 `waiting-choice`，h4/4 |
| Run to internal label | `paused`、`currentEvent=null`、Source Map 精确 label、transient=true |
| Step Over call | 访问 nested 事件但最终停在 caller 的 `stmt_after`，调用栈为空 |
| Choice fork | 广播 future 被天台路线原子替换，cursor=length、1 个 tombstone、无 Forward |

定向最终为 2 files / 14 tests；全仓普通回归为 98 files / 600 tests；串行 storage conformance 1/1，autosave 实际 5.18 秒。Typecheck、Architecture（85 portable / 4 adapters）、requirements（50 / 10 USP / 13 P0 / 27 AC / 6 owners）、workspace、risk 与 PR traceability 均通过。

## 4. 预期—实际与修正

| 检查 | 预期 | 首次实际 | 修正/判定 |
|---|---|---|---|
| Optional 状态清理 | Back 后不存在旧 ending/error | 用 `undefined` 清理触发 exact optional 类型错误 | 改为真正移除旧可选字段，类型门通过 |
| 既有产品测试 | 新控制入口保持流程可操作 | 旧测试仍查找“继续剧情” | 改用统一 `Continue` 可访问名称，不保留重复入口 |
| Run to Cursor | 在目标执行前暂停 | 初始测试误期望目标已执行、h3/3 | 实际为 `stmt_gate_002` 待执行、h2/2；修正错误测试预期 |
| Choice 光标 | Continue 前不创建输入边界 | 初始测试误期望 `waiting-choice` | 实际 paused h3/3；Continue 后才 waiting-choice h4/4，符合冻结语义 |
| transient Back | 一次回最近 checkpoint，二次移动 History | 实际第一步 h2/2、第二步 h1/2 | 明确写入契约与 UI 测试 |
| reconciliation 文案 | 仅存在 Effect 操作时提示 Host | 无补偿/重放也显示“需要 Host 协调” | 按操作数区分，实际显示 `back · checkpoint 已恢复` |
| Production preview 启动 | 运行已构建 dist | editor workspace 没有 `preview` npm 别名 | 使用仓库已安装的 `vite preview` 服务同一 dist；不退回 dev server |
| 生产构建 | 成功并报告体积 | CSS 76.97/14.73 kB；JS 721.30/205.42 kB | 通过；较 E3 远端约 +26.54/+6.35 kB，>500 kB 拆包债扩大并保留 |

## 5. 真实 production browser 证据

在 `127.0.0.1:4173` 打开本次 production build，经真实项目首页 → 示例工程 → 项目结构 → 内容编辑器操作：

- 首个方向事件为 r1、h1/1、`stmt_gate_bg #0`；
- 选择 `stmt_gate_002` 后 Run to Cursor 实际为 r2、h2/2、`光标临时状态`，Forward 禁用；
- 第一次 Back 恢复 `stmt_gate_001` h2/2，第二次 Back 到 `stmt_gate_bg` h1/2，Forward 再恢复 `stmt_gate_001` h2/2；
- Run to Choice 实际 paused h3/3，Continue 后 waiting-choice h4/4，两个产品 Choice 按钮可用；
- 选择广播室得到 h5/5，Back 到 Choice h4/5 后改选天台，实际为 `stmt_rooftop_bg` h5/5；
- 无操作 reconciliation 复验实际显示 `back · checkpoint 已恢复`；
- 控制条实际 352×46 px、11 px 圆角、六列 grid，多彩渐变，console 实际为 `[]`。

自动生产浏览器验证不替代 N21/N23 权威记录要求的真人参与者证据。

## 6. 出口条件与下一步

Draft PR #55 的实现头已通过 Windows / Node 22 完整 `npm run check`：普通回归 98 files / 600 tests；autosave 1/1，实际 2.961 秒；Runtime corpus 10,000 seeds / 20,000 replays / 40 chunks、30.334 秒、0 failed seeds、digest `20e9a842cd1e70b012d2307b37209f63192f4e463df7e15cf5beed8c5fc92ef2`。远端 production build 与本地实际相同：CSS 76.97/14.73 kB，JS 721.30/205.42 kB；typecheck、architecture、requirements、risk、workspace、delivery、Script/Asset 性能门均绿色，E4 Engineering 出口满足。

最终证据文档头仍需通过同一远端完整门；该检查只确认文档更新未破坏仓库门，不重复宣称实现证据。下一步是 N32-E5：正式 Effect/Stage Host、补偿/重放、安全取消和 Barrier 产品呈现。E4 不提升 N32 Product Acceptance，不解除 N40、M1 Stable 或发布阻断；JS 拆包债必须继续进入后续性能/架构审计，不能因功能正确而消失。
