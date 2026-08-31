# N52-E4d build-authored Player Stop Point source 审计

> 日期：2026-08-31
> 分支：`codex/n52-e4d-build-stop-point-source`
> 直接基线：E4 出口精确绿色头 `2e6704a167ef393614a0262374942bb8b5d10334`
> 判定：**E4d Engineering：完成**；E4 总出口、AC-15、N52 Product Acceptance 仍 blocked。

## 1. 目标、授权与需求对齐

E4 出口复审确认原始 Gal/PRD 要求“项目声明的 Stop Point 强制停止 Auto/Skip”，而真实 Shell 的 Auto 与 Skip 各自硬编码 `stopInstructionIds: []`。E4d 只补齐这一条 Source→Build→Shell 缺链。产品负责人在获知需要 N20 Story Language / N30 Compiler 第二个窄修订及唯一接续点后，再次明确要求进入后续步骤，并要求真实预期—实际测试、差异修正、文档、逐步审计和推送。因此 `RA-N21-011` 新增仅限 E4d 的修订：最大节点仍为 N52，不改 Runtime IR 1.1，不改 Save schema，不把 checkpoint、History checkpoint、scene ID 或数组下标冒充 Player Stop Point。

正式合同为作者在可呈现语句尾部写 `@stop()`；Projection 生成同一稳定 statement ID 上的 `playerStopPoint: true`；Compiler 生成独立版本化 `{schemaVersion:1, policyVersion:1, stopInstructionIds}`，非空时写入 `player-playback-policy.json`；Player Core 状态持有同一次正式编译产物；Shell 的 Auto 与 Skip 都读取 `state.artifacts.playerPlaybackPolicy.stopInstructionIds`，继续调用既有 N31 Scheduler。Runtime story IR 的 opcode、schema 和 `1.1.0` 版本均未变化，Save checkpoint 语义也未变化。

无 Stop Point 的项目不额外写 policy 文件，因此四个既有 golden build ID 和 story IR hash 保持稳定；内存 artifact 仍给出版本化空 policy，消费端不需要猜测或硬编码。

## 2. 真实预期—首次实际—修正

### 2.1 冻结失败基线

先只加入 Source、Compiler、Auto 和 Skip Read/All × Hold/Toggle 的新断言。冻结预期是新增链失败而原有行为通过。首次实际收集 `3 files / 84 tests`：`77 passed / 7 failed`。Source 实际缺 `playerStopPoint`；Compiler 实际缺 `playerPlaybackPolicy`；Auto 和四种 Skip 均无法保持 `stopPoint`，Skip All 实际到 `terminal/ended`。原有 77 项全绿，说明差异精确落在缺失桥。

第一次实现 Source projection、versioned build artifact 和 Shell 同源列表后，实际为 `81 passed / 3 failed`：所有路径已经报告 `stopPoint`，但三种 Skip 在 React effect 同一周期先排入下一次 0ms dispatch，随后越到 ending。这不是测试等待问题，而是正式 Shell 的停止竞态。修正为调度 effect 在当前 mode 已有非 `budget` stop reason 时同步退出并调用统一 `stopSkip()`，没有放宽 timeout、instruction budget 或断言。

最终同命令实际为 `3 files / 84 tests PASS`，总时长 `12.01s`。随后加入 Core 的 build artifact→Normal 等价断言，最终跨层回归为 `4 files / 104 tests PASS`，总时长 `52.61s`；`stopPoint` 路径与 Normal 单步的 `runtimeStateHash`、完整 History 相等。Source 格式化保留 `@stop()` 且正文不混入元数据；Compiler policy ID 为 `stop_line`、Runtime IR 仍为 1.1 narration；Auto 和四种 Skip 均在 B 停止且 ending 不出现。

## 3. cold production 1280×720

正式 Player workspace 由 Vite 8.2.1 production build 生成，`90 modules`，构建 `1.36s`。仓库提供 `?demo=stop` 的 production 证据入口，它使用正式 Canonical→Compiler→Player Core→Web Shell 路径，不修改 golden fixture。in-app production 浏览器实际结果：

