# N40-E8g 局部 Script/Sequence 同源投影审计

> 日期：2026-08-23
> 实现提交：`27990a79fc8956f82a6fe414bde2ce3db886b555`
> 范围：Route-first Lazy Scene Session → Script/Sequence 双视图 → 共享选择/历史/dirty → 64 卡有界窗口 → E8f 原子保存闭环
> 结论：受管 IndexedDB Route-first 单场景页现在可在 Script 与可视 Sequence 间切换；两者读取同一个 `ScriptSourceSession`，共享稳定 statement ID、选择、诊断、dirty 和 Undo/Redo，并沿用 E8f 的单 script 原子保存与 Route 失效重建。局部 Sequence 可安全修改对白、旁白、选择提示/选项文本、等待时长和结局名称；结构、ID、目标、变量表达式与演出参数继续只读。本节点不是完整 N41 Sequence，也不关闭 N40 Product Acceptance。

## 1. 计划审计与纠偏

E8f 把下一步写为“将同一 Lazy Scene Session 投影为可视 Sequence，再建立全局 ID/引用索引”。代码审计确认现有完整 `WriterView` 不能直接复用：它同步依赖全工程 scenes、characters、variables、assets、Project Service 和完整 `StudioSession`。直接挂载会迫使 Launcher full read，违背 Route-first 边界。

E8g 因此只抽取 Sequence 的核心产品语义，而不复制完整 Writer 状态：

1. 卡片来自当前 scene source 的正式 Story Language projection；
2. 卡片选择写入 Lazy Scene Page，切换 Script/Sequence 不丢失；
3. Inspector 通过正式稳定 ID patch 修改同一个 source session；
4. Undo/Redo 继续使用 source session 唯一历史，不建立 Sequence 私有撤销栈；
5. 结构/引用编辑在可信全局索引存在前保持失败关闭。

实现末期复审发现 Set/Condition 表达式可能引入未加载变量引用。E8f 的结构安全签名原先允许表达式变化，与“跨实体引用不变”文案不完全一致；E8g 已纠偏为把 set/condition expression 纳入安全结构签名，并在局部 Sequence 显示只读。实际反例证明修改表达式后保存返回 error 且零写入。

## 2. 冻结协议

1. Script 与 Sequence 必须共享同一个 `ScriptSourceSession`、`savedSource`、status 和 source revision；
2. 当前选择以稳定 `statementId` 保存在 Lazy Scene Page，不使用 DOM index 作为身份；
3. Sequence 修改必须调用 Story Language `script.patch-dialogue`、`script.p0-update` 或原子 `script.p0-batch`，完成后由权威 source 重新投影；
4. 可编辑内容限定为 dialogue/narration 文本、choice prompt/option label、wait duration 和 ending name；
5. scene title、statement/option ID、kind/order、choice target、speaker、label/jump/call target、set variable/expression、condition target/expression 和 direction 内容不得通过局部页改变；
6. Script 无效草稿存在时，Sequence 继续显示最后有效 committed projection，但 Inspector 禁用；
7. Script 或 Sequence 的有效修改都进入同一 history/future，Undo/Redo 后两视图必须同步；
8. Sequence 每页最多挂载 64 个 statement cards；上一/下一窗口按固定 64 边界移动，选择变化自动 reveal；
9. 保存继续执行 E8f selected atomic write，成功后 Route 派生失效，完整工程重编译验证落盘；
10. 不得把本节点的内容 Inspector 称为完整 Sequence：插入、删除、移动、复制、批量、跨实体选择器和演出 Inspector 尚未迁入 lazy page。

## 3. 红灯与实现

红灯实际执行：

```text
npx vitest run apps/editor/src/lazy-scene-session.test.ts apps/editor/src/studio-launcher-managed-workspace.test.tsx
```

