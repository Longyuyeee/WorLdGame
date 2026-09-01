# N40-E1 Canonical Route Graph 核心闭环审计

> 日期：2026-08-22
> 分支：`codex/n40-e1-route-graph-core`
> 授权：`RA-N21-005`，仅 N40 Route Map Engineering
> 判定：E1 本地工程、production browser 与远端 Windows / Node 22 完整门均通过，Engineering 切片关闭。N40 Product Acceptance、N41+、M1 与发布继续阻断。

## 1. 目标与需求对齐

本切片落实 [N40 治理冻结点](152-n32-n40-governance-checkpoint.md)的最小真实闭环，不再保留只从 `StoryProject` 猜测 Choice 边的原型 Flow：

1. `@world-studio/route-graph` 从 Canonical Project 调用正式 Project Compiler，确定性投影章节、场景、Choice、Label、Jump、Call、Condition 与 Ending 事实；
2. 图节点、边和诊断携带稳定实体 ID；悬空 Choice 目标保持为显式 dangling edge，并展示 Compiler 诊断；
3. Editor Route Map 支持搜索、选中、连接与诊断检查，并可进入现有 Sequence；
4. 场景改名必须调用 Project Service 的 `scene.rename` 命令，返回新的 Canonical Project，再投影到 Route、Writer 和 Script；
5. Canonical 适配器同步场景标题，避免“脚本文本已改、场景清单仍旧名”的双权威偏移。

对应需求为 `REQ-ROUTE`、`AC-03`、`AC-17` 的部分实现证据。E1 没有完成整个 N40。

## 2. 实现边界

| 层 | 真实实现 | 未声明能力 |
|---|---|---|
| Portable Core | `packages/route-graph`；只依赖 `project-domain` 与 `project-compiler` | 不依赖 DOM、Editor 或平台 API |
| Read Model | Compiler IR/Source Map/诊断 → Route nodes/edges/facts | 不复制故事正文为第二份可编辑模型 |
| Command | `renameRouteScene` → `createProjectService` → `scene.rename` | 本切片未声称完整图编辑与 Undo/Redo |
| Editor | Route Map、搜索、Inspector、进入 Sequence、Script 同步 | 未实现布局 Sidecar、分组/折叠、局部加载、路线运行高亮 |
| Architecture | 新 workspace 纳入根构建、TypeScript references、边界注册和架构审计 | 未进入 N41 或 Player workspace |

## 3. 测试驱动与差异纠正

实际红灯按顺序保留：

- Core 首测因 `@world-studio/route-graph` 尚不存在而失败；实现后发现旧 fixture 的章节路径不满足 Canonical 约束并修正 fixture；
- 悬空图负例不能走 Project Service 写路径，因为服务会正确拒绝无效工程；因此拆分为只读非法投影 fixture 与合法编辑 fixture，没有放宽 Project Service 验证；
- Route UI 首测旧 Flow 3/3 失败，实现后曾为 7/9，再修正可访问名称与跨视图断言到 9/9；
- 全量普通回归首次为 622/623：旧 `App.test.tsx` 仍断言“自动路线图/无语义副本”。更新为 Route Map、Compiler 图事实和稳定节点断言后，重新执行为 623/623；
- 一次审计命令误写为 `audit:workspace`，npm 明确失败；随后用仓库真实脚本 `audit:workspaces` 重跑通过。该操作错误不计为产品通过证据。

定向重跑：4 files / 40 tests，通过。包含 Route Graph 正反例、Route Map 搜索/改名/空名称拒绝、Canonical 标题往返及既有 App 回归。

## 4. Production Browser 实测

实际使用 production build 的 `vite preview`，在浏览器完成：

1. 打开示例工程并进入内容编辑器；
2. Flow 显示 `3 场景 / 2 连接 / 0 诊断`，来源标记为 `Compiler 图事实`；
3. 搜索“天台”只保留 `scn_rooftop` 路线节点；
4. 选中 `scn_broadcast_room`，改名为“旧广播室 · N40 实测”，提交状态显示 `Project Service 已提交`；
5. Route 节点、场景列表、Preview 均显示新名称，稳定 ID 仍为 `scn_broadcast_room`；
6. “进入 Sequence”打开同一场景的 Writer；Script 权威文本为 `scene "旧广播室 · N40 实测" @id(scn_broadcast_room)`，且报告 0 个阻断问题；
7. 页面 console error/warning：`[]`。

这证明的是开发者生产浏览器工程闭环，不是真人产品验收。

## 5. 本机完整门

`npm run check` 退出码 0，实际结果：

- 治理：50 条需求、唯一 active `RA-N21-005`、当前节点 N40，N40 Product Acceptance/N41/M1/发布阻断仍在；
- Compiler：20/20；Runtime：55/55；10,000 seeds / 20,000 replays / 40 chunks，digest `20e9a842cd1e70b012d2307b37209f63192f4e463df7e15cf5beed8c5fc92ef2`；
- 普通测试：102 files / 623 tests；storage：1/1；重型 VM：5/5；
- 构建：14 workspaces 全部成功；Editor CSS 81.48 kB（gzip 15.47 kB），JS 741.24 kB（gzip 210.59 kB）；
- 架构：90 portable files / 4 Node adapter files；Script performance 10/10；Asset performance 4/4。

Editor JS 仍有 `>500 kB` warning，本切片只登记债务，不通过调高阈值隐藏。

## 6. 远端 Windows / Node 22

实现提交 `7fb1010` 推送后，Draft PR #59 的 product-baseline run `32509355479` / job `96856611297` 实际执行锁定依赖安装与完整 `npm run check`，4 分 19 秒绿色。该结果验证的是干净 Windows / Node 22 实现头，不以本机缓存替代远端证据。

## 7. E1 结论与下一阻断

N40-E1 已形成“Canonical Project → Compiler 图事实 → Route Map → Project Service 编辑 → Canonical Project → Route/Writer/Script 重投影”的可运行闭环。本地自动化、构建、生产浏览器与远端 Windows / Node 22 证据全部通过，E1 Engineering 切片关闭。

N40 后续必须按顺序补齐：

1. 真实 10k Branching Route Golden、局部加载与目标预算；
2. 布局 Sidecar、删除布局不损剧情、脚本增量更新保布局；
3. 分组/折叠/过滤、不可达/循环产品诊断与路线运行高亮；
4. 可撤销图编辑和 500 ms Script→Route 增量同步测量；
5. N40 完整工程出口复审与独立 Product Acceptance。

在这些证据完成前，`REQ-ROUTE`、`AC-03`、`AC-17` 保持“实现中”，N40 Product Acceptance 保持失败。
