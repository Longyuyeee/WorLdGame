# N40 Route Map Engineering 出口复审

> 日期：2026-08-24
> 审计基线：`5079ee7d4d4e39ad99c1fbc46e2e5377c29ec7cf`
> 分支：`codex/n40-e1-route-graph-core`，Draft PR #59
> 授权：`RA-N21-005`，只允许 N40 Route Map Engineering
> 判定：N40 Engineering 出口通过。Goal `1/1`、Implementation `11/11`、Tests `3/3`、Acceptance `2/2` 均有当前代码和真实测试证据。该判定不等于 N40 Product Acceptance；N41+、M1 Stable 与发布继续 fail closed。

## 1. 审计方法与范围

本次不以 E1–E8n 文档累计数量代替出口证明，而从当前头重新核对 N40 冻结的 Goal、Implementation、Tests 与 Acceptance：

1. Route 必须来自 Canonical Project 与正式 Compiler，不维护第二份剧情逻辑；
2. 章节、场景、label、choice、condition、jump、call、ending 必须可投影；
3. Layout、分组、折叠、搜索、P0 过滤和局部窗口必须不改变剧情语义；
4. 不可达、悬空、无出口/非交互循环必须来自正式 Compiler 诊断；
5. Formal Runtime History 必须驱动当前、已访问及已走连接高亮；
6. Route 必须能定位内容，并形成审阅、修改、保存、重建和 Runtime 复核闭环；
7. 真实 10k 二叉分支图、布局隔离及 500 ms 局部同步预算必须重新执行。

完整 N41 Sequence、N42 Stage、N50 Player、外部目录 trusted lazy host、增量 topology 写、角色/变量/覆盖高级过滤均不属于本次 N40 Engineering 出口的偷渡范围。

## 2. Goal / Implementation 对齐矩阵

| 冻结项 | 当前实际 | 判定 |
|---|---|---|
| 大型结构可理解、可定位、可诊断 | 10k Compiler 图使用 64 节点/256 相关边窗口；支持搜索、过滤、结局路线审阅、诊断定位及 stable-ID 目标导航 | 完整 |
| 不维护第二份剧情逻辑 | 节点、facts、edges 与 diagnostics 均从 Canonical Project 的正式 Compiler 结果投影；写入只走 Story Language / Project Service 事务 | 完整 |
| 章节、场景及六类控制流事实 | chapter/scene 与 label、choice、condition、jump、call、ending 均有投影和定向断言 | 完整 |
| Layout Sidecar | 坐标、viewport、group 进入 `layouts/*.json`；删除布局自动重建且 scripts / Compiler facts 不变 | 完整 |
| 分组与折叠 | 创建、归组、折叠、删除均经 Project Service；折叠仅改变窗口可见性 | 完整 |
| 搜索与 P0 过滤 | 章节、节点类型、视觉分组组合过滤后再应用局部窗口 | 完整 |
| 局部加载 | trusted Route-first 只读 manifest/chapter 与当前最多 64 个 scene/layout；script/global/full read 为 0 | 完整 |
| 不可达、悬空与循环诊断 | Compiler 提供 `UNREACHABLE_*`、`MISSING_TARGET_SCENE`、`SCENE_NO_EXIT`、`NON_INTERACTIVE_LOOP` 等结构化诊断，Route 只读消费 | 完整 |
| 路线与 Runtime 高亮 | Ending review 跳过循环/悬空边；Formal Runtime History 投影 current/visited/choice edge，Back/Forward 同步撤销与恢复 | 完整 |
| Route 进入内容 | 节点双击、Inspector 与诊断进入同一 stable scene 的现有 Writer 图形内容入口，并可聚焦 statement | 完整；术语已澄清 |
| 创作修复闭环 | Choice option target 经 stable-ID P0 事务修改，真实保存/复读后 Compiler/Route 重建，Formal Runtime 抵达新 ending | 完整 |

### 术语纠偏

旧冻结文本写“进入 Sequence”，但当前产品的正式模式名称是 `Writer / Script / Flow`。production 实测节点双击后 `Writer` 被选中并打开同一 stable scene；E8m 代码和测试也明确如此。N40 在此要求的是 Route → 场景图形内容入口，不是提前完成 N41 的“全部 P0 块、类型化 Inspector、批量和完整跨视图协议”。相关主计划改为“进入同场景内容入口（当前 Writer；不等于 N41 完整 Sequence）”，避免用错误名称夸大进度。

## 3. 真实测试：预期、实际、差异与处置

