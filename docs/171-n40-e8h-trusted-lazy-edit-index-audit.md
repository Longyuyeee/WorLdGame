# N40-E8h Trusted Global Lazy Edit Index 审计

> 日期：2026-08-24
> 实现提交：`e51b47f0028d243c44146da7749a3c80ae12a3ea`
> 测试分层纠偏提交：`5905b3e4ecec9f601ad2b46e3bc89c12f99730a2`
> 范围：完整 Canonical/Compiler 生命周期 → revision-bound 全局声明与反向引用索引 → envelope Hash → Route-first scene 交叉校验
> 结论：受管 IndexedDB 工程在完整编译成功后会发布独立 `.world-cache/lazy-edit-index-v1.json`。Route-first 打开单场景时不读取全工程 source bodies，而是读取该索引并与同一 trusted source revision、当前场景真实 script 投影交叉校验。索引覆盖 project/chapter/scene、character/variable/asset、statement/option/text，以及 localization/screen/plugin/test-route/extension 声明，并记录 entry scene、speaker、choice target、set/expression variable 和演出 asset 反向引用。本节点关闭全局 ID/引用索引前置缺口，但尚未开放结构编辑，也不关闭 N40 Product Acceptance。

## 1. 计划审计与纠偏

E8g 计划要求“发布绑定 trusted revision、带 envelope Hash 的全局 Lazy Edit Index，然后逐步开放结构编辑”。真实调用链审计确认索引不能并入 Route overview：Route artifact 是可视图派生，只覆盖场景图事实；完整 Writer 又依赖全工程 Canonical 正文。E8h 因此建立独立派生物，并只在完整 Compiler 成功时发布。

实现审计还确认：全局 ID/引用索引只是结构编辑的必要条件，不是充分条件。插入、删除或移动可能改变结局可达性、控制流、资源依赖和 Compiler diagnostics；不能因为 E8h 有索引就直接开放结构按钮。后续节点必须把索引预检、局部 Story Language 命令、增量 Compiler/Route 语义验证与 selected atomic write 合并为一个失败关闭事务。

## 2. 冻结协议

1. 派生路径固定为 `.world-cache/lazy-edit-index-v1.json`，不得混入 Canonical source 或 Route overview；
2. Artifact 固定 `schemaVersion=1`，包含 `sourceVersion/projectId/entities/references/envelopeHash`；
3. entity 按稳定 ID 排序并全局唯一，记录 kind、source path、JSON pointer、owner 与 scene owner；
4. 已知声明覆盖 project/chapter/scene、character/variable/asset、statement/option/text、localization/screen/plugin/test-route；未知保留字段内的 `id/textId` 以 extension 声明收录；
5. reference 覆盖 entry-scene、speaker、choice-target、set-variable、expression-variable 与 direction asset，并对完全相同引用去重；
6. 发布前后 trusted commit 必须与请求 source version 相同；source race 必须报错；
7. 读取必须校验 commit、严格 schema、source path、Envelope Hash、全局重复 ID、owner/scene 关系和 reference resolution；
8. Route-first scene 必须把索引中的 statement/option/text 集合与真实选中 script 精确交叉校验；Envelope 合法但遗漏当前场景 ID 仍失败关闭；
9. 读取索引不得调用 `readFiles()` 或 `readSelectedFiles()`；当前 scene 正文仍按 E8f 读取 `script+layout`；
10. selected save 会在同一 IndexedDB 事务中清除所有派生物；保存成功后的 page 必须丢弃旧索引，不能把旧 revision 索引用于下一次结构修改。

## 3. 红灯、实现与远端纠偏

红灯实际执行：

```text
npx vitest run apps/editor/src/trusted-lazy-edit-index.test.ts
```

结果为 `1 suite failed / 0 tests`，Vite 明确报错 `Failed to resolve import "./trusted-lazy-edit-index"`，证明协议测试先于实现。

实现内容：

