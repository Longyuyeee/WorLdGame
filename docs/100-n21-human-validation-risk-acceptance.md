# N21 真人验收临时风险接受

> 例外 ID：`RA-N21-001`
> 批准日期：2026-08-14
> 批准人：Product Owner（用户明确批准）
> Owner：`editor-experience`
> 状态：Active
> 到期：2026-09-14 00:00 +08:00，或进入 N23 验收前，以先到者为准
> 结构化登记：`config/risk-acceptances.json`

## 1. 决议

当前无法获得未参与实现且不了解脚本语法的真人测试者。Product Owner 明确批准一个不超过 N22 的临时例外：在其他准入条件独立满足后，真人证据缺失不再单独阻止 N22 工程实现；N21 继续保持“产品验收中”，不得标记为通过。

本例外不是测试替代品。自动化、代理操作、开发者演示或 AI 操作均不得登记为 N21 真人证据。

## 2. 失败的 Requirement / Control

- N21 Acceptance：非程序用户在 20 分钟内完成完整 Writer/Sequence 任务；
- `REQ-SEQ`：真实目标用户完成 P0 卡片与 Inspector 创作任务；
- `REQ-UX`、`AC-10`：真实用户对键盘/触屏等价路径的理解成本和求助需求。

## 3. 影响与风险

- 自动化只能证明操作路径存在，不能证明目标创作者能发现、理解并完成路径；
- 插入菜单、稳定 ID 选择器、条件和 Choice Inspector 可能存在未暴露的认知负担；
- 当前无法测得真实完成时间、求助次数、误操作和放弃点；
- 风险限于产品可用性证据，不允许扩展为数据安全、运行时正确性或发布质量豁免。

## 4. 临时补偿控制

1. 保留 N21 全 P0 创作、错误隔离、原子批处理、保存关闭重开、键盘和触屏等价自动化门；
2. N21 状态保持“验收中”，M1 `0/27` 完整通过结论不变；
3. 例外只移除 N22 的真人前置阻断，不替代 Draft PR 集成；只允许 N22 工程实现，不允许借此通过 N21 或扩大到 N23 验收；
4. `N21 Product Acceptance`、`N23 Acceptance`、`M1 Stable` 和 `Public Release` 持续为阻断门；
5. 根级 `npm run check` 执行 `audit:risk-acceptances`，在时间过期、交付节点越过 N22、例外未进入追踪矩阵或发布阻断被删除时失败；
6. N22 必须继续使用真实导入媒体和 Golden Project，不得用 CSS 假素材或固定样例掩盖产品缺口。

## 5. 关闭方法

获得合格参与者后，按冻结任务执行：新建工程 → 创建对白 → 创建两选项 → 设置变量 → 条件进入两个结局 → 加入背景/BGM → 保存 → 关闭 → 重开。

证据必须记录：

- 开始/结束时间和输入设备；
- 求助次数、阻塞点、误操作与完成结果；
- 最终工程快照；
- 重开后的文本、稳定 ID、排序、选择和 Inspector 数据核对；
- 发现问题的修复提交与复验结果。

证据完成后将结构化例外改为 `closed`，更新 N21 审计和 M1 追踪矩阵；没有证据不得仅因日期到期自动关闭。

2026-08-14，补充冻结的 [`N21-HV-01` 真人产品验收执行包](114-n21-human-validation-execution-kit.md)、机器协议和 `pending-participant` 权威记录。`npm run audit:n21-human-validation` 只验证“待执行状态真实、关闭规则完整”，不把待执行状态解释为真人证据。真人运行完成前，本例外继续 active。

## 6. 自动审计

```powershell
npm.cmd run audit:risk-acceptances
npm.cmd run audit:risk-acceptance-policy
```

该审计只证明例外边界仍被机器执行，不证明 N21 真人产品门已经完成。

N22 的另一项独立前置是建立 [M1 N21 指定集成基线](101-m1-n21-integration-baseline.md)。本例外不替代该基线的整合 PR、远端 CI 或祖先链审计。

## 7. 本地验证记录

- 风险登记审计：PASS；
- 风险策略：5/5 PASS，覆盖正常、时间过期、节点越界、Stable 阻断删除和非法到期顺序；
- typecheck：PASS；
- 第一次全仓门：常规测试 496/497，既有 autosave 恢复测试在 4-worker 并发下超时；同文件单 worker 1/1 PASS；
- 第二次全仓门：常规测试 497/497 PASS；VM 重型门 3/5，VM-14 10k 为 7.928 秒（门 5 秒），10,000-seed corpus 为 106.368 秒（门 90 秒）；
- 10 个 workspace build、架构审计与 Script Performance 10/10：PASS；
- Asset Performance：3/4；Dicing 隔离复跑总耗时 5.350 秒（门 5 秒）。同时修正性能报告在断言失败前仍硬编码输出 `PASS` 的审计缺陷，现在按测量值如实输出 `FAIL`；算法和预算均未修改；
- 未修改上述既有算法、门槛或测试断言，仅修正报告真实性；完整 `npm run check` 保持 RED，不能表述为全仓通过。
