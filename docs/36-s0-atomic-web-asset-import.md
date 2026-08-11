# S0.17 Web 资源原子导入、进度与 reload 租约审计

> 状态：需求边界、IndexedDB schema 2、原子跨 Store 事务、真实文件 UI、故障测试、干净安装、真实浏览器与远端证据回读均通过
> 日期：2026-08-11
> 范围：Web 编辑器本地资源导入与恢复；不冒充媒体内容验证、Android adapter、资源备份/GC 或 Dicing/Delta 已完成

## 1. 需求对齐

S0.16 已冻结稳定 `assetId`、不可变 SHA-256 Blob 和严格 Asset Index，但没有 Web 持久 adapter，也没有真实文件选择。S0.17 要回答：创作者在浏览器中选择一个 CG/音频/视频/字体后，能否在 writer lease、容量、取消、刷新和多标签竞争下安全写入，而不污染剧情 JSON/WAL。

本切片验收：

- 真实 `File` 二进制读取，显示文件名、MIME、字节数与进度；
- 自动建议规范 Asset ID、显示名和资源类型，允许创作者修改；
- Web 单文件原型上限 64 MiB，超限在 Blob 写入前拒绝；
- Blob 与 Asset Index 在同一个 writer-fenced IndexedDB 事务中提交；
- 相同字节复用同一 Blob，但保留不同稳定 Asset ID；
- 取消或事务错误时 Blob 与 Index 同时回滚；
- reload 后恢复 Index 与 Blob，不改变剧情 storage revision；
- 393×852 手机端保留完整导入表单和资源列表。

## 2. IndexedDB schema 2

数据库 `world-studio-local-projects` 从 version 1 升级到 version 2：

| Object Store | Key 范围 | 内容 |
|---|---|---|
| `project-files` | 项目路径与 writer lease | 既有项目 Manifest、WAL、备份、迁移归档和 fenced lease |
| `asset-blobs` | `<projectId>/<sha256:digest>` | 项目作用域的不可变二进制 Blob |
| `asset-indexes` | `<projectId>` | UTF-8 JSON Asset Index schema 1 |

升级只新增两个 Store，不改写或删除 version 1 的 `project-files`。自动测试从真实 version 1 数据库升级到 version 2，并确认原项目文件与三个 Store 均存在。

Blob 采用项目作用域去重，不跨项目共享。这样避免跨项目隐私关联，也使孤儿审计只计算当前项目。

## 3. 原子 fenced 导入事务

导入顺序：

1. 读取当前 Asset Index；
2. 校验 `expectedIndexRevision`、容量、Asset ID、MIME 和标签；
3. 对完整文件字节计算 SHA-256；
4. 打开覆盖 `project-files + asset-blobs + asset-indexes` 的 strict readwrite transaction；
5. 在事务内重新读取 writer lease，校验 owner、fencing token 与 expiry；
6. 在事务内重新读取 Asset Index，确认 revision 与内容没有变化；
7. 检查目标 Blob：缺失则写入，存在则重新计算摘要；
8. 写入新 Asset Index；
9. transaction complete 后才向 UI 报告成功。

取消信号会直接 abort transaction。即使取消发生在 “Blob ready” 与 “Index publish” 之间，也不会留下 Blob 或 Index 修订。

两个并发导入即使暂时拿到相同的 UI revision，也会由 IndexedDB 串行事务内的第二次 revision 检查阻止后提交者覆盖先提交者。

## 4. reload writer lease 交接

真实浏览器刷新审计发现：旧页面的异步 `pagehide release` 与新页面立即 acquire 可能交错，新页面会在 lease TTL 内进入冲突闸门。

修正方案：

- true reload 使用当前 tab 的 session owner 续约同一 fencing token；
- 普通 navigate、打开新标签和复制标签始终轮换 owner；
- 即使 sessionStorage 被复制，新标签也不能借用旧标签 owner；
- owner 仍必须通过安全 ID 字符约束；存储不可用时回退到当前页面内存 owner；
- 多标签 fencing 规则不放宽。

专项测试覆盖 true reload 复用、普通导航轮换和非法 owner 拒绝。真实浏览器二次 reload 后不再出现暂时冲突，并恢复 Asset Index r2。

## 5. 文件读取、进度与取消

Web UI 使用 `FileReader.readAsArrayBuffer`，原因是当前浏览器/移动壳需要真实 progress 与 abort 事件：

- 读取前检查 `File.size <= 64 MiB`；
- progress 映射到总体 0–78%；
- SHA-256 与 revision 校验显示为 committing；
- Blob ready 与 Index publishing 映射到 92% / 97%；
- transaction complete 后才显示 100%；
- FileReader abort 与事务 AbortSignal 统一为 `CANCELLED`；
- FileReader 返回字节数必须等于选择时 `File.size`。

当前 SHA-256 仍在编辑器线程对完整 `Uint8Array` 执行。16 MiB 性能门通过，但正式大媒体导入仍需要 Worker/流式读取，不能把当前实现宣称为最终低端 Android 方案。

## 6. 错误与恢复语义

| 错误 | UI 与数据保证 |
|---|---|
| `RESOURCE_LIMIT` | 显示 Web 上限；资源库保持可重试 |
| `CANCELLED` | 显示已取消；Blob/Index 回滚；资源库保持可用 |
| `BUSY` | 不冒充用户取消；允许重试 |
| `NO_SPACE` | 明确本机空间不足；旧 Index 保持有效 |
| `STALE_INDEX_REVISION` | 不发布内容；要求基于新 revision 重试 |
| `LEASE_REQUIRED/LOST` | 事务回滚并进入全局 writer conflict 闸门 |
| `CORRUPT_BLOB` | 阻断资源写入，不覆盖损坏证据 |
| `UNSUPPORTED_INDEX_SCHEMA` | 阻断资源库，不把未来格式降级写回 |

