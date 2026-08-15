# N31-E2 Runtime 确定状态基础审计

> 审计日期：2026-08-15
> 变更前基线：`4c3712749773e7dd265edffbb327cdf9c57ad44b`
> 审计分支：`agent/n31-runtime-e2`
> 交付状态：本地完整门通过；Draft PR 与远端 CI 待本分支推送后回填
> 节点判定：N31 Engineering E2 候选；N31 Product Acceptance、N32、M1 Stable 与发布继续被 `RA-N21-003` 阻断

## 1. 需求与边界

E2 对齐 N31 的“版本化 State、PRNG、Scene State、Meta Progress”和“Node/Web Worker State Hash 零差异”。输入继续只接受 N30 Runtime IR v1；正式包不导入 VM Spike、Editor、DOM、文件系统、墙钟或环境随机源。Compiler 尚无随机 opcode，因此 E2 只提供绑定 `expectedStateRevision` 的显式抽样 API，不私自扩展 IR。

本节点不实现 Effect/Barrier、Save/Load、History、Auto/Skip、Source Map UI、Editor Preview 接入或 Player。这些缺口分别留给后续 N31 切片与被阻断的 N32；E2 通过不等于 Runtime 或游戏引擎完成。

## 2. 已实现状态语义

- Runtime 升至 `0.2.0`，State schema 保持 v1，但 Runtime identity 会拒绝 E1 旧状态；
- `canonicalRuntimeStringify` 强制 Unicode NFC、合法代理对、Unicode code-point key 顺序、plain record、无 `undefined`、safe integer 和 `-0 → 0`；
- `runtimeStateHashV1` 使用域分离 `WORLd-RUNTIME-STATE\0v1\0` 与纯 TypeScript SHA-256，不依赖宿主 crypto；
- PRNG 固定为 `xorshift32-v1`，保存非零 uint32 state 与 draw count；抽样拒绝陈旧 revision 和超过 2^32 的区间；
- Background/Character/Audio 指令折叠为 Scene/Audio 逻辑状态，Dialogue/Narration、Gallery Asset 与 Ending 折叠为排序、去重、单调 Meta Progress；
- 损坏的 PRNG、Scene、Audio、Meta、浮点或非规范 State 在执行前失败关闭且不修改输入引用。

Runtime 数值在 E2 收紧为 safe integer，以确保所有可执行变量和 Hash 表示一致。小数计算若未来成为产品需求，必须先冻结跨宿主数值规范和迁移版本，不能隐式依赖 JavaScript 浮点序列化。

## 3. Node / Web Worker 固定向量

`executeRuntimeE2ConformanceV1()` 冻结同一初始 State、一次 PRNG 抽样和结局 State：

| 向量 | Golden |
|---|---|
| Initial State | `9b16cbbcf8c3567c9d764f6d6852a5f7856e1aa53cd4d4d2a3d2efa1ded12360` |
| Random draw | `13`；PRNG state `1085196063` |
| Random State | `a9718fe0a1adaf8e907fb568b4e20e5464aa6deb98024d76fc57912bc4eab84c` |
| Ending State | `8b0d261ca7074c9d95f9ddf5f54a634e45e3dc3811aa03e8a3cc02b185f40b28` |

Node 定向测试直接断言完整结果。现有 `apps/vm-conformance` 增加独立快速请求，在真实 `new Worker(..., { type: "module" })` 中调用同一正式函数并与 Node Golden 比较；本地浏览器实测得到 `data-runtime-e2=passed`。旧 Spike 10k 套件仍保留为并行的独立请求，正式 Runtime 的 10k Corpus 仍属于后续 N31，不以 Spike 数量冒充正式覆盖。

## 4. 自动化证据与诚实缺口

E2 定向门共 15 项：E1 八项回归，加上规范 Hash、Unicode/数值拒绝、PRNG stale-safe 固定向量、Scene/Audio 折叠、Meta 单调集合、五类损坏 State 和 Node Conformance Golden。完整 `npm run check` 已通过：98 个并行测试文件/603 项、1 项串行存储、5 项重型 VM、12 workspace 构建、76 个 portable 文件/4 个 Node adapter，以及 Script/Asset 性能门；远端 Windows / Node 22 CI 尚待交付步骤回填。

REQ-RUNTIME 保持“实现中”。AC-07 仍缺 Save/History 与三端 Player，AC-15/16 仍缺调度和历史，AC-18 只新增 Gallery/Ending Meta 内核而无玩家 UI。因此 M1 仍为 `0/27`，N21 `0/1` 与 N23 `0/2` 不变。

## 5. 下一顺序

在 N31 工程上限内，E3 应实现 Effect Intent、可重放/不可重放 Barrier、completion/cancel 输入及确定 receipt；之后才进入 Save/History、Auto/Skip 和完整 Conformance。任何时候均不得借 E2 进入 N32，真人资源可用时仍优先执行 N21、再执行 N23 验收。
