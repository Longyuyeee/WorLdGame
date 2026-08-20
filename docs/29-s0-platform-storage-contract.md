# S0.10 平台存储契约与 Windows 参考适配器审计

> 状态：本地实现、自动化、真实浏览器审计、推送与远端证据回读均通过。
> 决策日期：2026-08-11。
> 风险等级：R4（虚假耐久声明、路径越界、低存储错误不可行动、平台适配器语义漂移）。

## 1. 需求对齐与范围

S0.9 证明了项目级 WAL 可以恢复，但其 `ProjectFileStore` 只有四个方法，无法机器判定后端究竟是内存、浏览器托管，还是完成了文件与目录同步。S0.10 的目标是先把平台适配器的承诺变成可审计契约：

- 每个适配器必须公开原子写、原子替换、耐久级别、工作区范围和目录元数据能力；
- 路径逃逸、Windows 设备名、权限、无空间、设备不可用、忙碌和一般 I/O 失败必须使用稳定错误码；
- 所有适配器必须运行同一套可观察一致性测试；
- 提供 Node 文件系统参考适配器，在当前 Windows 主机上验证真实覆盖、并发完整值、WAL 跨实例恢复和临时文件清理；
- 冻结 Android 活动项目与 SAF 导入/导出的边界，但不提交无法在当前仓库构建和真机验证的 Kotlin “占位实现”。

本轮不选定 Electron/Tauri/Capacitor，不宣称 Windows 安装包或 Android APK 已完成，也不把 Node 参考适配器直接接入 Web Editor。

## 2. 强类型能力声明

`ProjectFileStoreCapabilities` 固定公开：

| 字段 | 允许值 | 用途 |
|---|---|---|
| `backend` | 稳定后端标识 | 日志、诊断与兼容判断 |
| `atomicWrite` / `atomicReplace` | 合规适配器必须为 `true` | WAL 的单路径原子前提 |
| `durability` | `volatile / browser-managed / file-sync / file-and-directory-sync` | 禁止把不同落盘强度混为一谈 |
| `workspaceScope` | `memory / origin-private / app-private / user-selected` | 判断清理、权限和外部修改风险 |
| `directoryMetadata` | `not-applicable / best-effort / synced` | rename 后目录项是否有同步证明 |

当前后端声明：

- InMemory：`volatile + memory`，只能用于测试；
- IndexedDB：`browser-managed + origin-private`，事务原子但物理落盘由浏览器管理；
- Node 文件系统默认：`file-sync + app-private + best-effort directory metadata`；
- 只有平台实际支持且配置 `directorySync: required` 时，Node 适配器才声明 `file-and-directory-sync`，同步失败会使操作失败而不是降级。

## 3. 稳定失败语义

`ProjectStoreError` 包含 `code / operation / path`：

| 错误码 | 代表情况 | 产品动作 |
|---|---|---|
| `INVALID_PATH` | 绝对路径、反斜杠、空段、`.`/`..`、Windows 设备名、尾随点 | 拒绝项目/插件输入，记录安全事件 |
| `NOT_FOUND` | replace 的临时源不存在 | 进入 WAL 恢复或损坏诊断 |
| `NO_SPACE` | `ENOSPC / EDQUOT / QuotaExceededError` | 停止保存，显示释放空间指引，不清除 WAL |
| `PERMISSION_DENIED` | `EACCES / EPERM / EROFS / SecurityError` | 显示权限/只读状态，不循环重试 |
| `BUSY` | `EBUSY / EAGAIN / AbortError` | 有界退避或要求关闭占用者 |
| `UNAVAILABLE` | 卷/数据库不可用 | 切为只读并保留内存草稿 |
| `IO_FAILURE` | 未分类 I/O 错误 | 保留证据、禁止静默覆盖 |

错误归一化只提供可行动分类，不掩盖项目级 `CORRUPT_*`、`STALE_STORAGE_REVISION` 或 `INCOMPLETE_STAGED_TRANSACTION`。

