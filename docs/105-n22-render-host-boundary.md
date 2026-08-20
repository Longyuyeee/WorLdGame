# N22 Render Host 边界审计

> 日期：2026-08-14
> 分支：`agent/n22-stage-media`
> 节点状态：实现中；本文件只验收 N22 第四切片，不宣称 N22 通过
> 前置切片：[Preview 媒体宿主安全审计](104-n22-preview-media-host-safety.md)

## 1. 需求对齐

本切片冻结 Preview 的正式渲染宿主边界，把资源驱动的背景/角色视觉层与 React DOM 管理的对白、选择项、安全区、错误提示和传输控件分离。当前可执行后端仍是经过浏览器验证的 DOM Media Host；本切片建立 Canvas/Pixi 可替换接口，但不宣称 Canvas/Pixi 后端已经实现。

## 2. Host Contract v1

| 字段 | 冻结值 | 说明 |
|---|---|---|
| `contractVersion` | `1` | Render Frame 破坏性变更必须升版 |
| `backend` | `dom-media-v1` | 当前最小 N22 后端，不伪装为 Canvas/Pixi |
| `coordinateSpace` | `design-pixels` | 与 DPR/设计分辨率契约一致 |
| `visualPlanes` | `background`, `character` | 仅资源视觉层归 Renderer |
| `overlayOwner` | `react-dom` | 对白、UI、安全区、错误与传输保持可访问 DOM |
| `hitTesting` | `accessible-dom-proxy` | 角色使用原生按钮完成鼠标/触摸/键盘选择 |

- Render Frame 只接受当前 generation 与 `planKey`，不会暴露旧媒体；
- 媒体宿主的失败图层在 Frame 投影阶段被隔离，Backend 不重复解释错误状态；
- Background Plane 与 Character Plane 建立独立 stacking context；角色 `z=-100…100` 只在角色平面内排序，负 z 不再被背景遮挡；
- Preview Chrome、Safe Area、Dialogue/Choice/Ending、Audio/Error Overlay 不进入视觉后端，确保可访问性和未来 Renderer 替换不改变产品语义；
- 后续 Canvas2D/Pixi/WebGL Backend 必须消费同一 Render Frame，不得绕过 Canonical Project、媒体宿主或安全回退状态。

## 3. 自动化证据

- `preview-render-host.test.ts`：契约常量、活动 generation 投影、错误图层隔离、角色顺序保留；
- `stage-character.test.tsx`：Host DOM 契约标记、背景/角色平面顺序、负 z 角色仍位于 Character Plane、触摸/键盘代理；
- `App.test.tsx`：默认 Preview 发布 `contract=1` 与 `backend=dom-media-v1`；
- 定向门：4 files、38 tests PASS；Editor TypeScript project references PASS；
- 完整仓库门：86/86 常规测试文件、517/517 tests PASS；VM Conformance 5/5 PASS；10 个 workspace build、Architecture、Requirements、Risk Acceptance、Delivery Baseline、PR Traceability、Golden Registry、Script Performance 10/10、Asset Performance 4/4 全部 PASS；
- 真实浏览器复核：Host 发布 `contract=1 / dom-media-v1 / ready`；实际 stacking 为 Background=1、Character=2、Dialogue=5、Safe Area=6；16:9 实测 1.777778，9:16 实测 0.562503；布局无溢出；console 0 warning / 0 error；
- 浏览器示例工程不含已导入角色媒体，负 z 修复以 Render Contract 与组件结构测试为证据，不冒充真实媒体 E2E 或视觉 Golden。

## 4. 边界与后续

- 本切片完成的是 Renderer 边界，不是 Pixi/WebGL 实现；正式高性能 Backend、批处理、纹理图集与 GPU 预算归 N42/N71/N72；
- N22 仍缺可审查视觉 Golden，以及 Media Golden 的真实导入、保存重开、播放和错误隔离产品验收；
- N21 真人门、N23、M1 Stable 与 Public Release 继续被 `RA-N21-001` 阻断。

因此本轮只能登记为 N22 实现进展，不得标记 N22、N21 或 M1 通过。
