# N40-E3 Route Layout Sidecar 审计

> 日期：2026-08-22
> 分支：`codex/n40-e1-route-graph-core`
> 范围：最小 Canonical 节点坐标契约、Project Service 写回、自动重建、真实工程落盘
> 结论：本地与远端 Windows / Node 22 Engineering 均通过

## 1. 偏移审计与纠偏

代码此前已有 `layouts/<scene>.json` 和 `LayoutDocument.nodes`，但 `nodes` 只是无约束 `JsonObject[]`，Project Service 没有布局命令，Editor Route 卡片只用数组序号排版。旧开发文档还展示未实现的 `formatVersion`、对象形态 `nodes` 和 `groups`。因此“Layout Sidecar 已有”只能算文件占位，不能算可编辑、可保存的产品能力。

本切片纠偏为：

1. 以当前 `schemaVersion: 1` 为权威，冻结最小 `nodeId/x/y` 数组契约；
2. codec 拒绝重复节点、非 portable ID、非有限数值和未知字段；
3. 所有布局修改只能通过 Project Service 的 `layout.node.set` / `layout.reset`；
4. Route 图的场景、边和 Compiler 诊断仍只来自 Canonical 剧情与正式 Compiler，sidecar 只影响视觉坐标；
5. sidecar 缺失坐标时按稳定场景顺序生成确定性自动坐标，重建不写剧情；
6. Editor 将 Canonical layout 变化回传 Launcher Lifecycle，随后使用既有 Canonical save 路径真实写盘。

未把尚未实现的分组、折叠、视口、拖拽或自动图算法写入 schema，也未把 CSS state 冒充 sidecar。

## 2. 实现结果

| 层 | 实现 | 边界 |
|---|---|---|
| Project Domain | `LayoutNodePosition`、严格 codec、`layout.node.set`、`layout.reset`、ChangeSet/undo/redo/serialize | 坐标改变 Canonical 工程 hash，但不改变 scripts 或 Compiler 图 |
| Route Graph | sidecar 坐标读取、确定性四列自动坐标、set/reset façade | 不保存边，不维护第二份剧情语义 |
| Editor | X/Y Inspector、保存节点布局、重建自动布局、绝对坐标画布 | 当前是数值编辑，不宣称拖拽/分组/视口完成 |
| Lifecycle | `onCanonicalProjectChange` 将布局写回 Launcher session，既有“保存到本机”持久化完整 Canonical 工程 | 无 standalone UI 私有布局副本 |

## 3. 实际测试

### 3.1 红灯与定向回归

- 初始红灯：Route API 不存在，Editor 找不到“路线节点 X”，共 `4 failed / 35 passed`；
- 最终定向：Project Domain、Route Graph、Editor App、Route Map 共 `5 files / 62 tests`，全部通过；
- 覆盖：codec 坏坐标/重复节点、Service 提交/序列化/undo/redo、未知场景和 `NaN` fail closed、脚本改名保布局、重建布局不损 scripts/Compiler 图、产品 UI 保存/重建。

### 3.2 本地完整门

`npm run check` 实际退出码为 `0`：

- 普通并行测试：`102 files / 632 tests`；
- IndexedDB storage：`1/1`；重型 VM：`5/5`；Runtime generated corpus：10,000 seeds / 20,000 replays / 40 shards，digest 未变；
- 14 workspace build、90 portable / 4 adapter 架构审计全部通过；
- 真实 10k 二叉 Route：10,000 节点 / 9,999 边 / 0 诊断；Compiler 投影 `1791.61 ms`、索引 `5.91 ms`、三次局部查询 `2.71 ms`，窗口最多 64 节点 / 128 当前相关边；
- production Editor build：CSS `82.02 kB`（gzip `15.57 kB`），JS `746.86 kB`（gzip `212.16 kB`）；构建通过，`>500 kB` 拆包债仍保留。

### 3.3 Production browser 与真实落盘

在 `vite build` 产物上从项目首页打开真实示例工程并进入 Flow：

1. 天台自动布局实测为 CSS/计算位置 `648×96`；
2. 输入 `700×400` 并保存后，CSS 变量和计算位置均为 `700×400`；
3. 通过 Project Service 将场景改名为“风中的天台 E3”，坐标仍为 `700×400`；
4. 重建自动布局后恢复 `648×96`，产品状态明确“脚本与 Compiler 图未修改”；
5. 再保存 `720×420`，点击“保存到本机”，返回首页并从最近工程重开；重开后场景名和坐标仍为“风中的天台 E3”/`720×420`；
6. 浏览器 console warning/error：`[]`。

这组证据同时关闭“只在 React state 中变化”和“测试臆断已落盘”两类假阳性。

## 4. 未完成与下一顺序

E3 只关闭最小坐标 sidecar，不关闭 N40：

1. N40-E4：分组、折叠、视口与可访问拖拽/键盘替代，并继续走 Project Service；
2. 存储级按需加载，而非当前编译全图后的有界查询；
3. 运行路线高亮、不可达/循环的产品呈现；
4. 真实 10k 局部编辑、端到端 500 ms P95、完整图编辑撤销；
5. N40 Product Acceptance 仍受 `RA-N21-005` 阻断，N41+、M1 Stable 与发布不得启动或宣称完成。

## 5. 远端证据

- Draft PR：[#59](https://github.com/Longyuyeee/WorLdGame/pull/59)；
- 实现提交：`bb40530639a71ce792f5afe6d9da87eb2aacbcb3`；
- Windows / Node 22 full check：[run 32514046873](https://github.com/Longyuyeee/WorLdGame/actions/runs/32514046873)，job `96871521066`，`4m32s`，`success`；
- locked dependencies、完整 `npm run check` 与 post steps 全部为绿色。

远端结论关闭 E3 Engineering；它不解除 `RA-N21-005` 对 N40 Product Acceptance、N41+、M1 与发布的阻断。
