# N40-E8i Index-backed Lazy Narration Structural Transaction 审计

> 日期：2026-08-24
> 实现提交：`d1339d89e4755d7b66bfb14c31e1bc79d3247759`
> 范围：Route-first Lazy Scene → 全局 ID 索引预检 → Story Language P0 命令 → Compiler 精确变更证明 → Route 中性证明 → expected-version selected atomic write
> 结论：Route-first Sequence 已完成第一个可落盘的结构事务。创作者可在具有后继路径的既有语句后新增一条旁白；事务必须使用同 revision 的 E8h 索引证明 statement/text ID 全局唯一，由正式 portable Compiler 边界证明候选脚本只新增这一条合法旁白，由 Route 边界证明路线事实和跨场景边不变，最后只写当前 script。保存后完整 Compiler、Route 和索引可重建并再次局部打开新增语句。删除、移动、终止语句后插入、其他 P0 类型和跨实体引用仍失败关闭，因此本节点不等于完整 N41 Sequence，也不关闭 N40 Product Acceptance。

## 1. 计划审计与纠偏

E8h 要求下一步把索引、正式 Compiler/Route 语义验证和 selected atomic write 合成一个事务。代码审计确认现有 Story Language 已有 P0 insert/delete/move 命令，但完整 Project Compiler 只接受完整 Canonical Project；局部页不能伪造缺失的变量类型和资源正文后声称做过完整工程编译。

本节点据此收窄为可形式化证明的第一片：只新增 `narration`。Compiler 证明基线中的每个既有 statement 完全不变、候选只多一个声明一致且正文非空的 narration，并拒绝 choice/jump/return/end 等终止控制流锚点；Route 独立比较 choice/label/jump/call/condition/end 事实，证明路线语义未变化。这个证明依赖 E8h 索引只在完整 Compiler 成功后发布的基线事实，没有把局部检查冒充全量 Compiler。

审计还保留一个明确限制：默认空白工程当前只有 `end`，因此不能直接在该终止语句后插入；需先在含非终止语句的场景使用本切片。支持“终止语句前/场景首部插入”应由后续正式命令扩展完成，不能绕过 Story Language 命令拼接源码。

## 2. 冻结事务协议

1. E8i 只接受一次 `insert-narration`；页面必须处于 `ready`、无其他 dirty 内容、无待处理结构事务；
2. request 固定包含 `afterId/statementId/textId/text`，ID 必须满足稳定 ID 规则且 statement/text ID 不同；
3. 当前 page 必须携带 `sourceVersion` 完全一致的 trusted Lazy Edit Index；新 statement/text ID 在全局 entities 中都不得存在；
4. Story Language 必须通过正式 `script.p0-insert` 命令产生候选 source session，不允许字符串拼接写入；
5. Compiler preflight 必须证明：scene/schema 不变、锚点存在且非终止、候选长度只增加 1、插入位置/类型/ID/正文与声明一致、移除新增项后与基线 statements 完全相同；
6. Route preflight 必须证明新增项不是 Route fact，且所有 choice/label/jump/call/condition/end 事实与基线完全相同；
7. apply 时和 save 前各执行一次 Compiler/Route 证明；内存凭据、baseline source、index revision 任一不一致都拒绝；
8. 保存只能调用 `writeSelectedFiles({scriptPath}, expectedSourceVersion)`；revision race 必须为 `stale` 且零覆盖；
9. 保存成功后必须清除旧 edit index 和结构事务凭据，使所有 Compiler/Route 派生物保持失效状态，直到完整重建；
10. 任意 Script/Sequence 内容编辑会取消结构凭据；不得把“结构插入 + 额外内容修改”偷渡为同一个已证明事务。

## 3. 红灯与实现纠偏

红灯实际执行：

```text
npx vitest run packages/project-compiler/src/lazy-structural-preflight.test.ts packages/route-graph/src/lazy-structural-preflight.test.ts apps/editor/src/lazy-scene-session.test.ts --maxWorkers=1
```

结果为 `3 files failed`：Compiler/Route 两个 suite 因实现模块不存在而各 `0 tests`，Editor 的两个新闭环测试因 `insertLazyNarration is not a function` 失败；旧测试仍有 `8 passed`。这证明测试先于实现且直接命中三个缺口。

