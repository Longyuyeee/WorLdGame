# N40-E4 Route Workspace 交互审计

> 日期：2026-08-22
> 分支：`codex/n40-e1-route-graph-core`
> 范围：Canonical 分组/折叠/视口、拖拽、键盘与触控等价移动、真实保存恢复
> 结论：本地与远端 Windows / Node 22 Engineering 均通过

## 1. 需求对齐与偏移纠正

N40-E3 只冻结了节点坐标，文档明确把分组、折叠、视口和交互移动留给 E4。本切片没有转向平台、账户或包装工作，严格关闭 Route Workspace 的下一组产品缺口：

1. 分组定义、折叠状态、节点归组和视口成为 Canonical Layout Sidecar，而不是 React/CSS 私有状态；
2. 所有写操作继续通过 Project Service，并产生正常 ChangeSet、undo/redo 与序列化结果；
3. 分组删除自动清除全部节点引用，承载元数据的场景被删除时将 groups/viewport 迁移到剩余布局，避免静默丢失；
4. Route Graph 只将折叠应用于视觉查询，场景、边和诊断仍来自正式 Compiler；
5. 鼠标采用原生 HTML5 拖放，同时提供 `Alt+方向键` 和四个显式方向按钮，保证键盘与触控无需模拟拖拽；
6. E4 不宣称存储级 lazy loading、高级过滤、运行路线高亮、10k 局部编辑或 500 ms P95 已完成。

## 2. 实现结果

| 层 | 已实现 | 约束 |
|---|---|---|
| Project Domain | `groupId?`、`LayoutGroup[]`、`LayoutViewport`；严格 codec 与引用校验 | zoom 为 `0.5–2`；重复/悬空/未知字段 fail closed |
| Project Service | group upsert/delete/toggle、node assign、viewport set | 删除分组清引用；删除元数据 owner 时迁移；支持事务历史 |
| Route Graph | 分组/视口投影、折叠过滤与五个写入 façade | 边仍由 Compiler 生成，不保存第二份剧情逻辑 |
| Editor | 创建/折叠/删除分组、节点归组、视口保存、原生拖放、键盘/触控 24 px 移动 | 每次修改均回传 Canonical Launcher Lifecycle |

## 3. 实际测试证据

### 3.1 红灯与定向测试

- 初始红灯真实出现：`3 files / 4 failed / 48 passed`，失败原因分别为产品控件、Project Service commands 和 Route façade 尚不存在；
- 实现后定向测试：Project Domain、Project Service、Route Graph、Editor App 与 Route Map 共 `5 files / 69 tests`，全部通过；
- 覆盖负例：非法 viewport、悬空 group、未知 scene/group、重复元数据；
- 覆盖状态：分组新增/改名/折叠/删除、节点归组、owner scene 删除迁移、序列化、折叠查询、视口、键盘/触控移动以及 DOM drop 事件写回。

### 3.2 本地完整门与构建

`npm run check` 实际退出码 `0`：

- 普通并行测试：`102 files / 639 tests`；
- IndexedDB storage：`1/1`；重型 VM：`5/5`；Runtime generated corpus：10,000 seeds / 20,000 replays / 40 shards，digest `20e9a842…92ef2`；
- 14 workspace build、90 portable / 4 adapter 架构审计全部通过；
- 真实 10k Route：10,000 节点 / 9,999 边 / 0 诊断；Compiler 投影 `1838.90 ms`、索引 `4.97 ms`、三次局部查询 `2.94 ms`，窗口最多 64 节点 / 128 当前相关边；
- production Editor build：CSS `83.20 kB`（gzip `15.76 kB`），JS `758.18 kB`（gzip `214.75 kB`）；构建通过，`>500 kB` 拆包债未关闭。

### 3.3 Production browser 与持久化

在 production build 的真实示例工程“黄昏广播”中完成：

1. 创建 `group_rooftop / 天台线`，将“风中的天台 E3”归组；
2. `Alt+ArrowRight` 将节点从 `720×420` 移到 `744×420`，显式“下移 24”按钮再移到 `744×444`；
3. 保存视口 `x=100 / y=50 / zoom=1.25`，页面实际 transform 为 `translate(-100px, -50px) scale(1.25)`；
4. 折叠后天台节点从当前窗口消失，展开后恢复；
5. 自动保存到 storage revision 7，返回首页重开同一工程；分组、归组、节点 `744×444`、视口 transform 和 `draggable=true` 均真实恢复；
6. 浏览器 warning/error 为 `[]`。

边界说明：浏览器自动化的合成手势没有可靠触发原生 HTML5 DnD，因此没有把两次未改变坐标的合成拖拽记录为通过。生产 DOM 的 `draggable=true` 已实测，drop handler 使用实际 `DragEvent`/DOM 事件级自动测试通过；键盘与触控等价路径则已在 production browser 真实改变并持久化坐标。

## 4. 当前判定与下一顺序

E4 Engineering 本地通过，但 N40 仍未完成：

1. 下一切片先补存储级按需载入与高级过滤，不能把当前“全图编译后 64 节点查询”继续称为 lazy loading；
2. 随后补正式 Runtime 路线高亮，以及不可达/循环诊断的产品交互；
3. 最后执行真实 10k 局部编辑、端到端 500 ms P95、完整图编辑 undo/redo 与 N40 出口复审；
4. `RA-N21-005` 仍阻断 N40 Product Acceptance、N41+、M1 Stable 与发布。

## 5. 远端证据

- Draft PR：[#59](https://github.com/Longyuyeee/WorLdGame/pull/59)；
- 实现提交：`691167db8f5fcc933d309f2cc42ff07695a568e4`；
- Windows / Node 22 full check：[run 32518694786](https://github.com/Longyuyeee/WorLdGame/actions/runs/32518694786)，job `96885966342`，`4m9s`，`success`；
- locked dependencies、完整产品基线检查与 post steps 全部为绿色。远端结论关闭 E4 Engineering，但不解除 `RA-N21-005` 对产品门和后续节点的阻断。
