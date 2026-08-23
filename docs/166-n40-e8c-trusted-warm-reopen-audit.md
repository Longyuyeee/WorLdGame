# N40-E8c 可信缓存 warm reopen 纠偏审计

> 日期：2026-08-23
> 实现提交：`00e49c2bdbdb7ff9f8d3b152ff060e343b921779`
> 范围：Project Compiler disposable cache → trusted source commit → Editor Lifecycle warm reopen
> 结论：受管工程 warm reopen 已做到 manifest 探测后不再读取 source-store 全量正文；它仍从 cache v2 读取完整 Canonical 快照，不等于按场景 lazy loading，也不关闭 N40 Product Acceptance。

## 1. 计划偏移与纠正

E8b 文档曾把 E8c 下一步描述为“只读取启动所需 manifest/选中场景正文”。真实代码审计证明该描述超前于当前架构：`ProjectLifecycleSession`、Editor `App`、Project Service、Writer/Script/Stage/Preview 和保存冲突处理都同步要求完整 `CanonicalProject` 与 `baseFiles`。只给 manifest 和一个场景无法合法构造当前可编辑 Session；若暗中把全部正文塞进别的对象，则也不能称为场景级 lazy loading。

本轮按真实契约纠偏为：可信 commit 与派生 cache 完全一致时，从 cache 中恢复完整、经过 Hash 证明的 Canonical 源快照，避免再次访问 source object store。该路径减少 source-store transaction/request 与重复正文获取，但 cache v2 自身仍包含完整正文，总读取字节和内存尚未局部化。

## 2. 冻结协议

1. Compiler 不因适配器实现了 `readTrustedSourceCommit()` 就自动信任其返回值；必须复核 schema、generation、路径安全与严格排序、size、逐文件 SHA-256 和 commit version；
2. disposable cache 升为 `.world-cache/compiler-v2.json` / envelope schema 2，显式加入 exact `sourceFiles` snapshot；旧 v1 只作为可丢弃缓存留存，不被误读为 v2；
3. envelope Hash 覆盖 inventory version、source hash map、source snapshot 与正式 `ProjectCompilerCacheV1`；
4. trusted fast path 要求 commit version 等于 envelope inventory version，路径集合、逐文件 Hash、UTF-8 byte size 和 snapshot 正文 Hash 全部一致；
5. fast path 前后再次读取并验证 trusted commit，版本变化必须失败；
6. cache miss、旧版本、不兼容、损坏、Hash/size/path 不匹配、伪造 commit 或不支持 trusted commit 的 workspace 全部走既有 full read → load →逐源验证→compile/rebuild 路径；
7. 本节点不能登记为按场景 lazy loading；真正局部化必须先为 Editor 引入可异步补页的 Lazy Project Session/Project Service 边界。

## 3. 红灯与实现

红灯命令：

```text
npm exec vitest run packages/project-compiler/src/compiler-cache-artifact.test.ts
```

真实结果：`1 file / 4 tests` 中 `1 failed`。受管模拟 workspace 首次打开后 `fullReads=1`，warm reopen 变为 `2`，而要求保持 `1`。这直接证明旧 cache hit 只复用 Compiler scene cache，仍完整读取 source bodies。

实现后：

- cache v2 保存源 Hash、完整 exact source snapshot、Compiler cache 与 envelope Hash；
- Compiler 在 trusted commit 上先验证 commit 与 cache，再从 snapshot 建立 Canonical Project 和 Lifecycle `baseFiles`；
- trusted hit 不调用 `workspace.readFiles()`，但仍运行正式 incremental Compiler 并复用全部 scene cache；
- 外部目录/OPFS/Node 和任何不可信状态保持完整读取；
- cache 损坏后完整重建，新 v2 再次 warm reopen 恢复 fast path。

## 4. 实际测试

定向测试：

- Compiler cache、真实 fake-IndexedDB workspace、Editor Lifecycle、Studio Launcher 和 Browser Directory：`5 files / 20 tests` 全部通过；
- N30 Compiler 正式回归：`1 file / 21 tests` 全部通过；
- `npx tsc -b packages/project-compiler apps/editor` 退出码 0；
- 真实 IndexedDB 计数：首次 open `fullReads=1`，warm reopen 后仍为 `1`；manifest selected reads 为两次；
- 写入损坏 cache 后 reopen `fullReads=2` 且状态 `corrupt`，重建后再次 reopen 保持 `2` 且状态 `hit`；
- 伪造 commit 不进入 fast path，完整读取计数从 `1` 增至 `2`；外部目录测试保持 full verified path。

完整 `npm run check` 退出码为 0：

- 普通并行测试：`106 files / 669 tests`；
- 存储一致性 `1/1`；VM 重载一致性 `5/5`；
- Runtime：`10,000 seeds / 20,000 replay executions`，0 failed seeds；
- 全部 workspace build、架构、Script/Route/Asset 性能门通过；
- Editor CSS `84.48 kB`（gzip `15.97 kB`），JS `780.96 kB`（gzip `220.78 kB`），既有 `>500 kB` warning 保留；
- Route 10k full projection `1790.41 ms`，index `6.89 ms`，three queries `3.02 ms`；
- Route 局部编辑 20 样本 P95 `60.81 ms < 500 ms`。

Vite 已在 `127.0.0.1:5174` 实际启动，ready `123 ms`。按 Browser 技能使用应用内浏览器复验时，管理员安全策略无法完成校验，访问在页面加载前被拒绝；没有 DOM/console 证据，production browser 继续标记未验证，未用其他手段绕过。

实现提交已由 Draft PR #59 的 GitHub Windows / Node 22 完整门复验：run `32645089657` / job `97208020611` 用时 `4m53s`，locked install、完整产品基线与 post steps 全部通过。

## 5. 结论与下一步

E8c 关闭“受管工程 verified cache hit 仍重复读取 source object store 全量正文”的缺口。它没有减少 cache snapshot 的完整正文体积，没有使 Canonical Project 或编辑器按场景异步加载，也没有改变外部目录的 full verified read。

下一节点必须先冻结 Lazy Project Session 边界，至少回答：

1. manifest、章节/场景索引、全局实体与场景正文如何分层；
2. Writer/Script/Sequence/Stage/Preview 在正文未加载时如何显式 pending/fail closed；
3. Project Service 如何在局部载入、Undo/Redo、保存、外部变化与冲突检测下保持单一事实来源；
4. Route 如何消费 Compiler cache 图而不要求完整 Canonical scripts/layouts；
5. 读取字节、文件/IDB request、首屏时间、内存和错误恢复如何建立预算与实测。

这些契约成立并取得实际产品流证据前，不得把 E8c 表述为完整 lazy loading。

> 后续纠偏（2026-08-23）：E8d 已建立只读取 manifest/chapter/scene 的可信分层结构协议，并以真实 IndexedDB、300 scene 分批、revision race 与正文 Hash 失配测试证明；它尚未接入 Route 或可编辑 Session。详见 [N40-E8d 审计](167-n40-e8d-lazy-project-structure-audit.md)。
