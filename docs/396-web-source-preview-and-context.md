# 396 素材来源核对中的预览与正文上下文

2026-10-18，接续 [#395](395-web-reading-press-ownership.md)。通读当前九个场景后，本批不改剧情和演出，转到下一项素材发行准备，解决核对来源时无法在同一窗口查看图片、试听实际配音及对照正文的问题。目标仍是 [#304 Web 完整 Gal 制作与交付](304-web-complete-gal-delivery.md)，作品 **1.11.0 候选**、技术 **S0.41** 保持；不是许可验收、Stable 或 M1 完成。

## 作者现在可以怎样核对

[原生产界面](../evidence/web-source-preview/baseline.json)选中当前 voice_04 后只有素材名、摘要和来源表单，没有图片／音频预览。核对文件时必须退出来源窗口，再到素材页找同一项，连续核对时容易失去上下文。

现在从发布页进入“核对素材来源”，可以在当前记录内完成以下操作：

1. 明确点击“查看当前图片”或“试听当前音频”才读取文件。图片保留等比完整预览；音频使用浏览器原生控制，不自动播放，不修改故事音乐或发行状态。
2. 展开“故事中的使用位置”，查看已提交的演出引用、场景和紧随的原文对白／旁白，角色名来自工程。这里只列源码引用，不把后续分支推断成实际路线，也不将旁边的文字当作音频转写；不跨跳转、其他演出或控制语句猜测正文，界面／封面／字体引用不计入该表。
3. 预览失败时可以明确重新准备；来源填写和其他素材的草稿仍保留。使用位置与预览不会代填确认依据、确认人、日期或公开署名。
4. 切换素材、关闭预览、打开手机素材选择列表、pagehide 或页面隐藏后，释放当前预览；返回不会自动重新播放。来源窗口关闭／替换文件后的迟到读取结果不创建新预览。

继续沿用已有素材预览的 SHA-256、长度、检查状态和大小限制：图片限已检查且不超过 8 MB 的 PNG／JPEG／WebP／GIF，音频限已检查且不超过 16 MB。其他类型到素材页或完整试玩中检查，不为预览扩大文件接收范围。只有 Asset ID 和当前文件摘要都与工程对应才提供预览，不拿旧台账文件替代当前文件；旧确认过期时仍需明确重新核对。

截图审查发现初版立绘的网格项会按原始比例撑高，图片被预览框裁掉。已将图片约束在明确的预览区域，按 contain 完整显示，而非只验证 URL 存在。最终核对 320×740、390×844、844×390 下实际图片和原生音频控件均可完整滚动到视区，预览／重试操作至少 44px，无横向溢出。[完整立绘](../evidence/web-source-preview/chromium-image-media-390.png)和[横屏音频](../evidence/web-source-preview/firefox-audio-media-844.png)已实际查看；桌面引擎窗口不等于物理手机验收。

## 当前素材事实与未完成事项

[逐项素材审计](../evidence/web-source-preview/media-audit.json)将当前工程索引、ZIP 中的原始 Blob、来源记录指定的仓库文件以及当前 #395 HTML 的媒体逐项对齐，26 项长度和 SHA-256 一致，没有改写或生成素材。九句配音对照原制作台词和当前脚本中的相邻对白；voice_04 明确使用 `voice-04-v1.7.wav` 及“出发的事明早确认，今晚的回信不用再等”，没有退回旧台词文件。

这证明文件与源记录对应，不是语音识别、真人听感或发行许可结论。**26 项 permission 均为 pending，已确认许可为 0**；依据、确认人、日期及公开署名均未代填。九句系统 TTS 的再分发条件、13 项生成式图片、三项程序合成音频及图标的所有者／署名／展示条件仍待核实。原 25 条剧情校订记录也未批准。

Chromium、Firefox 在当前来源窗口内点击原生控件后有实际声音时间推进；Windows WebKit 的 Blob 音频仍未开始，报告明确为 `nativePlayback:false`，没有以窗口可操作或无声回退算作试听通过。原生解码失败提示和重新准备路径另以无效 WAV 地址触发实际 error 检查，不伪造媒体事件；这不关闭既有 WebKit 内嵌音频或物理 Safari 未验项。

## 保存交付与当前接续文件

[Chromium](../evidence/web-source-preview/chromium.json)、[Firefox](../evidence/web-source-preview/firefox.json)、[WebKit](../evidence/web-source-preview/webkit.json)均使用当前完整工程，完成按需预览、当前配音原文对照、切换释放、手机列表收起、原生错误重试、草稿保留、明确应用及保存重开。每份报告核对实际服务的 Editor 页面、JS 和 CSS 与本次构建相同。

验证副本只在 voice_04 的内部待确认依据中添加测试标记。除 manifest 外的 65 个源条目逐字节保持，manifest 只允许这条依据变化（记录顺序规范化核对），26 项确认状态不变。保存重开后标记仍在；它没有写入正式源工程。

Chromium 另从真实界面导出 HTML、网站上传 ZIP 及两种内部制作交付包，再在全新界面导入制作包恢复来源记录。公开工程投影与全部 26 项媒体和 #395 一致；公开文件不含内部标记／台账、工程或玩家备份。内部交付包保留对应源工程、pending 依据、发布准备清单和原 25 条未批准记录。验证 HTML 与现有 #395 HTML 的原字节摘要也完全相同；网站 ZIP 的摘要另记，不假定每次打包字节相同。临时下载在核对后清理，仅保留报告摘要，没有重发无变化的正式游戏。

当前接续仍为 [#394 可编辑工程](../evidence/web-story-plans-and-farewell/before-rain-stops-project.zip)、[#394 校订记录](../evidence/web-story-plans-and-farewell/before-rain-stops.worldreview)、[#395 HTML](../evidence/web-reading-press/before-rain-stops.html)及[#395 网站 ZIP](../evidence/web-reading-press/before-rain-stops-website.zip)，四者前后摘要均核对保持。剧情／原存档边界沿 #394–#395；本批没有重跑完整玩家两路线、旧档或离线升级链，不把内部作者验证副本当作新的剧情候选。

## 回归与审计结论

[扩展回归](../evidence/web-source-preview/related-tests.json)覆盖 135 文件／1,185 项；[App 与自动保存](../evidence/web-source-preview/app-tests.json)另有两文件／47 项，共 137 文件／**1,232 项不同测试最终全部通过，无失败或跳过**。覆盖原 Runtime／Host／Core、连续阅读与存档、素材读入／预览／替换、来源表单、制作名单、发布、双导出、制作包恢复及离页保护。新增 14 项来源预览／上下文回归和一项图片失败／重试回归。[45 项 Node 测试](../evidence/web-source-preview/tool-tests.tap)包含新增六项逐文件／配音关联审计，拒绝旧摘要、缺失／重复记录、错误文件、旧 voice_04、错误对白／总线／相邻关系和擅自确认。

首轮扩展回归在浏览器与其他测试并行期间有两项既有 playback-advance 测试超过默认 5 秒，1183 通过／2 超时的[原报告](../evidence/web-source-preview/related-tests-first-run.json)保留。未修改 Runtime、放宽测试限时或跳过用例，随后按原范围完整复跑；最终结果以 related-tests 为准，不将重复运行累计成更多测试，也不据此宣布所有负载下的计时稳定性。

类型检查、Editor／Player 双构建、118 便携／4 Node 文件架构与 N52-E5b 工程审计通过；产品验收仍 blocked，既有大 chunk／jsdom 媒体提示保持。没有运行全仓 check、远端完整 CI 或长期 soak。

审计结论：本批沿 #395 第二项改善实际素材核对任务，没有更改剧情、玩家协议、发行确认规则或平台范围。[审计汇总](../evidence/web-source-preview/audit.json)再次核对同一生产构建、三个最终浏览器报告、全部回归、26 项文件／九句关联以及四份正式文件保留；重放为 `node tools/audit-web-source-preview.mjs`。文档区分文件可追溯、作者填写和真正发行验收，不把预览或技术 PASS 当成批准。

## 下一批顺序

1. 继续从完整作品实际阅读、人物／配音节拍和演出衔接处理具体问题；没有可说明的问题不强行改写或增加内容版本。25 条人工复核、自然全文／听感与篇幅计时保持待验。
2. 利用当前同窗预览与来源台账核对 26 项素材的真实发行依据和准确公开署名，尤其九句系统 TTS；没有可靠依据就保留待确认，需替换时走现有稳定 ID 的素材替换流程，不继承旧确认。
3. 继续跟踪 WebKit 冷开设置偶发与音频限制，稳定复现后处理；物理主流手机／Safari 的旋转、后台／锁屏、长期续读和获准 HTTPS 实际部署仍待完成。Windows／Android 原生继续搁置，长篇完整校验成本保留。

重放：生产预览默认 5195（可设置 STUDIO_UI_URL），`node tools/run-web-source-preview.mjs`，另加 `--engine=firefox`／`--engine=webkit`；作者验证使用临时副本，不覆盖正式工程／游戏。素材事实审计：`node tools/audit-current-rain-sources.mjs`。相关回归：`node tools/run-web-source-preview-tests.mjs`；不要与重型浏览器构建／其他大组测试并行后忽略超时。
