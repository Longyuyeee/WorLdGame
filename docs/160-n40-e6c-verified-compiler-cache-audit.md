# N40-E6c 可校验 Compiler 派生缓存审计

> 日期：2026-08-22
> 分支：`codex/n40-e1-route-graph-core`
> 范围：Web/Node `.world-cache` 隔离、版本化 Compiler cache artifact、源 SHA-256 校验、增量复用与 fail-closed 全量重建
> 结论：本地实现与实测通过；Compiler cache 正确性基础完成，尚未接入 Launcher/Route，冷启动也尚未减少源正文读取

## 1. 需求与边界

E6b 证明 inventory 可以在不读取正文时发现常规文件变化，但 `size/modifiedAtMs` 可能碰撞，不能独立证明缓存仍对应源内容。E6c 因此冻结以下顺序：

1. inventory 只快速判定“肯定失效”；
2. cache 命中还必须逐源文件比较 SHA-256；
3. Compiler cache artifact 自带 schema、Compiler/IR 版本和 envelope 完整性 Hash；
4. 任一版本、inventory、源 Hash、结构或 envelope 不一致均不向 Compiler 提供 previous cache，而是全量重建；
5. Route 不解析 cache artifact，只能继续消费正式 Compiler 结果；
6. Canonical 保存前先清理 `.world-cache`，派生缓存始终可删除重建且不进入 `readFiles()`、Git 源文件或语义 Hash。

当前 `compileProjectWorkspace()` 为了逐源 SHA-256 校验会读取全部 Canonical JSON。它证明缓存复用正确、可在后续编译跳过未变场景，但不能登记为冷启动磁盘 lazy loading。

## 2. 实现

- Project Workspace 新增可选 `readDerivedFile`、`writeDerivedFile`、`clearDerivedFiles` capability；派生路径只能位于固定 `.world-cache/**/*.json`；
- Web/Node adapter 将派生缓存与源扫描、inventory、并发源版本完全隔离；Canonical `writeFiles` 在修改源文件前清理派生目录；
- Node 派生缓存读、写、清理逐段检查链接，`.world-cache` 目录联接三条路径全部 fail closed；
- `@world-studio/project-compiler` 新增 `compiler-v1` artifact：inventory version、全部源 SHA-256、正式 `ProjectCompilerCacheV1` 和 artifact Hash；
- `compileProjectWorkspace()` 执行 inventory → 全量源读取 → inventory 稳定检查 → artifact 校验 → incremental/full compile → inventory 再检查 → cache 写回；读取或编译期间源文件变化会中止，不能写入不一致缓存。

## 3. 测试驱动与差异修正

- 红灯：3 个测试文件失败；Compiler artifact 模块无法解析，Web/Node 均不存在 `writeDerivedFile`，其余 7 项通过；
- 首次实现后 Compiler artifact 2 项已通过，但 Web/Node 2 项被路径断言错误拒绝；根因是源路径规则禁止前导点，与固定 `.world-cache` 首段冲突；
- 修正只放行首段精确 `.world-cache`，其后路径仍执行严格小写安全段规则；遍历反例继续拒绝；
- domain + Compiler + Web + Node 最终 `4 files / 18 tests`；
- 最终 Compiler/adapter 安全复验 `3 files / 12 tests`；
- workspace 编译闭环：首次 `miss` 编译全部场景；第二次 `hit` 且 `compiledSceneIds=[]`；故意保持 inventory version 不变并篡改脚本正文后得到 `source-mismatch`，全部场景重新编译；
- artifact 反例覆盖 inventory drift、同 inventory 正文篡改、Compiler 版本不兼容和损坏 JSON；
- Web conformance 证明缓存不进入源扫描且源保存后缓存为空；
- Node 真实临时目录证明缓存持久化/隔离/保存失效，并实际拒绝 `.world-cache` 目录联接的读、写、清理。

## 4. 本机完整门

`npm run check` 退出码 `0`：

- 常规 `103 files / 650 tests`；storage `1/1`；重型 VM `5/5`；
- Runtime `10,000 seeds / 20,000 replays / 40 shards`，digest `20e9a842…92ef2`；
- 14 workspace build；架构审计 `91 portable / 4 adapter`；
- Editor production build：CSS `83.32 kB`（gzip `15.78 kB`），JS `761.94 kB`（gzip `215.64 kB`），既有 `>500 kB` warning 保留；
- Route 10k：10,000 节点 / 9,999 边 / 0 诊断；Compiler `1781.17 ms`、索引 `5.93 ms`、三次查询 `3.82 ms`、最大 64 节点 / 128 局部边；
- Script、Asset、治理、需求、风险、Golden 与架构门全部通过。

## 5. 未完成与下一顺序

1. E5 production browser 仍因管理员安全校验不可用而待复验；
2. E6d：把 `compileProjectWorkspace()` 接入 Launcher/Route 生命周期，显示 hit/miss/rebuild 状态，验证第二次打开和源保存后的真实复用/失效；
3. E6d 仍不能宣称冷启动磁盘 lazy loading，因为内容 Hash 校验会读取全部源；
4. 真正冷启动局部正文读取需要可信宿主变更日志/强文件身份，或冻结由 Compiler 生成、可验证且不成为第二事实源的目录协议；必须另行审计后才能实施；
5. 运行路线高亮、10k 局部编辑/500 ms P95、N40 Product Acceptance 仍未完成。

## 6. 远端证据

实现提交、Draft PR #59 与 Windows / Node 22 full check 将在推送后回填；远端绿色前只登记本地实现通过。
