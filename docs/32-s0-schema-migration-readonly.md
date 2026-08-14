# S0.13 项目格式迁移、未知字段保留与未来版本只读审计

> 状态：实现、故障注入、干净安装、真实浏览器、移动视口、推送与 Draft PR 远端回读均通过
> 日期：2026-08-11
> 范围：项目文本元数据 schema 0 → 1；不冒充 Windows/Android 原生文件迁移或完整 M1 数据安全完成

## 1. 本切片需求边界

S0.13 把工程蓝图中的项目格式安全约束落为第一条真实升级路径：

- manifest 与 scene 文件独立携带 schema version；
- 任何迁移前先保存原始 manifest 和全部被引用 scene 文件；
- 只允许注册表中连续的 schema 0 → 1 升级，结果 storage revision 前进一位；
- 迁移可重复执行；已经升级的项目返回 `not-needed`，不会再次改写；
- 未知 JSON 字段读入后进入保留区，普通编辑与后续保存仍按原顶层位置写回；
- 未来 schema 必须在 WAL 恢复、迁移或项目写入之前拒绝，并进入只读启动闸门；
- 启动校验或迁移失败时封锁工作区，不用内置校园故事覆盖异常项目；
- schema 0 的既有轮换备份仍可校验、读取并恢复，不因编辑器升级被误报为损坏。

本切片不新增账号、云同步、协作、脚本语法、打包平台、资源格式或收费能力。

## 2. 格式与迁移契约

当前 `CURRENT_PROJECT_SCHEMA_VERSION = 1`。`probeProjectVersion` 只读取 `project.json`，返回 `missing / legacy / current / future` 及安全元数据，不执行恢复或写入。

schema 0 项目的升级顺序：

1. 获取带 fencing token 的单写者租约；
2. 探测版本，未来版本立即停止；
3. 对受支持版本执行既有 WAL 恢复；
4. 读取并校验 schema 0 manifest、scene 路径、长度与 SHA-256；
5. 把原始字符串及各自 SHA-256 写入 `migrations/pre-v1-sN.archive.json`；
6. 在内存中转换为 schema 1，并把 storage revision 从 sN 前进到 sN+1；
7. 复用两阶段 WAL 原子保存；
8. 返回来源/目标版本、归档路径、修订号和未知字段数量的迁移报告。

归档保存原始字符串，而不是重新序列化后的等价 JSON，因此可用于逐字节审计。未知字段仅接受有限 JSON 值；保留区不能覆盖当前版本的保留字段名。

## 3. 未来版本与启动失败策略

未来 schema 的保护同时存在于三层：

- `probeProjectVersion`：无副作用识别；
- `migrateProjectToCurrent`：在 `recoverProject` 前拒绝；
- `loadProject`：直接调用时也先检查 manifest 版本，再允许触碰 WAL。

Web 编辑器识别未来项目后释放写者租约，只显示项目标题、schema 版本、当前支持版本和“重新检测”入口。由于当前编辑器无法理解未来必需字段，它不会伪装成可以安全编辑完整内容。

迁移、完整性校验或存储启动失败进入 `blocked` 全屏闸门。只有完整恢复并成功构造 Studio Session 后才挂载 Writer / Script / Flow 工作区。

## 4. 兼容性与未知字段

schema 0 与 schema 1 文件均被读取为内存 schema 1。manifest 和每个 scene 的未知顶层字段分别保存在 `preservedFields`，保存时先展开未知字段、再写入当前已知字段，确保已知字段不可能被旧扩展覆盖。

Studio Session 保存时引用最后一次持久化快照，把项目级与 scene 级未知字段带到新修订。恢复备份后也同步更新该基线。

备份 envelope 仍为版本 0；其中 schema 0 `ProjectSnapshot` payload 在通过 envelope SHA-256 后只做内存规范化，不改写原备份。恢复时按现有契约产生新的 schema 1 storage revision。

## 5. 故障矩阵

