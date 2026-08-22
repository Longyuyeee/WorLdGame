# N40-E6b 工程源文件 Inventory 审计

> 日期：2026-08-22
> 分支：`codex/n40-e1-route-graph-core`
> 范围：Web/Node 不读取 JSON 正文的源文件 path/size/modified stamp 清单与版本提示
> 结论：本地实现与实测通过；这是验证 Route 派生缓存的必要前置，不是 Route 存储级 lazy loading 完成

## 1. 计划纠偏

E6a 后原计划直接在 E6b 持久化 Route catalog/window 并接入 Launcher。真实代码审计发现该顺序会产生错误：

1. Launcher 在进入编辑器前调用 `openProject()`，已全量读取所有 Canonical JSON；
2. 完整 Route 边、节点类型和诊断只能由正式 Compiler 根据全部脚本得到；
3. Compiler 已有逐场景可重建缓存，但宿主原先既不能无正文枚举源文件，也不能判断缓存对应的文件集合是否变化；
4. 此时直接信任 `.world-cache` 会在外部修改未被发现时显示旧图，形成第二份错误事实；进入 Route 后再调用选择性读取也只是重复 I/O，不能冒充 lazy loading。

因此 E6b 被纠正为先补文件 inventory。E6c 才允许设计可删除重建的 Compiler/Route 派生缓存、失效和降级路径；产品入口切换必须在缓存正确性成立后进行。

## 2. 契约与安全边界

- `ProjectWorkspace.listProjectFiles()` 返回排序后的源 JSON `path`、字节数 `size`、宿主修改标记 `modifiedAtMs` 和 inventory `version`；
- Web adapter 只取得 File metadata，不调用 `text()`；Node adapter 使用真实目录枚举和 `stat`，不读取正文；
- `.world-cache`、`.world-host`、非法名称和非 JSON 文件不进入源清单；
- Node 发现符号链接或目录联接仍 fail closed，不能借 metadata 枚举绕过工程根目录；
- 文件增删、大小或修改标记变化会改变 inventory version；
- inventory version 是缓存失效提示，不是内容 Hash 或安全签名。同大小、同修改时间的内容替换理论上可能碰撞，E6c 必须保留内容校验、宿主变更事件或全量回退，不能单凭 stamp 宣称 Compiler 结果权威。

正文选择读取仍受 E6a 的 1–256 路径限制；inventory 为支持 10k 工程而允许枚举全部源文件，但只持有固定大小 metadata。

## 3. 实现与实际测试

- domain：新增 `ProjectFileStamp`、`ProjectFileInventory` 和可选 `listProjectFiles` capability；
- Web：递归枚举安全源 JSON，按路径排序并从 `size/lastModified` 生成宿主本地版本提示；
- Node：真实 `readdir/stat` inventory，继续执行链接拒绝与私有目录排除；
- 红灯：`2 files / 3 failed / 4 passed`，失败均为 `listProjectFiles is not a function`；
- 首次转绿：domain + Web + Node `3 files / 13 tests`；
- 失效补强：Web + Node `2 files / 7 tests`；修改源文件后两端 inventory version 均改变；
- Web File System Handle conformance 的三个正文计数在两次 inventory 前后始终为 `[0, 0, 0]`；
- Node 使用真实临时工程目录，清单路径与 `createProject()` 写入文件完全一致；真实外部目录联接在 `readFiles`、`readSelectedFiles` 和 `listProjectFiles` 三条路径全部拒绝；
- TypeScript：`npx tsc -b packages/project-domain packages/project-persistence-node apps/editor` 退出码 `0`；
- 架构审计：`90 portable / 4 adapter`，Web Editor 未引入 Node 文件系统。

## 4. 本机完整门

`npm run check` 退出码 `0`：

- 常规：`102 files / 645 tests`；storage `1/1`；重型 VM `5/5`；
- Runtime：`10,000 seeds / 20,000 replays / 40 shards`，digest `20e9a842…92ef2`；
- 14 workspace build 与治理、需求、风险、Golden、架构审计全部通过；
- Editor production build：CSS `83.32 kB`（gzip `15.78 kB`），JS `761.23 kB`（gzip `215.47 kB`），既有 `>500 kB` warning 保留；
- Route 10k：10,000 节点 / 9,999 边 / 0 诊断，Compiler `1814.71 ms`、索引 `7.26 ms`、三次局部查询 `3.25 ms`、最大 64 节点 / 128 局部边；
- Script 与 Asset 性能门全部通过。

这些是实际执行结果。Web 证据属于可观测 File System Handle conformance，不冒充 production browser；Node inventory、安全边界和修改失效使用真实文件系统。

## 5. 下一顺序

1. E5 production browser 仍因管理员安全校验不可用而待复验；
2. E6c：为正式 Compiler cache 建立可删除重建的宿主存储、schema/compiler 版本、inventory 快速失效、内容校验和 fail-closed 全量回退；
3. E6d：Launcher/Route 先加载已验证 catalog，再按 64 节点窗口读取脚本/布局；记录实际读取路径，证明无关正文未读；
4. 保存、外部编辑、删除/重命名必须使缓存失效并由 Compiler 重建，不能维护第二份剧情逻辑；
5. 之后推进运行路线高亮、10k 局部编辑和端到端 500 ms P95。

## 6. 远端证据

实现提交、Draft PR #59 与 Windows / Node 22 full check 将在推送后回填；远端绿色前只登记本地实现通过。
