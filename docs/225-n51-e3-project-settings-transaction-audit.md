# N51-E3 Canonical Project Settings 与撤销事务审计

> 日期：2026-08-27
> 分支：`codex/n51-e3-project-settings-transaction`
> 直接基线：N51-E2 最终暂停头 `4817d68`
> 授权：`RA-N21-010`，最大节点 N51
> 判定：Engineering 通过；Product Acceptance 仍阻断

## 1. 原始需求与冻结边界

E3 继续服务 PRD 3.14、Gal 基础规格第 2 节、REQ-GAL 与 AC-19：设置必须属于统一工程，具备默认/项目/平台继承、撤销和可审计保存，不能依赖 localStorage 或平行状态。E3 只关闭 typed settings 的 Canonical Project 文件和正式 Project Service/ChangeSet，不制作 Settings UI，不热应用 Preview/Player，也不进入 N52 的 Save/History/Auto/Skip/Back/Forward 玩家行为。

冻结契约：

1. `settings/project.json` 继续是 Manifest 指定的唯一源路径，不新建旁路文件；
2. Canonical Project `settings` 直接使用 `GalSettingsDocument`，Codec 与 E1 parser/serializer 共用同一事实源；
3. 新工程和 S0 迁移直接写正式 `{schemaVersion, project, platforms}`；
4. 缺失 settings 或精确 `{schemaVersion:1,values:{}}` 的旧占位文件读为 defaults，首次保存写正式文件；
5. 非空旧 `values`、额外旧字段、损坏 JSON、非法 typed 数据和 future schema 均 fail closed，不静默丢弃或重写；
6. `settings.edit` 一条 Project Command 包含一个 project/platform 层的原子 edits 批次，只产生一个 ChangeSet；
7. stale revision、非法组合和 no-op 分别返回稳定错误且原 state 不变；Undo/Redo 恢复精确 settings 文件字节；
8. Node 原生目录与 Web IndexedDB 均使用正式 Project Lifecycle 保存和重开，不用内存假持久化冒充证据。

## 2. 兼容纠偏与架构决定

实现前代码审计发现：N10 已经把 `settings/project.json` 冻结为 `{schemaVersion:1,values:{}}`，E1 typed settings 也使用 `schemaVersion:1`，但形状为 `{project,platforms}`。两者不能只靠版本号区分。若直接把所有 `values` 当 defaults，会静默删除未来可能存在的旧数据；若一律拒绝，又会让仓库全部既有空工程无法打开。

因此 E3 只对白名单中的“缺文件”和“精确空旧占位”做无损升级。任何非空或未知旧数据都拒绝，要求后续显式迁移器处理。`project-domain` 原先零依赖的 N10 历史边界也随正式需求演进为只依赖 dependency-free、portable 的 `@world-studio/gal-settings`；workspace registry 和 architecture gate 同步收紧为唯一允许依赖，没有放宽 DOM、Shell、文件系统、时钟或随机全局限制。

## 3. 实际实现

- `CanonicalProject.settings` 由 generic `values` 文档升级为 `GalSettingsDocument`；
- Codec 对缺失/空旧占位执行 defaults 迁移，对损坏、非空旧数据和 future schema 映射为稳定 Project Domain 错误；
- `saveProject()` 单独调用 `serializeGalSettingsDocument()`，保证 Project 保存与独立 settings round-trip 字节一致；
- `createProjectTemplate()` 与 `migrateS0Project()` 直接创建正式 typed 文件；
- Project Service 新增 `settings.edit`，直接消费 E2 `applyGalSettingsEdits()`；关联字段先完成整批最终校验，再提交一个 ChangeSet；
- 设置错误增加 `INVALID_SETTINGS + path`，no-op 使用 `NO_CHANGES`，stale 继续使用 `STALE_REVISION`；
- settings ChangeSet 以 project stable ID 作为 changed entity，沿用正式 revision/hash/undo/redo 链；
- N51 专门门扩展到 Core、Catalog/Editor、Canonical/ChangeSet、Node Directory 和 Web IndexedDB 五个文件。

## 4. 预期—实际—修正

