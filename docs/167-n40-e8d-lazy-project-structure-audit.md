# N40-E8d 可信项目结构索引审计

> 日期：2026-08-23
> 实现提交：`646e374658373655836e4a872d1589cd2e5633e5`
> 范围：Project Domain 分层解码 → trusted source commit → manifest/chapter/scene 结构读取
> 结论：受管工程已有不读取 script、layout 和全局文档的可信结构索引读取边界；该边界尚未接入 Launcher、Route 或可编辑 Session，因此不是场景正文 lazy loading，也不关闭 N40 Product Acceptance。

## 1. 需求对齐与边界

E8c 已证明当前完整编辑会话不能在缺少 `CanonicalProject` 与 `baseFiles` 时直接成立。本节点没有伪造一个“已完成的 Lazy Session”，而是先建立下一阶段可依赖的最小结构协议：

1. `ProjectStructureIndex` 只包含 manifest、chapter 和 scene 元数据；
2. 严格解码拆为 manifest → chapters → scenes 三阶段，完整 `loadProject()` 继续复用相同验证，不产生第二套 Schema 语义；
3. `readTrustedProjectStructure()` 只适用于同时支持 selected read 与 trusted source commit 的 workspace；
4. 每个返回正文都按 trusted commit 的 UTF-8 byte size 与 SHA-256 重验，前后 commit 必须同 revision；
5. selected read 按既有契约最多 256 个 path 分批；缺文件、损坏正文、伪造 commit 或 revision 漂移全部失败关闭；
6. Compiler 的 trusted commit 校验收敛到 Project Domain 公共实现，避免缓存与结构读取使用不同信任规则。

当前未完成：结构索引还没有驱动 Route 首屏；所选场景的 layout/script 尚未独立补页；Writer/Script/Stage/Preview、Undo/Redo、保存和冲突处理仍使用完整同步 Session；cache v2 仍保存完整 source snapshot。

## 2. 红灯与纠偏

首个红灯实际执行：

```text
npm exec vitest run packages/project-domain/src/project-structure.test.ts
```

结果为 `2/2 failed`，原因是 `readTrustedProjectStructure is not a function`，证明测试先于实现。加入初版读取后，300 场景规模用例再次真实失败：预期批次 `[1, 1, 256, 44]`，实际为 `[1, 1, 300]`。实现随后按 `assertSelectedProjectPaths()` 的 256 上限分批，没有通过扩大契约隐藏问题。

## 3. 实际测试

定向测试命令覆盖 Project Domain、Lifecycle、Compiler cache、真实 fake-IndexedDB workspace 与 Route 回归：

```text
npm exec vitest run packages/project-domain/src/project-structure.test.ts packages/project-domain/src/project-domain.test.ts packages/project-domain/src/project-lifecycle.test.ts packages/project-compiler/src/compiler-cache-artifact.test.ts apps/editor/src/indexeddb-project-workspace.test.ts packages/route-graph/src/route-graph.test.ts
```

实际结果：`6 files / 43 tests` 全部通过。证据包括：

- 真实受管 IndexedDB 工程只发起 manifest、chapter、scene 三阶段 selected reads，`fullReads=0`；
- script、layout、characters 等全局正文没有出现在读取集合；
- 300 scene 被拆成 `[1, 1, 256, 44]`；
- 同 revision 返回被篡改正文时按 size/Hash 拒绝；
- 分批期间 revision 改变时失败关闭；
- `npx tsc -b packages/project-domain packages/project-compiler packages/route-graph apps/editor` 退出码 0。

完整 `npm run check` 退出码 0：

- 普通并行测试 `107 files / 674 tests`；存储 `1/1`；VM 重载一致性 `5/5`；
- Runtime `10,000 seeds / 20,000 replay executions`，0 failed seeds，用时 `7723 ms`；
- 全部 workspace build、架构与 Script/Route/Asset 性能门通过；
- Route 10k full projection `1743.28 ms`、index `5.17 ms`、three queries `3.82 ms`；局部编辑 P95 `59.61 ms < 500 ms`；
- Editor CSS `84.48 kB`（gzip `15.97 kB`），JS `781.44 kB`（gzip `220.91 kB`）；既有 `>500 kB` warning 未隐藏。

Vite 使用正式 Editor workspace 在 `127.0.0.1:5174` 实际启动，ready `105 ms`。应用内浏览器在加载前因管理员安全策略无法完成校验而拒绝访问；未取得 DOM/console 证据，也未绕过安全控制。本节点无 UI 集成，故只登记“启动通过、浏览器交互未验证”。

实现提交已推送至 Draft PR #59；GitHub Windows / Node 22 完整门 run `32646157815` / job `97210628628` 用时 `5m08s`，locked install、完整产品基线与 post steps 全部通过。

## 4. 审计结论与下一步

E8d 关闭的是“没有可信、分层、可分批读取的项目结构协议”，不是“编辑器已经按场景加载”。需求方向保持在实际游戏引擎的 Route/编辑闭环，没有转向平台外围工作。

下一节点 E8e 应按以下顺序执行：

1. 用 `ProjectStructureIndex` 与 Compiler cache 图构建 Route 首屏投影，不先构造完整 `CanonicalProject`；
2. 只为可见窗口/选中 scene 读取对应 layout，明确 request/byte/内存预算；
3. 进入 Sequence/Script/Stage/Preview 前按 scene ID 补读 script/layout，并定义 pending、失败、重试和 revision 变化行为；
4. 在接入编辑会话前冻结 dirty page、Undo/Redo、保存集合、外部变化和冲突处理，防止局部页与完整 Session 双事实源；
5. 用真实 IndexedDB 计数、10k 工程、production browser 和完整 CI 证明 Route 首屏没有读取全部正文。

在 E8e 产品流证据出现前，`ProjectStructureIndex` 只能称为 lazy-loading foundation。

> 后续纠偏（2026-08-23）：E8e 没有读取包含完整 source snapshot 的 Compiler cache v2，而是新增无源正文的 Route 派生快照；受管 Recent 已能以结构索引和 64 个 layout 进入只读 Route 首屏，完整编辑器仍在明确操作后加载。详见 [N40-E8e 审计](168-n40-e8e-trusted-route-first-overview-audit.md)。
