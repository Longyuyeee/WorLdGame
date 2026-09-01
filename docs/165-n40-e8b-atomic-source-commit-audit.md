# N40-E8b 受管工程原子源提交审计

> 日期：2026-08-23
> 实现提交：`0e63a70bfb4e73adfdbec53ca95eb48db095c2e2`
> 范围：浏览器受管工程的 ProjectWorkspace 存储契约与 Studio Launcher 生命周期
> 结论：可信原子 source snapshot identity 已在 IndexedDB 受管工程宿主落地；Compiler/Route 尚未消费该 identity 做正文局部读取，N40 lazy-loading 与产品验收均未关闭。

## 1. 需求与偏移审计

E8a 证明 path/size/modified stamp 不能抵抗同尺寸、同时间标记的正文替换，因此不能安全地用既有目录 inventory 跳过正文 Hash。继续在 Browser File System、OPFS 或 Node 原始目录上推断强版本会牺牲 Compiler 单一事实来源，属于需求偏移。

E8b 选择先为浏览器受管工程建立真实的原子宿主，而不是伪造目录可信度。外部目录和历史 OPFS 工程保持兼容但不升级为 trusted；新建、示例、五分钟验收和 ZIP 导入改用事务型 IndexedDB workspace。这样后续 E8c 可以只在明确提供 trusted commit 的宿主上启用可信缓存路径，对其他宿主继续完整校验并 fail safe。

## 2. 冻结协议

1. `ProjectTrustedSourceCommit` 固定 `schemaVersion=1`、单调 `generation`、commit `version` 和按 path 排序的文件清单；
2. 每个文件记录 UTF-8 byte size、修改 generation 和正文 SHA-256；commit version 是规范化 commit payload 的 SHA-256；
3. source bodies、trusted commit 和派生缓存失效必须在同一个 strict-durability IndexedDB read/write transaction 中发布；
4. `expectedVersion` 在同一事务内比较，过期 writer 必须失败，不能覆盖获胜提交；
5. full/selected read 均按 trusted commit 重新核对 byte size 与 SHA-256；缺文件、错误正文或损坏 commit 一律 fail closed；
6. 新建/示例/验收/导入使用 `web-indexeddb`；Recent 可重开该 reference，同时兼容既有 `web-opfs` 和授权目录 reference；
7. E8b 不修改 Compiler cache 命中算法，不宣称 current schema 已按需读取正文。

## 3. 红灯与实现

红灯命令：

```text
npm exec vitest run apps/editor/src/indexeddb-project-workspace.test.ts
```

真实结果为 suite 加载失败、`0 tests`：`./indexeddb-project-workspace` 不存在。该红灯证明受管工程还没有可调用的原子 workspace，而不是通过 mock 预设结果。

实现新增：

- `IndexedDbProjectWorkspace` 和三个隔离 object store：source、commit、derived；
- 原子写入、并发冲突、逐文件 Hash、commit Hash、inventory、selected/full read 与派生缓存生命周期；
- `web-indexeddb` host kind 与可选 `readTrustedSourceCommit()` ProjectWorkspace 能力；
- Studio Launcher 对新受管工程的创建、示例、验收、ZIP 导入及 Recent 重开；
- 旧 OPFS recent 和用户选择目录的兼容分支保持不变。

## 4. 实际测试

定向回归：

- `indexeddb-project-workspace.test.ts`、`studio-launcher-managed-workspace.test.tsx`、`editor-project-compilation.test.ts`：`3 files / 7 tests` 全部通过；
- 加入 Browser Directory 与 Project Home 回归后：`5 files / 17 tests` 全部通过；
- `npx tsc -b packages/project-domain apps/editor` 退出码 0；
- 测试实际覆盖一次提交同时发布正文/Hash/inventory/version、过期 writer 拒绝、获胜提交失效派生缓存、正文绕过事务后 selected/full read 双双闭锁，以及创建后卸载 UI、重新装载、从 Recent 打开同一 IndexedDB 工程并进入可编辑状态。

完整 `npm run check` 退出码为 0：

- 普通并行测试：`106 files / 665 tests`；
- 存储一致性 `1/1`；VM 重载一致性 `5/5`；
- Runtime：`10,000 seeds / 20,000 replay executions`，0 failed seeds；
- 全部 workspace build、架构、Script/Route/Asset 性能门通过；
- Editor CSS `84.48 kB`（gzip `15.97 kB`），JS `779.05 kB`（gzip `220.28 kB`），既有 `>500 kB` warning 保留；
- Route 10k full projection `1757.63 ms`，index `5.45 ms`，three queries `2.95 ms`；
- Route 局部编辑 20 样本 P95 `59.28 ms < 500 ms`。

Vite 已在 `127.0.0.1:5174` 实际启动。按 Browser 技能连接应用内浏览器时，管理员安全策略无法完成校验，页面访问在加载前被拒绝；故本节点没有可见 DOM/console 的 production-browser 证据。自动化 UI 生命周期测试通过不能替代该项，browser 状态保持未验证。

实现提交已由 Draft PR #59 的 GitHub Windows / Node 22 完整门复验：run `32643998215` / job `97205305615` 用时 `4m42s`，locked install、完整产品基线与 post steps 全部通过。

## 5. 需求对齐与下一节点

E8b 关闭的是“受管工程没有可信原子 source snapshot identity”的前置缺口。它没有关闭 REQ-ROUTE 的局部加载：当前 `openCompiledLifecycleProject()` 和 `compileProjectWorkspace()` 尚未读取 trusted commit 来证明 cache 对应同一原子 source revision，current cache hit 仍会读取全部 Canonical JSON。

后续调用链审计确认，现有 Editor 同步要求完整 `CanonicalProject` 与 `baseFiles`，因此原先“E8c 只读启动 manifest/选中场景即可进入完整编辑器”的表述不成立。E8c 已纠偏为可信 cache v2 warm reopen：验证 commit 与完整派生快照后不访问 source-store 正文，但 snapshot 本身仍是完整正文。详见 [E8c 审计](166-n40-e8c-trusted-warm-reopen-audit.md)。

E8c 实际协议为：

1. 只对 `readTrustedSourceCommit()` 返回有效 commit 的 workspace 启用 trusted fast path；
2. 证明 Compiler cache envelope 的 source hashes、路径集合、source version、byte size 与 commit 完全一致后，从 cache v2 exact snapshot 恢复完整工程且不读取 source-store 正文；
3. cache miss、commit/cache 不匹配、损坏或不支持 trusted commit 的宿主继续完整读取、逐源 Hash 和全量编译；
4. 用读取计数证明 warm hit 没有调用 full source read，并继续实测 cold miss、warm hit、损坏、future schema 与外部目录兼容；
5. 真正场景级 lazy loading 留给 Lazy Project Session 架构节点；production browser 未恢复前保持 N40 Product Acceptance fail closed。
