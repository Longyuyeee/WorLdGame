# N10 Canonical Project Schema 审计

> 日期：2026-08-13
> 节点：N10
> 对齐需求：`REQ-PRJ`、`REQ-SCRIPT`、`REQ-ASSET`、`REQ-L10N`、`REQ-GAL` 的权威工程前置
> 状态：通过（本地与 Draft PR Windows CI 均通过）

## 1. 审计结论

原仓库不能把现有任一模型直接宣布为 Canonical Project：

- `StoryProject schemaVersion:0` 只有角色、场景和四类基础语句，缺 Chapter、Variable、Asset、Localization、Settings、UI、Plugin 和 Test Route；
- `ProjectSnapshot schemaVersion:2` 是编辑器 Source Session 的原子存储/WAL 格式，包含 draft、revision、tombstone，不是项目语义格式；
- `restoreStudioSession` 原先要求 ID、标题、入口和场景数与 `campusStoryProject` 完全相同；
- 固定校园样例源码写在 TypeScript 常量中，不能作为任意项目的数据边界。

N10 因此新增独立、零运行时依赖、平台无关的 `@world-studio/project-domain`。Domain 定义项目语义和文件引用；Persistence 保持原子文件读写职责；Editor Session 继续作为可重建工作状态，三者不互相冒充。

## 2. `.world` v1 文件边界

权威入口是 `world.project.json`，`schemaVersion: 1`、`fileVersion: "1.0.0"`。Manifest 只保存稳定身份、展示元数据和下列源文件引用：

| 语义 | 路径约定 |
|---|---|
| Chapter / Scene | `chapters/*.json`、`scenes/*.json` |
| Script / Layout Sidecar | `scripts/*.json`、`layouts/*.json` |
| Character / Variable / Asset | `domain/*.json` |
| Localization | `localization/catalog.json` |
| Settings / UI | `settings/project.json`、`ui/screens.json` |
| Plugin / Test Route | `plugins/plugins.json`、`tests/routes.json` |

`schema/world-project-v1.schema.json` 冻结 Manifest JSON Schema；运行时 parser 对全部引用文档执行版本、形状、规范路径、稳定 ID、重复 ID、入口场景和跨文件 scene/script/layout 对齐检查。

## 3. 数据安全与演进规则

- 稳定 ID 使用小写可移植 token；`createStableId(kind, durableEntropy)` 不读取标题、墙钟或随机全局，因此重命名不改变 ID；
- 当前版本的未知 JSON 字段收集到 `preservedFields`，保存时恢复到原对象；
- Manifest 的未来 schema 只允许 `probeProject` 返回 `future-read-only`，禁止进入编辑态；
- `.world-cache/*` 不在任何源引用中，load/save 后自动消失，证明派生缓存可删除重建；
- 保存按路径和对象 key 确定排序并统一 LF/两空格，减少 Git diff 噪声；
- Domain 没有 UI、DOM、Shell、文件系统、Node process、crypto provider 或第三方运行时依赖。

## 4. S0 迁移与编辑器接入

`migrateS0Project` 将 S0 `StoryProject` 一次性拆为 Manifest、默认 Chapter、Scene、Script、空 Layout 以及完整领域清单。Manifest 保留 `migratedFrom: s0/story-project-v0` 未知字段；第二次迁移识别 current 文件并返回同一规范文件集。

N01 的 Tiny、Branching、Media、CJK、Recovery、Size、Benchmark 七类 Seed 全部进入迁移幂等与语义 Hash 测试。`projectCanonicalForEditor` 和 `createStudioSessionFromCanonical` 使编辑器核心可以接收任意 Canonical Project；定点用例使用非校园 ID、单场景工程创建可编辑 Source Session。默认 App 仍打开校园示例，项目选择/创建 UI 属于 N11，不能计为 N10 缺失。

## 5. 验收证据

定点门：

```powershell
npm.cmd run typecheck
npm.cmd exec -- vitest run packages/project-domain/src/project-domain.test.ts packages/project-domain/src/golden-migration.test.ts apps/editor/src/canonical-project-adapter.test.ts --maxWorkers=1
npm.cmd run audit:architecture
```

当前结果：

- 10 workspace 注册、6 个计划产品边界，PASS；
- Domain/Editor 类型检查，PASS；
- 普通测试 65 files / 432 tests、VM 重负载 1 file / 5 tests，全部 PASS；
- 10 个 workspace 构建（含正式 `project-domain`），PASS；
- 架构审计覆盖 57 个 portable 文件，Domain 零平台/运行时依赖，PASS；
- 脚本性能 9 tests、资产性能 4 tests，PASS；最终完整门总耗时 67.2 秒。

远端验收：Draft PR #25 的 GitHub Actions run `31711987340` 在 `windows-latest` / Node `22.12.0` 上通过，作业 `94487023563` 总耗时 2 分 50 秒；干净 `npm ci`、新 workspace 链接、PR 追踪门、全部测试、10 workspace 构建、架构和性能审计均成功。

## 6. Acceptance / Stop Conditions 对齐

| 条件 | 状态 | 证据 |
|---|---|---|
| 两个结构不同工程 load/save/reload 保持语义 Hash | 通过 | Tiny 单场景与 Branching 三场景参数化测试 |
| 重复 ID 拒绝 | 通过 | `DUPLICATE_ID` 定点测试 |
| 未来版本只读 | 通过 | probe 成功、load 拒绝测试 |
| 迁移幂等 | 通过 | 7 个 Golden + 核心定点测试 |
| 未知字段保留 | 通过 | vendor extension round-trip |
| Git diff 稳定 | 通过 | canonical key/path 排序和第二次文件集完全相等 |
| 项目语义不从 UI state 推断 | 通过（N10 边界） | Domain 文件先加载，再投影 Editor Session |
| 新场景不修改 TypeScript 常量 | 通过（Domain/Adapter） | 场景由 Chapter/Scene/Script 文件枚举；N11 再提供 UI 命令 |

## 7. 不证明与下一节点

N10 不证明新建/打开/最近项目 UI、OS 目录授权、事务命令、导入导出、Compiler、Runtime 或正式 Build 已完成。现有 `ProjectSnapshot` 仍用于原型会话恢复，后续 N11/N12 必须让宿主直接持久化 Canonical Project 文件并把 Session 状态降为可重建派生数据。

N10 已完成实现、自审、本地完整门、推送和远端 Windows CI。下一节点进入 N11：Project Service 与事务命令。
