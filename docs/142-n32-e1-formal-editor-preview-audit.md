# N32-E1 正式 Editor Preview 审计

> 日期：2026-08-21
> 分支：`codex/n32-e1-formal-preview-runtime`
> 直接基线：N31 Authoritative 头 `143c05f1d1fcf84844a5f3122e217e4283afd15b`
> 授权：`RA-N21-004`，最大节点 N32
> 远端交付：Draft PR #52；纠偏实现头 `b89a48e23be62dfced8d6b53275d2f6ef72ed0f0` 的 Windows / Node 22 run `32457615078` / job `96697835514`，4 分 8 秒绿色
> 当前判定：E1 Engineering 通过；[Runtime corpus 稳定性纠偏](143-n32-e1-runtime-corpus-stability-audit.md)已关闭；N32 Product Acceptance、N40、M1 和发布继续阻断

## 1. 本步目标与冻结范围

本步只替换 Editor 的“完整流程试玩”执行内核：Canonical Project 必须先经 N30 Project Compiler 产生 Runtime IR 和 Source Map，再由 N31 Runtime 推进。Choice、结局、变量、调用栈及源码位置以 Runtime State/Event/Source Map 为权威，不允许编译失败时退回旧的 `StoryStatement` 解释器。

E1 不包含 Run from Scene/Statement、Step Back/Forward/Over、变量与调用栈检查器、热更新、正式媒体 Effect Host 或 Web Player 共用 Host；这些仍属于 N32 E2+。

## 2. 实现结果

- 新增 `formal-preview-runtime.ts`，建立 compile → create state → run → source map 的 fail-closed Preview Session；
- `App.tsx` 的完整流程试玩不再导入或调用 `playable-preview-runtime.ts`；旧模块仅作为 N23 独立 HTML 历史链与回归测试保留；
- Editor 明确声明对 `@world-studio/project-compiler` 与 `@world-studio/runtime` 的依赖，并同步 workspace 边界；
- 默认校园项目的三条旧式演出描述迁移为 `action=clear`，保证默认产品输入可正式编译；旧式描述能力改由显式 legacy fixture 测试，不删除兼容测试；
- `currentDeliveryNode` 更新为 N32，风险审计仍强制 `RA-N21-004.maximumDeliveryNode=N32` 以及所有产品/后续节点阻断项。

## 3. 预期—实际差异与纠偏

| 检查 | 冻结预期 | 首次实际 | 纠偏 | 最终实际 |
|---|---|---|---|---|
| 双路线确定状态 | 两条路线产生固定 State Hash | 测试先以占位 Hash 故意失败并采集实际 Hash | 审核路线/结局/Source Map 后冻结真实 Hash | 广播室 `7cbc2296…7909b`；天台 `72def5ef…0353` |
| TypeScript | 全工作区无类型错误 | Choice pending state 报 4 个 possibly undefined | 将缺失值显式归一为 `null` 后再收窄 | `npm run typecheck` 通过 |
| 新默认与旧兼容 | 默认可编译，旧迁移能力仍受测 | 默认改为类型化命令后 7 个 legacy UI 用例失败；全仓又发现 2 个 Source Session 断言仍假定旧默认 | 7 个 UI 用例自行注入旧式项目；2 个 Session 用例改为验证合法 `action=set` 和新默认的无损复制，不删除断言 | 定向 `4 files / 40 tests`、Session `14/14`、普通全仓 `98 files / 590 tests` 通过 |
| 编译错误 | 不回退平行解释器 | 缺失 label 项目返回 `MISSING_LABEL` | 无需修正 | fail closed 通过 |
| 生产浏览器双路线 | Entry→Choice→两个 Ending，控制台 0 error | 与预期一致 | 无需修正 | Choice 前 3 次 Continue；分支后各 2 次；两个结局正确；0 error |
| Runtime 10k 性能 | 冻结 10,000 seeds / 20,000 replays / 40 chunks / 原 digest，单 shard ≤90 秒 | 单进程在本机与 CI 出现 90.612–180.332 秒波动 | 不放宽门、不减 corpus；消除重复 canonical 工作并四进程分片、父进程完整汇总 | Windows / Node 22 总墙钟 30.868 秒，shard 26.558–27.107 秒，原 digest；通过 |
| Editor 用例时限 | 默认单用例 ≤5 秒 | 紧接 10k 重型门后一次 6.647 秒超时 | 不放宽时限；隔离复跑 | 3.06 秒完成文件内 2/2，通过；登记为瞬时资源争用 |
| Editor 生产包 | 构建成功且如实报告体积 | JS 682.24 kB，gzip 196.33 kB，仍有 >500 kB warning | 本步不以拆包扩大范围 | 构建通过；体积优化债保留给后续性能切片 |

