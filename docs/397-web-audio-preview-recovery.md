# 397 素材试听的等待、停止与重试

2026-10-18，接续 [#396](396-web-source-preview-and-context.md)，本批处理作者连续核对配音时的试听操作和失败恢复。目标仍是 [#304 Web 完整 Gal 制作与交付](304-web-complete-gal-delivery.md)，不扩原生平台或新系统。作品 **1.11.0 候选**、技术 **S0.41** 保持，剧情和演出素材没有变化。

## 试听操作

发布页“核对素材来源”和素材库共用同一套试听。作者先明确打开当前音频，再选择“开始试听”或浏览器原生控件；没有自动播放。显式入口支持键盘，在手机上不必只靠浏览器内部的小播放按钮。

- 文件读取和 SHA-256 校验合计等待上限 10 秒，期间可以取消。超时或取消后不创建迟到预览；只有明确重新准备才再读取。底层仓库没有中止接口，因此取消是停止等待、忽略旧结果，不是假称物理中止存储读取。
- 播放请求及后续无时间进展的等待上限为 8 秒。播放 Promise 返回成功本身不算时间推进；播放、暂停、结束、等待和失败分别反馈。向前／向后拖动后继续播放不会沿用旧时间高水位误报停滞。
- “停止试听”、超时或错误会停止并退役当前音频元素。再次开始使用新元素；旧播放 Promise 的成功、拒绝和媒体事件不会恢复旧声音，也不能打断新的试听。正常原生暂停／继续保留位置，主动停止后从头再听。
- 权限阻止提示允许声音后手动开始；不支持或无法解码提示换浏览器／重新导入支持的格式。不自动循环重试。来源窗口中切换素材、关闭、手机列表收起和页面隐藏仍沿 #396 释放预览。

原检查状态、长度／摘要匹配和 16 MB 上限不变，预览不填写来源依据或确认发行状态。来源草稿、当前剧情和故事音轨不因试听而改变。

## WebKit 复核结果

旧生产构建的[基线报告](../evidence/web-audio-preview-recovery/baseline-webkit.json)记录了真实 `MEDIA_ERR_SRC_NOT_SUPPORTED`（code 4）及原生 `play()` 的 `NotSupportedError`，原界面在收到 error 时已有通用失败提示。因此不能将 #396 的“无播放时间推进”推断成每次都永久 pending，也没有以修改文案宣称修好解码。

当前 [Chromium](../evidence/web-audio-preview-recovery/chromium.json)和 [Firefox](../evidence/web-audio-preview-recovery/firefox.json)经实际显式／键盘播放，时间推进、停止、再听、自然结束和关闭释放均通过。[Windows WebKit](../evidence/web-audio-preview-recovery/webkit.json)仍有 code 4／NotSupportedError、播放时间为 0，**试听兼容未通过**；通过的是错误反馈和可恢复操作。报告跨音频元素记录真实事件与原生 Promise 结果，没有派发假播放事件。读取不返回、校验不返回、权限拒绝和播放无进展等分支由受控单元测试覆盖，不冒充真实浏览器成功解码。

320×740、390×844、844×390 均核对原生控件与显式按钮可滚动到视区、按钮至少 44px 且无横向溢出；[窄屏结束反馈](../evidence/web-audio-preview-recovery/chromium-controls-320.png)和[短横屏错误恢复](../evidence/web-audio-preview-recovery/webkit-controls-844.png)已实际查看。桌面浏览器窗口尺寸验证不替代物理手机／Safari。

## 保存与交付

同份最终生产构建的三引擎来源任务报告在 [workflow](../evidence/web-audio-preview-recovery/workflow)：按需预览、配音原文对照、切换释放、原生错误后重新准备、草稿保留、应用、保存和重开。Chromium 还从界面导出 HTML、网站 ZIP 和两种内部制作交付包，并在新界面恢复来源记录。

验证副本的 voice_04 只添加内部测试依据 `PRIVATE_AUDIO_RECOVERY_397`；其余 65 个源条目原字节保持，manifest 只允许该依据变化。公开工程投影和全部 26 项媒体与 #395 相同，公开文件没有内部标记或台账；制作包恢复原 25 条未批准记录和 pending 依据。验证 HTML 原字节摘要与 #395 完全相同，临时下载核对后清理，不重发相同游戏。

正式接续仍为 [#394 工程](../evidence/web-story-plans-and-farewell/before-rain-stops-project.zip)、[#394 校订记录](../evidence/web-story-plans-and-farewell/before-rain-stops.worldreview)、[#395 HTML](../evidence/web-reading-press/before-rain-stops.html)及[#395 网站 ZIP](../evidence/web-reading-press/before-rain-stops-website.zip)。四份摘要与既有冻结值一致。9 场景／两结局、9,772 字符／87 演出／26 媒体及原存档边界保持；本批不重复登记完整玩家两路线或旧档验收。

## 测试与审计

[扩展回归](../evidence/web-audio-preview-recovery/related-tests.json)136 文件／1,202 项，[App 与自动保存](../evidence/web-audio-preview-recovery/app-tests.json)另有两文件／47 项，共 **138 文件／1,249 项不同测试通过，无失败或跳过**。其中新增 17 项试听恢复测试，覆盖读取／校验超时、取消、同步异常、显式请求、权限／格式拒绝、无进展、向后拖动、原生暂停／结束、旧请求与新请求隔离、重试和卸载清理。[45 项 Node 测试](../evidence/web-audio-preview-recovery/tool-tests.tap)通过；受控媒体测试不用于宣称实际声音成功。

类型检查、Editor／Player 双构建、118 便携／4 Node 文件架构和 N52-E5b 工程审计通过，产品验收仍 blocked；既有大 chunk／jsdom 媒体提示保持。没有登记全仓 check、远端完整 CI 或长期 soak 通过。

诊断中保留两份失败记录：基线断言错误地预设原控件仍停在就绪提示，实测已经显示 code 4 对应的失败提示后纠正假设；首次 WebKit 来源流程仍从已退役元素读取 src，导致等待不存在的 URL 撤销。后者改为观测真实 createObjectURL／revokeObjectURL，继续要求文件重新准备和释放，不放宽 Chromium／Firefox 的实际播放要求。最终通过报告均核对同一 Editor JS／CSS 构建，失败文件不作为通过依据。

[汇总审计](../evidence/web-audio-preview-recovery/audit.json)再次核对六份最终浏览器报告、全部回归、双格式交付边界、26 项原文件／九句配音关联和四份正式文件。**26 项发行条件仍 pending，已确认 0；25 条校订仍待人工批准。** 文档没有把作者预览成功转写为许可、自然听感或正式发行完成。

## 下一批顺序

1. 回到完整作品连续阅读、人物／配音节拍和演出衔接，处理能明确说明的内容或使用问题；没有实际问题不强行改写或升内容版本。自然全文、听感和篇幅计时继续待验。
2. 用同窗图片／试听与来源上下文核对 26 项真实发行依据及公开署名，尤其九句系统 TTS。资料不足保持 pending；需要换素材时走稳定 ID 替换，不沿用旧确认。
3. WebKit 音频解码与冷开设置偶发继续跟踪；物理主流手机／Safari、旋转／后台／锁屏、长期续读和获准 HTTPS 部署仍待完成。长篇完整校验成本保留，Windows／Android 原生仍搁置。

重放：`node tools/run-web-audio-preview-recovery.mjs --engine=chromium`（另用 firefox／webkit）；来源完整任务用 `SOURCE_PREVIEW_OUTPUT=evidence/web-audio-preview-recovery/workflow` 和 `SOURCE_PREVIEW_MARKER=PRIVATE_AUDIO_RECOVERY_397` 运行 `tools/run-web-source-preview.mjs`，默认界面 5195，可用 STUDIO_UI_URL 改址。基线属于构建前的 #396，不在当前构建重放旧 UI 断言。回归运行 `node tools/run-web-audio-preview-tests.mjs`，审计运行 `node tools/audit-web-audio-preview-recovery.mjs`；报告写入本批目录，不覆盖 #396。