结果为 `2 files failed / 2 tests failed / 3 tests passed`：核心报 `selectLazySceneStatement is not a function`，产品路径找不到 `Sequence 视图` 按钮。这证明测试先于实现，并分别命中共享会话 API 与真实产品入口。

实现内容：

- Lazy Scene Page 新增稳定 statement selection、committed scene projection 和 Sequence 内容 patch；
- 新增独立 `LazySequenceEditor`，展示 P0 类型卡、选中态和安全内容 Inspector；
- Project Home 增加 Script/Sequence 双视图切换，两者共享 dirty、error、Undo/Redo 和保存按钮；
- 复用 `stage-window` 建立 64 卡固定分页与 selection reveal；
- 收紧 E8f 保存结构签名，把 set/condition expression 纳入禁止变化字段；
- 产品 E2E 改为从 Route 进入 Sequence 修改 ending，再切回 Script 验证文本、Undo/Redo、原子保存和完整工程重读。

## 4. 实际测试证据

最终定向回归 `4 files / 13 tests` 全部通过，覆盖：

- Route → scene → Sequence → ending Inspector → Script 同步；
- Script 中可见 Sequence 修改；共享 Undo 回原值、Redo 回修改值；
- 保存后 Route 失效，完整工程重编译后的 Script 仍包含修改；
- choice prompt/label 修改后 option ID 与 target scene ID 不变并可真实保存；
- 1,000 次 Script/Sequence 交替内容编辑产生 1,000 条共享历史，statement ID 不变、最终 ending 正确、0 error diagnostics；
- 150 statements 的窗口实际挂载 `64 → 64 → 22` 张卡，对应 `1–64 → 65–128 → 129–150`；
- set expression 修改在没有 trusted global reference index 时保存失败，selected write 次数为 0。

最终本地 `npm run check` 退出码 0：

- 普通并行测试 `110 files / 687 tests`；存储 `1/1`；VM 重载一致性 `5/5`；
- Runtime `10,000 seeds / 20,000 replay executions`，0 failed seeds，用时 `7583 ms`；
- Route 10k full projection `1771.89 ms`、index `7.56 ms`、three queries `3.28 ms`；局部编辑 P95 `109.57 ms < 500 ms`；
- 全部 workspace build、治理、架构与 Script/Route/Asset 性能门通过；
- Editor CSS `84.48 kB`（gzip `15.97 kB`），JS `804.76 kB`（gzip `227.37 kB`）；既有 `>500 kB` 拆包 warning 保留。

软件实际以端口 `5181` 启动，Vite ready `105 ms`；HTTP 返回 `200`、`528 bytes`、标题 `WorLd Studio`，验证后已停止。production in-app browser 仍受管理员安全策略阻断，因此没有把 jsdom E2E 冒充真实浏览器 DOM/console 证据。

实现提交已推送至 Draft PR #59；GitHub Windows / Node 22 完整门 run `32649874611` / job `97219677591` 用时 `4m57s`，locked install、完整产品基线和 post steps 全部通过。

## 5. 未关闭项与下一步

E8g 关闭的是“Route-first 单场景 Script/Sequence 内容同源编辑与共享历史”。以下仍未完成：

- 完整 Sequence 的插入、删除、移动、复制、批量、折叠、类型化引用选择器和演出 Inspector；
- 全工程 statement/option/text ID 唯一性，以及 scene/character/variable/asset 引用索引；
- 多 dirty scene page、跨页历史与批量原子保存；
- structure/topology 存储级分页、外部宿主 selected write 和 production browser；
- N40 Product Acceptance、N41 Engineering 与 M1 纵向验收。

下一节点 E8h 应发布绑定 trusted source revision、带 envelope Hash 的全局 Lazy Edit Index，至少覆盖 scene/character/variable/asset 与全工程 statement/option/text ID；局部页只有在该索引和 source commit 同 revision 且完整校验后，才能逐步开放插入、删除、移动和跨实体引用修改。索引缺失、损坏或 revision 漂移必须失败关闭并要求完整工程重建。
