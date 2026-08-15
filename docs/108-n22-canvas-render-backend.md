# N22 Canvas 2D 渲染后端审计

> 日期：2026-08-14
>
> 分支：`agent/n22-stage-media`
>
> 状态：N22 第七切片验收候选；不解除 `RA-N21-001` 对 N21、N23、M1 与发布的阻断

## 1. 需求对齐与纠偏

本轮首先复核了 N22 的剩余条款。BGM、Voice、SFX、Ambient 四总线以及 play/stop/pause/resume、音量、循环和时间轴确定性回退已经存在，因此没有重复开发音频包装。实际最大缺口是 N22 条款 1：“Pixi/Canvas 场景层与 DOM 文本/UI 分离”。

本切片只建立 Editor Preview 的 Canvas 2D 后端，不提前宣称 Pixi/WebGL、正式 Player Runtime、镜头、关键帧或模板已经完成。

## 2. Render Host v2

`PreviewRenderFrame` 契约升级为 v2：

- 主后端：`canvas-2d-v1`；
- 安全回退：`dom-media-v1`；
- 背景与角色统一在设计像素坐标系中绘制到单一 Canvas；
- React DOM 继续拥有文本、对话框、安全区、控制条和状态反馈；
- 角色交互由透明、可聚焦、可触摸的 DOM 命中代理承担，不在 Canvas 中伪造可访问性；
- Canvas 按 Stage 的有效 DPR 分配真实像素，16:9 为 3840×2160，9:16 为 2160×3840；
- 单个图片独立解码并增量重绘，慢资源不阻塞其他已就绪层；
- 时间轴换帧会取消旧代解码，旧图片不得污染新帧；
- Canvas 不可用或 `getContext("2d")` 失败时回退既有 DOM Media 后端。

角色绘制使用背景 cover、角色等比 contain、设计空间百分比位置、缩放、旋转、锚点和已排序 z 层级。选中反馈在 Canvas 视觉与 DOM `aria-pressed` 状态中同步。

## 3. 自动化与真实浏览器证据

新增测试覆盖：

- 角色尺寸、锚点和设计像素换算；
- DPR 变换和背景先于角色的绘制顺序；
- Canvas 视觉层与键盘/触摸 DOM 命中代理分离；
- Render Host v2 主后端和回退边界；
- 既有 DOM 回退、媒体状态机与角色交互不回归。

真实浏览器通过已保存的 Media Golden 工程进入 Writer Preview，并验证：

- `data-render-contract=2`、`data-render-backend=canvas-2d-v1`、状态为 ready；
- 页面只有一个 Canvas，DOM 媒体图片为 0；
- 角色步骤出现一个可访问命中代理，选中时 `aria-pressed=true`；
- 16:9 和 9:16 均无横向或纵向溢出；
- DPR 2 下 Canvas 像素分别为 3840×2160 与 2160×3840；
- Preview 运行错误为 0，安全占位未触发。

机器证据位于 `evidence/n22/canvas-2d-browser.json`，两张截图的字节数和 SHA-256 已注册进 Golden 审计；任何证据替换或尺寸漂移都会使 `audit:goldens` 失败。

最终本地完整门通过：89 个常规测试文件、524 项常规测试、5 项 VM 重型测试、10 个 workspace 构建、架构审计、10 项 Script 性能门和 4 项 Asset 性能门均成功。VM 重型门曾在系统瞬时负载下触发一次 90 秒超时，未修改阈值；独立复跑为 71.57 秒，最终完整门为 67.58 秒。

## 4. 审计边界

本切片补齐了 N22 的 Canvas/DOM 分层缺口，但不把 Editor Preview 当作正式 Player。当前过渡仍是 Preview 级基础过渡，复杂镜头、关键帧、缓动曲线、模板、WebGL/Pixi 性能后端和 Runtime 同步继续归后续正式节点。

`RA-N21-001` 仍然有效：N21 真人产品门未完成，N23、M1 Stable 和 Public Release 继续阻断。
