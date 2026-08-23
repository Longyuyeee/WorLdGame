# N40-E8f 可信单场景编辑闭环审计

> 日期：2026-08-23
> 实现提交：`b09658a38da2f3f43be540a2f659a563c53991b1`
> 范围：Route-first 场景入口 → script/layout 可信补读 → Script 内容编辑/撤销重做 → 单文件原子保存 → Route 派生失效与完整重建
> 结论：受管 IndexedDB 工程已经形成一个真实可落盘的 Route → 单场景 Script 闭环。它只补读所选场景的 script 与 layout，支持既有语句内容编辑、诊断隔离、Undo/Redo、expected-version 冲突拒绝和仅 script 原子写入；保存后明确使旧 Route artifact 失效，用户加载完整工程即可重编译并看到已保存内容。本节点不等于完整 Sequence、结构编辑或编辑器整体 lazy loading 已完成，也不关闭 N40 Product Acceptance。

## 1. 调用链审计与纠偏

E8e 的下一步原计划先接一个可编辑 scene page，再逐步补 dirty page、Undo/Redo、保存集合和冲突。实现前审计发现，如果只做读取和文本框，现有 `ProjectWorkspace.writeFiles()` 会用局部文件集合替换整个工程；这会删除未加载文件，不能称为局部编辑。因此本节点先冻结 `writeSelectedFiles(files, expectedVersion)`，再接 UI。

复审又发现单场景页没有读取其他脚本和全局实体，若允许任意新增稳定 ID 或修改跨实体引用，局部页无法证明其与完整工程不冲突。为保持 fail closed，E8f 纠偏为“既有语句内容编辑”：场景标题、语句结构、稳定 ID、角色/场景引用和控制流标签变化会拒绝保存，并提示进入完整工程。完整结构编辑仍归完整 Session/N41，不能以一个原始文本框冒充。

## 2. 冻结协议

1. scene page 状态固定为 `unloaded/loading/ready/dirty/error/stale`；
2. 加载必须在同一 trusted source version 前后验证，只读取该 scene 的 `scriptPath + layoutPath`，逐正文校验 UTF-8 size 与 SHA-256；
3. Script 使用既有 Story Language parser、projection、稳定 ID 和 `ScriptSourceSession`，无效草稿保留但不得进入权威 script；
4. Undo/Redo 复用正式 Script 历史；保存成功后开启新的内存历史 epoch；
5. 局部保存只接受 1–256 个安全且已存在的 JSON path，不允许借局部 API新增/删除工程结构；
6. selected source bodies、generation、逐文件 Hash、commit version 与全部派生缓存失效必须在同一 IndexedDB strict transaction 完成；
7. `expectedVersion` 不一致必须零写入并返回 `stale`，不得覆盖外部更新；
8. E8f 只允许不改变语句结构/稳定 ID/跨实体引用的既有内容修改；场景标题与结构命令进入完整工程；
9. 保存成功后旧 Route overview 立即标记失效，分页和再次局部编辑禁用；只有显式“加载完整工程”才能重建 Compiler/Route；
10. 外部目录、OPFS 等没有该原子边界的宿主必须报告不支持，不得回退为整工程覆盖。

## 3. 红灯与实现

首个红灯实际执行：

```text
npm test -- --run apps/editor/src/indexeddb-project-workspace.test.ts
```

该命令按仓库脚本先跑普通全量测试，结果为 `108 files passed / 1 file failed`、`678 passed / 1 failed`；失败断言为 `expected undefined to be defined`，证明 `writeSelectedFiles` 确实不存在，而不是测试臆测。

实现内容：

- Project Domain 抽出单场景 script 严格解码与确定性编码，并在 workspace contract 增加可选 selected write；
- IndexedDB workspace 在一个 strict transaction 中更新选中文件、递增 generation、更新 commit Hash 并清空该工程全部 derived files；
- 新增 Lazy Scene Session，覆盖六态、可信补读、Story Language 草稿/诊断、Undo/Redo、结构安全门、原子保存与 stale/error；
- Route overview 返回当前窗口 scene metadata；Project Home 为每个节点增加“编辑场景”，并显示局部读写边界；
- 保存后 Route 明确失效，“加载完整工程”触发正式 lifecycle/Compiler 重建，不在局部页伪造 Compiler 结果。

