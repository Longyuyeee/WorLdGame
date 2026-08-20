# N22 浏览器 Media 与视觉 Golden 审计

> 日期：2026-08-14
>
> 分支：`agent/n22-stage-media`
>
> 状态：N22 第六切片验收候选；不解除 `RA-N21-001` 对 N21、N23、M1 与发布的阻断

## 1. 验收范围

本切片使用真实浏览器和产品可见 UI 完成：Golden 负载物化、三个文件逐一选择、媒体检查、Asset Index 原子导入、类型化背景/角色/BGM 编辑、自动保存、整页重载后从最近工程打开、结构视图到内容视图即时重开，以及 16:9/9:16 Preview 视觉检查。

没有向产品加入 Fixture 开关、测试路由或 IndexedDB 直写后门。`tools/materialize-media-golden.mjs` 只把已登记 SHA-256 的 Base64 Fixture 还原为临时 PNG/WAV 文件；浏览器仍通过真实 `<input type="file">` 接收它们。

## 2. 重开缺陷与修复

首次真实重开暴露出两个相连问题：

1. `App` 组件卸载只停掉 heartbeat，没有释放活跃 writer lease，返回工程结构后立即重进会被误判为另一个编辑窗口；
2. 直接补释放后，React Strict Mode 的旧 cleanup 可能与同 owner 的新挂载竞态。旧 lease 与新 lease 共用 fencing token，而 `release` 原先不比较到期版本，因此旧 cleanup 可能清除刚续长的新 lease。

修复后的租约规则为：

- 组件卸载立即撤销导入/分析任务、清空活跃引用并异步释放 lease；
- acquire 在同 owner 重入时至少把 `expiresAtMs` 推进一个逻辑版本；
- release 必须同时匹配 owner、fencing token 与 `expiresAtMs`；旧 cleanup 无权释放新一代 lease；
- 如果 acquire 完成时组件已经卸载，会释放刚取得且尚未发布给 UI 的 lease。

新增测试覆盖正常卸载交权，以及同 owner 旧 lease 不能释放新租约代际。修复后，浏览器从结构视图立即重进内容编辑器不再出现 `WRITER LEASE CONFLICT` 或 `PROJECT OPEN BLOCKED`。

## 3. 浏览器产品证据

冻结证据位于 `evidence/n22/media-golden-browser.json`，并由 Golden 审计重新校验：

- 3 个真实资源写入 `Index r3`；项目保存到 `s3`；
- 整页重载后通过“最近工程”恢复 4 个步骤和全部 3 个资源；
- 背景 PNG 为 16×9、角色 PNG 为 4×8，均从 Blob URL 完成解码；
- WAV 使用 Blob URL，`readyState=4`，没有媒体错误；
- Preview 运行错误为 0，本地页面 console warning/error 为 0；
- 16:9 稳定尺寸为 334×187.875，比例精确为 1.777777…；
- 9:16 稳定尺寸为 240×426.6640625，比例误差小于 0.0001；
- 两种尺寸均没有横向或纵向溢出，DPR 2 对应 3840×2160 与 2160×3840 像素预算。

视觉取样必须等待 700ms 平滑比例过渡稳定；动画中间帧不能冒充最终尺寸失败。两张 1280×720 浏览器截图均登记字节数与 SHA-256，任何替换都会使 Golden 审计失败。

## 4. 边界结论

N22 的真实媒体导入、保存重开、背景/角色/BGM Preview、默认 16:9、可调 9:16、无溢出与视觉参考基线已经形成自动化和浏览器证据。当前渲染后端仍明确为 `dom-media-v1`；Canvas/Pixi/WebGL、镜头、关键帧、模板和正式 Player Runtime 继续归后续节点。

本切片不关闭 N21 真人任务例外，也不授权进入 N23。即使 N22 工程门通过，N23、M1 Stable 与 Public Release 仍被 `RA-N21-001` 阻断。
