# N31-E4 Runtime Save/Load 审计

> 审计日期：2026-08-15
> 变更前基线：`72e93f39c95850457f2d2b9b2d390f0d24216da0`
> 审计分支：`agent/n31-runtime-e4`
> 交付状态：实现头 `205b711e8b80730e72767f11f4cc1bf5d3b1513d`；首轮交付头 `6eb741b8f0ab90e4ff6c7387cfd9a86799b1e403`；Draft PR #39；本地完整门、真实 Worker 向量及远端 CI 均通过
> 节点判定：N31 Engineering E4 候选；N31 Product Acceptance、N32、M1 Stable 与发布仍被 `RA-N21-003` 阻断

## 1. 需求边界

E4 对齐 N31 的 canonical Runtime Save、损坏/未来 Save 拒绝、Build/State 身份校验和 pending Effect rehydrate。Save 是 Runtime State 的可移植确定性封装，不包含文件句柄、网络连接、媒体解码器、截图、槽位标题或墙钟时间；这些宿主/玩家元数据归 N50/N52。

本节点不实现 History/Checkpoint 栈、Back/Forward、分支截断、Barrier Back 阻断、Auto/Skip、Save migration、自动/快速保存槽或 Editor/Player 接入。E4 只完成 N31 Save 内核，不能把“可序列化 State”误报为玩家存读档功能或 AC-07 已通过。

## 2. 正式 Save v1 协议

- `world.runtime-save` envelope 固定 schema、Runtime、IR、Project、Build、State Revision、State Hash 与完整 State；
- `canonicalRuntimeStringify()` 是唯一序列化形式，拒绝尾随空白、重复/乱序成员、非 NFC 字符串、非安全整数和未知 envelope 字段；
- Save 最大 16 MiB，字符长度和 UTF-8 字节长度均失败关闭；
- Load 先验证格式和版本身份，再验证调用方期望 Build，随后验证 State 结构、envelope/State revision 与 Build 一致，最后验证域分离 State Hash；
- 未来/旧 schema、Runtime、IR 或其他 Project 返回 `RUNTIME_SAVE_INCOMPATIBLE`，Build 漂移返回 `RUNTIME_SAVE_BUILD_MISMATCH`，内容篡改返回 `RUNTIME_SAVE_HASH_MISMATCH`，非 canonical 或结构损坏返回 `RUNTIME_SAVE_INVALID`；
- Load 不执行 Runtime 指令、不发 Effect。pending Choice、Effect、Barrier 或 terminal 只形成类型化 rehydration 结果；pending Effect 保留原 `effectId`、`replayKey`、revision 和 logical sequence，宿主必须自行重连或按幂等协议完成，禁止读档时自动重放外部副作用。

State Hash 和 Save Artifact Hash 用于确定性与偶发损坏检测，不是 MAC、数字签名或不可信作者内容的真实性证明；发布包签名与恶意 Save 信任策略仍归 N80–N83/N110。

Runtime 升至 `0.4.0`，Save schema 为 v1，State schema 仍为 v1。旧 Runtime State/Save 明确不兼容；迁移器尚未建立，不能静默猜测旧数据。

## 3. 固定向量与宿主一致性

`executeRuntimeConformanceV1()` 在 E1–E3 向量上追加：

| 向量 | Golden |
|---|---|
| Initial State | `f8083d9d5464cfcd27cff37832c9fa83b1470c16577e17835f7eeb6cb2376fd3` |
| Awaited Effect State | `bceafdd28b3058ab515b3267c71ee8faf83b9a3c587483d15083861b21215a0d` |
| Save Artifact | `de61426116b0cf29c17d8141597cd5aa21e03a8f31eafc70ae9da92036061576` |
| Rehydrated Effect | `effect.d79a3a9f688842936460611f2fd9a3505574511865833e165d05ca0e7337d577` |
| Rehydrated State | `bceafdd28b3058ab515b3267c71ee8faf83b9a3c587483d15083861b21215a0d` |

Node 定向测试冻结完整对象；Windows Chrome 151 的真实模块 Worker 得到 `data-runtime=passed`，证明 canonical JSON、UTF-8、SHA-256、Save artifact 和 rehydrated State 在 Node/浏览器零差异。该证据不是 Web/Windows/Android 三端 Player 验收。

## 4. 自动化与需求判定

Runtime 定向门 26 项通过，其中 E4 五项覆盖 deterministic round-trip、pending Effect 恢复后完成、State 篡改、未来版本/Build 漂移、非 canonical 与结构损坏拒绝。完整 `npm run check` 通过：98 个并行文件/614 项、存储 1 项、重型 VM 5 项、12 workspace 构建、78 个 portable 文件/4 个 Node adapter，以及 Script 10 项和 Asset 4 项性能门。首轮交付头 `6eb741b8f0ab90e4ff6c7387cfd9a86799b1e403` 的远端 `product-baseline` run `31887290302` 已通过 Windows / Node 22 完整门，job `95018355252` 用时 3 分 7 秒。

REQ-RUNTIME 和 AC-07 提升为更强的“实现中”证据，但 AC-07 仍缺 History/Back、三端 Player 与设备证据；M1 仍为 `0/27`，N21 `0/1`、N23 `0/2` 不变。

## 5. 下一顺序

E5 在 N31 内实现 canonical History checkpoint、Back/Forward、分支改变截断 Forward，以及 Barrier 后 Back 阻断和解释；E6 再实现 Normal/Auto/Skip Read/Skip All/Instant 调度。未关闭真人门和例外前不得进入 N32。
