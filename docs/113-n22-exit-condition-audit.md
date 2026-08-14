# N22 最小 Stage 与媒体预览退出条件审计

> 审计日期：2026-08-14
> 审计分支：`agent/n22-stage-media`
> 基线提交：`15eb54b0d499889abe867cc8e001aef4b000aa74`
> 集成入口：Draft PR [#33](https://github.com/Longyuyeee/WorLdGame/pull/33)，目标分支 `agent/m1-integration-n21`

## 1. 结论

N22 的边界是“编辑器内、真实资源驱动的最小 Stage/Preview 工程能力”，不是正式 Runtime、Player 或可发布游戏。按[交付计划](89-engine-product-delivery-plan.md)逐条复核后，N22 工程退出条件已补齐：PNG/WAV 经过真实资源保险库导入，Stage 使用 Canvas 2D 主后端和 DOM 安全回退，背景/角色/基础过渡/四类音轨计划/横竖屏/安全区/选择同步均有实现与证据；本轮又补上了此前缺失的“WAV 确实处于播放态”证据和组件级回归约束。

因此，N22 可记为**工程验收通过**。此结论不改变以下事实：

- N21 的非程序用户 20 分钟任务仍未执行，状态仍是“验收中”；
- `RA-N21-001` 只授权 N22 工程实现，仍阻断 N23、M1 Stable 和 Public Release；
- M1 的 AC-01–AC-27 仍为 `0/27` 完整通过；
- Pixi/WebGL、复杂镜头/关键帧/UI 模板、正式 VM/Player/Build 均属于后续节点，不得回填成 N22 已完成。

## 2. 退出条件逐项对齐

| 计划条件 | 实现与证据 | 审计结果 |
| --- | --- | --- |
| 真实资源驱动的基础舞台 | `IndexedDbAssetRepository`、媒体检查 Worker、Blob URL Loader；Media Golden 为真实 PNG/WAV | 通过 |
| Canvas/Pixi 场景层与 DOM UI 分离 | Render Host v2，`canvas-2d-v1` 主后端；文本、按钮、命中代理保留在 React DOM；`dom-media-v1` 仅安全回退 | 通过；不宣称 Pixi 已实现 |
| 背景与角色几何 | X/Y、scale、rotation、anchor、z、slot、expression 进入同一类型化指令与 Render Frame | 通过 |
| BGM/Voice/SFX/Ambient 播放与停止 | 编译计划支持 play/stop/pause/resume、bus、loop、volume、fade；预览层调用真实 `HTMLAudioElement.play/pause` | 通过 |
| Fade/Move/Show/Hide | Move 插值与回退、Hide/Fade 退出、Show 入场及下一语句沉降均有浏览器生命周期证据 | 通过 |
| 设计分辨率、横竖屏、安全区 | 16:9、16:10、4:3、21:9、9:16、自定义尺寸；DPR 安全映射与安全区 | 通过 |
| 缺失/不可信资源安全占位 | generation 隔离、解码失败分层回退、诊断计数、Object URL 释放 | 通过 |
| 当前语句/Stage/Sequence 同步选择 | 卡片、轨道、预览索引共享稳定 statement ID；键盘、触摸与命中代理等价 | 通过 |
| 资源生命周期、切场景、DPR、触摸、视觉 Golden | `docs/102`–`docs/111`、`evidence/n22/`、Golden 审计与组件/运行时测试 | 通过 |
| Media Golden 正确显示和播放，不用 CSS 假素材 | 既有浏览器证据证明 PNG 显示与 WAV 解码；本轮独立工程证明 WAV `paused=false` 且时间前进 | 通过 |

## 3. 本轮发现并关闭的证据缺口

原有 `media-golden-browser.json` 只记录 WAV 使用 Blob URL、`readyState=4`、无错误；它能证明“已加载/可解码”，不能单独证明“正在播放”。原 Golden 审计也只要求 `readyState >= 1`。在没有补证前，N22 只能称工程验收候选，不能按 Acceptance 写成通过。

本轮执行了独立真实产品流：

1. 从当前分支启动 `http://127.0.0.1:5174/`，创建 `N22 Exit Audio Audit` 空工程；
2. 物化并校验 Media Golden 的 `media_theme.wav`；
3. 通过资源保险库完成签名、格式和预算检查，原子写入 `media_theme`；
4. 在 Writer 的 Stage 轨道插入 `action=play asset=media_theme bus=bgm loop=true volume=1`；
5. 保存、完整重载、从最近工程重开；
6. 对真实 `audio[data-testid="preview-audio-bgm"]` 两次采样：Blob URL、`readyState=4`、`paused=false`、`ended=false`、`error=null`、`loop=true`，`currentTime` 从 `0.014045` 前进到 `0.042476`；
7. 记录可访问状态 `bgm 音轨播放中`，并保留浏览器自动播放受限时的“点击启用”用户手势回退。

结构化事实写入 [`evidence/n22/audio-playback-browser.json`](../evidence/n22/audio-playback-browser.json)，其 canonical SHA-256 登记在 [`fixtures/projects/media/evidence.json`](../fixtures/projects/media/evidence.json)，`audit:goldens` 会拒绝 paused、未前进、非 Blob、低 readyState、错误或登记哈希漂移。

同时将 `PreviewAudioLayer` 抽为独立组件并新增三类测试：真实播放状态、自动播放被拒后的用户手势重试、暂停与解码错误。这样浏览器证据不再是一次性人工描述，核心行为也由 CI 约束。

## 4. 需求状态影响

| 需求/节点 | 本轮后状态 | 原因 |
| --- | --- | --- |
| N22 | 工程验收通过 | 计划中的 Goal、Implementation、Tests、Acceptance 均有实现和证据 |
| REQ-STAGE | 实现中 | N22 只完成最小 Stage；N42 的正式 Stage、模板、复杂关键帧和 Runtime 同步仍未完成 |
| REQ-SEQ | 实现中 | N21 真人门与 N41 完整 Sequence 仍缺失 |
| AC-13 | 实现中 | N22 提供最小画布和横竖屏证据，但正式 Stage/目标设备验收未完成 |
| N21 | 验收中 | 自动化或演示者操作不能替代真实非程序用户任务 |
| N23 | 未开始/阻塞 | `RA-N21-001` 明确不授权 N23；必须先关闭 N21 真人门与例外 |
| M1 | `0/27` | 没有任何 AC 同时完成编辑器、正式运行时、目标设备、分发产物和审核证据 |

## 5. 审计与推送门

本批变更必须按以下顺序进入 GitHub：

1. 定向测试：`npx.cmd vitest run apps/editor/src/preview-audio-layer.test.tsx --maxWorkers=1`；
2. Golden 登记审计：`npm.cmd run audit:goldens`；
3. 完整工程门：`npm.cmd run check`；
4. 补充 `git diff --check`、工作树范围审计和需求文档一致性复核；
5. 只暂存本审计涉及的代码、测试、证据与文档，提交到 `agent/n22-stage-media`；
6. 推送并等待 PR #33 当前 head 的 Windows `product-baseline` 通过。

任一门失败，N22 状态退回“工程验收候选”，不得开始 N23。

本轮本地结果：定向音频层测试 `3/3`；完整 `npm run check` 通过，其中治理策略 `5/5`、交付基线策略 `4/4`、常规测试 `90 files / 543 tests`、VM 重型门 `5/5`、10 个 workspace 构建、架构审计、Script 性能 `10/10`、Asset 性能 `4/4` 均为绿色。Editor bundle 为 `595.61 kB / gzip 169.07 kB`，保留超过 500 kB 的非阻塞警告，不将其隐藏为通过项。

## 6. 下一步严格顺序

1. 维护者按 [`N21-HV-01` 执行包](114-n21-human-validation-execution-kit.md)安排真实非程序用户执行 N21 20 分钟创作任务；
2. 将开始/结束时间、求助、阻塞点、输入设备、工程快照、保存关闭重开结果写回 N21 证据；
3. 关闭或更新 `RA-N21-001`，完成 N21 Product Acceptance；
4. 按顺序评审/合并串联 Draft PR，确认权威集成基线；
5. 只有上述门全部关闭后，才冻结 N23 五分钟可玩切片需求并开始实现。

在这之前，不增加与纵向切片无关的平台功能或新 Spike。
