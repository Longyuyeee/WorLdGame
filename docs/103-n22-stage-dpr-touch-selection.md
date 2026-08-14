# N22 Stage DPR 与触摸选择审计

> 日期：2026-08-14
> 分支：`agent/n22-stage-media`
> 节点状态：实现中；本文件只验收 N22 第二切片，不宣称 N22 通过
> 前置切片：[N22 Stage 几何与安全区审计](102-n22-stage-geometry-safe-area.md)

## 1. 需求对齐

本切片关闭上一轮登记的两项工程缺口：Preview 设计分辨率到设备像素的确定性映射，以及 Stage 角色对象的鼠标/触摸/键盘等价选择。它只建立渲染宿主可消费的 Surface Contract，不把当前 DOM Preview 冒充已经完成的 Pixi/Canvas Runtime。

## 2. 冻结契约

- 设计坐标始终使用所选 Preview Profile 的宽高，默认 `1920 × 1080`；
- 请求 DPR 非法时回退为 1，并限制在 1–4；
- backing surface 任一边不超过 8192 像素，超限时保持纵横比并降低有效 DPR，UI 和 DOM 数据明确标记 `resolutionLimited`；
- Client Point 按实际 Stage 边界映射到设计坐标，边界外、零尺寸或非有限值均 fail-closed；DPR 不参与语义坐标，避免跨屏缩放改变项目数据；
- 角色图层使用原生 `button` 语义，鼠标点击、触摸点击和键盘 Enter/Space 走同一原生激活路径；Pointer Down 只记录设计坐标，不修改工程；
- Stage 角色选择复用 `select-statement`，因此 Preview 步骤、Sequence 卡和 Inspector 的选中状态由同一 Studio Session 更新；选中态同时通过 `aria-pressed`、焦点轮廓和可视高亮反馈；
- 当前切片不实现自由拖拽。触摸端可直接选择对象，精确几何继续由已存在的 Inspector 数值输入完成，避免移动端只能拖拽而无法精确编辑。

## 3. 自动化证据

- `stage-surface.test.ts`：DPR 正常路径、非法值回退、8192 上限、设计坐标映射、越界/零尺寸拒绝；
- `stage-character.test.tsx`：Touch Pointer 命中坐标、统一选择回调、原生按钮语义、`aria-pressed` 与选中样式；
- `App.test.tsx`：默认 16:9、设计宽高、有效 DPR、backing width/height 与未限幅状态；
- 定向门：4 files、44 tests PASS；Editor TypeScript project references PASS；
- 完整仓库门：84/84 常规测试文件、507/507 tests PASS；VM Conformance 5/5 PASS；10 个 workspace build、Architecture、Requirements、Risk Acceptance、Delivery Baseline、PR Traceability、Golden Registry、Script Performance 10/10、Asset Performance 4/4 全部 PASS；
- 真实浏览器复核：设备 DPR 2 下，默认 16:9 的 backing contract 为 `3840 × 2160`、实测画幅比 1.777778；9:16 为 `2160 × 3840`、实测画幅比 0.562503；竖屏安全区实测水平/垂直内缩约 8.3%/5.2%；布局无溢出；console 0 warning / 0 error；
- 浏览器示例工程不含已导入角色媒体，本轮不把组件级触摸选择测试冒充 Media Golden 或真实媒体 E2E。

## 4. 审计边界与剩余阻断

- 错误解码/切场景矩阵已由[第三切片审计](104-n22-preview-media-host-safety.md)补齐；DOM Stage 仍是 Editor Preview，正式 Canvas/Pixi 渲染宿主尚未完成；
- 尚未生成可审查的视觉 Golden；
- Media Golden Project 仍缺“导入真实媒体 → 保存重开 → Preview 播放”的完整产品验收；
- N21 真人门、N23、M1 Stable 与 Public Release 继续被 `RA-N21-001` 阻断。

因此本轮只能登记为 N22 实现进展，不得标记 N22、N21 或 M1 通过。
