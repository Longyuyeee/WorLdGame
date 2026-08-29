# N52-E3c3 Checkpoint 跨层授权修订

> 日期：2026-08-29  
> 分支：`codex/n52-e3c3-checkpoint-authority`  
> 直接基线：N52-E3c2 最终绿色头 `0f0f16b`  
> 判定：**E3c3 跨层授权修订关闭**（候选，待同头 CI 回填）；最大节点仍为 N52

## 1. 触发事实

E3c2 已向产品负责人明确说明：下一步只能在取得“仅为 N52 checkpoint 修改 N20 Story Language、N30 Compiler、N31 Runtime IR 与 Save schema，最大节点仍为 N52”的授权后开始。产品负责人随后明确要求按照该接续点继续开发，并继续要求实际代码复核、最初需求对齐、偏移纠正、逐步审计和推送。本修订将这项指令记录为 `RA-N21-011` 的窄范围 scope amendment，不新建并行风险例外，也不提升 delivery node。

## 2. 允许与禁止

允许的唯一跨层变化：显式稳定 ID checkpoint 语句；Compiler Runtime IR 1.1 checkpoint opcode；Runtime 1.0/1.1 双读与非表现 checkpoint event；Player Save v3 严格迁移和三个 checkpoint 槽。

禁止修改其他 Story/Runtime 语义，禁止内部 History checkpoint、scene ID、指令数组下标或墙钟替代，禁止第二套 Runtime/Player Core/Save 格式。N52 Product Acceptance、N60+、真人、实体设备、M1 与发布继续阻断。

## 3. 机器门与执行顺序

风险策略新增三条精确补偿控制，并要求 `scopeAmendedAt`。正例必须接受修订后的 RA-011；删除 checkpoint scope 的反例必须失败。根级 `audit:n52-e3c3-checkpoint-authority` 同时核对 registry、范围、禁止项、blocked gates 和权威文档。

本治理步通过并推送后，下一代码切片才进入 `N52-E3c3-checkpoint-marker-implementation`，顺序保持 Story Language → Compiler IR 1.1 → Runtime → Player → Save v3，不把治理提交与产品实现混成不可审计的大提交。
