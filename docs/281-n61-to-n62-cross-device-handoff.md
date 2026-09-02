# N61 → N62 跨电脑开发交接

> 交接日期：2026-09-02  
> 当前分支：`codex/n60-e1-debugger-session`  
> 已验证产品/文档基线：`bbead3b1e46722c35b83267e9a4e9446da2e527e`  
> GitHub：Draft PR #123，目标分支 `codex/m1-integration-n52-candidate`，状态 OPEN / MERGEABLE  
> 基线 CI：run `33611126350` / job `100186260573`，Windows / Node 22 完整门成功  
> 当前结论：暂停功能开发；N61 Engineering 已关闭，下一功能节点为 N62-E1，但当前授权尚未准入 N62 Engineering

## 1. 换机时应恢复到什么状态

本交接以远端分支最新 tip 为唯一恢复点，不使用旧电脑未提交文件，也不从 `main` 重新开始。交接前已核对：

- 本地 `HEAD` 与 `origin/codex/n60-e1-debugger-session` 均为 `bbead3b1e46722c35b83267e9a4e9446da2e527e`；
- 工作区无未提交修改；
- Draft PR #123 的 head 与上述提交一致，且 GitHub 判定可合并；
- 精确 head 的 Windows / Node 22 完整门成功；
- 本文及入口文档提交后，应以“本地 HEAD 等于远端分支 HEAD”再次核验最终交接 tip。产品实现基线仍是上述 `bbead3b`，交接提交只改变文档。

新电脑恢复命令：

```powershell
git clone https://github.com/Longyuyeee/WorLdGame.git
Set-Location WorLdGame
git fetch origin --prune
git switch --track origin/codex/n60-e1-debugger-session
git pull --ff-only
git status --short --branch
git rev-parse HEAD
git rev-parse origin/codex/n60-e1-debugger-session
npm ci
gh pr view 123
```

两个 `rev-parse` 必须相同，`git status` 必须没有未提交文件。开始工作前依次阅读 `README.md`、本文、`docs/99-current-development-status-audit.md`、`docs/280-n61-e7-localization-engineering-exit-audit.md`、`docs/89-engine-product-delivery-plan.md` 的 N62 段和 `docs/90-m1-requirement-traceability.md` 的 AC-17/18/20。

## 2. 已完成且不要重复开发的内容

N40 Route、N41 Sequence、N42 Stage、N43 七工作模式、N50 Player、N51 Settings、N52 Player Control、N60 Debugger/Story QA、N61 Localization 的 Engineering 出口已经关闭。最新 N61 真实链路是：

1. Editor Production 导入真实 PNG/WAV，并以 stable text ID / base asset ID 建立语言媒体与 Voice 绑定；
2. 保存同一 Canonical Project 和 IndexedDB Blob；
3. Compiler 从该 Canonical 生成 Asset Manifest 与 Localization Catalog；
4. 正式 Player 从同一 IndexedDB Blob 运行 `en → zh-Hans → ja`；
5. 目标语言资源存在时即时切换，不存在时回退源语言并显示缺失数量；
6. 390×844 下 CJK 禁则、Ruby、横向溢出、44px 交互和 console 已闭合。

不要再为 N61 增加重复证明。N61 Product Acceptance 仍因 Windows/Android 正式 Host、实体设备和三端一致性缺失而阻断；Engineering 通过不能换算成产品通过。

## 3. 真实代码中的 N62 起点

本次直接检查了 `packages/project-compiler/src/compiler.ts`、`packages/project-compiler/src/types.ts`、`packages/runtime/src/runtime.ts`、`packages/runtime/src/meta-progress.ts`、`packages/player-core/src/player-core.ts` 与 `apps/player-shell/src/PlayerShell.tsx`。实际状态如下：

| 层 | 当前真实能力 | 尚缺内容 |
|---|---|---|
| Compiler | `catalogs.json` 已确定性生成 `endings`、`gallery`、`music`、`replay`；来源为可达结局、故事真实引用和 Asset metadata | 标题/排序/封面/剧透/本地化覆盖尚未形成作者可配置合同；缩略图缺失诊断尚未实现 |
| Runtime | `metaProgress` 已单调记录 `unlockedGalleryAssetIds` 与 `reachedEndingIds`，并在 Save/History 处理中保持 | Music 解锁与 Replay 隔离会话/恢复原状态尚未实现 |
| Player Core | 编译产物保存在 `state.artifacts`，现有本地化功能会消费 `catalogs.localization` | 未投影四类附加页所需的可见/锁定模型，也未定义 Replay 独立启动和退出恢复 |
| Player Shell | 正式剧情、语言、History、Save、Auto/Skip 等入口已存在 | 没有“附加内容”入口，也没有 Gallery、Replay、Music、Ending 页面；搜索这些用户文案没有命中 |

