# N40-E6a 宿主选择性工程读取契约审计

> 日期：2026-08-22
> 分支：`codex/n40-e1-route-graph-core`
> 范围：冻结并实现 Web/Node `ProjectWorkspace` 选择性 JSON 文件读取能力
> 结论：本地与远端 Windows / Node 22 完整门通过；这是 Route 存储级按需加载的基础，不是 Route lazy loading 完成

## 1. 需求与偏移审计

N40 P0 要求大型路线图“局部加载”。E2 的 64 节点窗口只限制了 UI 投影和挂载数量；`ProjectLifecycle.openProject()` 仍调用 `readFiles()`，一次读取整个工程并构造完整 `CanonicalProject`。把二者等同会掩盖真实 I/O 与内存缺口。

本切片只冻结宿主能力边界：

1. `ProjectWorkspace.readSelectedFiles(paths)` 只读取调用者明确指定的 1–256 个 JSON 路径；
2. 路径必须由小写安全段组成，拒绝空请求、重复项、遍历、非 JSON、`.world-cache` 与 `.world-host`；
3. Web File System Access adapter 不扫描无关目录；Node adapter 逐段检查并拒绝符号链接/目录联接，不能借选择性读取逃出工程根目录；
4. 返回版本只描述本次选择结果，不能替代完整工程的并发写版本；
5. 现有 `readFiles()`、打开/保存与 Compiler 权威链不变，避免在没有目录格式和事务方案前破坏工程语义。

因此，本切片不声明 Route 已按需加载。E6b 仍需设计可校验的 Route catalog/window、接入 Launcher/Route，并证明打开与换窗不会读取无关场景；Compiler 继续作为完整图事实权威。

## 2. 实现位置

- `packages/project-domain/src/project-lifecycle.ts`：新增选择性读取返回契约、可选 workspace capability 和统一路径断言；
- `apps/editor/src/browser-project-workspace.ts`：按请求路径逐级取得文件句柄，不调用全目录 `scan()`；
- `packages/project-persistence-node/src/node-directory-project-workspace.ts`：真实磁盘逐段 `lstat`，拒绝缺失路径与链接，再由受根目录约束的 file store 读取；
- 两个 adapter 的测试同时保留原有全量读写、冲突与安全行为。

## 3. 实际测试证据

- 红灯：`2 files / 2 failed / 3 passed`；两个 adapter 均因 `readSelectedFiles is not a function` 失败，证明测试先于实现生效；
- 转绿定向：domain + Web + Node 共 `3 files / 11 tests`；
- 安全补强复验：Web + Node 共 `2 files / 5 tests`；
- Web 句柄实际读取计数：请求 manifest 与场景 B 后三个文件计数为 `[1, 0, 1]`，场景 A 未调用 `text()`；遍历路径被拒绝；
- Node 真实临时目录：只返回 manifest 与指定入口脚本；外部真实 `secret.json` 经目录联接挂入后，全量扫描和选择性读取均拒绝；
- TypeScript project references：`npx tsc -b packages/project-domain packages/project-persistence-node apps/editor` 退出码 `0`；
- `npm run check` 退出码 `0`：普通 `102 files / 643 tests`，storage `1/1`，重型 VM `5/5`，Runtime `10,000 seeds / 20,000 replays / 40 shards`，14 workspace build，架构审计 `90 portable / 4 adapter`；
- Route 10k：10,000 节点 / 9,999 边 / 0 诊断；Compiler `1758.78 ms`，索引 `5.03 ms`，三次局部查询 `3.30 ms`，窗口上限 64 节点 / 128 局部边；
- production build：CSS `83.32 kB`（gzip `15.78 kB`），JS `760.55 kB`（gzip `215.28 kB`）；构建通过，既有 `>500 kB` warning 保留。

以上均为本机实际执行结果。Web adapter 测试使用可观测 File System Handle conformance；Node 测试使用真实临时目录和真实目录联接，不用 mock 代替文件系统安全边界。

## 4. 未完成与下一顺序

1. E5 production browser 第三次仍被管理员安全校验拒绝，保持实现候选，不用 adapter 测试替代产品交互验收；
2. E6b 审计发现宿主缺少无正文 inventory，原“直接接入 catalog”顺序会信任不可验证缓存；现已先补 path/size/modified stamp，详见 [E6b 审计](159-n40-e6b-project-file-inventory-audit.md)；
3. E6c/E6d：先建立 Compiler 派生缓存的内容校验和全量回退，再接入 Route 打开/换窗；保存、外部修改、删除/重命名不得产生双重事实；
4. 之后再推进运行路线高亮、10k 局部编辑与端到端 500 ms P95；
5. `RA-N21-005` 继续阻断 N40 Product Acceptance、N41+、M1 Stable 与发布。

## 5. 远端证据

- Draft PR：[#59](https://github.com/Longyuyeee/WorLdGame/pull/59)；
- 实现与首轮文档提交：`4d51cfb43c1d195403d25f4eca0a09f63dc91b98`；
- Windows / Node 22 full check：[run 32580452976](https://github.com/Longyuyeee/WorLdGame/actions/runs/32580452976)，job `97048887858`，`4m35s`，`success`；
- locked dependencies、完整产品基线与 post steps 全绿。该结果关闭 E6a Engineering，但不关闭 E5 production browser 或 E6b Route 存储级接入。
