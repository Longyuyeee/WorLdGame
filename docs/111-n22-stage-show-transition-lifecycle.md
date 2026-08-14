# N22 Stage Show 单语句过渡生命周期审计

> 日期：2026-08-14
> 基线：`f874570c5bb32bccbca816293dbcec4ad87247bc`
> 分支：`agent/n22-stage-media`
> 范围：N22 第十切片——Show 角色层入场、Move/Show 单语句沉降、确定性回退与浏览器 Golden

## 1. 需求对齐

本切片修复两个会削弱专业演出可靠性的状态泄漏：带 transition 的 Show 曾把 CSS 过渡挂到整个 Canvas，Move 的 `movementFrom` 又会保留到后续对白并可能重放。本轮冻结以下契约：

- Show 只有显式填写 transition 时才产生入场动画；动画只作用于目标角色层，不改变背景或整张 Canvas；
- Move 与 Show 的动画标记只存在于作者语句帧，进入下一句后保留最终资源和几何，但清除瞬时标记；
- 后退重新编译时间线并恢复作者帧的动画标记，前进再次沉降，结果不依赖此前播放历史；
- Canvas 整画布 transition 只允许当前选中的背景语句触发；角色 Show/Move/Hide 由角色层自己的动画路径负责；
- 本切片不扩展复杂关键帧、镜头、正式 Player Runtime、N23 或发布范围。

## 2. 实现与失败语义

Preview 时间线新增 `entering` 瞬时标记，并在处理下一条语句前统一沉降 `entering / movementFrom`。Canvas 2D 使用同一个可取消帧循环计算角色 alpha、Slide 起点和 Move 几何；DOM fallback 只在瞬时标记存在时挂 transition class，并补齐 Move 起始 transform。缺失 transition 的 Show 保持静态，退出角色仍沿用 Hide 的不可交互语义。

## 3. 自动化与浏览器证据

- 定向测试：`preview-media-runtime.test.ts` 与 `preview-canvas-host.test.tsx` 共 25 项通过；
- 常规门：89 个文件、540/540 项通过；类型检查、10 个 workspace 构建、65 个 portable/4 个 Node adapter 架构门、10 项 Script 与 4 项 Asset 性能门通过；
- Editor 主包：595.61 kB，gzip 169.12 kB，保留既有大 chunk 警告；
- Golden：`evidence/n22/show-transition-browser.json` 与 `show-transition-browser.jpg` 已由 `audit:goldens` 校验并登记；
- 真实浏览器观察：Canvas 为 3840×2160 设计像素（16:9、DPR 2）；Show 帧 Canvas class 保持 `stage-canvas`，角色带 `entering + slide`；下一步角色只剩稳定代理 class；回退恢复入场 class。

本机完整门首轮被外层 120 秒窗口终止；第二轮的 89/89、540/540 常规测试通过，但既有 10,000-seed VM corpus 在固定 90 秒门分别于 103.8 秒、93.2 秒和停止本工程 Vite 后的 98.7 秒超时。该文件与本切片无代码依赖，历史审计也记录本机约 106 秒、远端约 72 秒的差异；因此没有放宽门限，也不把本地结果写成全绿，最终裁决交给 Draft PR #33 的 Windows `product-baseline`。

实现提交 `908edb0` 推送后，Draft PR #33 的 Windows / Node 22 `product-baseline` run `31787057050` 在 3m16s 内完整通过，远端冻结 VM 门与全仓检查均为绿色。本机三次超时继续作为性能环境差异保留，不反向改写为本地全绿。

## 4. 边界与下一步

本切片证明的是编辑器 Preview 中基础 Show/Move 的单语句生命周期与角色层作用域，不证明 Pixi/WebGL、复杂关键帧、镜头、正式 Runtime 或三端一致性。`RA-N21-001` 继续阻断 N21 Product Acceptance、N23、M1 Stable 与 Public Release。
