# N31→N32 治理与集成检查点

> 日期：2026-08-20
> 分支：`codex/m1-integration-n31-governance`
> 风险接受：`RA-N21-004`
> 当前阶段：风险边界与集成候选建立中
> 当前判定：只批准 N32 Editor Preview Engineering；N32 Product Acceptance、N40 及以后、M1 Stable 与 Public Release 继续阻断

## 1. 开发目标

1. 在 N31 Engineering 已通过后，把 N00–N31 完整祖先链收敛为一个面向 `main` 的可审查集成候选；
2. 真人参与者仍不可用时，只为 N32 Editor Preview 工程建立一个有到期时间、可机器拒绝越界的新例外；
3. 冻结 N32 的真实测试原则：正式 Compiler → 正式 Runtime → 生产浏览器 Preview，同一用例必须记录预期、实际、Hash/诊断差异与修正；
4. 不用自动化、AI 或开发者操作替代 N21/N23 真人证据，也不把 Draft PR 称为已合入 `main`。

## 2. 授权依据与边界

产品负责人已被明确告知：`RA-N21-003.maximumDeliveryNode=N31`，真人记录仍为 N21 `0/1`、N23 `0/2`，进入 N32 需要新授权。产品负责人随后于 2026-08-20 再次明确要求进入后续步骤，并继续要求每步审计、需求对齐、文档、推送及真实的预期—实际差异测试。因此关闭 `RA-N21-003`，建立 `RA-N21-004`。

`RA-N21-004` 只允许：

- N32 Editor Preview Engineering；
- 正式 Compiler/Runtime 在 Editor Preview 的集成实现与自动化/真实浏览器工程验证；
- 为该集成补充诊断、状态观察和测试宿主。

它不允许：

- 把 N21、N23、N30、N31 或 N32 登记为 Product Acceptance 通过；
- 进入 N40、正式 Player、三端构建、M1 Stable 或 Public Release；
- 把自动化或代理操作登记为真人证据；
- 自动合并、关闭或重写现有 Draft PR 链。

## 3. 真实测试契约

| 对象 | 冻结预期 | 必须记录的实际 | 差异处理 |
|---|---|---|---|
| 风险策略正例 | RA-004 active、上限 N32 时通过 | 策略测试与登记审计结果 | 不符则停在 N31 |
| 越界反例 | current node=N40 时失败 | 固定 violation 文本 | 不得删除反例或放宽上限 |
| 到期反例 | 到期后 active 例外失败 | 固定 expired violation | 必须续批或停止工程 |
| Product Gate 反例 | 删除 N32 Product Acceptance 阻断时失败 | 固定 missing-gate violation | 恢复阻断，不把 Engineering 换算成产品通过 |
| N32 后续产品测试 | Compiler/Runtime 与 Preview 的 State、Outcome、History、Diagnostic 一致 | 生产浏览器实际值、Hash、截图/报告与耗时 | 先定位并修正实现，再更新证据 |

## 4. 集成策略

- 新分支以 N31 最终绿色头 `f8d3c727db58bf6a27ae1cb940bba1a4dd291230` 为直接基线；
- 它相对 `origin/main` 为 behind `0`，并完整包含既有开发链；
- 建立一个新的集中集成 Draft PR 面向 `main`，供完整差异、CI、审阅和回退决策使用；
- #1–#50 暂时保留为逐步证据，不自动合并或关闭；
- 只有集中 PR 建立且最终 Windows / Node 22 全仓门绿色，集成基线才能从 Candidate 记为 Authoritative；Authoritative 仍不等于已合入 `main`。

## 5. 当前预期与实际

| 检查 | 预期 | 实际 | 判定 |
|---|---|---|---|
| `origin/main...N31` | 当前分支不落后 `main` | `0 behind / 212 ahead` | 通过 |
| N22→N23→N30→N31 祖先链 | 顺序全部成立 | `merge-base --is-ancestor` 全部退出码 0 | 通过 |
| RA-004 策略测试 | 正例和四类反例全部通过 | `3 files / 20 tests` 通过；含 N32 正例、N40 越界、到期、Product Gate 删除、旧例外重启反例 | 通过 |
| 风险登记审计 | 唯一 active 为 RA-004、上限 N32 | 首轮因追踪矩阵缺少 RA-004 而 FAIL；同步 docs/90 后第二轮 PASS，blocked gates 与到期时间均正确 | 纠偏后通过 |
| N31 集成交付基线 | 固定祖先、证据、main 非 behind | 待建立 | 待取得 |
| Windows / Node 22 全仓门 | 最终候选头完整通过 | 待建立集中 Draft PR | 待取得 |

## 6. 关闭条件

本检查点只有在以下条件同时满足时才能关闭：风险策略正反例绿色、需求/风险/交付审计绿色、集成候选不落后 `main`、集中 Draft PR 的最终 Windows / Node 22 全仓门绿色，并在文档中保留本机与远端的所有真实差异。

关闭后只允许进入 N32 Engineering；任何 Product Acceptance 或 N40+ 工作仍需新的证据与授权。
