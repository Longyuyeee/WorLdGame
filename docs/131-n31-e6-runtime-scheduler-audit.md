# N31-E6 Runtime Scheduler 审计

> 审计日期：2026-08-15
> 变更前基线：`1aae507e52009701a799fafcfb9d449ed82cb61f`
> 审计分支：`agent/n31-runtime-e6`
> 交付状态：实现头 `132db0d303d8c6c86646edbeefd05dc7d98fa4b4`；Draft PR #41；本地完整门、真实 Worker 及远端 Windows / Node 22 CI 均通过
> 节点判定：N31 Engineering E6 候选；N31 Product Acceptance、N32、M1 Stable 与发布仍被 `RA-N21-003` 阻断

## 1. 需求边界

E6 对齐 `REQ-RUNTIME`、USP-09、AC-15 及 CL-04 VM-09/10 的正式 Runtime 内核部分：Normal、Auto、Skip Read、Skip All、Hold/Toggle 激活、5/10/20/40/Instant 预算、外部 Stop Point、资源不可用预检，以及 Choice、awaited Effect、Barrier、诊断和终局停止。Scheduler 只调用同一个 `runRuntime()`，不解释 Opcode、不导入 VM Spike，也不把墙钟、帧号、实际音频位置或平台对象写入 State。

本节点不实现 Player 按钮、倍速 UI、真实浏览器/Windows/Android 计时、语言分词、标点权重、语音元数据、媒体静音/压缩策略、资源下载器或后台恢复。E6 只完成确定调度协议，不能据此宣称 AC-15、玩家体验或三端产品验收通过。

## 2. Scheduler Session 与原子 History

- `RuntimeSchedulerSessionV1` 固定 Runtime Version、已提交 `RuntimeHistorySessionV1`、base checkpoint、working State 和累计内部指令数；schema/身份/History/State/counter 任一损坏均返回 `RUNTIME_SCHEDULER_INVALID`；
- Scheduler 与 History 是不同权威对象。预算在 label/set/condition/jump/call/return 等内部指令中耗尽时，只推进 transient working State，History entry/checkpoint 数保持不变；
- 到达对白、旁白、方向、Wait、Choice、Effect、Barrier 或 Ending 可见边界时，把 base checkpoint 到最终 State 作为一个原子 History entry 提交，`executedInstructions` 包含跨批累计值；
- Normal/Auto 在一个可见边界停止；Skip Read 可跨已读文本并在完成首个未读文本后停止；Skip All 可跨普通文本、Wait 和 detached Effect，但不能跨 Choice、awaited Effect、Barrier、Stop Point、资源不可用、诊断或终局；
- `hold` 与 `toggle` 只表示宿主激活方式，不改变 Runtime 转换；5/10/20/40 与 Instant 只给出每批指令预算，Instant 上限为 1–4096；
- 资源 descriptor 不可用时，该可见 Effect/Barrier 步不提交、不向宿主暴露 Effect，之前已提交的边界和当前安全 transient State 保留；
- Auto 建议为 `max(base + perUnit × readableUnits, voiceDuration + voiceTail)` 的安全整数毫秒，返回值不进入 State/History，因此与 Normal 到同一边界的 State Hash 必须完全一致；
- 外部 Stop Point 以排序稳定的 instruction ID 集合输入，补足 Runtime IR v1 尚无专用 stop-point 字段的现实边界；正式 Source Map/调试配置接线仍属于后续切片。

Runtime 升至 `0.6.0`，State/Save/History schema 仍为 v1。旧 Runtime State/Save/History 明确不兼容；Save migration 尚未建立，不得静默猜测。

## 3. 固定向量

`executeRuntimeConformanceV1()` 在 E1–E5 向量上追加 Scheduler 工作流，冻结：

| 向量 | Golden |
|---|---|
| Normal/Instant Final State | `4817233c4c9113e2d35b1aae0d33600d1210d44e6accd1bccc2abc29d308f0e4` |
| Normal History | `93bd7599a52295678809ba508806d921e64d263ceb2013079d7f1e234f3d7407` |
| Instant History | `93bd7599a52295678809ba508806d921e64d263ceb2013079d7f1e234f3d7407` |
| Auto Delay | `90 ms` |
| Instant first yield | `1` accumulated instruction，`0` History entry |
| Barrier stop | `barrier` |

Normal 与 Instant 的最终 State 和完整 History Hash 均零差异，证明预算让步没有漏指令、重排边界或制造额外 checkpoint。真实模块 Worker 已得到 `data-runtime=passed`，包含既有 10,000-seed Spike corpus 的完整 Worker 得到 `data-status=passed`，页面显示 Scheduler Golden 与 Node 零差异且应用 console 无错误；既有 Spike 数量仍不能冒充正式 Runtime 10k Corpus。

## 4. 自动化与失败路径

Runtime 定向门现为 37 项，其中 E6 六项覆盖：

1. Normal、5/10/20/40、Instant 最终 State/History 边界一致；
2. Instant 内部指令让步，跨批累计后只提交一个可见 History step；
3. Skip Read 跨已读并在首个未读边界停止，与 Normal 同边界 State Hash 一致；
4. Auto 延迟不进入 State，Normal/Auto 同边界 Hash 一致；
5. 资源不可用回滚该 Effect，并分别停止 Stop Point、Choice、awaited Effect 与 Barrier；
6. 非 canonical policy、负 counter 与损坏 Scheduler Session 失败关闭且不修改 History。

本地完整 `npm run check` 已通过：98 个并行文件/625 项、存储 1 项、重型 VM 5 项、12 workspace 构建、80 个 portable 文件/4 个 Node adapter、Script 10 项和 Asset 4 项性能门。实现头 `132db0d303d8c6c86646edbeefd05dc7d98fa4b4` 的远端 `product-baseline` run `31889416350`、job `95023356519` 已通过 Windows / Node 22 完整门，用时 3 分 46 秒。

## 5. 需求与下一顺序

REQ-RUNTIME、USP-09 与 AC-15 只增加“实现中”的正式调度内核证据；AC-15 仍缺 Player、真实媒体/时钟、三端设备与真人记录。M1 保持 `0/27`，N21 `0/1`、N23 `0/2` 不变。

下一节点继续留在 N31：建立正式 Runtime 10k generated corpus、Source Map 结构化诊断与 N31 Engineering 出口审计。`RA-N21-003` 未关闭前不得进入 N32。
