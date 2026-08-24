# N40-E8j Lazy Narration Structure Flow 审计

> 日期：2026-08-24
> 实现提交：`064d54efb9eaa1b5dc4f02e0b316fa405e799663`
> 范围：显式 before-anchor Story Language 命令 → narration 前插/删除/移动 → Compiler 精确变更证明 → Route 中性证明 → selected atomic write → 完整重建与重开
> 结论：默认空白工程现在可以从唯一的 `end` 前新增第一条旁白，并继续新增、移动、删除旁白；每次结构操作都经过同 revision 全局索引、Compiler/Route apply/save 双预检和 expected-version 原子写，保存后可完整编译、重建 Route/索引并局部重开。由此形成“空白工程 → 建立线性内容结构 → 保存 → 重建 → 再编辑”的最小可运行编辑闭环。它仍只覆盖 narration，不等于完整 Sequence、完整游戏引擎或 N40 Product Acceptance。

## 1. 需求审计与纠偏

E8i 的真实限制是：默认模板只有终止语句 `end`，既有 `insertP0Node(source, null, ...)` 的 `null` 语义又是“追加到文档末尾”。若把 `null` 偷换为“场景首部”，会破坏兼容；若在 `end` 后追加，则生成不可接受的控制流结构。

E8j 因此没有拼接源文本，也没有篡改旧 API 语义，而是在 Story Language 增加显式 `beforeId` 协议：`insertP0NodeBefore` / `moveP0NodeBefore` 及 `script.p0-insert-before` / `script.p0-move-before`。Compiler 结构预检扩展为带判别字段的 narration 操作联合，旧 E8i `preflightLazyNarrationInsertion` 保留为兼容包装。Route 仍使用同一独立事实比较边界。

范围继续失败关闭：只允许单次 narration 前插、后插、删除或移动；Choice、Dialogue speaker、变量、资源、控制流和多命令 batch 不在本节点开放。这样补齐空白工程最小编辑闭环，同时不把 N41 的完整 Sequence 范围偷渡进 N40。

## 2. 冻结事务协议

1. 页面必须为同 revision trusted index 对齐的干净 `ready` 页；一次保存只允许一个结构事务；
2. 插入必须声明 `beforeId` 或兼容的 `afterId`、全局唯一 `statementId/textId` 和非空正文；
3. 删除、移动目标必须在当前投影中真实存在且类型为 narration；非 narration 目标拒绝；
4. 前插/前移必须使用正式 before-anchor Story Language 命令；不得改变旧 append 语义或拼接源码；
5. Compiler 对插入证明“恰好多一条声明一致的非空 narration”，对删除证明“恰好少一条目标 narration”，对移动证明“只有目标 narration 的顺序改变”；任何正文、ID、类型或第二项变化均拒绝；
6. after-terminal 插入/移动继续拒绝；before-terminal 合法，因此空白模板可在 `end` 前建立首条内容；
7. Route preflight 必须证明 choice/label/jump/call/condition/end 事实及顺序完全不变；
8. apply 和 save 各自重新执行 Compiler/Route 证明；凭据、基线、index revision 任一不一致即失败；
9. 保存只写当前 script，并携带 expected source version；并发 revision race 返回 `stale` 且不覆盖；
10. 保存后旧 index 与事务凭据立即失效，必须完整重建后才能执行下一次结构事务。

## 3. 红灯、实现与闭环

红测在实现前实际执行：

```text
npm exec vitest run packages/story-language/src/n20-language.test.ts packages/project-compiler/src/lazy-structural-preflight.test.ts apps/editor/src/lazy-scene-session.test.ts
```

结果为 `3 files failed / 4 tests failed / 19 passed`：before-anchor API 和通用 Compiler preflight 均不存在，空白工程调用前插后仍只剩原 `end`。这直接证明缺口存在，而非依据计划文档猜测。

实现后定向组合为 `4 files / 26 tests` 全部通过，覆盖：

- before-anchor 插入和移动的 Story Language round-trip；
- Compiler 前插、删除、移动正例以及删除非 narration、伪装正文变化、终止锚点反例；
- 默认空白工程前插第一条 narration，连续保存、完整 Compiler/Route/索引重建、重开、再插入、移动、删除；
- 缺 index、重复 ID、删除 `end`、移动到 `end` 后、revision race 的失败关闭；
- Sequence UI 在所选语句前插入，以及空白模板对 `end` 的首条旁白入口。

闭环测试使用真实 fake-IndexedDB workspace 和 selected write，不是内存对象臆断。每次保存后都调用完整 lifecycle compilation、读取新 Route overview / Lazy Edit Index，再用新 revision 重开局部场景。

## 4. 实际测试与运行证据

最终本地 `npm run check` 退出码 0：

- 普通并行测试 `113 files / 704 tests`；存储 `1/1`；VM `5/5`；
- Runtime `10,000 seeds / 20,000 replay executions`，0 failed seeds；
- 全部 workspace build、治理、需求、风险、架构和 Script/Route/Asset 性能门通过；
- Route 编辑 P95 `64.32 ms < 500 ms`，10k Lazy Edit Index `138.67 ms < 500 ms`；
- 10k narration 结构预检本地前插/移动/删除分别 `4.01 / 2.44 / 2.38 ms`，每项均 `<500 ms`；
- Editor production build 成功，JS `826.52 kB`（gzip `232.43 kB`）；既有 `>500 kB` 拆包 warning 保留，不冒充优化完成。

软件实际以 `127.0.0.1:5184` 启动，Vite ready `102 ms`；HTTP 返回 `200`、`528 bytes`、标题 `WorLd Studio`，随后已停止。当前环境的 production in-app browser 自动化仍受管理员策略阻断，因此本节点只登记 jsdom 交互、真实数据闭环、构建和 HTTP 启动证据，不登记 production browser DOM/console 通过。

实现头 GitHub Actions run `32654253484` / job `97230449299` 在 Windows / Node 22 用时 `4m54s`，完整成功。远端普通测试为 `113 files / 704 tests`，Runtime corpus 为 10k/20k 且 0 失败；Route 编辑 P95 `141.70 ms`、Lazy Edit Index `249.17 ms`，E8j 10k 前插/移动/删除分别 `9.12 / 7.24 / 7.35 ms`，全部保持 500 ms 预算。

## 5. 当前能力边界与下一步

E8j 关闭了默认工程无法建立第一条内容的真实阻塞，也完成了 narration 的最小增删改序闭环。但以下能力仍未完成：

- Dialogue、Choice/options、Wait、Direction 与其他 P0 类型的结构增删改；
- speaker/scene/variable/asset 等跨实体引用事务及相应 Compiler/Route 证明；
- 复制、批量、折叠、多事务保存、多 dirty scene 和跨页统一历史；
- structure/topology 存储级分页与增量写，当前 Route 首屏之外仍有全量结构读取；
- 外部目录 selected write、production browser、真人验收和正式 Player/三端发布。

下一节点不应直接宣称进入 N41。应先做 N40-E8k 准入复审：优先关闭 Route structure/topology 分页与 trusted 增量更新，或在授权/验收条件满足后再开启 N41 的类型化结构命令。无论选择哪一项，仍须保持“红测 → 正式命令 → Compiler/Route 证明 → 原子保存 → 完整重建 → 本地全门 → 实现推送/Windows CI → 文档推送/最终 CI”的顺序。
