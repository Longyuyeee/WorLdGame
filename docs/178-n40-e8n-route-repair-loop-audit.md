# N40-E8n Route 驱动创作修复闭环审计

> 日期：2026-08-24
> 实现基线：`8f8a0a5`
> 分支：`codex/n40-e1-route-graph-core`，Draft PR #59
> 授权：`RA-N21-005`，仅允许 N40 Route Map Engineering
> 实现头：`7857ca95b9e92460c5821bc2f1e30d1c92c1cda2`
> 判定：E8n Engineering 已由真实存储、正式 Compiler/Route/Runtime、production browser 和远端 Windows / Node 22 完整门闭合；下一步只能进入 N40 Engineering 出口复审。N40 Product Acceptance、N41+、M1 Stable 与发布继续 fail closed。

## 1. 冻结目标与范围

E8n 只关闭一个创作者结果：在 Route Map 中把一条 Choice 连接改到另一个既有 stable scene，经过正式 Story Language P0 事务保存，然后由 Compiler/Route 重建，并由 Formal Runtime 实际抵达修改后的结局。

范围明确限制为：

1. 不建立第二份路线内容模型；Route edge 仍由正式 Compiler facts 派生；
2. 写入只生成一个针对既有 option stable ID 的 `script.p0-batch` update；
3. 来源 scene、目标 scene、option 缺失、目标未变化、未提交草稿和 revision 漂移均失败关闭；
4. 保存使用既有 checksummed IndexedDB project persistence 与 writer lease；
5. 修改后以 Compiler 诊断、Route edge、持久化复读和 Formal Runtime ending 联合裁决；
6. 不扩张 N41 的全部 Choice/Sequence Inspector，不触碰平台壳或发布工程。

## 2. 实现与审计结果

- `route-repair.ts` 提供纯计划契约：验证完整工程中的 source/target/option，不修改输入，只返回一个稳定 ID 的 P0 update。
- Flow Inspector 增加按需展开的 Choice 目标修复器；创作者可选择当前场景的一条连接，并输入/选择目标 scene stable ID。
- 候选只来自当前最多 64 节点的可见 Route window；用户仍可输入窗口外 stable ID，提交时由完整 StoryProject 校验。
- apply 进入现有 Studio reducer 的 `p0-batch`，因此继续复用 Source revision、语法投影、Compiler 预检、Undo/Redo、dirty/save 和错误通知，不直接篡改 StoryProject。
- 成功后同一 render 立即重建 Compiler/Route；提示创作者保存并用正式 Runtime 复核。
- 修复器默认不挂载候选 DOM；只有明确点击“修改 Choice 目标”才展开。手机断点折为单列。

## 3. 真实测试：预期、首次实际、差异与修正

| 检查 | 预期 | 首次实际/差异 | 修正后实际 | 判定 |
|---|---|---|---|---|
| Source transaction | P0 batch 成功并拒绝旧 revision | 测试最初假设成功状态为 `applied`，正式 Source Session 实际契约为 `committed` | 断言对齐正式契约；旧 `baseRevision` 返回 `STALE_REVISION`，原 project 不变 | 通过；未改产品契约 |
| fake IndexedDB 隔离 | 一条存储 E2E 不影响后续用例 | stubbed `indexedDB` 泄漏到同文件后续测试 | 每例结束恢复 globals；writer lease 规则未放宽 | 通过 |
| 大图候选 DOM | 65/10k 工程继续保持局部挂载 | 初版为每条边渲染全场景 select；65 节点 star graph 产生 4,160 个 option 并使 UI 测试超时 | 改为单连接编辑器、按需展开、候选最多 64；折叠时 0、展开时 64 | 关闭真实性能缺陷 |
| 持久化复读 | 保存后从真实文件存储读回同一 target | 测试用原始 StoryProject 恢复 Canonical project 快照，project identity 不同而被正确拒绝 | 使用 Canonical→Editor 的同身份基线复读，`repair_goal_option → repair_goal` 保持 | 通过；身份校验未绕过 |
| 可访问输入角色 | 测试能按可访问名操作目标字段 | 带 `list` 的 input 在浏览器语义中是 `combobox`，不是 `textbox` | 断言改为真实 combobox role | 通过 |
| Formal Runtime | 修改后抵达 `Goal Reached` / `晚风知道答案` | 自动化三场景夹具选择后直接完成；production 校园工程选择后只跨场景，仍需 Continue 执行目标场景语句 | 按正式 Runtime 语义继续到 End；Route 当前节点为天台，最终显示 `流程完成：晚风知道答案` | 通过；未伪造自动完成 |
| 浏览器保存后重开 | 重开读取 `s1` 并由 Compiler 重建 | refresh 后旧页面来不及异步释放 writer lease，新 Session 正确显示 lease conflict | 等待冻结租约自然到期并重试；edge 仍为 `scn_rooftop`，Compiler 重建 `UNREACHABLE_SCENE scn_broadcast_room` | 通过；并发写保护有效 |
| 并行大图测试 | 全量 4-worker 门稳定 | 三个完整 App 大图用例独立约 `3.26s`，全仓争用下分别触发通用 5 秒框架截止线；断言未失败 | 只把 65/70 节点大图 UI 用例截止线设为 10 秒；`114 files / 723 tests` 通过。产品 250/500 ms 性能预算未改 | 关闭测试随机性，不冒充产品性能 |
| 本机冻结 VM | `5/5` 在 90 秒用例截止线内 | 当前主机连续为 `116.7s`、`124.6s`；关闭 production preview 后仍为 `102.1s` | 未修改 VM 或预算；独立 Windows runner 为 `61.81s`、`5/5` | 本机资源差异保留；远端干净门通过 |

