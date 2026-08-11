# S0.9 本地保存、WAL 与崩溃恢复审计

> 状态：本地实现、自动化门禁与真实浏览器闭环通过；等待推送及远端证据回读。
> 决策日期：2026-08-11。
> 风险等级：R4（项目损坏、错误草稿丢失、旧写入覆盖新版本、崩溃后半提交）。

## 1. 需求对齐与切片边界

S0.9 验证“本地优先且无需账户”的第一条可运行数据链：

- 一次保存必须覆盖项目元数据、每个场景的已提交源、未提交草稿、源版本、语义版本和 Tombstone；
- 错误草稿可以落盘，但 Writer、Flow 与 Preview 只能读取最后一次有效的 committed source；
- 每份场景文件由项目清单记录 SHA-256 与字符长度，读取时先校验再暴露给编辑器；
- 同一个项目的旧写入者不能覆盖更新版本；
- 任一写入、WAL 换相或文件替换边界崩溃后，恢复结果只能是完整旧快照或完整新快照；
- Web 端用 IndexedDB 证明契约可落地，Windows 与 Android 文件系统适配器不在本切片伪实现。

本切片没有承诺自动保存、文件夹选择器、备份轮换、跨设备同步、协作、云账户、Windows/Android 原生文件系统或正式 `.worldproj` 迁移器。

## 2. 可移植持久化边界

`@world-studio/project-persistence` 是无 React、DOM、IndexedDB、Node 文件系统和第三方运行时依赖的纯 TypeScript 包。平台只需实现四个原子原语：

```text
read(path) -> complete string | null
write(path, complete string)         // 单路径原子替换
replace(sourcePath, targetPath)      // 单事务移动并删除 source
remove(path)                         // 幂等
```

核心包负责路径白名单、快照验证、确定性序列化、SHA-256、WAL 状态机、过期版本拒绝和恢复；平台适配器不得重新解释这些语义。Web 适配器把所有键置于项目 ID 命名空间，`replace` 在一个 IndexedDB readwrite transaction 内完成 get/put/delete，并请求 strict durability。

## 3. 快照与磁盘布局

```text
project.json                         # 最后替换的权威清单
scenes/<stable-scene-id>.json        # committed/draft/revision/tombstones
recovery/save.wal.json               # 唯一活动保存事务
.txn/<transaction-id>/...            # 临时完整文件
```

清单包含 `schemaVersion`、项目 ID、标题、入口场景、单调递增的 `storageRevision`，以及每个场景的路径、SHA-256 和长度。场景文件还区分：

- `committedSource`：已通过 Parser、Projection 和项目检查的权威源；
- `draftSource`：可包含阻塞诊断的用户草稿；
- `sourceRevision` / `semanticRevision`：编辑事务版本；
- `tombstones`：被删除对白的稳定 ID 和恢复元数据，防止 ID 复用。

保存前先完整读取并校验当前项目；发现现有文件损坏时拒绝覆盖，给后续修复/备份工具保留证据。`expectedStorageRevision` 与已存版本不一致时返回 `STALE_STORAGE_REVISION`。

## 4. 两阶段 WAL 状态机

```text
clean
  → write WAL(prepared)
  → write and hash-check all temp files
  → write WAL(staged)
  → replace scene files in deterministic order
  → replace project.json last
  → remove WAL
  → clean
```

- `prepared`：尚未允许修改权威目标。恢复会删除所有临时路径和 WAL，回到完整旧快照；
- `staged`：全部临时内容已经准备完成。恢复逐项检查 target；若 target 已是预期 hash 则跳过，否则验证 temp 后继续 replace，最终完成完整新快照；
- target 与 temp 都无法通过校验时返回 `INCOMPLETE_STAGED_TRANSACTION`，不猜测、不静默重建；
- `project.json` 永远最后替换，因此非恢复读取者不会由新清单引用旧场景；
- WAL 中的 target/temp 路径、事务 ID、hash 和长度均重新校验，防止损坏 WAL 越界删除或替换。

