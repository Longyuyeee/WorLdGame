# S0.20 备份资源根与确定性派生任务审计

> 日期：2026-08-11
> 状态：实现、全量/性能与真实浏览器审计通过

## 1. 需求与边界

S0.19 建立了资源血缘与可恢复 GC，但现有项目备份只有剧情快照，没有保存当时的 Asset Index。只按备份数量猜测保护根既不能证明关联，也不能安全解除 GC 锁。S0.20 解决两个基础问题：

- 新生成的项目备份必须提前保存经过校验的 Asset Index 快照，并建立精确 Backup 根；
- 资源管线必须先证明一个派生任务可以确定性重建、精确去重并原子发布，再进入图片解码、缩略图、相似分析或 Dicing。

本轮不会把元数据 Sidecar 称为图片压缩、缩略图、波形或切图成果。

## 2. 为什么不是一个底层事务

项目备份走平台无关的 `ProjectFileStore` + WAL 协议，Web 资源仓储使用 IndexedDB 多对象仓事务。二者没有共同事务管理器。将它们描述为“一个原子事务”是不真实的。

S0.20 使用失效安全的有序提交：

1. 在 IndexedDB strict 事务中同时写入 Asset Index 快照和对应 Backup 保护根；
2. 执行既有项目备份与项目 WAL 保存；
3. 读取并校验真实备份槽位；
4. 只保留与真实 `slot + sourceStorageRevision` 匹配的资源快照和 Backup 根；
5. 旧备份没有匹配快照时继续锁定 GC。

如果在第 1、2 步之间崩溃，会暂时多保留一个根；启动对账会删除未成为真实备份的暂存记录。如果项目备份已经写入但后续项目保存失败，预先建立的根仍保护该备份。协议选择“容量暂时泄漏”而不是“备份依赖被误删”。

## 3. Asset Backup Snapshot

`AssetBackupSnapshot` schema 1 包含：

- 固定轮换槽位；
- 源项目 storage revision；
- 创建时间；
- 完整规范 Asset Index；
- 对规范 Index JSON 计算的 SHA-256 digest。

记录键和根 ID 分别为 `project/slot-N:sR` 与 `backup:slot-N:sR`。解析时会重新规范化 Index 并验证 digest；键、envelope 和实际项目备份任一不一致都会失败关闭。

IndexedDB 从 schema 3 升至 schema 4，新增 `asset-backups` 对象仓。旧项目数据原样保留。

## 4. 对账与 GC 准入

对账以已经通过项目备份 envelope SHA-256 校验的槽位列表为权威输入：

- 匹配记录成为 Linked，并重建唯一的 Backup 根集合；
- 缺少资源快照的旧备份成为 Unlinked；
- 不对应真实槽位的暂存记录和根被清理；
- Current、History、Build、Recovery 根不受影响；
- 新根重新保护已经进入隔离但尚未移动的 Blob。

UI 不再用“Backup 根数量 >= 备份数量”推测安全性，而是使用精确 record ID 对账结果。对账未完成或存在任一 Unlinked 备份时，安全扫描和移入可恢复区保持禁用。

## 5. 首个确定性派生任务

`metadata-sidecar/v1` 为每个资源生成规范 UTF-8 JSON，包含稳定 Asset ID、类型、显示名、排序标签和源 Blob 元数据。任务具备：

- 固定 recipe name 与 recipe SHA-256；
- 输出内容寻址；
- 运行前重新校验源 Blob digest；
- 输出 Blob、Derivative 节点和 Build 根在同一 writer-fenced IndexedDB 事务发布；
- 相同输入重复运行复用同一 Blob，不推进 Lifecycle revision；
- 源 digest 变化时产生不同输出；旧输出可按普通血缘规则回收。

Sidecar 是派生任务执行协议的最小真实产物，不包含原始媒体字节，不替代媒体检查报告，也不改变源素材。

## 6. UI

- 资源列表新增“生成 Sidecar”操作；
- 生命周期指标立即显示派生文件和 Build 根；
- 重复运行明确显示“相同 recipe 精确复用”；
- 备份面板区分“资源根已联动”和“旧备份 · 资源回收锁定”；
- 对账期间显示独立锁定原因，避免短暂误开放 GC。

## 7. 故障审计

| 场景 | 预期 |
|---|---|
| 暂存后、项目备份替换前崩溃 | 旧真实根保留；启动对账移除未落地新根 |
| 备份已写、项目 head 保存失败 | 新备份仍有预发布资源根保护 |
| Legacy 备份没有资源记录 | 标记 Unlinked，GC 锁定 |
| Asset Backup digest 或键损坏 | 对账整体失败，不发布较少的根集合 |
| writer lease 失效 | 快照、根、Sidecar 与 Lifecycle 均不发布 |
| Sidecar 源 Blob 缺失/损坏 | `CORRUPT_BLOB`，输出事务回滚 |
| Sidecar 重复执行 | digest 相同、Blob 复用、revision 不变 |
| 轮换槽被新 revision 覆盖 | 只保留真实槽位对应的资源记录与根 |

## 8. 尚未完成的商业级能力

- 恢复项目备份时同步切换 Asset Index 的跨仓恢复意图与崩溃续作；
- Windows/Android 备份资源快照适配器；
- 图片/音频解码沙箱、缩略图和波形；
- 相似区域识别、Lossless Dicing/Delta/Atlas 和逐像素重组证明；
- 派生任务队列、取消、优先级、Android 后台续作与低空间调度。

因此 S0.20 可以解除“新备份没有可证明资源根”的设计缺陷，但不能声明完整备份恢复、资源优化管线或跨平台生产能力已经完成。

## 9. 本轮证据

- 干净安装：`npm ci --ignore-scripts` 通过，128 packages；
- 全量门禁：31 个测试文件、200/200 测试通过；TypeScript、生产构建和架构审计通过；
- 构建体积：主 JS 356.04 kB（gzip 107.70 kB），CSS 40.01 kB（gzip 8.33 kB），Worker 16.04 kB；
- 架构边界：26 个 portable core 文件、3 个 Node adapter 文件通过；
- 10,000 句脚本：196.24 ms / 12,000 ms；
- 16 MiB 媒体检查/哈希与 2,000 项 Index：604.69 ms / 10,000 ms；
- 5,000 节点生命周期往返/可达性/隔离计划：83.16 ms / 2,000 ms；
- 5,000 个确定性 Sidecar 准备：74.25 ms / 2,000 ms；
- 真实浏览器：IndexedDB 3→4 升级、两份 Legacy 备份锁、新 s6 备份资源根联动、Sidecar 生成/复用 revision 不变、刷新恢复和默认 1920×1080 / 16:9 通过；
- 浏览器审计发现并修复“GC 锁提示覆盖派生任务反馈”的 UI 缺陷，GC 准入与活动反馈现已分区；
- `git diff --check` 通过，5173 开发服务已恢复。
