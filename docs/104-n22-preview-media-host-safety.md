# N22 Preview 媒体宿主安全审计

> 日期：2026-08-14
> 分支：`agent/n22-stage-media`
> 节点状态：实现中；本文件只验收 N22 第三切片，不宣称 N22 通过
> 前置切片：[Stage DPR 与触摸选择审计](103-n22-stage-dpr-touch-selection.md)

## 1. 需求对齐

本切片处理真实媒体 Preview 在快速切场景、加载取消、存储读取失败和浏览器元素解码失败时的稳定性。目标是“不显示旧场景、不泄漏 Object URL、不让单个坏资源击穿整个 Preview”，而不是新增与 N22 无关的平台能力。

## 2. 冻结宿主语义

- 每次资源计划切换分配单调递增 generation；完成、失败和元素错误必须同时匹配 generation 与 `planKey`，旧结果一律忽略；
- AbortSignal 仍是第一层取消，generation 是第二层发布隔离；即使底层 Reader 不及时响应取消，旧媒体也不能覆盖当前场景；
- 加载中已经创建的 Object URL，在后续取消或 Reader 抛错时全部撤销；正常切换和卸载继续由 owner cleanup 撤销；
- 背景 `<img>` 解码失败后切换安全背景占位；角色 `<img>` 解码失败后只移除对应角色层；音频失败保留可识别的错误状态，不影响其他 bus；
- Runtime Error 按 role、statement、asset、code 去重并限制为 100 项；切换 generation 时清空，不污染下一场景；
- 资源错误统一计入 Preview 安全占位提示，同时保留导入/索引/Blob 校验产生的原始错误数量；
- CSS 安全占位仅用于故障反馈，不作为 Media Golden 或正式游戏素材验收证据。

## 3. 自动化证据

- `preview-media-host.test.ts`：快速 A→B 场景切换、旧 generation 拒绝、错误 plan key 拒绝、活动请求失败安全发布、元素错误去重/隔离、下一 generation 清理；
- `preview-media-runtime.test.ts`：验证媒体加载、类型不匹配、缺失 Blob、共享 URL 去重、取消前未创建 URL、部分 URL 创建后的取消撤销、后续 Reader 抛错撤销；
- `stage-character.test.tsx`：角色元素解码错误上报、鼠标/触摸/键盘统一选择语义；
- 定向门：3 files、18 tests PASS；集成定向门：4 files、44 tests PASS；Editor TypeScript project references PASS；
- 全仓常规门：85/85 files、513/513 tests PASS；10 个 workspace build、Architecture、Requirements、Risk Acceptance、Delivery Baseline、PR Traceability、Golden Registry、Script Performance 10/10、Asset Performance 4/4 全部 PASS；
- VM Conformance 首次执行中 10,000-seed 回放用时 91.6 秒，触发既有 90 秒测试超时；未修改门限，按原配置单独重跑后 71.1 秒、5/5 tests PASS。该抖动与本切片 Editor 媒体代码无依赖关系，但保留失败记录，不登记为一次无条件全绿的 `npm run check`；
- 真实浏览器烟雾复核：连续切换 9:16 → 21:9 → 16:9 后稳定回到 `1920 × 1080`，无残留 loading、无错误占位、安全区仍存在，页面 console 0 warning / 0 error；
- 浏览器示例工程不含已导入媒体，因此本轮浏览器复核只证明可见流程无回归，不冒充错误媒体 E2E 或 Media Golden。

## 4. 未完成与阻断

- Canvas/Pixi 与 DOM 文本/UI 的职责边界已由[第四切片审计](105-n22-render-host-boundary.md)冻结；当前后端仍为 DOM Media，Canvas/Pixi 高性能后端尚未实现；
- 尚未生成可审查的视觉 Golden；
- Media Golden Project 仍缺“导入真实媒体 → 保存重开 → Preview 播放 → 错误资源隔离”的完整产品验收；
- N21 真人门、N23、M1 Stable 与 Public Release 继续被 `RA-N21-001` 阻断。

因此本轮只能登记为 N22 实现进展，不得标记 N22、N21 或 M1 通过。
