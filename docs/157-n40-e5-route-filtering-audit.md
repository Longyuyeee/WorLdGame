# N40-E5 P0 Route 过滤审计

> 日期：2026-08-22
> 分支：`codex/n40-e1-route-graph-core`
> 范围：章节、节点类型、视觉分组组合过滤；P0/P1 口径纠偏
> 结论：实现候选；本地自动化/全仓/production build 通过，production browser 待复验

## 1. 需求与偏移审计

PRD 的 Route P0 是“分组、折叠、搜索、过滤和局部加载”；“按角色、变量、完成状态或测试覆盖过滤”列在 P1。此前状态文档使用“高级过滤”作为 N40 剩余项，混淆了 P0 与 P1。本切片纠正为：

1. N40 P0 提供章节、节点类型（入口/普通/结局）和视觉分组（全部/未分组/指定分组）过滤；
2. 搜索、折叠与三种过滤可以组合，之后才分页，最多挂载 64 个节点；
3. 过滤是只读投影，不修改 Canonical Project；
4. 角色、变量、完成状态与覆盖过滤保留在 P1，不作为 N40 P0 出口条件；
5. 当前 Project Lifecycle 仍一次读取完整 `ProjectFiles` 并构造 Canonical Project，因此 64 节点窗口不是宿主/磁盘级 lazy loading，该架构缺口继续保留。

## 2. 实现与实际测试

- 红灯：`2 files / 2 failed / 13 passed`，Route query 忽略过滤条件，Editor 找不到类型过滤控件；
- 转绿定向：Route Graph、Route Map App、Editor App 共 `3 files / 49 tests`；
- Route Graph 覆盖：章节、入口/结局、指定分组、未分组、无匹配，以及过滤后窗口；
- 产品 UI 覆盖：结局过滤显示 2 个节点并隐藏入口，入口过滤只显示入口，范围状态同步为 `1–2 / 2` 和 `1–1 / 1`；
- `npm run check` 退出码 `0`：普通 `102 files / 641 tests`，storage `1/1`，重型 VM `5/5`，Runtime 10k seeds / 20k replays，14 workspace 与 90 portable / 4 adapter 架构审计通过；
- 10k Route：10,000 节点 / 9,999 边 / 0 诊断；Compiler `1720.15 ms`、索引 `6.77 ms`、三次局部查询 `3.12 ms`；
- production build：CSS `83.32 kB`（gzip `15.78 kB`），JS `759.86 kB`（gzip `215.09 kB`），构建通过，`>500 kB` 债仍在。

## 3. 未关闭的 production browser

在 production preview `http://127.0.0.1:4173/` 上进行了两次直接连接，均被 Codex 应用的管理员安全校验拒绝，理由为安全策略暂时无法验证。没有绕过安全控制、切换间接浏览器或把 jsdom 冒充 production browser。

因此 E5 当前只能登记为实现候选。安全校验恢复后必须实际执行：全部 → 结局 → 入口 → 未分组/指定分组 → 清除过滤，并核对可见节点、范围状态和 console warning/error，之后才能关闭 E5。

## 4. 下一顺序

1. 补齐 E5 production browser 并回填精确值；
2. 冻结宿主/磁盘级按需读取契约，先证明只读取索引与当前窗口所需文件，再接入 Route；
3. 运行路线高亮、10k 局部编辑/端到端 500 ms P95、完整图编辑 undo/redo 仍在后续；
4. `RA-N21-005` 继续阻断 N40 Product Acceptance、N41+、M1 Stable 与发布。

## 5. 远端证据

- Draft PR：[#59](https://github.com/Longyuyeee/WorLdGame/pull/59)；
- 实现提交：`b4558e3448db760beed9e8e370124a6dda932741`；
- Windows / Node 22 full check：[run 32579135238](https://github.com/Longyuyeee/WorLdGame/actions/runs/32579135238)，job `97045771988`，`4m30s`，`success`；
- locked dependencies、完整产品基线与 post steps 全绿。该结果证明干净环境中的实现/测试/构建成立，但不能替代尚未完成的 production browser 产品路径，E5 状态仍为实现候选。