## 4. 实际测试证据

定向测试 `4 files / 14 tests` 全部通过，包含：

- 真实 fake-IndexedDB 只以单批 `[scriptPath, layoutPath]` 读取，`fullReads=0`；
- 有效 ending 内容修改进入 `dirty`，Undo 回 `ready`，Redo 回 `dirty`；
- 保存写集合精确为 `[scriptPath]`，layout 与所有其他文件逐值不变；
- source generation 从 1 增至 2、version 改变、Route artifact 被清空；
- 无效语法保留为 error draft 且零写入；稳定 ID/结构变化被安全门拒绝且零写入；
- 外部完整提交后使用旧 version 保存返回 `stale`，冲突内容未覆盖胜者；
- 产品 DOM 流程真实点击“Route 首屏 → 编辑场景 Start → Ctrl+S 提交 → 保存当前场景”，确认 Route 失效；再执行“加载完整工程 → 进入内容编辑器 → Script”，重新读出的权威脚本包含 `Closed loop ending`。

最终本地 `npm run check` 退出码 0：

- 普通并行测试 `109 files / 682 tests`；存储 `1/1`；VM 重载一致性 `5/5`；
- Runtime `10,000 seeds / 20,000 replay executions`，0 failed seeds，用时 `7660 ms`；
- Route 10k full projection `1723.69 ms`、index `6.00 ms`、three queries `2.99 ms`；局部编辑 P95 `60.73 ms < 500 ms`；
- 全部 workspace build、治理、架构与 Script/Route/Asset 性能门通过；
- Editor CSS `84.48 kB`（gzip `15.97 kB`），JS `798.17 kB`（gzip `225.31 kB`）；既有 `>500 kB` 拆包 warning 保留。

软件使用 `npm run dev --workspace @world-studio/editor -- --host 127.0.0.1 --port 5180` 实际启动，Vite ready `101 ms`；`Invoke-WebRequest` 返回 HTTP `200`、`528 bytes`、标题 `WorLd Studio`，验证后已停止服务。production in-app browser 仍受既有管理员安全策略阻断，本节点没有 DOM/console 的真实浏览器证据；产品交互由真实 IndexedDB + jsdom E2E 覆盖，不能冒充 production browser。

实现提交已推送至 Draft PR #59；GitHub Windows / Node 22 完整门 run `32648653153` / job `97216734611` 用时 `4m44s`，locked install、完整产品基线与 post steps 全部通过。

## 5. 需求对齐与下一步

E8f 关闭：受管 Recent Route 首屏可进入一个可信、可撤销、可冲突检测并真正落盘的单场景 Script 内容编辑闭环。它没有关闭：

- 完整 Sequence 卡片/Inspector 的 lazy scene page，以及 Script 与 Sequence 在局部 Session 中的双向投影；
- 语句增删移动、场景改名、跨场景/角色/变量引用编辑；这些仍需要全局 ID/引用索引或完整 Session；
- 多个 dirty scene page、跨页 Undo/Redo、批量原子保存与外部变化合并；
- Route topology/structure 的存储级分页；当前仍读取全部 scene metadata 和完整 Route artifact；
- 外部目录/OPFS 的 selected atomic write，以及 production browser 实测；
- N40 Product Acceptance、N41 和 M1 纵向验收。

下一节点 E8g 应先把同一 Lazy Scene Session 投影为可视 Sequence 内容页，冻结 Script/Sequence 共用历史、selection 与 dirty 状态；然后补同一 trusted revision 下的全局实体/ID 索引，使结构编辑能够在保存前完成全工程引用与重复 ID 校验。完成前不得把 E8f 的安全内容编辑称为完整 Sequence 或整体 lazy loading。
