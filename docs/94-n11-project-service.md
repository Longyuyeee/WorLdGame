# N11 Project Service 与事务命令审计

> 日期：2026-08-13
> 节点：N11
> 对齐需求：`REQ-PRJ`、`REQ-SEQ`、`REQ-SCRIPT`；为 N13、N21 和 AC-02/03/04 提供统一写入前置
> 状态：通过（本地与 Draft PR Windows CI 均通过）

## 1. 节点目标与原有问题

N10 已建立权威 Canonical Project，但编辑器原型仍主要通过 `StudioAction → SourceSession` 修改脚本，再投影回 `StoryProject`。Chapter、Scene、Character、Variable、Asset 没有统一写入入口，也没有跨视图共享的 revision、ChangeSet 或批处理边界。

N11 将所有项目语义写入收敛到 `@world-studio/project-domain` 内的 Project Service。Service 不访问磁盘、不持有 UI state，也不调用平台 API；文件生命周期与 WAL 仍分别属于 N12 和 Persistence。

## 2. 命令契约

每条 `ProjectCommand` 必须包含：

- `commandId`：稳定、可登记的幂等键；
- `expectedRevision`：乐观并发基线；
- 命令 `kind`、目标稳定 ID 和结构化 payload。

已定义并执行的命令：

| 实体 | 命令 |
|---|---|
| Chapter | Create / Rename / Delete / Move |
| Scene | Create / Rename / Delete / Move，支持设置 Entry |
| Character | Create / Rename / Delete / Move |
| Variable | Create / Rename / Delete / Move |
| Asset | Create / Rename / Delete / Move |
| Story Statement | Insert / Update / Delete / Move |

错误使用结构化 code：`STALE_REVISION`、`DUPLICATE_COMMAND`、`DUPLICATE_ID`、`NOT_FOUND`、`INVALID_COMMAND`、`REFERENCE_CONFLICT`、`INVALID_PROJECT`。删除被 Dialogue/Choice 等引用的角色或场景会返回 `REFERENCE_CONFLICT`，不执行隐式级联。

## 3. Revision、ChangeSet 与事务

- 单命令通过 `executeProjectCommand`，内部使用同一批处理实现；
- `executeProjectBatch` 从 Service 持有的不可变快照顺序产生新对象；普通批次最后用 Canonical save/load 再验证，严格场景改名在已验证基线之上使用局部标题/引用约束快路径；
- 任一命令、引用或最终 Schema 验证失败时返回原始 `state`，revision、Hash、命令 receipt 均不变化；
- 成功批次只增加一次 revision，并产生包含 command IDs、before/after Hash、changed entity IDs 的 `ChangeSet`；
- 已登记的 `commandId` 重放返回 `DUPLICATE_COMMAND` 且不再次修改项目；
- ChangeSet 的 before/after Hash 是独立的 SHA-256 事务修订链（前一修订 Hash、revision、完整规范化命令载荷、changed entity IDs），用于审计、幂等与 Undo/Redo；它不是工程语义 Hash；
- 工程语义 Hash 仍由 Canonical Project files 计算，只用于持久化、外部变化和 Compiler 对齐，不能与事务修订 Hash 混用；
- `undoProject` / `redoProject` 使用语义快照恢复，Redo 后事务修订 Hash 必须与原提交完全一致；
- 新命令会清空 redo stack，避免分叉后应用旧未来状态。

## 4. 保存边界与 SourceSession 收敛

`serializeCommittedRevision(state, revision)` 只接受当前 Project Service revision。调用者使用陈旧 revision 保存时立即得到 `STALE_REVISION`，无法把过期 UI/Session 快照写成项目源文件。

编辑器新增 `commandsFromCommittedSource`：

1. 只读取 `ScriptSourceSession.committedDocument`；
2. 投影为 Story Scene；
3. 与 Canonical Script 比较稳定 statement ID；
4. 生成 Delete / Insert / Update / Move 命令；
5. 由 Project Service 作为一个原子批次提交。

因此 Writer/Script 后续接入时使用同一 revision/ChangeSet 路径。当前 `StudioAction` UI reducer 尚未整体替换，属于 N21/N41 视图集成；N11 已提供并验证适配器，不把原型 UI 接线冒充完成。

## 5. 验收与故障审计

定点命令：

```powershell
npm.cmd run typecheck
npm.cmd exec -- vitest run packages/project-domain/src/project-service.test.ts apps/editor/src/project-service-source-adapter.test.ts --maxWorkers=1
```

已验证：

- 从空故事骨架用一个批次创建角色、两个场景、对白、分支选择和结局；
- Undo 回到空故事骨架，Redo 后语义 Hash 与首次提交相同；
- 全部 24 类实体命令可执行并通过 Canonical save/load；
- 同一批次中后置命令故障时，前置修改不泄漏；
- 陈旧 revision、重复 command ID、被引用角色/场景删除和陈旧保存被拒绝；
- SourceSession 的删除、插入、更新、排序作为一个 revision 提交；
- 定点测试 2 files / 8 tests，PASS。

完整门：

```powershell
npm.cmd run check
```

结果：workspace/需求/PR 追踪/Golden 审计通过；TypeScript 通过；普通测试 67 files / 440 tests、VM 重负载 1 file / 5 tests 全部通过；10 workspace 构建通过；架构审计覆盖 58 个 portable 文件；脚本性能 9 tests、资产性能 4 tests 通过；总耗时 63 秒。

远端验收：Draft PR #26 的 GitHub Actions run `31713637992` 在 `windows-latest` / Node `22.12.0` 上通过，作业 `94492692905` 总耗时 2 分 59 秒；干净依赖安装、PR 追踪、类型、全部测试/构建、架构与性能门均成功。

## 6. Acceptance / Stop Conditions 对齐

| 条件 | 状态 | 证据 |
|---|---|---|
| 所有视图可走同一项目命令边界 | 通过（Service/Adapter） | Project Command union + SourceSession adapter |
| 两场景分支故事命令创建 | 通过 | 单批次验收测试 |
| 撤销到空、重做到相同 Hash | 通过 | Undo/Redo 语义 Hash 测试 |
| 批处理原子性 | 通过 | 后置故障注入，state 对象及内容保持原值 |
| 陈旧 Revision / 语义冲突 | 通过 | 结构化错误测试 |
| 保存只接收提交 Revision | 通过 | stale serialize 拒绝测试 |
| UI 不维护第二份项目语义 | 未完全证明，后续视图节点接入 | N11 提供唯一写 API；旧 reducer 接线仍需 N21/N41 收敛 |

## 7. 不证明与下一节点

N11 不证明项目首页、真实目录打开、最近项目、导入导出、崩溃恢复 UI 或章节/实体管理界面已经完成。它证明的是这些界面将要调用的统一语义事务内核。

N11 已完成实现、自审、本地完整门、推送和远端 Windows CI。下一节点进入 N12：项目首页与文件生命周期。

> 2026-08-27 N51-E3 演进说明：Project Command union 新增单命令原子 `settings.edit`，复用 typed catalog/editor 最终校验并进入同一 revision、ChangeSet、Undo/Redo 与保存链；stale、非法设置和 no-op 均保持原 state。该扩展不改变 N11 的事务原则，详见[审计 #225](225-n51-e3-project-settings-transaction-audit.md)。