自动化测试对一次 schema 0 → 1 迁移产生的每个 store mutation 边界逐一注入崩溃。重新打开后先执行 WAL 恢复，最终状态只能是：

- 完整 legacy sN；或
- 完整 current sN+1。

两种状态都必须可加载，禁止出现半份 manifest、混合 scene schema 或无法验证的临时文件被当成成功项目。额外覆盖：缺失/旧版/当前/未来探测无副作用、迁移幂等、原始归档逐文件相等、未知字段普通保存不丢失、未来项目直接 load/migrate 均零写入、旧备份不被改写。

## 6. UI 与移动端审计

- 启动阶段区分单写者检查、安全迁移、未来版本只读、启动封锁和写者冲突；
- 页脚明确显示 `schema 1` 与 `S0.13 SAFE MIGRATION`；
- 真实浏览器把保留的 S0.12 schema 0 / s5 项目升级为 schema 1 / s6；
- 原 s3/s4 备份仍被读取，UI 显示 `备份 2/5`；
- 迁移后 Writer、Script、Flow、即时预览与三场景内容正常恢复；
- 393×852 视口中 `innerWidth=393`，document/body `scrollWidth=378`，无页面级横向溢出。

未来版本只读 UI 由 fake-indexeddb 集成测试用真实 `IndexedDbProjectFileStore` 验证：schema 99 只显示只读闸门，不挂载 Writer，manifest 逐字节不变且不生成 WAL。

## 7. 本地审计证据

2026-08-11 结果：

- `npm ci`：按锁文件干净安装 128 个包；
- TypeScript strict：通过；
- 常规测试：17 个测试文件、116/116 通过；
- 五工作区构建：通过；Editor JS 279.94 kB / gzip 85.96 kB，CSS 27.01 kB / gzip 6.21 kB；
- 架构审计：20 个 portable 文件与 2 个 Node adapter 文件通过，迁移实现未引入 DOM、Node 文件系统或第三方运行时依赖；
- 10k 句性能：parse 60.30 ms、projection 6.72 ms、末句 patch 156.55 ms、总计 223.57 ms，低于 12,000 ms 总预算；
- 默认镜像 `npmmirror.com` 未实现 npm security endpoint，首次 audit 返回 404；切换官方 `registry.npmjs.org` 复跑为 0 vulnerabilities；
- `git diff --check`：通过。

最终并发复跑曾让既有 S0.12 自动保存 UI 用例触发 Vitest 默认 5 秒总超时；该用例本身包含两次 1.5 秒真实防抖、IndexedDB 备份和恢复，未出现产品断言失败。测试总预算已提升为 10 秒，产品防抖值未改变，并在随后复跑中通过。

## 8. 明确未完成

- schema 1 之后的真实多步迁移链、迁移注册工具和格式弃用周期；
- manifest 与资源索引的独立版本、Blob/CG/音频迁移与内容寻址资源库；
- Windows/Android 文件系统上的断电、ENOSPC、权限撤销和后台杀进程真机矩阵；
- 用户可下载的迁移报告、归档浏览、导出与“一键复制后打开”；
- 未来版本的通用内容预览；未知格式只能安全显示元数据；
- 2 小时 soak、低端 Android、大型商业项目迁移基准与正式支持矩阵。

这些缺口继续阻断“完整 M1 商业级数据安全已经完成”的声明。

## 9. 远端证据

- 实现提交 `451d88da61b7a2b6d79ea0864649c419e89d7c25` 已推送到 `origin/agent/visual-production-bar`；
- 既有 Draft PR #1 保持 Draft，没有创建重复 PR；
- PR 标题更新为 `Add safe schema migration and future-version read-only recovery`；
- REST API 回读确认 PR head 与实现提交一致，正文仍包含 S0.1 累计索引、完整 S0.13 标题、`116/116` 与“全局 M1 阻断项”；
- PR 更新期间一次 PATCH 遇到 TLS handshake timeout，重试后成功；最终回读正文长度为 3,167 字符，没有把网络失败误报为完成。
