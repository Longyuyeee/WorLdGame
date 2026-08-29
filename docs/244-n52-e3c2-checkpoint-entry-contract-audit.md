# N52-E3c2 Checkpoint 入口合同审计

> 日期：2026-08-29  
> 分支：`codex/n52-e3c2-checkpoint-entry`  
> 直接基线：N52-E3c1 最终绿色头 `7b5998c`  
> 授权：`RA-N21-011`，最大节点 N52  
> 判定：**N52-E3c2 入口合同关闭**；跨层实现等待明确授权扩展，N52 Product Acceptance 不变

## 1. 需求与实际代码复核

最初需求没有要求把任意场景、时间点或 Back/Forward 快照当作永久检查点。Gal 基础规格要求手动、自动、快速、检查点、云存档切换，并把“显式 `checkpoint`”列为默认 Story Step；CL-04 VM 合同与仍在仓库中的 Spike 也明确拥有 `checkpoint(stepId)` opcode。

正式化链路却遗漏了这项能力：`StoryStatement` 没有 checkpoint；Compiler 只输出严格 Runtime IR `1.0.0` 且 opcode union 无 checkpoint；Runtime 对非 `1.0.0` 失败关闭；Player Core 会把除 direction 外的事件当作可见 presentation；Save v2 的严格 kind 只有 manual/auto/quick。偏移发生在 Spike→正式 Story/Compiler/Runtime 的提升过程，不是产品路线变化。

## 2. 冻结的修复合同

| 层 | 合同 |
|---|---|
| Story Language | 新增显式非可见语句 `checkpoint @id(statementId)`；statement ID 同时作为 checkpoint step ID。语言 v0 保持，因为旧读取器可作为 Opaque 保留，但不得投影/编译为成功 |
| Compiler | 新增 `checkpoint` opcode 与 Source Map；Runtime IR 提升到 `1.1.0`，不得在 `1.0.0` 下静默扩展 |
| Runtime | 同时读取 `1.0.0` 与 `1.1.0`；只有 `1.1.0` 接受 checkpoint，并发出 `checkpoint-reached` 非表现事件 |
| Player Core | 消费 marker 后的已提交 Runtime Session，不把 marker 显示为对白/结局，不重放 Effect，然后继续到下一可见边界 |
| Save | 严格 schema 从 v2 提升 v3，kind 新增 checkpoint；合法 v1/v2 读取后内存归一化 v3、成功写入时 copy-on-write，future 继续失败关闭 |
| 策略 | 三槽 `checkpoint-1..3`，空槽优先，否则按 savedAt、slot ID 最旧优先；相同 Build + step 合并最新；失败保留旧槽且不阻断剧情 |

明确禁止用 Runtime History checkpoint、scene ID、指令数组下标或墙钟触发替代 build-authored marker。

## 3. 治理裁决

`RA-N21-011` 允许 N52 Player 控制 Engineering，并要求消费既有正式 N31 Save/History/Scheduler 合同；它没有授权修改 N20 Story Language、N30 Compiler、N31 Runtime IR 和严格 Save schema。直接编码会越过补偿控制，也会把 IR 兼容变化藏在 Player 小切片里。

因此本步只关闭入口合同与偏移审计。下一代码切片固定为 **N52-E3c3 checkpoint marker implementation after authority**；开始前须由产品负责人明确把 RA-011 扩展到“仅为 N52 checkpoint 所需的 N20/N30/N31 合同修改”，最大交付节点仍为 N52。未取得该授权前不得落地 opcode 或槽位。

## 4. 验收与仍阻断项

后续实现必须证明：无 checkpoint 的旧工程剧情结果不变；IR 1.0.0 与 Save v1/v2 可读；future 失败关闭；marker 不产生 presentation/Effect；三槽轮转、失败保留、Back/Forward/Load/rehydrate State Hash 一致；桌面与移动端冷 production browser 均无 console/overflow。

本入口没有改变产品代码或 UI，不生成浏览器证据，也不登记 checkpoint 功能完成。真实进程强杀、Windows/Android Host、云冲突、N52 Product Acceptance、N60+、M1 与发布继续阻断。

## 5. 审计与远端证据

机器合同 `config/n52-e3c2-checkpoint-entry.json` 与根级 `audit:n52-e3c2-checkpoint-entry` 核对最初需求来源、Spike checkpoint 证据、正式链路缺口、版本提升、三槽策略和授权停止线。首次完整门在 E3b 历史审计发现需求矩阵缺少精确令牌 `N52-E3b Auto / Quick Engineering 已关闭`；恢复令牌后 E3b/E3c1/E3c2 三门均通过，证明差异只在文档压缩，不在产品代码。

修正后的第二轮 `npm run check` 完整通过：普通回归 `153 files / 919 tests`，Runtime corpus `10,000 seeds / 20,000 replay` 且 digest 保持 `20e9a842...92ef2`，VM `5/5` 用时 `25.16s < 90s`，Compiler `29/29`、Runtime `60/60`、N50 `53/53`、N51 `104/104`、N52 `63/63`；全 workspace build 与 100 portable / 4 Node adapter 架构门通过，Route 编辑链 P95 `59.17ms < 500ms`，Asset dicing `1505.78ms < 5000ms`。同头 Windows / Node 22 CI 结果在推送后回填；只有同头绿色时才把合同状态从 candidate 改为 complete。