因此当前不是“自动页基本完成、只差美化”，而是底层 Catalog/部分 Meta 已有、正式玩家入口和连续使用路径尚未开始。

## 4. 唯一接续功能：N62-E1

用户场景先固定为：玩家在正式 Player 中推进剧情并产生解锁后，从清晰可发现的“附加内容”入口打开自动生成内容；页面数据必须来自当前 build 的 Compiler Catalog 和 Runtime Meta，不要求作者维护第二份手工列表。玩家能区分已发现、未发现、空内容和资源缺失，并能返回原剧情状态。

N62-E1 先做最小纵向闭环：

1. 给正式 Player 增加“附加内容”入口；
2. 由 Player Core 从同一 `artifacts.catalogs` 与当前 `metaProgress` 投影只读摘要；
3. Shell 至少呈现 Ending / Gallery / Music / Replay 四类的数量与锁定/空状态，不手工复制 Catalog；
4. 从附加页返回时保持原 Runtime/History/Save 状态不变；
5. 资源缺失或 Catalog 为空时给玩家明确反馈和返回路径，不崩溃、不静默显示错误内容。

Replay 的隔离 Checkpoint、Music 解锁规则、封面/标题/排序/剧透/本地化覆盖属于后续 N62 切片；只有当 E1 的真实用户路径确实需要时才补底层结构，不先扩建抽象层。

## 5. 下一步真实测试合同

进入 N62 后先写一条正式产品路径，记录预期、当前实际和修正后实际：

| 阶段 | 内容 |
|---|---|
| 预期 | 用含真实故事引用与结局的 Canonical Project 启动正式 Player；推进到解锁后能打开自动附加页，四类内容来自 Compiler Catalog，锁定/空状态可见，返回后仍处于原剧情位置 |
| 当前实际 | Compiler 已生成四类 Catalog、Runtime 已记录 Gallery/Ending Meta，但 `PlayerShell` 没有附加入口或页面，用户无法消费这些结果 |
| 修正后实际 | 在实现完成后填写真实交互结果、Catalog/Meta 对照、返回前后 Runtime/History identity，以及桌面与 390×844 可见结果 |

测试必须经过正式 `Canonical → Compiler → Player Core → Player Shell`，并用实际引用生成 Catalog；禁止在测试里手写第二份 Player Catalog 来让页面通过。先跑这一条受影响产品测试，再跑对应 Core/Shell 回归和 production browser；除非发现影响面扩大，不追加无关全仓测试。完整仓库由推送后的精确 head GitHub CI 裁决。真人操作继续等功能与整体 UI 完成后统一进行，不记录无效点击时间。

## 6. 授权、需求与交付边界

当前 `RA-N21-011` 的 Localization 窄范围修订只准入到 N61 Engineering，并持续阻断 N61 Product Acceptance、N62 Engineering、M1 Stable 和发布。因此新电脑上的第一项动作是确认产品负责人允许进入上述 N62-E1 范围；在确认前只能读代码和核对本文，不能提交 N62 产品代码。

授权确认后直接开发 E1，不再单独制造治理文档替代功能。每个功能切片结束时执行：

1. 对照本节用户路径审计是否交付了可见功能；
2. 对照 N62 Goal、AC-17/18/20 和原 PRD，确认没有把底层机制冒充产品完成；
3. 只运行能暴露本次真实差异的最小必要测试；
4. 更新受影响文档，提交并推送；
5. 核验本地/远端 exact head 一致，并等待该 exact head 的 GitHub CI 结论。

保持两条长期原则：功能优先，只做最小必要测试/审计/安全工作；用户场景先行，开发前明确用户、入口、操作路径、反馈和失败恢复。

## 7. 当前不应做的事情

- 不重复扩充 N61 本地化测试或提前组织真人计时验收；
- 不把响应式 Web 当作 Windows/Android 正式 Host 或实体设备证据；
- 不因 Catalog 数据结构已存在就宣布 N62 Engineering 完成；
- 不先实现三端一致、发布门、Optimization 或 N70+；
- 不自行合并 PR #123、#122 或 #61；当前请求只要求安全交接与推送。
