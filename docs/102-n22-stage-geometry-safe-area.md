# N22 Stage 几何与安全区审计

> 日期：2026-08-14
> 分支：`agent/n22-stage-media`
> 节点状态：实现中；本文件只验收 N22 第一切片，不宣称 N22 通过
> 前置基线：`agent/m1-integration-n21` / Draft PR #32 / Authoritative

## 1. 需求对齐

本切片对应 N22 的“位置、缩放、旋转、锚点、层级”“设计分辨率、横竖屏、安全区”和“缺失/不可信资源安全占位”。已有真实 Blob、Object URL 生命周期、背景、多角色和四路音频预览继续复用，不重复制造 CSS 假素材作为验收证据。

## 2. 冻结参数与执行边界

| 参数 | 范围 | 默认值 |
|---|---:|---:|
| `x` / `y` | 0–100% | 位置预设映射 / 100 |
| `scale` | 0.1–4 | 1 |
| `rotation` | -360–360° | 0 |
| `anchorX` / `anchorY` | 0–1 | 0.5 / 1 |
| `z` | -100–100 整数 | 0 |

- Story Language、资源编译器、图形化 Inspector 和 Preview 使用同一组范围；
- 任一几何参数非法时，该 `@show` 指令 fail-closed，不发布部分角色状态；
- 旧 `position=left|center|right` 继续确定性映射为 20/50/80%，不破坏既有项目；
- Preview DOM 记录解析后的几何数据，渲染变换按锚点平移、缩放、旋转的固定顺序执行；
- 安全区默认显示，横屏为 5%，竖屏水平内缩为 8%，可在预览工具栏关闭；切换不修改 Canonical Project revision。

## 3. 自动化证据

- TypeScript project references：PASS；
- 定向测试：4 files、54 tests PASS；
- 覆盖：稳定 ID 局部 Patch、新参数资源编译、范围拒绝、累计 Stage 回放、旧位置兼容、Inspector 输入边界、安全区开关；
- 全仓非 VM 重型门：82/82 files、501/501 tests PASS；10 个 workspace build、Architecture、Requirements、Risk Acceptance、Delivery Baseline、Script Performance 10/10、Asset Performance 4/4 均 PASS；
- 本地浏览器复核：16:9 与 9:16 切换正常；竖屏稳定画幅比 0.5625，安全区实测水平/垂直内缩约 8%/5%；开关关闭后覆盖层移除；几何 Inspector 3×2 字段网格无溢出；console 0 warning / 0 error；
- `git diff --check`：PASS。

## 4. 后续进展与阻断

- DPR/画布像素映射、触摸命中与精确数值编辑替代路径已由[第二切片审计](103-n22-stage-dpr-touch-selection.md)补齐；自由拖拽留在正式 Stage 操控切片；
- 尚未生成可审查的视觉 Golden 快照；
- Media Golden Project 仍未形成“导入真实媒体 → 保存重开 → Preview 播放”的完整产品验收证据；
- 错误解码与场景切换矩阵已由[第三切片审计](104-n22-preview-media-host-safety.md)补齐，Renderer 与 DOM Overlay 边界已由[第四切片审计](105-n22-render-host-boundary.md)冻结；Canvas/Pixi 高性能后端仍未实现；
- N21 真人门、N23、M1 Stable 与 Public Release 继续被 `RA-N21-001` 阻断。

因此本轮只能登记为 N22 实现进展，不得标记 N22、N21 或 M1 通过。