这不是多文件系统事务的虚假“原子”声明，而是以可重复恢复保证最终一致。未来 Windows/Android 适配器必须证明 `write` 与 `replace` 的单路径原子和落盘语义，才能接入该核心。

## 5. 会话恢复语义

- 启动时先显示恢复门，完成 WAL 与内容校验前不开放编辑，避免异步恢复覆盖用户刚输入的内容；
- 有效源重新 Parse/Project，绝不直接信任序列化的 UI 派生模型；
- 错误草稿恢复到 Script，诊断重新计算，Writer/Preview 保持 committed projection 并显示 `LOCKED`；
- `revision`、`semanticRevision` 和 Tombstone 保留；
- Undo/Redo 与命令幂等缓存是内存会话历史，本轮明确不持久化，重开项目后开始新的撤销周期；
- UI 分离“脚本事务 rN”和“磁盘 storage sN”，避免把内存提交误报成已落盘。

## 6. 自动化与故障注入证据

常规测试覆盖：

- SHA-256 标准向量 `abc`；
- committed source、错误 draft、双版本号和 Tombstone 往返；
- 旧 writer 冲突拒绝；
- 场景篡改在 load 和后续 save 前均被拒绝，损坏证据不被覆盖；
- staged WAL 丢失 target 与 temp 时硬失败；
- 恢复 ScriptSourceSession 时拒绝非法版本和 Tombstone ID 冲突；
- Studio 恢复错误草稿时仍维持最后有效 StoryProject；
- InMemory 参考适配器对一次双场景保存的每个 mutating boundary 逐一注入崩溃，再用无故障适配器恢复，结果逐项断言为完整旧快照或完整新快照。

本轮干净安装门禁结果：10 个常规测试文件 82/82 通过；独立 10k 性能测试 1/1 通过；TypeScript strict、四 workspace 生产构建、17 个可移植源文件架构审计、`git diff --check` 全部通过；官方 npm Registry 报告 0 vulnerabilities。

10k 固定样本包含 10,000 行对白、10,001 个语义步骤和 826,763 bytes 源文本，本轮代表性总耗时 175.76ms（parse 46.57ms、projection 13.91ms、末行 patch 115.27ms），低于 S0 宽松总预算 12,000ms。该结果只作为回归门，不外推为 Android 低端机性能承诺。

## 7. 真实浏览器证据

桌面浏览器执行：

1. Writer 修改对白并 blur 提交为脚本 `r1`；
2. 点击保存，得到 `已保存 · s1`；
3. 刷新，得到 `已恢复 · s1`，对白和 Preview 内容一致，撤销栈为空；
4. Script 制造未闭合场景标题，确认 2 个阻塞诊断且 Preview 为 `LOCKED`；
5. 保存为 `s2` 并刷新，确认错误草稿仍在、Writer 被禁用、Preview 仍显示 `s1` 中最后有效对白；
6. 浏览器 console warning/error 为 0。

手机视口 393×852：`innerWidth=393`、`documentScrollWidth=378`、`bodyScrollWidth=378`，无页面横向溢出；保存/恢复状态保留在紧凑顶栏。

## 8. 未关闭风险与下一步准入

- IndexedDB 证明了 Web 契约，但浏览器配额、隐私清理和磁盘耗尽仍需独立 UX；
- Windows 的 flush/fsync、目录 replace 与防病毒软件干扰，Android 的 SAF/应用私有目录、进程杀死和低存储场景都必须建立原生故障矩阵；
- 大型 CG 等二进制资源不应进入字符串 JSON/WAL；M1 需要内容寻址 Blob Store、引用清单、孤儿回收和容量预算；
- 自动保存需要 debounce、可见的最后落盘时间、应用退出协调和错误升级，不得直接复用按钮轮询；
- 正式项目格式需要 schema migration、备份轮换、只读降级和未知字段保留策略。

因此 S0.9 的结论是：**本地保存与崩溃恢复的核心语义成立，足以进入下一持久化切片；尚不能宣称 Windows/Android 商业级存储完成。**
