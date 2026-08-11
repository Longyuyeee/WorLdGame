# S0.19 资源血缘、保留与两阶段回收审计

> 日期：2026-08-11  
> 状态：S0 原型实现、全量/性能/真实浏览器审计通过  
> 决策：优先建立不可误删的资源生命周期，再进入真实转码、相似图分析与 Lossless Dicing

## 1. 需求对齐

容量优化不能只生成更小文件，还必须能证明每个源文件、派生文件和发布产物为何仍被保留。S0.19 建立以下基础：

- 源文件与派生文件使用 SHA-256 不可变节点；派生节点必须声明父节点、确定性 recipe 名称与 recipe digest；
- 当前 Asset Index、历史 Index、备份、构建产物和恢复操作都可成为保护根；
- 可达性沿“派生 → 父节点”反向闭包，任何根依赖的源文件都不得进入回收候选；
- 回收分为“扫描登记 → 24 小时隔离 → 原子移入可恢复区 → 7 天后才允许永久清理”；
- 编辑器本轮不提供永久清理按钮；旧项目备份没有资源根时，UI 锁住回收操作。

本轮没有实现图片转码、视觉相似度、Dicing、Delta、构建产物生成，也不会用“派生文件 0 项”冒充这些能力已经完成。

## 2. 数据契约

`AssetLifecycleManifest` schema 1 包含：

| 集合 | 不变量 |
|---|---|
| `nodes` | digest 唯一；Source 无父节点/recipe；Derivative 至少一个已知父节点且 recipe 完整 |
| `roots` | rootId 唯一；恰好一个 `current` 根；可选到期时间必须晚于创建时间 |
| `quarantine` | digest 唯一；`sweepAfterMs > markedAtMs` |
| `trash` | digest 唯一；`purgeAfterMs > trashedAtMs`；字节数为非负安全整数 |

解析器拒绝重复标识、缺失父节点、派生环、错误时钟、角色字段冲突和非规范 digest。序列化前再次解析，避免内部调用产生无法恢复的持久化数据。

## 3. 存储与事务

Web IndexedDB 从 schema 2 升至 schema 3，新增：

- `asset-lifecycles`：每项目一份规范 JSON；
- `asset-trash`：项目作用域的可恢复 Blob。

资源导入现在在同一个 writer-fenced strict 事务中提交 Blob、Asset Index 与 Lifecycle。更新稳定 Asset ID 时，旧 digest 进入带到期时间的 Index 历史根，不会立刻成为垃圾。

GC 操作仍要求有效 writer lease：

1. `planGarbageCollection` 对 Blob inventory 计算可达性，只写隔离计划；
2. `sweepGarbageCollection` 只处理隔离期已满项目，逐项重新核对 SHA-256，并在同一事务内复制到 Trash、删除活跃 Blob、更新 Lifecycle；
3. `restoreTrash` 重新核对 Trash digest，在同一事务内移回活跃区并添加短期 Recovery 根；
4. `purgeExpiredTrash` 仅接受保留期已满且仍不可达的条目。该 API 没有暴露给当前 UI。

任一事务失败都不发布半份 Lifecycle，也不允许只删 Blob 而不留下恢复记录。

## 4. 备份边界与失效安全

核心模型已经实现并测试非到期 Backup 根，能够阻止只被备份引用的 Blob 进入隔离。但是，现有 S0.12 项目备份快照只包含剧情项目，没有携带 Asset Index/Lifecycle 根快照；因此不能证明旧备份所需资源集合。

S0.19 的处理不是猜测，而是锁定：当编辑器检测到项目备份数量大于已登记 Backup 根数量时，“安全扫描”和“移入可恢复区”均禁用，并解释原因。这会保留更多空间，但不会为了节省容量承担误删风险。

将项目备份、Asset Index 快照与 Backup 根做同一提交协议，是后续进入商业级 GC 前的阻断项。

## 5. UI 契约

资源保险库新增“资源血缘与安全回收”面板，展示 Source、Derivative、保护根、隔离候选、可恢复区和 Lifecycle revision。操作说明明确：

- 安全扫描不移动或删除数据；
- 隔离不足 24 小时不能移动；
- 移入可恢复区后保留 7 天；
- 可恢复条目允许单项恢复；
- 未联动备份时显示黄色锁定状态。

该面板延续当前现代化、多彩、平滑过渡的 UI 语言，并保持资源管理的专业语义，不使用“自动优化完成”等误导文案。

## 6. 审计矩阵

| 风险 | 证据 |
|---|---|
| 替换资源后旧 Blob 被立即删除 | 历史根到期边界测试 |
| 构建派生保留但源文件被删 | Derivative 父图反向可达测试 |
| 备份专属 Blob 被删 | Backup 根保护测试与 UI 锁定 |
| 并发覆盖 Lifecycle | expected revision 与 writer lease 测试 |
| 隔离期绕过 | `sweepAfterMs` 边界测试 |
| Trash 提前永久清除 | `purgeAfterMs` 边界测试 |
| Trash 损坏后恢复 | SHA-256 写前检查与事务回滚测试 |
| 恶意/损坏 manifest | 重复、环、缺父、时钟、digest 失败关闭测试 |
| 大项目扫描卡顿 | 5,000 节点 + 500 孤儿性能门 |

## 7. 商业级结论

S0.19 可以声明：Web 原型具备 Source/Derivative 血缘契约、Index 历史保护、两阶段回收、可恢复 Trash，以及旧备份未联动时的失效安全锁定。

S0.19 不能声明：完整商业级资源优化管线、跨平台 GC、备份资源原子一致性、真实派生生成或自动切图压缩已经完成。上述内容仍是 M1 的阻断项，必须分别设计、实现和审计。

## 8. 本轮证据

- 干净安装：`npm ci --ignore-scripts` 通过；
- 全量门禁：29 个测试文件、192/192 测试通过；TypeScript、生产构建与架构审计通过；
- 构建体积：主 JS 344.89 kB（gzip 104.97 kB），CSS 39.58 kB（gzip 8.25 kB），媒体检查 Worker 14.24 kB；
- 10,000 句脚本门：总计 149.66 ms，低于 12,000 ms 预算；
- 16 MiB 媒体检查/哈希与 2,000 项 Index：总计 542.11 ms，低于 10,000 ms 预算；
- 5,000 个生命周期节点、5,500 项 Blob inventory（其中 500 孤儿）：规范往返、可达性与隔离计划 71.73 ms，低于 2,000 ms 预算；
- 真实浏览器：S0.19 面板、Legacy 资源恢复、两份旧备份触发 GC 锁、默认 1920×1080 / 16:9、writer lease 冲突关闭与到期重试恢复均通过；
- `git diff --check` 通过。

真实浏览器的自动化导航刷新没有绕过旧页面尚未到期的 12 秒 writer lease，而是进入冲突闸门；租约到期后通过“重试获取编辑权”恢复。这一结果证明刷新路径以可用性短暂下降换取单写者安全，不构成数据损坏。
