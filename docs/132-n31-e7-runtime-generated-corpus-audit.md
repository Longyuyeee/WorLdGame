# N31-E7 正式 Runtime Generated Corpus 审计

> 审计日期：2026-08-15
> 变更前基线：`02cb25adfa4874b35557b729c2ab401ce0f58a59`
> 审计分支：`agent/n31-runtime-e7`
> 交付状态：实现头 `78ded09d969bc68ca3aab56f8bbffa4e1e57a442`；需求对齐头 `dcdcd74cb293aaecffc2e771845c51115216e52e`；Draft PR #42；本地完整门、真实 Worker 及远端 Windows / Node 22 CI 均通过
> 节点判定：N31 Engineering E7 候选；N31 Product Acceptance、N32、M1 Stable 与发布仍被 `RA-N21-003` 阻断

## 1. 需求与范围

E6 前已有 10,000-seed corpus 属于 `narrative-vm-spike`，不能证明正式 `@world-studio/runtime`。E7 只关闭“正式 Runtime 10k generated corpus”缺口，不同时宣告 Source Map 诊断或 N31 Engineering 出口完成。

本轮新增 `corpus.generated.runtime.v1`：固定 10,000 seeds、每个 seed 重放两次、250 seeds/分块、共 40 块。语料执行器位于正式 Runtime 包内，不依赖 Spike、Editor、DOM、Node API、墙钟或环境随机源。包版本升至 `0.7.0-n31`；序列化协议 `RUNTIME_VERSION` 保持 `0.6.0`，因为本轮没有改变 State/Save/History wire schema 或执行语义，不制造无意义的存档不兼容。

## 2. 七类场景与性质

| 场景 | seeds | 验证性质 |
|---|---:|---|
| control-flow | 1,429 | Set、Condition、Jump、Call/Return、Wait 与 Ending 确定终止 |
| random | 1,429 | 固定 PRNG seed 的两次抽样与最终 State Hash 可重放 |
| effect-cancellation | 1,429 | awaited Effect 签发、token 校验、取消和终止 |
| save-load | 1,429 | canonical Save Artifact、Load State Hash 和恢复后终止 |
| choice-history | 1,428 | Choice input、checkpoint、Back/Forward 与 History Hash |
| scheduler-equivalence | 1,428 | Normal 与不同 Instant budget 的最终 State/History Hash 相同 |
| diagnostic-rollback | 1,428 | 缺失变量诊断失败关闭且 State 引用与 Hash 不变 |

每个 seed 的两次执行必须得到相同 outcome hash；任何异常、重放差异或性质失败都会生成 `FAILED` 与可追溯的 seed/scenario/message，Golden 要求失败列表为空。

## 3. 分块与摘要防伪

聚合器拒绝空集合、超 250 的分块、非连续/未覆盖 0–9,999 的范围、错误 schema/corpus ID、伪造场景计数、非法 outcome hash、重复或越界失败 seed，以及 `FAILED` 与失败记录不一致。完整摘要冻结为：

```text
seedCount       = 10000
replayExecutions= 20000
chunkCount      = 40
failedSeeds     = []
outcomeDigest   = e12b72f81c47339604540876d77eda0d0f5dc624462a20ec1dd35f8c9322a125
```

这证明当前七类生成场景的确定性和失败可定位性，不代表所有未来 Opcode、宿主媒体行为或产品 E2E 已被穷尽。

## 4. Node、Worker 与完整门

Runtime 定向门由 37 增至 39 项。完整 Corpus 在本机 Node 多次运行约 35–39 秒，低于测试冻结的 90 秒上限。真实模块 Web Worker 得到：

- `data-runtime=passed`；
- `data-status=passed`；
- `runtimeCorpusElapsedMilliseconds ≈ 37182.4`；
- 10,000 seeds、20,000 executions、0 failures 与 Node 同一 digest；
- 应用日志只有 Vite 连接 debug，无 error。

本地 `npm run check` 通过：Runtime 39 项、其余并行 97 文件/588 项、存储 1 项、重型 VM 5 项、12 workspace 构建、81 个 portable 文件/4 个 Node adapter、Script 10 项和 Asset 4 项性能门。Runtime 测试从并行集合显式排除，只由 `audit:n31-runtime` 串行运行一次，避免昂贵 Corpus 在同一完整门重复执行。

实现头首次远端 run `31890539425` 在 `audit:pr-traceability` 正确失败：产品代码已变化但同一 PR 尚未更新需求矩阵。补齐需求对齐提交后，`dcdcd74cb293aaecffc2e771845c51115216e52e` 的 `product-baseline` run `31890646223`、job `95026280246` 通过 Windows / Node 22 完整门，用时 5 分 25 秒。该失败与修复保留为流程证据，不被抹去。

## 5. 需求状态与下一顺序

REQ-RUNTIME 增加正式 10k Corpus 证据，但仍保持“实现中”。E7 不改变 AC-07/15/16 的产品状态，也没有 Editor/Player/三端设备或真人证据。M1 保持 `0/27`，N21 `0/1`、N23 `0/2` 不变。

下一节点仍在 N31：E8 将 Runtime Diagnostic 结构化映射到 Compiler Source Map 的 Statement ID；随后 E9 才执行 N31 Engineering 出口审计。`RA-N21-003` 未关闭前不得进入 N32。