| 检查 | 预期 | 当前实际 | 差异与处置 | 判定 |
|---|---|---|---|---|
| Route 定向回归 | 当前 Route、lazy 与修复链全部成功 | `8 files / 59 tests`，30.08 秒 | 无功能差异 | PASS |
| 真实 10k 图 | 二叉分支 DAG 为 10,000 节点、9,999 边、0 诊断；窗口最多 64 节点 | Compiler 投影 `3730.42 ms <15000`；index `16.07 ms <2000`；三次查询 `11.58 ms <250`；最大 64 节点/128 相关边 | 无差异 | PASS |
| 500 ms Script/Route 同步 | Project Service 单场景修改经增量 Compiler、Route 投影和锚点窗口，20 样本 P95 `<500 ms` | P95 `164.88 ms`；最慢样本 `190.67 ms` | 余量 335.12 ms；预算未放宽 | PASS |
| 指定结局路线 | 10k 中找到目标 ending，忽略循环/悬空 | `13.13 ms <250`，1 条候选、14 场景、探索 9,999 边 | 无差异 | PASS |
| 诊断定位 | 10k 目标定位并只挂载局部窗口 `<250 ms` | `5.90 ms`，窗口 `9984–10000`，16 节点 | 无差异 | PASS |
| trusted 局部读取 | 首窗最多读取 64 scene + 64 layout，不读 script/global/full project，`<500 ms` | `[1,1,64,64]`，130 源文件，`321.95 ms` | 余量 178.05 ms；不宣称完整 Lazy Project | PASS |
| 10k 全局 edit index | 20,000 statement/text IDs `<500 ms` | `310.07 ms`，20,003 entities | 无差异 | PASS |
| 10k 结构预检 | narration 插入/前插/移动/删除各 `<500 ms` | `11.72 / 9.83 / 7.20 / 7.08 ms` | 无差异 | PASS |
| production desktop | 默认 16:9；Flow 显示真实图；结局审阅和双击内容入口可用 | `1920×1080` profile；天台返回 1 条、2 场景路线；双击进入同场景 Writer | 名称与“Sequence”旧文案不同，已作术语纠偏，不改产品行为 | PASS |
| production mobile | 390×844 无横向溢出，16:9 舞台保持 | `innerWidth=390`、document/body `scrollWidth=375`；canvas `335×187.5625`，比例约 `1.786` | CSS 取整约 0.5%，与既有可接受证据一致 | PASS |
| production 控制台 | 0 warning / 0 error | `[]` | 无差异 | PASS |

Editor production build 成功：CSS `87.60 kB / gzip 16.50 kB`，JS `838.75 kB / gzip 235.74 kB`。既有单 chunk `>500 kB` warning 仍是后续性能债，不影响本次 Route 功能判定，也未被隐藏。

## 4. 冻结 Tests / Acceptance 判定

### Tests：3/3

1. **真实 10k 分支图**：使用 binary branching DAG，不用线性轨道替代；通过。
2. **布局删除不丢剧情**：布局 reset 后 scripts、edges 与 Compiler facts 保持；通过。
3. **脚本增量更新保留布局**：Project Service 修改 scene/script 后 stable layout sidecar 保持；通过。

### Acceptance：2/2（Engineering）

1. **10k Route 目标预算内局部编辑**：20 样本 P95 `164.88 ms <500 ms`；通过。
2. **修改 Script 后图在 500 ms 内同步**：同一测量覆盖 Project Service → incremental Compiler → Route graph/index → anchored window；通过。

自动化 production browser、fake IndexedDB 和 CI 都不能代替真人 Product Acceptance。`RA-N21-005` 仍明确把 N40 Product Acceptance、N41 Engineering、M1 Stable 和发布保持为阻断状态。

## 5. 出口与后续边界

N40 Route Map 已具备 Engineering 出口资格，当前不再新增 N40 功能切片。仍未完成或后置的能力按归属保持：

- N41：完整 Sequence 语义编辑、全部 P0 结构事务、类型化 Inspector、批量与完整跨视图协议；
- N42：完整 Stage 与基础时间线；
- N50/N80：正式 Player 与 Web 发布链；
- 后置性能工程：完整 Lazy Project Session、增量 topology 派生产物、外部 trusted host、高级 Route 过滤；只有后续真实阻断出现时再立项。

下一步不是自动进入 N41，而是冻结 N40 分支并等待治理授权/产品门处置。若没有新的有效风险接受或前置产品证据，继续开发 N41 必须失败关闭。