审计特别区分显式 AbortSignal 与 IndexedDB 自身 `AbortError`：只有前者是用户取消；后者归为可重试事务 `BUSY`，避免隐藏真实存储问题。

## 7. UI 与可访问性

左侧资源保险库卡成为真实按钮，显示：

- 当前资源数量与 Asset Index revision；
- 导入中、索引错误或本机存储不可用状态；
- SHA-256、同内容去重和源 Blob 只读不变量。

资源对话框包含原生文件输入、稳定 ID、显示名、类型、进度、取消、错误详情和已导入资源列表。每条资源显示类型、字节数与摘要短码。替换相同 Asset ID 时明确提示旧 Blob 不可变并进入孤儿审计。

没有伪造图片预览、媒体尺寸、时长、色彩空间或安全解码结果；当前 MIME 只来自浏览器文件声明。

## 8. 自动化证据

新增测试覆盖：

- IndexedDB Blob Store 共同 Conformance；
- schema 1→2 升级保留项目文件；
- Blob + Index 原子发布与刷新重开；
- 同字节两个 Asset ID 精确去重；
- Blob ready 后取消，两个 Store 均无残留；
- stale revision 不发布第二个 Blob；
- 新 fencing token 永久拒绝旧 repository；
- Quota、Permission、Busy、Unavailable 与 Abort 错误归一化；
- FileReader 精确字节、进度、容量和预取消；
- 文件名到 Asset ID/type 建议；
- React UI 真实 File 导入、Index r1、新 ID 命中去重到 r2；
- reload owner 复用与新标签 owner 轮换。

## 9. 性能、构建与安全门

2026-08-11 最终结果：

- `npm ci`：按锁文件干净安装 128 个包；
- TypeScript strict：通过；
- 常规测试：26 个测试文件、162/162 通过；
- 五工作区构建：通过；Editor JS 308.57 kB / gzip 94.22 kB，CSS 37.51 kB / gzip 7.89 kB；
- 架构审计：22 个 portable 文件与 3 个 Node adapter 文件通过；Web editor 未引入 Node adapter；
- 10k 剧情性能：parse 47.91 ms、projection 2.31 ms、末句 patch 96.14 ms、总计 146.36 ms / 12,000 ms；
- 资源性能：16 MiB SHA-256 490.79 ms；2,000 条、501,941 字节 Index 严格往返 23.62 ms；总计 514.40 ms / 7,000 ms；
- 官方 `registry.npmjs.org`：0 vulnerabilities；
- `git diff --check`：通过。

## 10. 真实浏览器证据

- 既有过期标签首先正确进入 writer conflict，没有双写；到期后单一标签获取新 token；
- version 2 启动后原项目恢复为 storage s6，资源初始 Index r0；
- 导入 184 B `image/svg+xml`：生成 `codex_s017_test`，Blob + Index 原子提交到 r1；
- 同一文件改用 `codex_s017_copy`：命中同一摘要 `256bea452c5a…`，Index 到 r2；
- 两项逻辑资源各显示 184 B，但只保存一份内容 Blob；
- 资源导入前后项目本地保存状态保持 s6，没有污染剧情 storage revision；
- reload 后直接恢复 2 项资源与 Index r2，没有临时 lease conflict；
- 默认 Preview 仍为 `landscape-16-9`；
- 393×852：dialog/body/document 宽 378 < 393，文件选择器 318，metadata 为单列；无横向溢出；
- 手机对话框 clientHeight/scrollHeight 均为 767，当前两项资源无需内部滚动；
- 浏览器控制台 0 error；测试后关闭对话框、恢复 1280×720 和 16:9。

本地演示项目保留两个 184 B 的 S0.17 测试资源条目，用于用户立即查看去重与刷新恢复结果；它们共享同一 Blob。

## 11. 明确未完成

- MIME sniff、SVG/字体安全处理、图片尺寸/像素上限、音视频时长和解码炸弹防护；
- Worker 流式哈希、分块读取、超大媒体和 Android 后台恢复；
- Asset Index/Blob 与项目备份、迁移归档、导出和恢复的联动；
- Source/Derivative 分区、历史可达性、保留期、可恢复 GC 和测试资源删除 UI；
- Android app-private Blob adapter 与真机 SAF/权限/ENOSPC/kill 矩阵；
- 缩略图、波形、媒体预览、相似度分析、Dicing/Delta 和逐像素重建；
- Runtime Loader、构建 Manifest 与 Web/Windows/Android 发布包资源验证。

这些项目继续阻断“商业资源管线完成”与“自动切图压缩完成”的声明。

## 12. 下一步

S0.18 建议实现不可信媒体 Inspection Gate：魔数/MIME sniff、图片像素与尺寸预算、SVG 隔离策略、音视频/字体元数据上限，以及 Worker 边界；通过后再进入相似资源候选分析和 Lossless Dicing。

## 13. 远端证据

- 实现提交：`96f2daa35bd98161651db24fe43848187a0ef255`（`Add atomic Web asset import`）；
- 分支：`agent/visual-production-bar` 已推送到 `origin`；
- Draft PR：[#1 Add atomic Web asset import and content-addressed safety](https://github.com/Longyuyeee/WorLdGame/pull/1)；
- GitHub REST 回读：PR `open`、`draft=true`、head 精确等于实现提交；正文包含 S0.17、162/162、全局 M1 阻断项与 S0.18；
- 最终证据提交将在本节回填后再次推送，并执行 local/origin/PR 三方 SHA 回读。