| 路径 | 实际状态 |
|---|---|
| Auto | `presenting / history=2 / mode=auto / reason=stopPoint / auto=stopped / ending=false / overflow=0` |
| Toggle Skip Read | `presenting / history=2 / skipRead / toggle / stopPoint / ending=false` |
| Toggle Skip All | `presenting / history=2 / skipAll / toggle / stopPoint / ending=false` |
| Console | warn/error `0` |

首次自动化 Skip Read 点击落在 title→presenting 状态切换瞬间，按钮尚未真正激活，实际读取为 `mode=normal / reason=none / history=1`。等待正式 control 可交互后重试得到上表结果；该操作差异被保留，没有重复点击后只报告成功。Hold 两种已由真实 React pointerdown 测试覆盖；当前浏览器驱动的 click 会立即 pointerup，无法诚实保持按住跨过 0ms dispatch，因此本轮不伪造 Hold cold-production 证据。

## 4. 目标审计与剩余接续点

E4d 的五项冻结目标均已对齐：作者稳定声明、Compiler 精确 build identity、现有 Scheduler 消费、Auto 与四种 Skip 同边界、Shell 无空列表。实现没有引入第二套 Runtime/Scheduler，没有借用 Save checkpoint，也没有提升产品门。

E4 出口矩阵由 `完整 4 / 阻断 3` 更新为 `完整 5 / 阻断 2`。剩余阻断是正式 Player video renderer/视频 Skip policy 实证，以及 E4c 390×844 cold production 复验。下一唯一代码切片冻结为 **N52-E4e formal Player video renderer and skip policy evidence**；完成后仍须补手机证据并再次执行 E4 总出口审计，不能提前关闭 AC-15 或 Product Acceptance。

## 5. 退出门

本切片必须在机器审计、风险策略、定向测试、完整 `npm run check` 全绿后提交推送；推送后只接受该精确头的 Windows / Node 22 CI 作为远端结论。远端 run/job 和最终完整门统计待精确头产生后回填，不复用 E4 出口旧 run。

本机完整门首次执行在 E4d、N42 `15 files / 157 tests` 均通过后，于既有 Editor `App.test.tsx` 出现 `44/45`：唯一 same-command range keyboard/touch lane control 用例超过未改的 5 秒预算，实际 9.543 秒。该用例在同一代码、同一命令过滤条件下隔离复跑为 `1 passed / 44 skipped`，测试体 3.11 秒。它与本切片文件及 Player 路径无交集，因此不修改 Editor 产品代码或 timeout；该长尾作为首次实际保留，并要求重新运行完整门取得最终裁决。

第二次完整门中上述 Editor 文件先后两次均为 `45/45`，但随后 N43 workspace context 的真实 lease 释放探针读到 `held` 而非 `acquired`。同一 N43 文件隔离复跑为 `1/1 PASS`，测试体 5.79 秒。完成 cold production 的 Vite preview 随后正常停止，以减少本机并发占用；没有终止其他用户进程，没有修改 lease 语义、持久化代码或预算。该第二个环境长尾同样保留，并要求第三次从头执行完整门。

第三次 `npm run check` 从治理开始完整执行并退出码 0：普通回归 `154 files / 961 tests`；N50 `73/73`、N51 `118/118`、N52 History `85/85`；Runtime `61/61` 与 `10,000 seeds / 20,000 replay` 固定 digest；VM `5/5`（测试体 66.09 秒）；17 workspace production build 和 architecture 均通过。Script 性能 13/13；Route 10k 正式编辑链 P95 `121.55ms < 500ms`；Asset Dicing/Atlas/总计 `1107.09 / 1335.69 / 2442.78ms`，均在原预算内。前两次环境长尾未在第三次出现，且未通过修改产品代码、测试规模或预算来消除。
