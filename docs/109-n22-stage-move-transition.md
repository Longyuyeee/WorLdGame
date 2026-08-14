# N22 Stage Move 基础过渡审计

> 日期：2026-08-14
> 基线：`e04f5d5a543a49815a491a9bdc9835ab1990482d`
> 分支：`agent/n22-stage-media`
> 范围：N22 第八切片——角色槽位 Move 语言契约、图形化编辑、Canvas 预览、确定性回退与浏览器证据

## 1. 需求对齐结论

本切片补齐 `Show / Move / Hide` 中此前缺失的 Move 基础过渡。它直接服务 N22“真实资源驱动的基础舞台结果”，没有进入正式 Runtime、复杂关键帧、镜头系统、Pixi/WebGL 或 N23 可玩切片。

- `@show action=move` 不携带新资源，只修改已存在的稳定角色槽位；
- 至少提供一个几何字段：`z / position / x / y / scale / rotation / anchorX / anchorY`；
- 未修改的资源、表情和几何从当前槽位继承；不存在的槽位、空 Move 或携带资源的 Move 失败关闭；
- Move 不增加或重新加载资源依赖，资源窗口保持不变；
- 向前预览按指定时长插值，向后再向前按语句边界确定性重建；减少动效偏好直接落到终态；
- 已知标准参数按动作收窄，未知扩展参数仍保留并继续走警告路径，避免封死未来插件 ABI。

## 2. 产品入口与实现链

图形化插入面板已提供“移动”动作、稳定槽位和 X/Y 输入，不要求重复选择资源；Inspector 可把 Show 转为 Move，保留几何并清除资源/表情字段。语言层、资源清单编译器、Preview 状态折叠、Canvas 绘制和无障碍命中代理共享同一动作语义。

| 层 | 结果 |
|---|---|
| Story Language | `move` 动作、动作级参数白名单、空几何/非法资源/缺失目标诊断 |
| Resource Manifest | 合法 Move 继承活动槽位且不改变资源集合；错误 Move 不污染状态 |
| Editor | 插入与 Inspector 均可编辑 Move；输入限制为画布百分比 |
| Preview State | 记录前后几何，保持资源与表情，时间线回退重建上一状态 |
| Canvas Host | `requestAnimationFrame` 插值，默认 300 ms、最长 10 s，清理帧与解码任务 |
| Accessibility | DOM 命中代理使用同一初末几何和时长，不复制视觉媒体 |

## 3. 验证与证据

自动化覆盖合法插入、非法参数、资源窗口、继承、回退、几何插值、时长解析、命中代理以及图形化 UI。真实浏览器从已保存 Media Golden 打开编辑器，通过可见界面插入 `slot=actor x=80 y=90 transition=slide duration=300ms`，观察到代理从 `(50%, 100%)` 经过中间位置到 `(80%, 90%)`，回退恢复原位置，运行时错误为 0，主后端为 `canvas-2d-v1`。

- 结构化证据：`evidence/n22/move-browser.json`
- 视觉证据：`evidence/n22/move-browser-workspace.png`
- Golden 登记：`fixtures/projects/media/evidence.json#n22MoveEvidence`
- 复现门：`npm run audit:goldens`、`npm run check`、`git diff --check`

本轮完整门结果：89 个常规测试文件、531 项常规测试、5 项 VM 重型测试全部通过；10 个 workspace 构建、65 个 portable 文件/4 个 Node adapter 架构门、10 项脚本性能门与 4 项资源性能门通过。Editor 主包为 593.28 kB（gzip 168.62 kB），相对上一切片增加 4.38 kB（gzip 1.10 kB），仍保留现有大 chunk 警告并归入后续代码分割审计。

## 4. 审计边界

本切片只证明编辑器 Preview 的基础角色平移和确定性语义。它不证明复杂曲线/多关键帧、摄像机、正式 Player Runtime、三端一致性或生产发布能力。`RA-N21-001` 继续阻断 N21 Product Acceptance、N23、M1 Stable 与 Public Release。
