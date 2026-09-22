# N52 开发暂停与接续交接审计

> 日期：2026-08-28
> 暂停分支：`codex/n51-n52-governance`
> 暂停提交：`568da54`（已推送）
> Draft PR：#97，base=`codex/n51-e6-p0-coverage-exit`
> 状态：暂停快照已收束；最终治理头 `1cf6458` 同头 CI 绿色；产品负责人已恢复开发

## 1. 暂停时的真实状态

### 已完成

- N51 Engineering 已在最终绿色头 `7bc7b78` 关闭；N51 Product Acceptance 仍阻断；
- 已审计 N52 真实代码边界：N31 Runtime 已有 Save、Session Save、History、Back/Forward、Scheduler 与 Runtime Host reconciliation；正式 Player Core/Shell 尚未产品化这些能力；
- 已建立 `RA-N21-011`，current/max 均为 N52，只准入 N52 Engineering；RA-001–010 均为 closed；
- 治理冻结测试首次实际为 `16/20`，4 项失败准确暴露旧 N51 ceiling；修正策略与注册表后为 `3 files / 20 tests` PASS；
- 提交前本机完整 `npm run check` 一次绿色：普通 `149/886`、N50 `37/37`、N51 `95/95`、Autosave `4.66s <5s`、VM `76.25s <90s`、Route P95 `161.05ms <500ms`、Asset dicing `2644.81ms <5000ms`；
- 治理提交 `568da54` 已推送，Draft PR #97 已创建。

### 正在进行但未完成

- `product-baseline` run `33158924466` / job `98808364766` 对提交 `568da54` 的 Windows / Node 22 完整门已由 GitHub 启动；暂停快照时状态为 `in_progress`；
- 因尚无终态，不能登记同头 CI 绿色，PR #97 暂时显示 `UNSTABLE`；
- [治理检查点 #236](../../docs/236-n51-n52-governance-checkpoint.md)的同头 CI 章节尚未形成最终裁决。

### 尚未开始

- 没有修改 `packages/player-core`、`apps/player-shell` 或 `packages/runtime` 的产品代码；
- N52-E1 History-backed Player Core、Back/Forward UI、production-browser evidence 均未开始；
- Save 槽位、自动/快速保存、Load、History 页面、Auto、Skip 和 Choice scheduling 后续切片均未开始；
- N52 Product Acceptance、N60+、真人/实体设备、M1 Stable 与 Public Release 全部继续阻断。

## 2. 唯一接续开发点

恢复时不能直接写 Save/Auto/Skip。唯一接续点是先收束 N51→N52 治理检查点：

1. 拉取 `codex/n51-n52-governance`，确认 HEAD 与远端 `568da54` 或其后续文档头一致且工作树干净；
2. 读取 run `33158924466` 的真实终态和日志：若失败，保留实际失败并只修治理/文档缺口；若成功，把 run、job、SHA、耗时和关键数字回填 #236；
3. 提交并推送治理最终文档头，再核验该最终头自己的同头 CI；在它绿色前，治理检查点不能登记关闭；
4. 治理最终头绿色后，从该头建立 `codex/n52-e1-history-backed-player-core`；
5. N52-E1 必须先写冻结测试，预期当前 Player Core 因没有 History Session 和 Back/Forward intent 而失败，再实施代码修正。

## 3. N52-E1 已冻结的范围

E1 只做以下闭环：

- 同一正式 Player Core 以 N31 `RuntimeHistorySessionV1` 记录可观察剧情边界；
- Back/Forward intent 直接调用 N31 History API；
- Runtime Host 按 reconciliation plan 执行 Back compensation / Forward replay；
- Golden 路线验证“结局→Back→Forward”的 Runtime State Hash 完全恢复、active presentation channels 等价，并保留 Host append-only compensation/replay 操作证据；原“Host hash 完全恢复”与真实 Host hash 包含操作审计账本的实现冲突，由 N52-E1 审计纠偏；
- Back 后改选另一分支必须截断旧 Forward；
- Web Player Shell 提供可访问、状态正确的 Back/Forward 控件，并执行桌面与 390×844 冷 production-browser；
- 不在 E1 实现 Save 槽位、Auto、Skip，也不宣称 N52 Product Acceptance。

## 4. 恢复时必须读取的真实代码

- `packages/player-core/src/player-core.ts` 与对应测试：当前 Core 状态和 intent 边界；
- `packages/runtime/src/history.ts`、`save.ts`、`session-save.ts`、`scheduler.ts`：唯一正式内核；
- `packages/runtime-host/src/host.ts`：presentation compensation/replay；
- `apps/player-shell/src/player-shell.tsx`、`mount-player.tsx`：正式 Web Player 与版本化 Host API；
- [范围消歧 #220](../../docs/220-n50-n52-scope-reconciliation.md)、[治理 #236](../../docs/236-n51-n52-governance-checkpoint.md)、[需求矩阵 #90](../../docs/90-m1-requirement-traceability.md)。

## 5. 恢复后的每步关闭规则

继续保持：冻结目标与预期 → 运行真实首测 → 记录实际差异 → 修正 → production-browser → 文档/需求对齐 → 完整门 → 提交推送 → 同头 CI。不得删除断言、缩减 corpus、提高预算或用自动化冒充真人和实体设备。

## 6. 暂停快照收束结果

2026-08-28 恢复时读取到以下真实终态：

- 实现头 `568da54` 的 run `33158924466` / job `98808364766` 因后续提交到来在 Checkout 阶段被取消，未执行完整门；
- 最终文档头 `1cf6458` 的 run `33159131108` / job `98809082514` 独立完成 Windows / Node 22 `npm run check`，结论为 success，用时约 `10m09s`；
- Draft PR #97 为 OPEN、CLEAN；本地分支与远端同头，治理策略 `20/20`、N50 `37/37`、N51 Engineering Exit `0 violations` 定向复验通过；
- 产品负责人随后明确要求按接续点继续开发，因此本交接的暂停条件解除。

治理最终头的同头裁决已经满足，第 2 节步骤 1–3 关闭。下一动作严格执行步骤 4–5：从最终治理头建立 `codex/n52-e1-history-backed-player-core`，先提交可审计的失败冻结测试，再实现 E1；Save 槽位、Auto、Skip 和 N52 Product Acceptance 继续不在本切片范围内。

> 2026-08-28 后续状态：N52-E1 已按该顺序实施并完成本地审计，最新权威接续点改由[N52-E1 审计 #238](../../docs/238-n52-e1-history-backed-player-core-audit.md)维护；本文件保留为恢复前暂停快照。
