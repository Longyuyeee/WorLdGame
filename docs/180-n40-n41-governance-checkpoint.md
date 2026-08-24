# N40→N41 Sequence Engineering 治理检查点

> 日期：2026-08-24
> 分支：`codex/n41-e1-sequence-core`
> 直接基线：N40 最终绿色头 `60b5aae5b55caaff61e2361e7a0b7a528e031e71`
> 授权：`RA-N21-006`，最大节点 N41，2026-09-24 11:35:40（UTC+8）到期
> 判定：只准入 N41 Sequence Engineering；N41 Product Acceptance、N42+、M1 Stable 与发布继续阻断

## 1. 触发与前置事实

N40 Route Map Engineering 已按当前代码重新取得 Goal `1/1`、Implementation `11/11`、Tests `3/3`、Acceptance `2/2`，最终文档头 `60b5aae` 的 Windows / Node 22 完整门也已绿色。真人参与者仍不可用：N21 为 `0/1 pending-participant`，N23 为 `0/2 pending-participants`。

产品负责人已被明确告知 `RA-N21-005.maximumDeliveryNode=N40`，N40 Product Acceptance、N41 Engineering 与以后节点均被阻断；随后在 2026-08-24 再次明确要求进入后续步骤，并继续要求真实预期—实际差异测试、修正、文档、逐步审计、需求对齐和推送。因此关闭 RA-005，建立只覆盖 N41 Engineering 的 `RA-N21-006`。这不是把自动化换算成真人产品验收。

## 2. 有界授权

`RA-N21-006` 只允许：

- N41 Sequence Engineering；
- 全部 P0 block 的同源可视化编辑、类型化 Inspector、搜索插入、复制/批量/折叠和跨视图定位；
- 所有写入通过稳定 ID Story Language / Project Service 事务，随后以正式 Compiler、Route、持久化复读证明语义；
- 1,000 次 Script/Sequence 连续互改稳定 ID 与语义不漂移的工程验收；
- 自动化、真实受管 IndexedDB、production browser、性能与 Windows CI 开发者实测。

它不允许：

- 登记 N21、N23、N30、N31、N32、N40 或 N41 Product Acceptance 通过；
- 进入 N42 Stage、N43、多端 Player、正式构建、M1 Stable 或发布；
- 把 E8g–E8j 的局部 Sequence 能力重新命名为完整 N41；
- 把 AI、开发者或自动化操作冒充真人证据；
- 合并 Draft PR 或宣布当前分支已进入 `main`。

## 3. 风险策略真实测试契约

| 检查 | 冻结预期 | 首次实际 | 差异处理 | 判定 |
|---|---|---|---|---|
| 唯一 active | RA-006 active，RA-001–005 closed | registry 审计返回 current N41、active RA-006、maximum N41；N21/N23 审计仍为 0/1、0/2 | 无差异 | PASS |
| N41 正例 | `currentDeliveryNode=N41`、上限 N41 时通过 | 专用策略文件 `1 file / 6 tests` 通过 | 无差异 | PASS |
| N42 越界反例 | 返回 `current delivery node exceeds the accepted maximum` | exact violation 命中 RA-006 | 无差异；上限未放宽 | PASS |
| 到期反例 | 2026-09-24 11:35:40 后 active 失败 | exact `active exception has expired` 命中 RA-006 | 无差异 | PASS |
| Product Gate 反例 | 删除 N41 Product Acceptance 阻断时失败 | exact missing-gate violation 命中 RA-006 | 无差异 | PASS |
| 旧例外反例 | RA-005 重新 active 时失败 | 同时命中“只有 RA-006 可 active”和“RA-006 要求 RA-005 closed” | 无差异 | PASS |

首次直接执行 `npx vitest run tools/risk-acceptance-policy.test.ts` 得到 `No test files found`，因为默认 Vitest 冻结为 `apps/**` 与 `packages/**`，不收集 `tools/**`。修正为使用仓库正式治理配置 `vitest.governance.config.ts` 后，目标文件 `1/1`、用例 `6/6` 通过；完整治理门为 `3 files / 20 tests`。没有修改测试发现规则或减少反例。

## 4. N41-E1 冻结起点

治理门闭合后，E1 先做当前 Sequence 能力与 N41 冻结规格的代码级差距审计，再关闭一个可独立验证的创作者结果。优先顺序为：

1. 建立正式 N41 Sequence 视图/模型边界，继续复用 Canonical Script，不建立第二份内容；
2. 选择一个尚未安全开放的 P0 结构编辑族，补稳定 ID 命令、类型化 Inspector、失败关闭和保存重开；
3. 同一用例必须经过 Sequence → Script → Compiler/Route → 再打开 Sequence，并记录预期、首次实际、差异和修正；
4. E1 不宣称全部 N41，不触碰 N42 Stage 或 Player。

## 5. 关闭条件

本地策略正反例、风险、需求、N21/N23、工作区、delivery baseline、PR traceability 与文档格式检查均已通过。精确推送和当前 head 的 Windows / Node 22 完整门仍是最后关闭条件；在其绿色前不启动 N41-E1 产品代码。