## 4. 真实测试证据

- 定向：`npm run typecheck`；`npx vitest run apps/editor/src/formal-preview-runtime.test.ts apps/editor/src/playable-preview-app.test.tsx apps/editor/src/playable-preview-runtime.test.ts apps/editor/src/App.test.tsx --maxWorkers=1` → `4 files / 40 tests`；
- 架构与治理：workspace、architecture、risk acceptance、requirements 审计全部 PASS；当前节点 N32，唯一 active 例外为 RA-N21-004；
- 生产构建：`npm run build --workspace @world-studio/editor` → 122 modules，JS 682.24 kB / gzip 196.33 kB；
- 生产浏览器：Vite production preview `http://127.0.0.1:4173/`，真实打开示例工程并进入内容编辑器；正式 Runtime 两条路线均到达冻结结局，console error `[]`；
- Runtime 重型门：不改冻结 corpus 和门槛，纠偏后本机三轮总墙钟 37.331/42.403/47.651 秒；Windows / Node 22 为 30.868 秒，10,000 seeds、20,000 replays、40 chunks、七类计数、零失败和 digest `20e9a842…92ef2` 全部一致。
- 远端完整门：Draft PR #52 run `32457615078` / job `96697835514` 用时 4 分 8 秒；Runtime 主测试 `55/55`、普通并行 `98 files / 590 tests`、串行 autosave `1/1`（3.107 秒）、VM 重型 `5/5`、12 workspace build、architecture、Script `10/10`、Asset `4/4`、typecheck 全部通过。

## 5. 需求对齐与下一步

本步使 REQ-RUNTIME 在 Editor 产品面首次贯通正式 Compiler→Runtime，并把 AC-05 从“未开始”提升为“实现中”。它没有完成“任意语句预览和变量”，因为 Run from Scene/Statement、状态检查器和调试控制仍缺；也没有建立 Web Player 共用 Host。因此 E1 Engineering 通过不能换算为 N32 Engineering 整体完成或任何 Product Acceptance。

下一步 N32-E2 应冻结并实现可观察 Preview Session：变量、调用栈、当前指令/语句、Runtime diagnostic，以及从场景/语句启动的合法状态构造；继续使用固定 State Hash、诊断位置与生产浏览器预期—实际对照。

> 2026-08-27 N51-E3 演进说明：上文保留 N32-E1 当时的 State Hash。Canonical source identity 纳入正式 Gal settings defaults 后，现行广播室/天台结束 State Hash 分别为 `137bb121a345a9ae99a2917d4f29c6dbb6bba42e2bc15a4d4689ef507c2595fa` 与 `8704bf523fa62d736bb799cebc092fbf09ef2093e1d039e63418b6b6e05eddd1`；路线、结局、Story IR 与 Source Map 未改变。详见[审计 #225](225-n51-e3-project-settings-transaction-audit.md)。

> 2026-08-28 N51-E6a 演进说明：Settings schema v2 改变 Canonical source/build identity 后，现行广播室/天台 State Hash 为 `868417ff5d5f506dad7ae373cb3ec5691911efe1dbeafec22abaed3cd0c06a57` / `48ce4af53d14f97ec6681169f5ba5db84e85b63a42bb624a261cbfee7c7b20f4`；路线、结局与 Story IR Hash 保持。详见[审计 #230](230-n51-e6a-settings-schema-v2-migration-audit.md)。
