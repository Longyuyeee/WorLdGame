# N40-E2 10k Branching Route 与有界窗口审计

> 日期：2026-08-22
> 分支：`codex/n40-e1-route-graph-core`
> 授权：`RA-N21-005`，仅 N40 Route Map Engineering
> 判定：E2 本地实现、性能门、production build、production browser 与远端 Windows / Node 22 完整门通过，Engineering 切片关闭。N40 Product Acceptance、N41+、M1 与发布继续阻断。

## 1. 本切片解决的问题

E1 的 Route Map 会把全部节点和全部边直接挂载到 DOM。该实现对 3 场景样例成立，但不满足 N40 的大型工程目标。E2 将“10k Branching Route”落实为真实 Canonical Project 和正式 Compiler 投影，并建立可复用的有界查询窗口：

1. 10,000 个场景组成二叉分支 DAG，不以 10k 条线性轨道替代；
2. 9,999 条 Choice 跨场景连接全部由正式 Compiler 事实生成；
3. Route Index 支持场景、稳定 ID、章节和控制流事实搜索；
4. 每个窗口最多返回 64 个节点、256 条当前相关连接；
5. Editor 提供上一段/下一段、范围状态、搜索收敛和边截断反馈，不再一次挂载全图。

“有界窗口”指编译后图索引的局部查询和 DOM 局部挂载，不等同于磁盘级按需读取。首次打开仍会编译完整 Canonical Project；文档不得把它写成存储层 lazy loading。

## 2. 测试驱动差异

实际红灯与修正：

- Core 首测因 `createRouteGraphIndex` / `queryRouteGraphWindow` 不存在失败，随后实现确定性索引与局部边查询；
- 70 场景 UI 首测实际挂载 70 个节点而不是上限 64，证明旧 Editor 未使用窗口；
- 接入窗口后第二页首测仍挂载 64 个重叠节点，因为核心把 offset 64 回退到 6 以填满末页；修正为固定分页边界后，第二页实际只挂载剩余 6 个节点；
- 没有把测试改成接受重叠窗口，也没有提高节点上限掩盖问题。

定向重跑为 2 files / 8 tests，通过。70 场景 UI 证明第一页 64、第二页 6，搜索唯一 Ending 后为 1；Core 证明首尾窗口与局部连接保持确定。

## 3. 10k 性能 Golden

新增 `audit:route-performance` 并纳入根 `npm run check`。测试每次在内存构造真实 Canonical Project，再调用 production Route Graph API，不使用预计算计数或 mock Compiler。

| 项目 | 实际 | 冻结预算 | 判定 |
|---|---:|---:|---|
| 正式 Compiler + Route 全量投影 | 1,976.30 ms | < 15,000 ms | 通过 |
| 10k Route 搜索索引 | 4.98 ms | < 2,000 ms | 通过 |
| 首段、中段锚点、唯一结局三次局部查询 | 3.09 ms | < 250 ms | 通过 |
| 图规模 | 10,000 节点 / 9,999 边 / 0 诊断 | 精确一致 | 通过 |
| 有界结果 | 最多 64 节点 / 128 当前相关边 | ≤64 / ≤256 | 通过 |

以上是本机实测值；远端 Windows / Node 22 将重新运行同一固定预算，不复用本机结果。

## 4. Production Browser 实测

production build 体积为 CSS 82.07 kB（gzip 15.57 kB）、JS 743.11 kB（gzip 211.27 kB），构建成功，既有 `>500 kB` warning 继续登记。

实际浏览器路径：打开示例工程 → 内容编辑器 → Flow：

- 初始窗口 `1–3 / 3`，上一段/下一段均禁用，显示最多挂载 64 节点及连接 `2/2`；
- 搜索“天台”后为 `1–1 / 1`，只保留 `scn_rooftop` 及相关连接 `1/1`；
- 清除搜索后选择 `scn_broadcast_room`，经 Project Service 改名为“旧广播室 · E2 实测”；
- 进入 Sequence 后 Script 包含 `scene "旧广播室 · E2 实测" @id(scn_broadcast_room)`，0 个阻断问题；
- 页面 console error/warning：`[]`。

70 场景真实分页由 jsdom 产品 UI 测试覆盖；当前产品入口没有注入测试工程或操作浏览器存储来伪造 10k 浏览器样例。

## 5. 本机完整门

`npm run check` 退出码 0：治理与 50 条需求审计通过；Compiler 20/20；Runtime 55/55 与 10,000 seeds 固定 digest 通过；普通测试 102 files / 625 tests；storage 1/1；重型 VM 5/5；14 workspaces 构建成功；architecture 90 portable / 4 Node adapters；Script performance 10/10；Route performance 1/1；Asset performance 4/4。

实现提交 `b4fb150` 推送后，Draft PR #59 的 product-baseline run `32511431022` / job `96863202675` 在干净 Windows / Node 22 上重新执行锁定依赖安装与完整 `npm run check`，4 分 24 秒绿色，包含新增 Route performance gate。E2 Engineering 切片据此关闭。

## 6. 诚实边界与下一步

E2 关闭的是 10k 正式图投影、索引、查询预算和有界 DOM 挂载。仍未完成：

1. 布局 Sidecar、布局删除不丢剧情、脚本增量更新保布局；
2. 存储层/工程层按需载入，而非编译后窗口；
3. 10k 工程通过 Project Service 局部编辑及端到端延迟预算；
4. 分组/折叠/高级过滤、不可达/循环产品诊断和路线运行高亮；
5. 可撤销完整图编辑、Script→Route P95 500 ms 同步门；
6. N40 完整工程出口和独立 Product Acceptance。

因此 `REQ-ROUTE`、`AC-03`、`AC-04`、`AC-17` 继续保持“实现中”。
