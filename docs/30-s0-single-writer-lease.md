# S0.11 Web 单写者租约与 Fencing 审计

> 状态：实现、仓库级验证与浏览器双窗口证据通过；提交推送与远端回读待收尾
> 日期：2026-08-11
> 决策范围：Web/IndexedDB；Windows/Node 与 Android 不在本阶段虚构跨进程锁能力

## 1. 为什么 storageRevision 还不够

S0.9/S0.10 的 `expectedStorageRevision` 能拒绝已经观察到的新版本，却无法关闭“两个窗口同时读取 s3、随后同时准备写 s4”的检查—使用时间差。商业编辑器不能依赖最后写入者获胜，也不能只在 UI 上提示用户少开一个窗口。

S0.11 因此增加独立的单写者层：编辑器必须先取得项目级租约，恢复逻辑和所有写操作才可运行。租约与 `storageRevision` 同时存在：前者保证某一时刻只有一个有效写者，后者继续保证项目快照的逻辑版本单调。

## 2. 冻结契约

`ProjectFileStoreCapabilities.writerCoordination` 明确声明后端能力：

- `fenced-lease`：后端能原子获取/续约/释放租约，并能在每次变更中验证 fencing token；
- `none`：后端没有证明跨实例写者协调，调用方不得把它解释为安全。

可移植契约包括：

- `ProjectWriterLease { ownerId, fencingToken, expiresAtMs }`；
- `acquire(ownerId, nowMs, ttlMs)`：返回租约或当前占用的到期时间；
- `renew(lease, nowMs, ttlMs)`：只续约同一 owner/token 的有效租约；
- `release(lease)`：只释放同一 owner/token，重复或陈旧释放返回 `false`；
- `LEASE_REQUIRED`：调用方未激活租约；
- `LEASE_LOST`：激活的 token 已过期或被更高 token 取代。

## 3. IndexedDB 原子性设计

租约状态与项目文件存放在同一个 object store。获取、续约、释放分别使用一个 `readwrite` transaction；`write`、`replace`、`remove` 在各自的同一 transaction 内先读取租约状态，再执行数据变更。不存在“先在一个 transaction 检查、再在另一个 transaction 写入”的空隙。

状态只保存最后 fencing token 和当前 holder。新 owner、过期接管、正常释放后的重新获取都会把 token 加一；同一 owner 在有效期内重入只延长到期时间，不更换 token。旧窗口即使在暂停后恢复，也无法用旧 token 写入。

当前参数：

| 项目 | 值 | 目的 |
|---|---:|---|
| 租约 TTL | 12 秒 | 崩溃窗口能自动恢复，同时容纳短时主线程抖动 |
| 心跳间隔 | 4 秒 | 正常情况下保留两次以上续约余量 |
| 最大调用 TTL | 300 秒 | 阻止异常调用制造长期死锁 |

时间来自同一设备的 `Date.now()`。时钟向前跳会令旧租约提前失效，但 fencing 仍阻止陈旧写；时钟向后跳可能延迟接管，属于可用性而非数据完整性风险。M1 若需要系统休眠后的更强体验，应增加基于可见性/单调时钟的恢复测试，但不能弱化 token 检查。

## 4. 编辑器生命周期

启动顺序被冻结为：

1. 创建 IndexedDB 适配器；
2. 获取项目写租约；
3. 失败时显示全屏冲突闸门，不挂载可编辑工作区；
4. 成功后激活 token，再执行 WAL/哈希恢复；
5. 每 4 秒续约并更新激活租约；
6. 续约或任意保存报告失权时，立即移除 store 引用并切回冲突闸门；
7. 正常 `pagehide` 尽力释放；BFCache 冻结时不异步释放，恢复后强制重新获取。

“关闭页面立即释放”只是体验优化，12 秒到期和 fencing token 才是崩溃安全机制。浏览器、扩展或用户清除站点数据属于外部破坏；随后写入会因租约缺失而失败，不会无保护地继续。

## 5. 验收矩阵

| 场景 | 必须结果 |
|---|---|
| 两实例同时获取 | 恰好一个 `acquired`，另一个 `held` |
| 无租约写入 | `LEASE_REQUIRED`，文件不改变 |
| 到期前续约 | token 不变，其他 owner 不能接管 |
| 到期后接管 | token 严格增加，旧 owner 写入为 `LEASE_LOST` |
| 陈旧续约/释放 | 续约 `lost`，释放 `false` |
| 正常释放后重获 | token 仍严格增加 |
| 时间溢出/负数 | 在 transaction 前拒绝 |
| 浏览器第二窗口 | 只显示冲突闸门，不能进入编辑器 |
| 第一窗口离开后重试 | 第二窗口取得编辑权并恢复同一项目 |

## 6. 明确未完成与阻断项

- Node/Windows 适配器仍声明 `writerCoordination: none`。进程内 mutation queue 不是 OS 级锁；后续必须实现并审计原生文件锁或带 fencing 的锁文件协议。
- Android M1 的 app-private workspace 已冻结，但进程/Activity 生命周期协调尚未实现，不能引用本阶段 Web 证据代替。
- 多标签协调不等于实时协作。M1 无账户、无云同步，不实现多人合并或 CRDT。
- 后台冻结、系统休眠、浏览器强杀和存储清理仍需纳入平台级长稳测试；本阶段只建立不会陈旧写入的安全下界。

## 7. 阶段退出条件

只有以下证据全部通过，S0.11 才能标记完成：类型检查、全量单元/属性测试、五工作区构建、架构审计、10k 性能门、依赖漏洞审计、真实浏览器双窗口冲突与接管、手机宽度无横向溢出、提交推送和 Draft PR 远端回读。

## 8. 本地审计证据

2026-08-11 本地结果：

- `npm run check`：通过；13 个测试文件、101 项测试全部通过；
- 五工作区 TypeScript/Vite 构建：通过；Web 产物 JS gzip 81.99 kB、CSS gzip 5.83 kB；
- 架构审计：通过；18 个 portable 文件与 2 个 Node adapter 文件未越界；
- 10k 句性能审计：最终复核总计 171.99 ms，低于 12,000 ms 预算；
- `npm audit --registry=https://registry.npmjs.org`：0 vulnerabilities；默认镜像缺少 audit API，已明确切换官方端点复核；
- IndexedDB 两实例测试：同时获取只有一个成功；到期接管 token 加一；旧实例写入、续约、释放全部被拒；
- 真实浏览器：第一窗口恢复 s3；第二窗口只显示冲突闸门；强关第一窗口后等待 12 秒 TTL，第二窗口成功接管并恢复 s3；
- 393×852 手机视口：`innerWidth=393`、根节点与 body `scrollWidth=378`，无横向溢出；
- 浏览器测试标签与临时 viewport 已全部清理。

以上仍是 S0 原型证据，不等于 Windows/Android 平台锁或 M1 长稳门已经完成。
