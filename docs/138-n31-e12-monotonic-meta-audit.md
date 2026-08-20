# N31-E12 Monotonic Meta Boundary 开发与审计

> 审计日期：2026-08-20
> 起始基线：`7f550b9`（N31-E11 文档证据头）
> 开发分支：`agent/n31-runtime-e12-monotonic-meta`
> 远端状态：本文件记录推送前的本地真实证据；Windows / Node 22 完整门必须由独立 Draft PR 取得后回写，未取得前不登记 E12 最终关闭。
> 节点边界：只修复 VM-13 永久 Meta Progress 回退；不宣告 N31 Engineering、N31 Product Acceptance、M1 Stable 或平台发布通过。

## 1. 目标冻结与修复前差异

Meta Progress 指已读文本、已解锁 Gallery Asset 与已到达 Ending。它属于玩家永久进度，不属于可随剧情位置回滚的 Story State。

| 场景 | 冻结预期 | 修复前实际 | E12 修正 |
|---|---|---|---|
| Back / Forward | 剧情 checkpoint 可移动，永久进度只增不减 | Back 直接恢复旧 checkpoint，已读/CG/结局可能消失 | 移动后把当前 Meta 与目标 checkpoint 做 canonical union，并确定性重链 History |
| 加载旧 State Save | 恢复旧剧情位置，同时保留设备上较新的永久进度 | 旧 Save 内的 Meta 覆盖当前进度 | Load 可接收 current Meta；先验证原存档，再原子 union |
| 加载旧 Session Save | 恢复完整旧 History，同时保留设备上较新的永久进度 | 旧 Session 中活动 checkpoint 的 Meta 覆盖当前进度 | 验证原 History/Hash 后在活动 cursor 合并，并重算 checkpoint/entry chain |
| 多来源合并 | 顺序和重复操作不影响结果 | 没有独立正式合并契约 | 固化交换律、结合律、幂等律及域隔离 Hash |
| 损坏/串档 | foreign project/scope、乱序/重复/超限集合 fail closed | 没有独立 Meta validator | 精确字段、canonical ID、排序唯一集合与上限验证；失败不返回部分 State/Session |

为了保持既有 wire payload 可读，`metaProgress` 字段仍位于 `RuntimeStateV1`；E12 在逻辑所有权边界上将其视为永久域。剧情 Outcome 继续排除 Meta，State/History Hash 则继续完整覆盖实际载荷。

## 2. 实现结果

- 新增 `validateRuntimeMetaProgressV1`、`mergeRuntimeMetaProgressV1` 与 `runtimeMetaProgressHashV1`；
- 新增 `WORLd-RUNTIME-META-PROGRESS\0v1\0` 哈希域，避免与 State/Save/History Hash 混用；
- 合并只允许同 `projectId` 和 `progressScopeId`，三个集合均为排序、唯一、只增 union；
- Back/Forward 合并 Meta 后确定性重算活动 checkpoint 及 entry chain，reconciliation plan 指向修正后的 checkpoint；
- State Save 与 Session Save Load 新增可选 `currentMetaProgress`，原 artifact/hash 先按保存时字节验证，合并不会伪造或改写原 artifactHash；
- Runtime Conformance 与真实浏览器 Worker Golden 增加 Meta 当前值、Back 后值、旧 Save Load 后值三项观测；
- Runtime package 升为 `0.11.0-n31`，VM Conformance 精确内部依赖与 lockfile 同步；既有 Runtime/Save/History schema 版本不变。

## 3. 真实测试：预期与实际

| 真实测试 | 预期 | 实际 | 判定 |
|---|---|---|---|
| E12 定向用例 | Back/Forward、旧 State/Session Save、代数律/固定 Hash、foreign/malformed 共 4 项通过 | `4 passed / 52 skipped` | 通过 |
| Runtime 非重型完整回归 | 除冻结 10k 双重重放外无回归 | `55 passed / 1 skipped` | 通过 |
| 全仓 TypeScript | workspace 引用与新增公共类型零错误 | `tsc -b --pretty false` 退出码 0 | 通过 |
| 全仓非 Runtime 并行回归 | 97 个文件、588 项无语义回归 | `97 passed / 588 passed` | 通过 |
| Editor 自动保存隔离门 | 5 秒内完成一致恢复 | 四组重负载并发时 26 秒未完成而失败；负载释放后同一测试 4.36 秒、`1/1` 通过 | 功能通过；并发资源争用差异保留 |
| 既有 Spike 10,000-seed 门 | 0 failed seed 且 90 秒内完成 | 四组并发时 117.741 秒超时；隔离重跑实际 82.00 秒、`5/5` 通过 | 隔离预算通过；并发差异保留 |
| VM Conformance 生产构建 | TypeScript 与真实 Worker bundle 生成 | 构建通过；Worker bundle `168.93 kB`，入口 gzip `4.97 kB` | 通过 |
| 浏览器 Runtime 快速门 | 正式 Runtime 与 Node Golden 零差异 | 真实生产预览 `data-runtime=passed` | 通过 |
| 浏览器完整语料门 | 正式 Runtime、Source Map 与 10,000 seeds 全部零差异 | 真实模块 Worker 最终 `data-status=passed`，页面显示 PASS | 通过 |
| Node 10,000-seed 双重重放 | 20,000 次执行、0 failed seed，并在冻结 90 秒内完成 | 本机 Node 25 实际 163.528 秒、0 failed seed、结果 Digest `20e9a842…92ef2`；超过 90 秒 | 语义通过，性能门失败；不得放宽阈值 |

测试先以旧 Golden 运行并得到预期失败；仅在核对“Meta 保留导致 checkpoint/History/reconciliation Hash 改变、剧情执行结果未被误改”后才冻结新向量。新独立 Meta 固定向量为 `3781e0d4…fe8b3`。旧 Save Load 的返回 State/Session 使用 union 后进度，但返回的 artifactHash 与原保存产物严格相同。

本机 Node 为不受支持的 `v25.2.1`，仓库权威环境为 Windows / Node `22.12.0`。浏览器完整门本轮实际通过，既有 Spike 在隔离时也于 82 秒通过；正式 Runtime 10,000-seed 双重重放仍为 163.528 秒并超过冻结 90 秒，因此必须交由远端支持版本复验。不能以浏览器或旧 Spike 通过替代正式 Runtime 的 Node 预算门。

## 4. 需求对齐与出口审计

- VM-13：实现与本地真实 Node/浏览器证据已对齐；最终关闭仍等待 Windows / Node 22 完整门；
- USP-09 / REQ-RUNTIME / AC-07 / AC-16：Back/Forward 和旧 State/Session Save 不再回退 read/CG/ending，但 Player 控件、真实媒体宿主、三端设备与存档槽仍缺；
- AC-18：Runtime 永久解锁边界已补齐，Catalog 覆盖配置、Replay/Music 规则和 Player UI 仍归 N62；
- VM-14：仍未对齐；10,000 seeds 不等于单次 10,000-step 有界执行；
- N31 Engineering：仍未通过；E13 与 E14 未完成；
- N21/N23 真人门继续为 `0/1`、`0/2`；自动化不得替代真人产品验收；
- N32 继续被 `RA-N21-003` 阻断。

## 5. 下一步

1. 推送 E12 独立分支并建立独立 Draft PR；
2. 以 Windows / Node 22 `product-baseline` 完整门复验冻结 90 秒预算；
3. 远端绿色后回写 PR、commit、run、job 与耗时，并将 VM-13 登记为关闭；
4. 再进入 E13 Bounded 10k-step；E14 复审前不得宣告 N31 Engineering 通过。