实现后首次组合测试发现两条既有失败关闭测试的产品错误文案回归；已恢复“结构、稳定 ID 与跨实体引用”语义并保留新的 Compiler/Route 原因。首次完整 `npm run check` 随后在类型检查真实发现 `ProjectLifecycleSession.hostVersion` 为 `string | null`，测试不得直接当作 `string` 使用；已增加运行时非空证明，再从头执行完整检查。没有用类型断言、跳过测试或放宽门槛掩盖问题。

实现内容：

- `@world-studio/project-compiler` 新增 portable narration insertion preflight；
- `@world-studio/route-graph` 新增 portable Route-neutral scene preflight；
- Lazy Scene 保存边界新增结构事务凭据和 apply/save 双重验证；
- Lazy Sequence UI 新增“在所选语句后新增旁白”，只有索引对齐、页面干净且锚点有后继路径时可用；
- 保存后完整重编译、Route/索引重建与局部重开测试验证新增 statement/text 已进入新的 trusted revision；
- Route 专用 Node 单进程性能门新增 10k statements Compiler + Route 双预检 `<500 ms` 预算。

## 4. 实际测试证据

定向测试最终覆盖 Compiler 正反例、Route 正反例、索引缺失/重复 ID/终止锚点/revision race、真实 fake-IndexedDB 原子保存、UI 入口以及保存后完整重建重开；相关新增回归共 7 项，全量计数由 E8h 的 692 增至 699。

最终本地 `npm run check` 退出码 0：

- 普通并行测试 `113 files / 699 tests`；存储 `1/1`；VM 重载一致性 `5/5`；
- Runtime `10,000 seeds / 20,000 replay executions`，0 failed seeds，最终用时 `8206 ms`；
- Route full projection `1767.65 ms`、index `7.61 ms`、three queries `3.16 ms`；局部编辑 P95 `62.47 ms < 500 ms`；
- E8h 10k Lazy Edit Index `137.71 ms < 500 ms`；E8i 10k Compiler + Route 双预检 `4.37 ms < 500 ms`；
- 全部 workspace build、治理、架构与 Script/Route/Asset 性能门通过；
- Editor JS `820.72 kB`（gzip `231.61 kB`），既有 `>500 kB` 拆包 warning 保留。

软件实际以端口 `5183` 启动，Vite ready `103 ms`；HTTP 返回 `200`、`528 bytes`、标题 `WorLd Studio`，验证后已停止。第一次启动命令的 npm workspace 参数边界错误在 Vite 启动前失败，随后用正确的 `--` 参数边界重试成功；没有把命令错误记为产品通过。

实现头 GitHub run `32652926653` / job `97227196050` 在 Windows / Node 22 用时 `4m59s`，完整成功。Windows 实测 Route 编辑 P95 `134.26 ms`、Lazy Edit Index `252.36 ms`、E8i 10k 双预检 `10.25 ms`，均保持原 500 ms 预算。

production in-app browser 仍受管理员安全策略阻断，本节点没有把 jsdom UI 测试或 HTTP 200 冒充 production browser DOM/console 证据。

## 5. 未关闭项与下一步

E8i 关闭的是“一个可验证、可保存、可完整重建的 lazy 结构事务”，不是“完整结构编辑”。仍未完成：

- 场景首部/终止语句前插入，narration 删除/移动，以及其他 P0 类型的安全结构命令；
- Choice option、speaker、variable、asset 等跨实体引用结构编辑；
- 多结构命令 batch、复制、折叠、批量、跨页历史和多 dirty scene；
- structure/topology 存储级分页、外部宿主 selected write 与 production browser；
- N40 Product Acceptance、N41 Engineering 和 M1 纵向验收。

下一节点 E8j 应扩展同一事务协议，而不是另开旁路：先补场景首部/终止语句前插入以及 narration 删除/移动，让默认空白工程也能从 Route-first Sequence 建立内容结构；每个命令继续要求 E8h 全局索引、Compiler 精确变更证明、Route 中性证明、expected-version 原子写和保存后完整重建。涉及 Choice/引用/控制流的类型继续留到具备对应语义证明后再开放。