- 新增 deterministic Lazy Edit Index builder、严格 artifact parser、trusted publish/read；
- 完整 Compiler 成功后与 Route overview 分别发布；Compiler 有 error 时不伪造可信索引；
- Route-first scene 打开时读取索引并显示 ID/reference 数量与 revision 对齐状态；
- 当前 scene source 与索引精确核对 statement/option/text 所有权和 source path；
- selected save 后移除内存中的旧索引；
- 专用 Route 性能门新增 10k statements / 20k statement+text IDs 的 500 ms 预算。

第一次实现头 GitHub run `32651352033` / job `97223349164` 在 Windows 并行 jsdom 普通单测中实际得到 `517.6557 ms`，触发 `<500 ms` 断言并失败。审计确认同一规模被普通并行 jsdom 单测和专用 Node 单工性能门重复计时；前者受调度噪声影响，不是有效性能环境。纠偏提交 `5905b3e` 保留普通测试的 10k 完整性断言，把时间预算唯一收敛到会输出 JSON 证据的 `audit:route-performance`。没有提高 500 ms 预算，也没有删除 10k 性能门。

纠偏后 GitHub run `32651592837` / job `97223944981` 完整成功；Windows 专用门实测 Lazy Edit Index `308.36 ms < 500 ms`，证明修正的是测试分层而非掩盖性能回归。

## 4. 实际测试证据

最终定向回归 `5 files / 20 tests` 全部通过，覆盖：

- deterministic entity/reference projection 与 Envelope Hash；
- full Compiler lifecycle 发布，随后只读 commit + derived artifact，`fullReads=0`、`selectedReads=0`；
- Hash 损坏、重新签名的重复 ID、source revision race 与失效后缺失全部拒绝；
- Envelope 合法但遗漏当前 scene statement 的索引被正文交叉校验拒绝；
- Route → scene 产品路径显示 revision 对齐的全局索引，并继续完成 E8g Sequence/Script/Undo/Redo/save/full reopen；
- 10k narration statements 的 10k statement IDs 与 10k text IDs 全量收录。

最终本地 `npm run check` 退出码 0：

- 普通并行测试 `111 files / 692 tests`；存储 `1/1`；VM 重载一致性 `5/5`；
- Runtime `10,000 seeds / 20,000 replay executions`，0 failed seeds，用时 `7546 ms`；
- Route full projection `1685.06 ms`、index `5.24 ms`、three queries `3.08 ms`；局部编辑 P95 `58.69 ms < 500 ms`；
- E8h 10k global Lazy Edit Index `140.49 ms < 500 ms`，生成 `20,003 entities / 1 reference`；
- 全部 workspace build、治理、架构与 Script/Route/Asset 性能门通过；
- Editor JS `815.58 kB` 左右（gzip `230.13 kB`）；既有 `>500 kB` 拆包 warning 保留。

软件实际以端口 `5182` 启动，Vite ready `97 ms`；HTTP 返回 `200`、`528 bytes`、标题 `WorLd Studio`，验证后已停止。production in-app browser 仍受管理员安全策略阻断，因此没有把 jsdom 产品 E2E 冒充 production browser DOM/console 证据。

## 5. 未关闭项与下一步

E8h 关闭的是“同一 trusted source revision 下可被 Route-first scene 消费的全局声明/反向引用索引”。以下仍未完成：

- Sequence 的插入、删除、移动、复制、批量、折叠与类型化引用选择器；
- 结构修改后的增量 Compiler、Route 可达性、资源依赖和 diagnostics 预检；
- 多 dirty scene、跨页历史与多文件原子保存；
- structure/topology 存储级分页、外部宿主 selected write 和 production browser；
- N40 Product Acceptance、N41 Engineering 与 M1 纵向验收。

下一节点 E8i 应先冻结 Index-backed Lazy Structural Transaction：以当前 scene source session 产生稳定 ID 命令，用 E8h 索引验证全局唯一性与引用，用正式 Compiler/Route 增量语义验证证明不会引入阻断诊断，再以 expected source version selected atomic write 提交。任何索引缺失/不完整、Compiler 上下文不可用、Route 语义无法证明或 revision race 都必须失败关闭。首个切片应只开放可以完成上述闭环的最小语句集合，不能一次性宣称完整 N41 Sequence。
