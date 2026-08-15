# N31-E5 Runtime History / Back / Forward 审计

> 审计日期：2026-08-15
> 变更前基线：`f0f94aed57157c21ad2163c36e1466814ed8697c`
> 审计分支：`agent/n31-runtime-e5`
> 交付状态：实现、定向测试、真实 Worker 与本地完整门已完成；Draft PR 与远端 Windows / Node 22 CI 待本轮后续回填
> 节点判定：N31 Engineering E5 候选；N31 Product Acceptance、N32、M1 Stable 与发布仍被 `RA-N21-003` 阻断

## 1. 需求边界

E5 对齐 `REQ-RUNTIME`、USP-09、AC-07 与 AC-16 的正式 Runtime 内核部分：canonical checkpoint chain、Back/Forward、已存在 Forward 的显式处理、改变选择后的原子分支截断、被截断输入 tombstone，以及已提交 Barrier 的 Back 阻断和准确解释。实现位于 `@world-studio/runtime`，不导入 VM Spike、Editor Undo/Redo、Project WAL、DOM、文件系统、网络、墙钟或环境随机源。

本节点不实现 Auto/Skip 调度、Editor/Player 控件、媒体对象补偿执行、Save slot、Auto/Quick Save、Save migration、History Session 的持久化 envelope、三端宿主或人工验收。E5 只把正式 Runtime 的可逆逻辑状态链建立起来，不能据此宣称玩家“存档/回退体验”或 AC-07/AC-16 已通过。

## 2. 正式 History v1 协议

- `RuntimeHistorySessionV1` 固定 Runtime/IR/Project/Build/Execution 身份、cursor、`entries[]`、`checkpoints[]` 与 `inputTombstones[]`；`checkpoints.length` 必须严格等于 `entries.length + 1`；
- 每个 checkpoint 保存完整 `RuntimeStateV1`、域分离 State Hash 和由该 Hash 派生的 checkpoint ID；每个 entry 保存前后 checkpoint、规范输入、事件、Effect Intent、指令数和本步新增 Barrier，并具有独立域分离 entry ID；
- `runtimeHistorySessionHashV1()` 对完整 canonical Session 计算域分离 SHA-256；最大 10,000 entries，超限失败关闭；
- Back/Forward 直接恢复已验证 checkpoint 的完整逻辑 State，返回 `reconciliationRequired=true`，不重新执行 IR、不重发 Effect，也绝不重放 Barrier。宿主必须把舞台/音频等可重建对象协调到目标 State；真实补偿调度归 N50/N52；
- 当前 checkpoint 存在 recorded future 时，普通 Advance 或相同输入返回 `RUNTIME_HISTORY_FORWARD_REQUIRED`；只有提供改变后的输入才尝试 fork。尝试失败保持原 Session/Forward 不变，执行成功后才原子截断 future 并登记旧输入 tombstone；
- 同一 `inputId` 绑定不同 canonical payload 时返回 `RUNTIME_INPUT_ID_CONFLICT`；active entries 与 tombstones 共同参与冲突审计；
- Back 跨越 entry 新增的已提交 Barrier 时返回 `RUNTIME_BARRIER_BLOCKED`、descriptor 和原始 reason，Session/State 不变；awaited pending Effect 也必须先完成或取消，避免留下未协调宿主操作；
- schema 未知成员、链长/游标、State/entry/checkpoint Hash、身份、Barrier delta、输入 receipt、tombstone 或 canonical 编码任一异常均返回 `RUNTIME_HISTORY_INVALID`，不导航、不执行 IR，并对结构损坏数据保持不抛异常。

Runtime 升至 `0.5.0`，State/Save schema 仍为 v1。由于 Runtime Version 是 State/Save 身份的一部分，E4 的旧 State/Save 明确不兼容；迁移器尚未建立，不得静默猜测。E4 Save v1 仍只封装单个 State，不假装已经保存完整 History Session。

## 3. 固定向量与真实 Worker

`executeRuntimeConformanceV1()` 在 E1–E4 向量上追加正式 History 工作流：Choice → Left → Back → Forward → Back → Right fork，以及 Barrier request → approve → blocked Back。Node 与浏览器共用下列冻结结果：

| 向量 | Golden |
|---|---|
| Back State | `5475e655dbdfdd18c838f85151473a839e190f7bda0dab74243bf3ae9337fb7a` |
| Forward State | `58d4a8b6bbca607226c05127ea7514f98008a7e9317ac4ee3199cf7ed87cc99f` |
| Fork State | `ff93d34ff22204a6fa489ae7a31bb8d4a696c2e2a6ab81460717f1c0c7cea88c` |
| Branched Session | `5eb97952d5ea84edf7030fb069b4ba5885ef53f4c9c314868418ccecb4635b69` |
| Tombstone | `input-history-left` |
| Barrier Back | `RUNTIME_BARRIER_BLOCKED` |

真实浏览器模块 Worker 已得到 `data-runtime=passed`；包含既有 10,000-seed Spike corpus 的完整 Worker 也得到 `data-status=passed`，页面无 console error。Spike 数量仍不能冒充正式 Runtime 10k Corpus；本轮只证明正式 E5 固定向量在 Node/Web Worker 零差异。

## 4. 自动化与失败路径

Runtime 定向门现为 31 项，其中 E5 五项覆盖：

1. canonical checkpoint chain、Back/Forward 精确 State Hash 恢复和 Session Hash；
2. recorded future 必须显式 Forward、无效 fork 保持旧链、有效 fork 原子截断并形成 tombstone；
3. tombstone `inputId` 冲突拒绝且不修改 Session；
4. Barrier Back 阻断并返回准确 reason；
5. checkpoint/entry Hash 篡改和结构损坏拒绝且不抛异常。

本地完整 `npm run check` 已通过：98 个并行文件/619 项、存储 1 项、重型 VM 5 项、12 workspace 构建、79 个 portable 文件/4 个 Node adapter、Script 10 项和 Asset 4 项性能门。GitHub Draft PR 与远端 `product-baseline` 证据将在实现提交后按顺序回填；没有最终远端绿色头前，本文件不把 E5 记为交付完成。

## 5. 需求与下一顺序

REQ-RUNTIME、USP-09、AC-07 和 AC-16 只增加“实现中”的正式内核证据；玩家入口、三端宿主、存储介质、设备与真人记录仍缺。M1 保持 `0/27`，N21 `0/1`、N23 `0/2` 不变。

下一节点严格是 N31-E6：实现 Normal/Auto/Skip Read/Skip All/Instant 的确定调度、与 History/Effect/Barrier 的原子边界及固定向量；之后再完成正式 Runtime 10k Corpus、完整 Source Map 诊断和 N31 Engineering 出口审计。`RA-N21-003` 未关闭前不得进入 N32。
