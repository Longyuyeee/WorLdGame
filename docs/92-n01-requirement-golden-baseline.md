# N01 需求追踪与 Golden 基线审计

> 日期：2026-08-13
> 节点：N01
> 对齐需求：全部 10 个 USP、13 个 P0 `REQ-*`、`AC-01`–`AC-27`
> 状态：本地实现与定点验收通过；等待 Draft PR Windows CI

## 1. 节点目标

N01 建立以后每个产品节点必须更新的需求、测试和证据骨架，防止“代码增长但产品完成度不可判断”。本节点不宣称 Canonical Project、Compiler、Runtime 或正式 Build 已完成。

完成定义：

1. 10 个 USP、13 个 P0 模块和 27 条 AC 无遗漏、无未知 ID、无重复；
2. 50 项都有唯一 owner、交付节点、允许状态、统一测试入口和证据索引；
3. Tiny、Branching、Media、CJK、Recovery、Size、Benchmark 七类 Golden 均有真实可解析的 S0 源工程；
4. 每个 Golden 保存可复算的源语义 Hash 和基线 Build Manifest Hash；
5. 尚不存在的正式 IR、Runtime State、项目 Build Artifact 必须明确 pending 到 N30、N31、N80，禁止假造 Hash；
6. 产品代码 PR 未更新追踪矩阵时 CI 失败；
7. 每周从空临时目录运行一次 Web 编辑器壳构建演示。

## 2. 审计发现与处理

| 发现 | 风险 | N01 处理 |
|---|---|---|
| Markdown 表已有完整 ID，但无机器完整性门 | 行被误删或新增未知 ID不会失败 | `audit-requirements.mjs` 冻结 10/13/27 集合、状态和节点规则 |
| 需求有交付节点和证据类型，但 owner 分散 | 失败时无明确责任域 | `requirement-owners.json` 将 50 项唯一分配给 6 个 owner |
| 代码 PR 可不更新追踪矩阵 | 文档与实现长期漂移 | PR 环境比较 base SHA；`apps/`/`packages/` 产品代码变化必须同时修改追踪矩阵 |
| 仓库没有七类 Golden 入口 | 后续节点各造自己的样例 | 建立 7 个稳定目录、注册表、S0 源工程和证据封套 |
| 正式 Compiler/Runtime/Build 尚不存在 | 容易用 Spike Hash 冒充产品证据 | 对应 Hash 字段只能为带目标节点的 `pending/null` |
| “空目录到 Web Build”没有可执行入口 | 每周演示只停留在计划 | 临时目录复制 Tiny 源工程、构建 Web 编辑器壳、校验并清理 7 个产物 |

## 3. 产物与机器规则

- `config/requirement-owners.json`：50 项全覆盖，统一测试入口为 `npm run check`，证据索引为追踪矩阵；
- `tools/audit-requirements.mjs`：校验 ID 集、状态、节点、唯一 owner、通过项证据链接和每周 workflow；
- `tools/audit-pr-traceability.mjs`：PR 产品代码变化必须更新 `docs/90-m1-requirement-traceability.md`；
- `config/golden-projects.json`：七类 Golden 的 ID、category、owner 和固定路径；
- `fixtures/projects/*/project.s0.json`：当前 S0 模型下的真实源工程；
- `fixtures/projects/*/evidence.json`：源语义 Hash、Build Manifest Hash 和下游 pending 证据槽；
- `fixtures/projects/*/build-manifest.json`：只标记为 `editor-shell-baseline`，正式项目构建固定由 N80 接管；
- `tools/audit-golden-projects.mjs`：校验稳定 ID、引用、分类语义、Hash 新鲜度和不夸大规则；
- `.github/workflows/weekly-demo.yml`：每周一 18:17 UTC 及手动触发。

## 4. 本地验收证据

```powershell
npm.cmd run audit:requirements
npm.cmd run audit:goldens
npm.cmd run demo:empty-to-web
```

结果：

- 需求审计：50 项，10 USP / 13 P0 / 27 AC，6 owner，PASS；
- Golden 审计：7 类源工程、稳定 ID/引用、源语义 Hash、Build Manifest Hash，PASS；
- 空目录演示：Tiny 源工程进入临时目录，Web 编辑器壳构建成功，校验 7 个产物后清理，PASS；
- 正式项目 Web Build：明确为 `pending N80`，没有计入 N01 产品完成度。

完整门：

```powershell
npm.cmd run check
```

结果：需求/PR 追踪/Golden/workspace 四类机器审计通过；TypeScript 通过；普通测试 62 files / 415 tests、VM 重负载 1 file / 5 tests 全部通过；9 个 workspace 构建通过；架构审计通过；脚本性能 9 tests、资产性能 4 tests 通过；总耗时 53.7 秒。Draft PR Windows CI 结果在推送后补入本文件。

## 5. 需求对齐

| N01 要求 | 状态 | 证据 |
|---|---|---|
| 所有 P0/AC 有 owner 和节点 | 通过 | 追踪矩阵 + owner 注册表 + 需求审计 |
| 七类 Golden Project | 通过（S0 Seed） | `fixtures/projects/*` + Golden 审计 |
| 源、IR、State、Build 证据位置 | 通过（分阶段） | 源/Manifest Hash 已锁；N30/N31/N80 pending 槽被机器约束 |
| 每周空目录演示 | 本地通过，待远端调度生效 | weekly workflow + `demo:empty-to-web` |
| 功能 PR 更新追踪矩阵 | 已实现，待 PR 环境验证 | base SHA diff 门 |
| 通过状态必须有证据链接 | 通过 | 需求审计规则；当前没有产品项被标记“通过” |

## 6. 不证明

N01 不证明七类工程已经采用未来 Canonical Schema，也不证明正式 IR、Runtime State、三端 Build 或 Benchmark Episode 已完成。Size 当前是确定性的多段 Seed，不是 100k 语句性能样本；正式规模在 N20/N30/N100 按对应预算生成。每个 pending 槽只能在其目标节点用正式产品实现和可复跑证据替换。

## 7. 下一节点

N01 本地与远端门全部通过后进入 N10：Canonical Project Schema。N10 将建立正式 `project-domain`，把七类 S0 Seed 迁移为通用 Schema，并以两个结构不同工程的 load/save/reload 语义 Hash 作为验收核心。
