# N22 Stage Hide 基础退出过渡审计

> 日期：2026-08-14
> 基线：`fe6baf47a0387752c0009c88143e64565fecf064`
> 分支：`agent/n22-stage-media`
> 范围：N22 第九切片——角色 Hide 语言契约、退出资源窗口、Canvas/DOM 淡出、确定性回退与浏览器证据

## 1. 需求对齐结论

本切片补齐 `Show / Move / Hide` 中 Hide 此前“立即删除、无退出帧”的缺口，继续服务 N22 的基础舞台过渡，不进入复杂关键帧、镜头、正式 Runtime 或 N23。

- `@show action=hide` 只接受稳定槽位以及可选 `transition / duration`，不接受新资源或几何；
- 目标槽位必须已激活，否则语言编译和 Preview 都失败关闭；
- Hide 语句窗口保留原角色资源、表情与几何作为瞬时退出层，下一语句彻底释放；
- 默认退出为 `fade`、默认时长 300 ms，显式时长沿用现有 `ms/s` 契约并限制 Canvas 动画上限；
- Canvas 按时间进度把透明度从 1 插值到 0；DOM 安全回退使用同一退出动画；
- 退出层命中代理立即禁用、移出键盘顺序并从无障碍树隐藏，避免不可见控件仍可操作；
- 后退重新折叠时间线并恢复原槽位，前进可重复进入相同退出状态。

## 2. 实现链与失败语义

| 层 | 结果 |
|---|---|
| Story Language | Hide 动作级参数集合允许 `transition / duration`，继续拒绝 `asset` 等非法标准字段 |
| Resource Manifest | 退出语句窗口保留原角色 Asset；下一窗口移除；缺失目标产生 `MISSING_STAGE_TARGET` |
| Editor | 图形化插入默认生成 fade/300ms；Inspector 可修改过渡与时长且清除资源/几何字段 |
| Preview State | 活动槽位与单语句瞬时退出层分离；非法动作参数不执行且未知扩展参数仍保持兼容 |
| Canvas 2D | 复用可取消帧循环按进度插值 alpha；减少动效直接到终态 |
| DOM fallback | 专用退出关键帧覆盖入场过渡，命中代理和媒体节点均不可交互 |

## 3. 自动化与真实浏览器证据

定向自动化覆盖 Hide 插入、非法资源、缺失目标、退出资源窗口、单语句瞬时层、下一语句释放、回退重建、Canvas alpha 插值、无障碍代理和图形化 UI。真实浏览器在已保存的 Media Golden 中从 Move 步骤后插入 Hide，轨道扩展为 6 步：

1. 背景 Set；
2. 角色 Show；
3. 角色 Move 到 `(80%, 90%)`；
4. 角色 Hide/Fade；
5. BGM Play；
6. Ending。

浏览器观测到淡出中间透明度 `0.311682`、最终透明度 `0`、动画名 `stage-media-exit`、时长 300 ms；退出代理为 disabled 且 `aria-hidden=true`。后退时角色恢复为透明度 1、可操作且保持 `(80%, 90%)`，再前进重新到退出终态；运行时错误为 0。

- 结构化证据：`evidence/n22/hide-browser.json`
- 视觉证据：`evidence/n22/hide-browser-workspace.png`
- Golden 登记：`fixtures/projects/media/evidence.json#n22HideEvidence`
- 复现门：`npm run audit:goldens`、`npm run check`、`git diff --check`

本轮最终完整门结果：89 个常规测试文件、537 项常规测试、5 项 VM 重型测试全部通过；10 个 workspace 构建、65 个 portable 文件/4 个 Node adapter 架构门、10 项脚本性能门与 4 项资源性能门通过。Editor 主包为 594.82 kB（gzip 168.90 kB），相对上一切片增加 1.54 kB（gzip 0.28 kB），仍保留现有大 chunk 警告。

首次并行全门中，既有 `autosave-app.test.tsx` 在 5 秒等待窗口内停留于“保存中…”并超时；该测试隔离单 worker 通过，随后未经代码变更重跑完整门 537/537 通过。审计将其登记为并行负载时序波动，不把首次失败隐藏，也不归因于 Hide 功能。

实现提交 `304eebe` 已推送至 Draft PR #33；GitHub `product-baseline` run `31781567127` 在 Windows / Node 22 上通过。

## 4. 审计边界

本切片证明的是 Editor Preview 的基础角色退出过渡。Show 当前已有 Preview 级入场过渡，但复杂曲线、多关键帧、摄像机、正式 Player Runtime、三端一致性和生产发布仍未完成。`RA-N21-001` 继续阻断 N21 Product Acceptance、N23、M1 Stable 与 Public Release。
