# N31-E8 Runtime Source Map 结构化诊断审计

> 审计日期：2026-08-15
> 变更前基线：`818aa6c462396cc405dd0604dc74ca3729b3e083`
> 审计分支：`agent/n31-runtime-e8`
> 实现与需求对齐头：`9d4e9a50d45719dee51bf0787aac1e1300256834`
> 交付状态：Draft PR #43；本地完整门、真实浏览器 Worker 及远端 Windows / Node 22 CI 均通过
> 节点判定：N31 Engineering E8 候选；N31 Product Acceptance、N32、M1 Stable 与发布仍被 `RA-N21-003` 阻断

## 1. 需求与真实缺口

N30 Compiler 已产出 `RuntimeSourceMapV1`，但 E7 结束时正式 Runtime Diagnostic 只有 `sceneId` 与可选 `instructionId`，缺少指令序号、Source Map 输入验证和 Statement 级映射。因此运行失败仍不能安全、确定地回到创作者源码；直接交给未来 Editor/Debugger 会允许残缺映射、错属指令或伪造位置污染跳转结果。

E8 只关闭 Runtime 后端定位契约：结构化 Runtime Diagnostic 映射到 Compiler Statement ID/Index。它不实现 N32 任意入口预览，不实现 N60 Debugger、断点、单步、变量 UI 或源码跳转界面，也不把 N31 Product Acceptance 记为通过。

## 2. 冻结契约

正式诊断新增必填 `instructionIndex: number | null`，位置形成 `(sceneId, instructionIndex, instructionId)` 三元组。映射结果新增：

- `sourceMapStatus = instruction`：诊断显式指向指令，三元组必须与 IR 完全一致；
- `sourceMapStatus = cursor`：诊断没有显式指令，但合法 Runtime cursor 可回落到当前指令；
- `sourceMapStatus = unmapped`：Save 输入等全局错误或越界 cursor 不伪造源码位置；
- `statementId` 与 `statementIndex`：只从验证通过的 Compiler Source Map 读取。

`validateRuntimeSourceMapV1` 采用 fail-closed 规则，要求精确 schema/IR 版本、覆盖所有 IR 指令且仅一次、canonical ID、与扁平 IR 相同的顺序和 scene ownership，以及同一 scene 内严格递增的 statement index。残缺、重复、错属、乱序或额外字段均返回 `RUNTIME_SOURCE_MAP_INVALID`。

`mapRuntimeDiagnosticsV1` 同样拒绝未知诊断码、额外字段、非法 null 配对，以及与 IR 不一致的 scene/index/instruction 三元组，并返回 `RUNTIME_DIAGNOSTIC_INVALID`。映射层是 portable 纯 TypeScript，只依赖正式 Compiler 类型与 Runtime canonical 序列化，不依赖 Spike、DOM、Node、文件系统、墙钟或环境随机源。

## 3. 版本与兼容边界

包版本由 `0.7.0-n31` 升至 `0.8.0-n31`，因为公共 Diagnostic 合约新增必填字段和映射 API。序列化协议 `RUNTIME_VERSION` 保持 `0.6.0`：E8 没有改变 State、Save、History wire schema 或执行语义，既有 State/Save/History Hash 与正式 Corpus 摘要均保持不变，避免制造无意义的存档不兼容。

## 4. 测试与跨宿主证据

新增四类定向测试：

1. 将真实 Compiler Branching Source Map 与 Runtime 指令失败映射到精确 Statement ID；
2. 验证 cursor fallback 与全局诊断 `unmapped`；
3. 拒绝残缺、重复、错属、非 canonical 和乱序 Source Map；
4. 拒绝伪造 scene/instruction、错误 instruction index 与额外诊断字段。

Node/Web Worker 共用固定向量冻结为：

```text
sourceDiagnosticCode             = RUNTIME_VARIABLE_MISSING
sourceDiagnosticStatus           = instruction
sourceDiagnosticInstructionIndex = 0
sourceDiagnosticStatementId      = source_statement
sourceDiagnosticStatementIndex   = 3
```

本地 Runtime 门为 43/43。真实浏览器模块 Worker 显示 `PASS：正式 Runtime、Source Map 诊断与 10,000 种子 Runtime Corpus 均和 Node Golden 零差异`；Source Map 五个字段与 Node Golden 完全一致，Runtime Corpus 为 10,000 seeds、20,000 replays、40 chunks、0 failures，`outcomeDigest=e12b72f81c47339604540876d77eda0d0f5dc624462a20ec1dd35f8c9322a125`，浏览器内耗时约 `29604.7 ms`，应用日志无 error。

本地 `npm run check` 通过：Runtime 43 项、其余并行 97 文件/588 项、存储 1 项、重型 VM 5 项、12 workspace 构建、82 个 portable 文件/4 个 Node adapter、Script 10 项和 Asset 4 项性能门。Editor bundle 仍为 636.67 kB、gzip 183.52 kB，既有超过 500 kB 警告没有因 E8 扩大。

实现与需求对齐头 `9d4e9a50d45719dee51bf0787aac1e1300256834` 的 `product-baseline` run `31891932163`、job `95029389258` 通过 Windows / Node 22 完整门，用时 4 分 23 秒。

## 5. 需求状态与下一顺序

REQ-RUNTIME 与 REQ-QA 获得 Runtime → Statement 后端定位证据，但继续保持“实现中”；AC-05 仍为“未开始”，因为任意语句预览、变量检查和 Debugger UI 尚未实现。E8 没有 Editor/Player/三端设备或真人证据。M1 保持 `0/27`，N21 `0/1`、N23 `0/2` 不变。

下一节点仍在 N31：E9 只执行 N31 Engineering 出口审计，逐项核对 N31 Goal、Implementation、Tests 与 Acceptance，并明确仍应后移到产品节点的缺口。`RA-N21-003` 未关闭前不得进入 N32。
