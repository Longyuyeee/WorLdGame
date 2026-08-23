# N40-E8e 可信 Route-first 首屏审计

> 日期：2026-08-23
> 实现提交：`4c121887b6647ee353f3b2b906992cd9817a0ff0`
> 范围：Compiler/Route 派生快照 → E8d 结构索引 → 64 节点 layout 补页 → Recent 产品入口
> 结论：受管 IndexedDB 最近工程现在可以先进入只读 Route 首屏，且不读取 script/global/完整 Canonical 正文；用户明确点击“加载完整工程”后才进入既有同步编辑 Session。该节点关闭 Route-first 产品切片，不等于 Writer/Sequence/Stage/Preview 已按场景懒加载，也不关闭 N40 Product Acceptance。

## 1. 计划偏移与纠正

E8d 文档把下一步描述为“用 `ProjectStructureIndex` 与 Compiler cache 图构建 Route 首屏”。真实调用链审计发现两种直接接法都不成立：

1. 把结构 API 接进 `openCompiledLifecycleProject()` 后，当前 `ProjectLifecycleSession` 仍立即要求完整 `CanonicalProject`/`baseFiles`，最终仍会读取完整正文；
2. E8c `.world-cache/compiler-v2.json` 自身包含 exact full source snapshot。即使不访问 source store，直接读取该 cache 也会把全部源正文载入内存，不能称为局部首屏。

本节点因此纠偏为独立的 `.world-cache/route-overview-v1.json`：只保存 Route 图派生数据、source commit version 与 envelope Hash，不保存任何源正文。它在正式 Compiler lifecycle 成功后生成；Route 首屏先读 E8d 结构，再用该图确定 64 节点窗口，最后只从 source store 读取该窗口对应的 layout。

## 2. 冻结协议

1. Route 派生快照必须绑定当前 trusted source commit version，并校验 envelope Hash；
2. 快照内 chapters、nodes、facts、edges、diagnostics、groups、viewport 必须逐字段严格验证；仅重新计算 Hash 不能让非法图通过；
3. 快照的 project/entry/chapter/scene ID 与标题签名必须和实时结构索引完全一致；
4. 结构读取继续按 E8d 的 manifest → chapters → scenes 三阶段执行；
5. Route window 仍冻结为最多 64 nodes / 256 local edges；只读取 window scene 的 layout path；
6. layout 读取必须绑定同一 trusted revision，并逐正文复核 UTF-8 size/SHA-256；revision race、损坏、缺失全部失败关闭；
7. 产品界面必须显示本次源读取文件数、layout 数、UTF-8 bytes 和 `fullRead=false`；
8. 只有受管 IndexedDB Recent 显示 Route 首屏入口；外部目录没有 trusted commit 时不得伪装支持；
9. Route 首屏只读。进入 Project Entity Manager、Writer、Script、Stage 或 Preview 前仍明确加载完整工程，避免局部页和完整 Session 形成双事实源。

## 3. 红灯与实现

红灯命令：

```text
npm exec vitest run apps/editor/src/trusted-route-overview.test.ts
```

实际结果：suite 在 import 阶段失败，`Failed to resolve import "./trusted-route-overview"`，0 tests，证明协议测试先于实现。

实现内容：

- Project Domain 新增公共 trusted selected file read 与严格单批 layout 解码；完整 `loadProject()` 复用同一 layout 语义；
- Editor Compiler lifecycle 在受管工程编译/重建后发布无源正文的 Route 快照；
- Route-first reader 验证 commit、artifact、结构签名，查询窗口后补读对应 layout；
- Project Home 的受管 Recent 新增“Route 首屏”，支持上一/下一 64 节点窗口；
- UI 显示实际源文件数、layout 数、UTF-8 bytes 和未执行 full read；
- “加载完整工程”保留为显式边界，之后才调用既有完整 lifecycle。

## 4. 实际测试

定向回归最终结果：`7 files / 38 tests` 全部通过，覆盖 Route-first core、真实 fake-IndexedDB Launcher、Project Home、Editor Compiler lifecycle、Project Structure/Codec 与 Route Graph。

100 scene 规模证据：

- 首屏 selected read 批次为 `[1, 1, 100, 64]`：manifest 1、chapter 1、scene metadata 100、layout 64；
- UI/返回值登记 `166 files / 64 layouts / fullRead=false`；UTF-8 bytes 与实际返回正文逐字节求和完全相等，并严格小于全工程源正文；
- script path、characters/global path 从未进入读取集合；`fullReads=0`；
- 第二窗口只补读 36 个 layout，节点为 scene 64–99；
- 正文损坏、layout 页期间 revision 改变、artifact Hash 损坏、重新 Hash 后的非法图、artifact/source revision 不同全部失败关闭；
- 真实 Launcher 流程完成“新建受管工程生成快照 → 卸载/重启应用 → Recent Route 首屏 → 读取指标显示 → 加载完整工程”。

`npx tsc -b packages/project-domain packages/project-compiler packages/route-graph apps/editor` 退出码 0。

最终本地 `npm run check` 退出码 0：

- 普通并行测试 `108 files / 678 tests`；存储 `1/1`；VM 重载一致性 `5/5`；
- Runtime `10,000 seeds / 20,000 replay executions`，0 failed seeds，用时 `7612 ms`；
- 全部 workspace build、治理、架构与 Script/Route/Asset 性能门通过；
- Route 10k full projection `1749.76 ms`、index `5.36 ms`、three queries `2.97 ms`；局部编辑 P95 `57.64 ms < 500 ms`；
- Editor CSS `84.48 kB`（gzip `15.97 kB`），JS `790.56 kB`（gzip `223.34 kB`）；既有 `>500 kB` 拆包 warning 保留。

Vite 在 `127.0.0.1:5174` 实际启动，ready `99 ms`。按 Browser 技能尝试访问时，管理员安全策略仍无法完成校验并在页面加载前拒绝；未取得 DOM/console 证据、未绕过安全控制。真实 fake-IndexedDB DOM 流程通过，但 production browser 继续标记未验证。

实现提交已推送至 Draft PR #59；GitHub Windows / Node 22 完整门 run `32647435399` / job `97213728178` 用时 `3m56s`，locked install、完整产品基线与 post steps 全部通过。

## 5. 未关闭项与下一步

E8e 关闭的是“Recent 可以不加载完整工程而先看到真实 Route 窗口”。以下仍未完成：

- 结构层仍读取全部 scene metadata；10k 项目尚未建立结构目录单文件/分页格式；
- Route 派生图仍一次读入全部 topology，只有 DOM/layout source window 有界；
- 旧受管工程必须先完整打开一次生成新 Route artifact；artifact 缺失/损坏时当前 fail closed，不静默冒充快速路径；
- Route 首屏只读，搜索/过滤与完整 FlowView 交互尚未迁入该入口；
- Script、Sequence、Stage、Preview 仍要求完整 Session；dirty page、Undo/Redo、保存集合、冲突与外部变化尚未分页化；
- 外部目录、OPFS 和 production browser 没有 Route-first 证据。

下一节点 E8f 应先冻结 `LazyProjectSession` 的 scene page 状态机（unloaded/loading/ready/dirty/error/stale），实现按 scene ID 补读 script+layout，并把进入 Sequence/Script 的一个只读到可编辑流程接上；随后才处理 dirty page、Undo/Redo、原子保存集合和冲突。上述边界及真实产品流完成前，不得宣称编辑器整体 lazy loading 已完成。
