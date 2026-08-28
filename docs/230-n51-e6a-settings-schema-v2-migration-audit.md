# N51-E6a Settings Schema v2 迁移安全审计

> 日期：2026-08-28
> 分支：`codex/n51-e6-p0-coverage-exit`
> 直接基线：N51-E6 入口最终头 `562a4f7`
> 授权：`RA-N21-010`，最大节点 N51
> 当前判定：实现与本机定向/后半门通过；本机完整串行门存在累积负载红项，同头远端 Windows / Node 22 证据待补

## 1. 目标、边界与版本纪律

E6a 只建立 Settings v1→v2 的兼容读取和确定性升级，不新增配置字段、UI 或执行策略。合法 v1/v2 均经同一严格 parser 校验，内存事实统一为 v2，保存只写 v2；v3 及以上继续以 `FUTURE_SCHEMA` 失败关闭，0、非整数和非数字版本继续以 `INVALID_SCHEMA` 拒绝。

v2 是迁移基础切片，不授权后续在同一版本下静默追加严格字段。E6b 若改变严格文档形状，必须再次提升 schemaVersion 或先证明旧 v2 读取器兼容，避免重复产生同版本不可互读。

## 2. 冻结预期与真实链

| 链路 | 冻结预期 | 真实测试 |
|---|---|---|
| Typed parser | 非空合法 v1 保留 project/platform overrides 与逐字段 source；v2 可读；v3 拒绝 | `settings.test.ts` 用 Web/Android 非空覆盖比较 resolved values/source，并验证二次序列化字节相同 |
| Canonical Project | v1 工程加载为 v2，第一次保存升级，第二次保存完全幂等 | `project-settings.test.ts` 通过正式 `loadProject` / `saveProject` 比较完整文件映射 |
| Windows 目录 | 真实磁盘 v1 打开→保存→释放语义重开，覆盖值和 v2 字节不漂移 | `node-directory-project-workspace.test.ts` 使用真实临时目录和实际文件字节 |
| Web IndexedDB | 管理型工作区真实写入 v1→打开→保存→重开，第二次保存字节不漂移 | `indexeddb-project-workspace.test.ts` 使用 `fake-indexeddb` 的真实事务 adapter，不用内存假 workspace |
| Player identity | 只有 settings schema 归一化时，活跃 choice Core 不重建 | `player-shell.test.tsx` 从正式保存文件注入 v1，经 `loadProject` 迁移后 rerender，choice 与 `waiting-choice` 保持 |

## 3. 预期—首次实际—修正

| 阶段 | 预期 | 首次实际 | 修正与复测 |
|---|---|---|---|
| 先写测试 | 5 层全部要求 v2 归一化 | 5 files / 52 tests 中 45 通过、7 失败；当前 parser 返回 v1，并把 v2 判为 future | 只把当前版本提升为 2，并允许安全整数范围 1–2 进入既有严格字段校验；同组复测 52/52 |
| N51 聚合门 | 新迁移不破坏 Catalog/UI/application | 10 files / 74 tests 运行期全部通过 | 无运行期放宽 |
| TypeScript | 测试按只读 ProjectFiles 契约编译 | 两个测试直接向 `Readonly<Record>` 注入旧字节，类型门失败 | 复制文件映射后注入；类型门通过，相关 22/22 复测通过 |
| Compiler Golden | Story 语义不变，工程源码身份必须反映 settings v2 字节 | 首次完整门四个 Story IR Hash 全部不变，但四个 Build ID 因 source identity 更新而与旧 Golden 不同 | 冻结新 Build ID；Tiny `7d0be95b…0736a`、Branching `2d789cd2…d08e1`、CJK `885e929e…8fe30`、Media `a8701f4f…28445` |
| Project/Runtime Golden | Canonical identity 派生向量应更新，路线/位置/History 语义不漂移 | 普通回归 4 个快速断言显示空白工程 semantic hash、双路线/Run-from State 与 History Hash 仍是旧向量 | 冻结 v2 源身份的新向量并保留相等/Outcome/位置断言；旧审计追加演进说明 |

没有删除断言、降低规模、放宽超时或绕过正式 Project/Workspace/Player API。Build ID 变化只反映 Canonical source bytes 的版本升级；四个 `storyIrHash` 保持原值，证明剧情编译语义未漂移。

## 4. 本机完整门与负载差异

首次 `npm run check` 在 Compiler Golden 29 项中的旧 Build ID 断言停止；更新预期身份后，Compiler `29/29` 通过。第二次从头执行完整门，Runtime `60/60`、10k corpus `33.496s`、N41 scale/lazy 等前置门通过，但 N41 Sequence Exit 的 49 项中 3 项在 5s/10s 原超时下失败；受影响的两个真实 App 文件保持原门限隔离复跑 `16/16` 通过。

继续执行未到达的后半门：

- N42 `15 files / 152 tests` 与 App `45/45` 通过；N43、Player/Core `32/32`、N51 `74/74`、typecheck 通过；
- 普通回归首次为 `149 files / 861 tests`，其中 855 通过：4 个快速失败是旧 Project/Runtime identity Golden，2 个是 Playable Preview 5s/10s 超时；更新身份后，Formal Preview、空白工程与 Playable Preview 原门限隔离复跑 `3 files / 22 tests` 全通过；
- 17 workspace production build 通过；Editor `972.26 kB / gzip 272.57 kB` 的既有拆包 warning 未放宽，Player Host `308.75 / 95.88 kB`；
- architecture `100 portable / 4 Node adapter`、Script `13/13`、Route `9/9`、Asset `4/4` 通过；Route edit P95 `194.16ms < 500ms`，Asset dicing `3313.33ms < 5000ms`。

因此本机功能与隔离原门限证据已绿，但单次完整串行命令没有全绿，不能在本地宣称完整门通过。同一最终提交必须由干净 Windows / Node 22 完整 `npm run check` 裁决；任一远端红灯都阻止 E6a 关闭。

## 5. 需求与完成度审计

本切片直接推进 REQ-GAL / AC-19 的旧工程迁移、严格 schema 和三层配置持久化安全，但没有新增 23 字段之外的 P0 覆盖，也没有完成 N51 Product Acceptance。Project Service ChangeSet/Undo/Redo 仍消费归一化后的同一 `GalSettingsDocument`，无需第二迁移 store；损坏文档和 future schema 的既有失败关闭测试继续保留。

E6a 关闭必须同时满足：完整 `npm run check`、同一最终提交的 GitHub Windows / Node 22 完整门、文档与实现头一致。证据完成前，本文件只记录本机实现状态，不提前宣称 Engineering 关闭。

## 6. 下一步

远端同头绿色后，E6a Engineering 才关闭。下一允许切片为 E6b Text/Accessibility application；必须先冻结字段、schema 版本和可观察 Host 效果，再按“预期→首次实际→差异→修正”执行。N52 Save/History/Auto/Skip/Back/Forward、N61 本地化生产、N62 附加页生成和 N80–N83 构建发布继续阻断。
