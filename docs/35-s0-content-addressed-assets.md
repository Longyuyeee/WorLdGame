# S0.16 内容寻址资源索引与 Blob 安全契约审计

> 状态：需求边界、可移植契约、Node 参考适配器、故障测试、干净安装与本地质量门均通过；远端证据将在提交推送后回填
> 日期：2026-08-11
> 范围：源资源 Blob 与资源索引的安全底座；不冒充浏览器/Android 资源导入、媒体解码、Dicing/Delta 或正式资源发布管线已完成

## 1. 需求对齐

M1 已确认必须自动发现相似 CG/立绘，以 Lossless Dicing/Delta、透明/重复块消除、逐像素验证和无收益回退降低容量，同时不能覆盖源素材。现有 S0.9–S0.13 项目保存链只适合 UTF-8 Manifest 与剧情快照，大型 CG、音频和视频不能进入字符串 JSON/WAL。

S0.16 因此先冻结 Dicing 上游不可缺少的资源不变量：

- 剧情、画廊和后续派生资源只引用稳定 `assetId`；
- `assetId` 通过资源索引解析到不可变源 Blob；
- Blob 地址是其完整字节的 SHA-256，不依赖文件名、绝对路径或导入顺序；
- 相同字节只发布一次，但可被多个稳定资源 ID 引用；
- 写入前校验摘要，读取后再次校验摘要；
- Index 只能在完整 Blob 已发布后生成下一修订；
- Index 发布失败允许留下完整孤儿 Blob，但禁止留下指向半写文件的资源条目；
- 本阶段只报告孤儿，不自动删除任何源素材。

## 2. 架构决策

二进制资源没有扩展 `ProjectFileStore<string>`，而是使用独立 `AssetBlobStore<Uint8Array>`。原因是：

1. 防止大型媒体进入项目 JSON、WAL、备份轮换与字符串内存副本；
2. Blob 的“不可变、按摘要去重、逐次校验”语义与可覆盖项目文件不同；
3. 资源 Blob 和资源索引可以独立迁移、审计、备份和恢复；
4. Web、Windows、Android 可实现同一契约，但分别声明真实耐久性；
5. 后续 Dicing/Delta 派生缓存可引用相同内容地址，不修改源资源。

可移植核心仍无 DOM、Node、Electron、Capacitor 或第三方运行时依赖。Node 文件系统逻辑继续隔离在 `project-persistence-node`。

## 3. Blob 契约

### 3.1 规范地址

- 摘要格式：`sha256:<64 lowercase hex>`；
- 非小写、长度错误、未知算法和摘要别名一律拒绝；
- 文件系统参考路径：`blobs/sha256/<前2位>/<后62位>`；
- 地址完全由内容决定，不接收用户文件名或相对路径片段。

### 3.2 Store 能力

`AssetBlobStore` 只开放：

- `put(digest, bytes)`：完整验证后返回 `created` 或 `existing`；
- `read(digest)`：缺失返回 `null`，存在则验证并返回防御性副本；
- `list()`：枚举规范摘要，供完整性和孤儿审计使用。

契约故意不提供 `remove`。源 Blob 删除必须等未来 Reachability/Retention/Backup 门禁完成，不能把普通 UI 操作直接映射为物理删除。

## 4. 资源索引 Schema 1

索引包含独立的 `schemaVersion` 与 `indexRevision`。每个条目记录：

| 字段 | 约束 |
|---|---|
| `assetId` | 稳定、唯一、规范字符集，重命名显示名不改变引用 |
| `kind` | background/character/cg/audio/video/font/ui/other |
| `displayName` | 非空显示元数据，不参与 Blob 地址 |
| `source.digest` | 规范 SHA-256 内容地址 |
| `source.byteLength` | 安全整数，用于导入和读取审计 |
| `source.mimeType` | 规范 MIME 声明；本阶段不把声明冒充解码验证 |
| `tags` | 去重并排序的资源/章节/画廊标签 |
| `preservedFields` | 保留未来或未知 JSON 字段 |

严格 Parser 在执行任何 Blob I/O 前拒绝损坏头、重复 `assetId`、非法摘要、非法 MIME、负数尺寸和未知未来主版本。未来 Schema 使用独立 `UNSUPPORTED_INDEX_SCHEMA`，不混淆为普通资源损坏。

## 5. 导入与失败顺序

一次资源导入遵循：

1. 校验调用方持有的 `expectedIndexRevision`；
2. 校验 asset ID、显示名、MIME、标签和 `maxBytes`；
3. 对完整输入字节计算 SHA-256；
4. Blob Store 再核对“声明摘要 = 实际字节摘要”；
5. 原子发布 Blob，或确认同地址完整内容已存在；
6. 生成排序后的新 Asset Index 修订；
7. 未来平台事务层负责原子发布 Index。