## 4. 自动化、性能与 production 证据

- 定向：`route-repair`、Route 产品流和 N13 复验最终 `3 files / 20 tests`；Route 产品流包含诊断→修改→Compiler/Route 更新→真实 IndexedDB 保存/复读→Formal Runtime ending。
- 全量并行：`114 files / 723 tests`；storage conformance `1/1`。
- 失败关闭：source/target/option 缺失、unchanged target、stale revision 均有 exact code 断言。
- 10k Route：本地最终 target plan `0.75 ms <250 ms`，远端 `0.79 ms <250 ms`；本地局部 edit P95 `197.11 ms <500 ms`，远端 `152.68 ms <500 ms`；Route performance `9/9`。
- production desktop：按需展开前 0 个候选，校园工程展开后 3 个；“去广播室”实际改为 `scn_rooftop`，自动保存 `s1`，正式 Runtime 抵达“晚风知道答案”。
- production reopen：租约到期后 edge 与新 Compiler 诊断均从保存工程恢复；默认 Preview 仍是 `16:9 · 标准横屏`。
- production mobile `390×844`：`innerWidth=390`、document `scrollWidth=375`，修复器单列 `303px`、容器 `321px`，无横向溢出；Preview 舞台取整比例约 `1.786`。
- production console：0 warning / 0 error。
- Editor production build：CSS `87.60 kB / gzip 16.50 kB`，JS `838.75 kB / gzip 235.74 kB`；既有 `>500 kB` 拆包 warning 仍未关闭，未误报为功能失败。

## 5. 远端门与阶段判定

实现头 `7857ca9` 的 GitHub Actions `product-baseline` run `32684809412` / job `97307842092` 在 Windows / Node 22 上用时 `4m56s`，locked install 与完整 `npm run check` 全绿：

- 普通并行测试 `114 files / 723 tests`；storage `1/1`；重型 VM `5/5`，用时 `61.81s`；
- Runtime corpus 10,000 seeds / 20,000 replays，`23.883s`，digest 不变；
- Script `10/10`、Route `9/9`、Asset `4/4`；全部 workspace build、architecture、治理与需求门通过。

因此 E8n Engineering 可以登记完成，但这不等于 N40 总出口或任何产品验收通过。N21 为 `0/1 pending-participant`，N23 为 `0/2 pending-participants`，M1 仍为 `0/27`。

## 6. 下一步

下一节点冻结为 **N40 Engineering 出口复审**：逐项对照 N40 Goal/Implementation/Tests/Acceptance，确认 Route P0 是否具备工程出口候选资格，并重新审计哪些缺口确属 N40、哪些属于 N41/N42/N50。不得因为 E8n 闭合一个用户流程就直接开启 N41；`RA-N21-005` 仍明确阻断 N40 Product Acceptance、N41 Engineering、M1 Stable 与发布。