## 4. 统一一致性套件

`auditProjectFileStore()` 对任意适配器执行：

1. 能力字段审计；
2. 缺失读取返回 `null`；
3. UTF-8/CRLF/emoji 完整往返；
4. 同一路径完整覆盖；
5. replace 后 source 消失且 target 为完整新值；
6. replace 缺失源返回 `NOT_FOUND`，相同 source/target 返回 `INVALID_PATH`；
7. 两个 32 KiB 并发写的最终值只能完整等于其中一份，不能撕裂；
8. remove 幂等；
9. 六类危险路径全部返回 `INVALID_PATH`。

这套测试只能证明进程可观察语义，不能替代断电、进程杀死、存储拔出和文件系统故障测试。报告不得把“conformance PASS”解释成物理耐久 PASS。

## 5. Windows / Node 参考适配器

写入顺序：

```text
在目标同目录创建随机 wx 临时文件
  → 写入完整 UTF-8 内容
  → FileHandle.sync()
  → close
  → rename(temp, target)
  → 尝试同步父目录
```

`replace` 使用同一卷内 rename；官方 Node 文档说明目标已存在时会被覆盖，同时明确 `fsync` 的具体实现依赖操作系统与设备。因此代码仍需要当前目标平台实测，而不是仅凭 API 名称推断耐久。

干净安装审计曾捕获同一适配器实例并发 rename 到同一目标时的 Windows `EPERM`。参考实现现以失败安全的 mutation queue 串行化同实例 `write/replace/remove`；前一操作失败不会毒化队列，后续操作仍可执行。该队列不解决两个进程或两个适配器实例同时保存的 TOCTOU，M1 仍需项目级单写者 lease/lock 和抢锁恢复协议。

当前 Windows 主机（Node 25.2.1）实测：目录可以只读打开，但对目录句柄执行 `fsync` 返回 `EPERM`。因此默认适配器诚实声明 `file-sync + best-effort directory metadata`，**不能作为断电级商业存储完成证据**。文件内容、原子替换和 WAL 可以继续验证；目录项物理耐久仍需要最终 Windows 壳能力（原生 API 或受审计 sidecar）解决。

`directorySync: required` 的自动化测试还确认一个重要的模糊结果：Windows 上 rename 已使新文件可读，但随后的目录同步以 `PERMISSION_DENIED / sync` 失败。调用方必须先执行 WAL 恢复和 hash 校验再决定重试，不能看到 Promise rejected 就盲目重复业务命令。

适配器只允许绝对、非卷根的 app-private 根目录；逻辑路径必须是 canonical relative path。词法 containment 不能单独解决敌对进程替换目录为 symlink 的 TOCTOU，因此正式根目录必须由应用独占创建并限制外部写入。