| 故障 | 保证 |
|---|---|
| 超过导入容量 | Blob 写入前拒绝 |
| 过期 Index 修订 | Blob 写入前拒绝 |
| 声明摘要错误 | 不发布 Blob |
| 已有 Blob 损坏 | 报 `CORRUPT_BLOB`，不覆盖证据 |
| Blob 发布中断 | 临时文件不成为内容地址目标 |
| Index 发布失败 | 最多留下完整孤儿，旧 Index 仍有效 |
| Index 指向缺失/损坏内容 | 审计失败，不把内容交给上层 |
| 同 Blob 被多个资源引用 | 每个受影响 asset ID 都产生一致诊断 |

## 6. Node 文件系统参考适配器

`NodeAssetBlobStore`：

- 拒绝相对根目录和文件系统卷根；
- 使用随机临时文件、`wx`、完整写入、file sync、rename 和可选 directory sync；
- 并发导入相同摘要只产生一份规范目标；
- 进程/适配器重开后仍按摘要读取；
- 每次读取重新计算 SHA-256；
- 遇到磁盘篡改时拒绝读取，也不以新输入覆盖损坏证据；
- 统一映射 `NO_SPACE / PERMISSION_DENIED / BUSY / UNAVAILABLE / IO_FAILURE`；
- 不泄漏 `.world-blob-*` 临时文件。

Windows 的断电级 directory durability、OS 级跨进程锁和杀进程矩阵仍需真机验证；本适配器不夸大这些保证。

## 7. 审计报告

`auditAssetIndex` 输出：

- 资源条目数与唯一 Blob 数；
- 引用总字节与唯一内容字节；
- 由精确内容去重节省的字节；
- Missing、Corrupt、Size Mismatch 和 Orphan 诊断。

孤儿只被报告，不自动回收。以后只有在当前 Index、历史修订、备份、构建引用和保留期均证明不可达后，才允许进入可恢复回收流程。

## 8. UI 对齐

左侧场景栏新增“资源保险库”契约状态卡，明确显示：

- SHA-256；
- 同内容去重；
- 源 Blob 只读；
- Index 只引用完整可校验内容地址。

UI 没有伪造资源数量或导入成功状态。实际浏览器导入、进度、取消、配额和持久 Index 发布属于下一切片。

真实浏览器证据：

- 桌面 1280×720：资源保险库卡可见，S0.16 标识、三项安全规则和 footer 状态正确；
- 页面仍默认 `landscape-16-9`、1920×1080，右侧 Preview 宽 334px；
- 393×852：资源卡保留并可见，宽 354px；document/body scrollWidth 均为 378 < innerWidth 393；
- 手机端只隐藏低价值 Source of Truth 状态条和 footer，不隐藏资源入口；
- 预览仍为 16:9、1920×1080，手机舞台宽 340px；
- 浏览器控制台 0 error；测试后恢复 1280×720、16:9，未修改脚本、资源或存储修订。

## 9. 自动化与本地质量门

2026-08-11 结果：

- `npm ci`：按锁文件干净安装 128 个包；
- TypeScript strict：通过；
- 常规测试：22 个测试文件、143/143 通过；
- Blob 专项覆盖：标准 SHA-256、规范分片路径、同内容去重、防御性读取、副本篡改、过期修订、容量闸门、非法元数据、严格 Parser、未知字段、未来版本、Missing/Corrupt/Size/Orphan 与共享损坏诊断；
- Node 专项覆盖：真实文件系统共同 Conformance、并发去重、跨实例重开、磁盘篡改、临时文件和错误归一化；
- 五工作区构建：通过；Editor JS 286.28 kB / gzip 87.90 kB，CSS 32.35 kB / gzip 7.10 kB；
- 架构审计：22 个 portable 文件与 3 个 Node adapter 文件通过；
- 最终 10k 句性能：parse 67.92 ms、projection 1.97 ms、末句 patch 164.77 ms、总计 234.66 ms，低于 12,000 ms 总预算；
- 官方 `registry.npmjs.org`：0 vulnerabilities；
- `git diff --check`：通过。

## 10. 明确未完成

- Web IndexedDB/OPFS Blob adapter 与 Android app-private Blob adapter；
- 浏览器/Android 文件选择、流式哈希、取消、进度、后台恢复与配额 UX；
- Asset Index 的 WAL/备份/迁移和 writer fencing 集成；
- MIME sniff、PNG/JPEG/WebP/AVIF/音频/视频解码检查、尺寸与炸弹限制；
- Source Blob 与可再生派生缓存的分区、引用图、保留期和安全 GC；
- 相似度分析、Dicing/Delta、Atlas、逐像素重建和收益模型；
- Web/Windows/Android 构建 Manifest、Runtime Loader 与低内存验证。

这些项目继续阻断“资源导入完成”“自动切图压缩完成”或“商业资源管线完成”的声明。

## 11. 下一步

S0.17 建议实现 Web IndexedDB Blob Store 与原子 Asset Index 发布事务，并把真实文件导入、容量进度、取消和失败恢复接入资源保险库 UI；随后再进入媒体检查和 Dicing 候选分析。

## 12. 远端证据

实现提交、PR head、PR 正文与最终证据提交将在推送和 REST 回读后补充。
