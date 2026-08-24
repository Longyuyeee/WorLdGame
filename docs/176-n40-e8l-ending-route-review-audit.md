# N40-E8l 指定结局路线审阅审计

> 日期：2026-08-24
> 实现基线：`5eb1575c4e13d7e5577e3bc4c1c39e92fa62c44b`
> 分支：`codex/n40-e1-route-graph-core`，Draft PR #59
> 授权：`RA-N21-005`，仅允许 N40 Route Map Engineering
> 判定：E8l 本地 Engineering 证据通过；远端 Windows / Node 22 完整门在首次推送后登记。N40 Product Acceptance、N41+、M1 Stable 与发布状态不变，继续 fail closed。

## 1. 开发目标与需求对齐

E8l 的用户结果是：创作者选择一个结局后，可审阅从项目入口抵达该结局的权威候选路线，并在大型 Route 图中沿路线逐节点定位。实现严格读取 Canonical Project 经正式 Compiler 投影出的场景、Ending fact 与 Choice edge，不维护第二份剧情语义，也不修改脚本或布局。

冻结验收项如下：

1. portable Route Graph 提供确定性、循环有界的入口到结局查询；
2. 多候选、循环、悬空、不可达和无效目标均有明确结果；
3. Flow 提供结局选择、候选切换、节点/连接高亮和逐步定位；
4. 定位跨越 64 节点窗口时仍只挂载当前窗口；
5. 10,000 场景真实 Compiler 图查询小于 250 ms；
6. desktop 与 390 px 手机生产页面可实际操作，默认 Preview 仍为 16:9；
7. 全仓治理、Compiler、Runtime、存储、VM、构建、架构和性能门不回归。

## 2. 实现结果

- `reviewRouteToEnding` 按 Compiler edge 顺序枚举简单路径，默认最多 8 个候选、100,000 次连接展开；活动路径内重复场景被作为循环边跳过。
- dangling edge 不进入候选并单独计数；目标不存在或没有 Ending fact 返回 `invalid-ending`，入口不可达返回 `unreachable`。
- 每个候选仅包含 stable scene IDs 与 edge IDs；UI 高亮和定位都消费该结果。
- Flow 新增目标结局、候选路线、上一步/下一步和状态反馈；review 高亮与 Runtime History 高亮可同时存在。
- 每次路线步骤切换都用 `anchorSceneId` 重新查询既有 Route window，不解除 64 节点与 256 局部连接上限。
- 手机端将审阅面板折为单列，保持控件可操作并消除本功能引入的横向溢出。

## 3. 真实测试：预期、实际、差异与修正

| 检查 | 预期 | 首次实际 | 修正后实际 | 判定 |
|---|---|---|---|---|
| Route 单元/UI | 多候选、循环、悬空、不可达、无效目标、跨窗和高亮全部成立 | `2 files / 24 tests` | 无差异 | 通过 |
| 10k 指定结局查询 | `<250 ms`，入口与目标 stable ID 精确 | 首轮 `6.94 ms`；全门复测 `13.29 ms`，14 场景候选，展开 9,999 edge | 无需修正 | 通过 |
| 10k 既有 Route 门 | Compiler 投影 `<15s`、三查询 `<250ms`、编辑 P95 `<500ms` | `4690.09 ms`、`10.09 ms`、`198.80 ms` | 无需修正 | 通过 |
| desktop production | 选择天台后 `1` 条路线、步骤 `2/2`，scene/edge 均高亮，返回入口为 `1/2` | 与预期一致；console `0 error / 0 warning` | 无需修正 | 通过 |
| Preview 默认画幅 | 仍为 16:9 标准横屏 | `landscape-16-9`、`16:9 · Balanced` 可见 | 无需修正 | 通过 |
| 390×844 production | 审阅控件完整且页面宽度 `≤390 px` | 控件可见，但 document width `558 px` | 审阅网格改单列后 body/document width `375 px`，控件仍可见，console 为空 | 发现并关闭差异 |
| production build | 构建成功 | CSS `86.12 kB / gzip 16.25 kB`；JS `833.03 kB / gzip 234.27 kB` | 无功能差异；`>500 kB` 拆包警告继续登记为既有债务 | 通过但债务未关闭 |

浏览器测试使用 `npm run build --workspace @world-studio/editor` 的 production `dist`，由 `vite preview` 在 `http://127.0.0.1:4173/` 提供，不使用 jsdom 代替真实页面。

## 4. 全仓门结果

`npm run check` 退出码为 0：

- 普通并行测试：`113 files / 714 tests`；
- storage conformance：`1/1`；重型 VM：`5/5`；
- Runtime corpus：10,000 seeds、20,000 replays、40 chunks，digest 不变；
- workspace、需求、风险、delivery baseline、PR traceability、Golden、Compiler、Runtime、typecheck、全部 workspace build、architecture、Script/Route/Asset performance 全部 PASS；
- N21 仍为 `0/1 pending-participant`，N23 仍为 `0/2 pending-participants`，没有用自动化或浏览器测试冒充真人产品验收。

## 5. 审计结论与下一步

E8l 没有偏移到 topology cache、平台壳或发布工程，直接关闭了功能优先复审列出的首个 Route P0 缺口。它完成的是“静态指定结局路线审阅”，不是完整 Ending Solver、覆盖率工具、正式 Player 或三端验收。

下一步冻结为 N40-E8m：Compiler 诊断点击后锚定 Route window、选中 stable scene，并在有 `statementId` 时定位对应内容；同时补 Route 节点双击进入 Sequence 和合法目标导航。E8m 不扩张为 N41 全量 Sequence，也不解除任何产品门。