参考：[Node.js File System 文档](https://nodejs.org/download/release/latest-v22.x/docs/api/fs.html)。

## 6. Android 存储决策

Android 正式活动项目采用 `Context.filesDir` 下的 **internal app-specific persistent workspace**：

- Android 官方说明 internal app-specific storage 无需存储权限、其他应用不可访问，并比可移除 external storage 更适合应用启动依赖的数据；
- 工作区不能放在 cacheDir，因为系统可在低存储时清理缓存；
- 工作区不能直接以 SAF DocumentsProvider 为事务后端，因为 SAF 是本地或云端 provider 的抽象，底层物理存储和 move/rename 能力由 provider 决定，无法统一满足本项目 WAL 的原子 replace 前提；
- SAF 仅用于显式 Import/Export：Import 先复制到私有 staging、完整校验后进入项目；Export 生成版本化快照，失败不改变活动项目；
- app-specific 文件会在卸载时删除，因此 M1 必须提供显式导出/备份提醒和可验证归档，不能把私有工作区宣传成永久用户备份。

Android 原生适配器候选使用 `AtomicFile` 完成单文件完整写入。官方说明 `AtomicFile` 会在 rename 前完成文件写入与同步，但不提供文件锁；它能帮助实现 `write`，不自动证明多路径 `replace`、目录元数据耐久或多进程排他。

参考：[App-specific storage](https://developer.android.com/training/data-storage/app-specific)、[Storage Access Framework](https://developer.android.com/training/data-storage/shared/documents-files)、[AtomicFile](https://developer.android.com/reference/android/util/AtomicFile)。

## 7. Android 原生准入门

只有以下证据齐全，才能把 Android 能力从“设计冻结”升级为“实现完成”：

- 冻结 minSdk/targetSdk 与平台壳，Kotlin 模块可在 CI 和本地构建；
- `AtomicFile`/rename/目录同步的具体实现和失败映射接受 R4 评审；
- instrumentation test 覆盖 ENOSPC、权限变化、进程 kill、应用冷启动恢复和错误草稿；
- 至少一台低端真机和一台主流真机执行 100 次保存中止矩阵；
- 卸载清理、导出归档、SAF provider（本地、云端、只读）行为有 UX 和数据安全证据；
- 任何 provider 不支持安全替换时，UI 明确显示“导出失败”，不把失败当作已保存。

## 8. 当前限制与下一步

- Node 参考实现证明接口可落地，不等于最终 Windows 壳选型；
- 当前 Windows 目录 fsync 为 `EPERM`，仍缺原生落盘证明；
- Android 只有架构决策和准入门，没有提交不可验证的原生代码；
- 文件系统空间耗尽由错误映射测试覆盖，真实填满磁盘测试因破坏性风险不在开发机执行；
- 二进制素材、备份轮换、自动保存和外部编辑合并仍未进入本切片。

S0.10 的退出标准是：平台能力不再含糊、Windows 参考适配器通过真实文件系统一致性测试、Android 工作区/SAF 边界冻结、未完成的物理耐久证据被明确阻断。

## 9. 本地验收证据

- `npm ci` 从锁文件干净安装 127 个包；
- 常规测试 12 个文件、96/96 通过，其中 Node 真实文件系统与共享 conformance 共 13 项聚焦测试；
- 独立 10k 性能门 1/1 通过：10,000 句、10,001 个语义步骤、826,763 bytes，本轮总耗时 148.39ms；
- TypeScript strict、五个 workspace 生产构建通过；
- 架构审计：18 个可移植生产文件无 UI/DOM/Node 平台依赖；2 个 Node Adapter 生产文件无 UI、Web 或平台壳依赖；Web Editor 未导入 Node Adapter；
- 官方 npm Registry：0 vulnerabilities；`git diff --check` 通过；
- Windows 实测：目录句柄 open 成功、`fsync` 返回 `EPERM`；required-sync 自动化路径按 `PERMISSION_DENIED / sync` 拒绝且新文件仍可校验；
- 审计第一次干净复跑捕获并发 rename `EPERM`，加入同实例 mutation queue 后全量门禁复跑通过；
- Web 浏览器从既有 `s2` 项目恢复，丢弃错误草稿后保存为 `s3`，刷新再次得到 `已恢复 · s3`；Console 0 warning / 0 error；
- 393×852：`innerWidth=393`、`documentScrollWidth=378`、`bodyScrollWidth=378`，无页面级横向溢出；
- Editor 构建：JS 258.41 kB / gzip 80.27 kB；CSS 24.09 kB / gzip 5.72 kB。

## 10. 远端证据

- 实现提交：`11b97db089eb51aada6a561aa96a19c3d7c86d2f`；
- `origin/agent/visual-production-bar`、本地 HEAD 与 Draft PR #1 head 三方 SHA 首次回读一致；
- PR 标题更新为 `Build crash-safe local and platform storage contracts`；
- PR 正文回读确认包含完整 `S0.10 Platform Storage Contract` 范围、验证和未完成项；
- PR 保持 Draft，Android 原生与 Windows 断电级耐久未通过前不进入发布声明。