| 验证 | 冻结预期 | 首次实际 | 修正与复测 |
|---|---|---|---|
| 旧工程兼容 | 缺文件/精确空占位读 defaults；首次保存正式化 | 代码审计发现旧、新格式都叫 schema v1，无法按版本粗迁移 | 以严格 shape 白名单消歧；非空/额外旧数据 fail closed，正反例通过 |
| Typed round-trip | Project Codec 与 settings serializer 同字节 | 初版 generic Codec 会把 settings 当普通 unknown-preserving 文档 | settings 从通用 docs 列表拆出，唯一使用正式 parser/serializer；稳定 round-trip 通过 |
| 原子关联编辑 | Android portrait 三字段一个 ChangeSet | 单改 orientation 被正式组合校验拒绝 | 三字段同命令成功；单字段返回 `INVALID_SETTINGS / settings.project.display`，state 不变 |
| Undo/Redo | 恢复精确旧/新 settings 字节 | 正式 Project Service 快照链可直接复用 | undo 与 redo 分别等于提交前后完整文件字节，ChangeSet ID/revision/hash 保持 |
| 并发 | Service stale 与宿主 stale 都不覆盖新设置 | Node/IndexedDB 两层均拒绝旧版本 | 最终磁盘/commit settings 字节仍为胜者版本 |
| 损坏/future | 打开失败且源字节不变 | Node 真实目录按预期拒绝 | `{oops` 与 schema 9 复读仍为原始字节 |
| Web/Node 集成回归 | 新增用例不破坏旧工作区测试 | 首次定向集成运行因测试 import 漏保留 `createProjectTemplate`，同文件 6 个旧用例 `ReferenceError` | 恢复既有 import；3 文件集成复测 `17/17`，N51 聚合门 `43/43` |
| Compiler 身份 | settings 属于 source identity；Story IR 不因 defaults 改变 | 首轮完整门四个 Story IR Hash 全部不变，但旧 Build ID 冻结值失败 | 复核 `buildId = compiler/IR/profile/project/sourceHash/artifacts` 后重基线四个 Build ID，并新增 settings 改变 Build ID、Story IR 不变的显式回归；Compiler `29/29` |
| Runtime/空工程向量 | Build ID 下游向量与 Canonical semantic hash 同步演进 | 第二轮完整门 `145` 个普通文件中只有 2 个文件的 4 个冻结 Hash 失败，其余 `837/841` 通过 | 核对路线、结局、Source Map、位置和 IR 均不变后更新 State/History/空工程向量；定向复测 `15/15` |

本轮因正式 settings source identity 产生的当前确定性向量为：

| 向量 | N51-E3 当前值 |
|---|---|
| Tiny / Branching / Media / CJK Debug Build ID | `55fee35b…dd551` / `fd520ac7…580fb` / `cf2e8cfb…90639` / `9c9741ef…3e37` |
| Campus 广播室 / 天台结束 State | `137bb121…595fa` / `8704bf52…eddd1` |
| Run-from Scene / Statement State | `67eda61e…fccc4` / `04c2d201…d0622` |
| 三步 History Session | `3863ae18…98c32` |
| N23 空白工程 semantic hash | `16e57309…4fc69` |

这些变化来自 Canonical Project source hash 纳入正式 defaults，并非 Story IR 或运行路径漂移；历史审计保留当时值并附 N51-E3 演进说明。

## 5. 本地证据

- `npm run audit:n51-gal-settings`：`5 files / 43 tests`，PASS；
- `npm run typecheck`：PASS；
- `npm run build --workspace @world-studio/project-domain`：PASS；
- `npm run audit:architecture`：99 portable files、4 Node adapter files，PASS；
- `npm run audit:workspaces`：17 workspaces，PASS；
- 最终完整 `npm run check`：PASS；普通回归 `145 files / 841 tests`，Editor integration `8 files / 54 tests`，storage `1/1`，VM `5/5`、实际 `27.14s < 90s`；
- Compiler `29/29`、N51 `43/43`；production build 17 workspaces，Editor `956.01 kB / gzip 267.47 kB` 的既有拆包 warning 未放宽；
- 性能门：Route edit P95 `70.68ms < 500ms`，Asset dicing `2122.83ms < 5000ms`，其余 Script/Route/Asset 预算全部 PASS；
- 实现头 `8bae1b8` 的 GitHub Windows / Node 22 完整门：Draft PR #93，run `33088005806` / job `98572871025`，用时 `11m42s`，PASS；
- 远端普通回归 `145/841`、N51 `43/43`、Compiler `29/29`、VM `63.76s <90s`、Route edit P95 `148.65ms <500ms`、Asset dicing `3382.11ms <5000ms`；99 portable / 4 Node adapter architecture 与 production build 均绿色。

## 6. 需求对齐与诚实边界

E3 直接推进 REQ-GAL 的“统一工程、继承、撤销、平台值”和 AC-19 的正式数据链，但没有可见 UI，也没有 Preview/Player 应用，因此不能宣称配置中心或 N51 完成。仍未完成：

1. Basic/Advanced Settings 产品 UI、搜索、来源、修改态、恢复默认和 platform selector；
2. 桌面与 390×844 冷 production-browser 操作、键盘/焦点/触控/reduce-motion 与保存重开；
3. Preview/Player 对显示、文本、推进、六音量和输入设置的热应用；
4. REQ-GAL 剩余 P0 字段和模板；
5. 所有真人、实体设备、正式三端包、M1 Stable 与发布门。

下一切片冻结为 N51-E4 现代 Settings UI。E4 必须复用本轮 Canonical/Project Service/Lifecycle 链，不得把 React state、localStorage 或独立 settings store 变成第二权威来源。实现头已通过同头本地与远端完整门，E3 Engineering 关闭；真人、实体设备和 N51 Product Acceptance 仍按权威记录失败关闭。
