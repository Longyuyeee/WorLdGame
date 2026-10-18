# 399 媒体失败时保持阅读与明确恢复

2026-10-18，接续 [#398](398-web-choice-keyboard-and-readability.md)，按 [#304 Web 完整 Gal 交付](304-web-complete-gal-delivery.md)的实际运行问题推进。内容仍为 **1.11.0 候选**、技术 **S0.41**；本批处理完整作品中声音／画面失败后的阅读，不增加剧情、素材、存档协议或原生平台功能。

## 实际问题与用户操作

在 #398 原 HTML 的 568×320 横屏，用无效 WAV 地址触发真实媒体错误，浮动错误卡片覆盖正在阅读的正文。[原包复现](../evidence/web-reading-media-recovery/baseline-chromium.json)和[遮挡截图](../evidence/web-reading-media-recovery/baseline-chromium-error-covers-reading.png)保留。上一批的分支区域已经改为内联恢复，但普通旁白／对白仍有这个问题。

现在普通阅读发生失败时，画面操作区显示“媒体问题”，同时提供无障碍通知，不自动打开详情或挤走正文。点击它，或从普通菜单进入，可在现有阅读菜单顶部查看实际失败声音名称、解释和恢复操作。Canvas 舞台的失败／超时／预算不足也进入这里，保持不同原因的提示，不把预算不足说成文件损坏。

玩家可以直接返回，继续手动读原段落；也可以明确重试、先无声阅读，再返回原段落和本段阅读位置。声音重试只替换失败音轨，健康背景音乐保持；画面重试沿原资源重建流程。无声阅读仍是本次会话选择，停止 Auto，不改变个人音量、剧情或图片失败状态，不自动批准或修复资源。

手机故障状态优先保留媒体问题、恢复声音、停止自动和菜单。欣赏画面临时收进菜单，H 快捷键保留；菜单中的按钮同样至少 44px，暂停宿主不可启用。返回菜单沿原 Auto 暂停边界，重新开始阅读等待；没有为了保持旧的计时断言绕过菜单暂停。分支仍沿 #398 的可滚动内联故障卡片，不改答案或确认方式。

## 验证与交付

最终作者流程在 [release-work/browser-checks.json](../evidence/web-reading-media-recovery/release-work/browser-checks.json)：生产编辑器实际导入 #394 工程／25 条记录，保存、关闭、刷新重开并双格式导出。源工程原字节及校订内容保持，公开工程投影与全部 26 项媒体和 #398 深比较一致，网站 37 文件逐项长度／摘要对齐，没有内部工程、校订或玩家备份混入。

桌面本地 HTML 留下路线、390px 断网网站远行路线各核对 66 段正文完整 ID 和六句原生语音自然结束，包含 Auto、历史回看、保存、刷新、明确读取后停止 Auto，以及 #394 同内容原备份导入接续。输出静音，不等于自然听感／完整篇幅计时，也不是全部格式与路线交叉矩阵。

[Chromium](../evidence/web-reading-media-recovery/chromium.json)、[Firefox](../evidence/web-reading-media-recovery/firefox.json)、[Windows WebKit](../evidence/web-reading-media-recovery/webkit.json)检查 568×320、320×740、390×844、844×390、1280×900，问题入口／菜单／恢复按钮可达且至少 44px；故障时实际触摸点按先翻本段下一屏，菜单返回、重试、无声阅读保持同一 hash／段内偏移。另在原生图像解码输入边界注入损坏 PNG，验证 Canvas 故障保留、无声后仍可画面重试，以及 320px 下图片失败＋无声＋Auto 的四个按钮均可见可点。没有伪造 error／ended、正文状态或几何。

三引擎 [choices](../evidence/web-reading-media-recovery/choices)沿 #398 保留的 #395 原分支备份核对相同 hash／游标 54、长按确认停在选择、方向键／数字、明确提交以及提问／错误布局。普通阅读的故障详情进入菜单，分支恢复仍在滚动选择区。当前作品布局截图已实际查看；不将这些结果扩大为所有自定义布局／配色验证。

[press 三引擎报告](../evidence/web-reading-media-recovery/press)使用未修改的真实时钟，验证按住正文期间生产 Auto 换段，松手不误跳／停止 Auto，新的点按才接管；同时核对 H 返回、真实键盘、横屏拖动不翻段／触摸先翻本段，以及旋转和菜单返回。Firefox 的受控时钟测试仍失败，详见下节，不把真实时钟结果当成该失败已关闭。真实时钟只是这组操作的调度方式，不是全文人工计时、真实听感或物理设备验收。

[最终扩展回归](../evidence/web-reading-media-recovery/related-tests.json)为 138 文件／1,234 项，[App 与自动保存](../evidence/web-reading-media-recovery/app-tests.json)另两文件／47 项，共 **140 文件／1,281 项不同测试通过，无失败或跳过**；专项与独立 Shell 复跑不重复累计。[48 项 Node 测试](../evidence/web-reading-media-recovery/tool-tests.tap)通过。浏览器任务结束后以单 worker、原范围、默认限时运行，没有扩大用例时限。类型检查、Editor／Player 双构建、118 便携／4 Node 文件架构审计及 N52-E5b 工程审计通过，产品验收仍 blocked。既有 chunk／jsdom 提示保留；未登记全仓 check、远端完整 CI 或长期 soak 通过。

[汇总审计](../evidence/web-reading-media-recovery/audit.json)核对最终三引擎的普通阅读／分支／真实时钟指针九份报告与同一 HTML 摘要、作者完整路线与双导出、同内容原备份、媒体原字节及来源／校订未批准边界；同时保留首轮失败与 Firefox 受控时钟失败，不将它们覆盖成通过。提升后再以正式路径重跑审计通过。没有改 Core／Runtime 的剧情解释、存档校验、声音等待策略或发布权限。

新增 11 项普通阅读媒体恢复用例，最初九项先在旧代码全部失败，[红色基线](../evidence/web-reading-media-recovery/baseline-tests.json)保留，另两项补 Canvas 预算故障／无声隔离。首轮扩展回归为 [1,231 通过／3 失败](../evidence/web-reading-media-recovery/related-tests-first-run.json)：三条既有舞台测试仍直接查找正文外浮层中的恢复按钮，或未打开详情就断言具体超时文案。按实际新菜单入口迁移，保留停止 Auto／Skip、暂停、超时取消、资源重试和剧情／健康音轨不变断言；[独立 Shell 82 项复测](../evidence/web-reading-media-recovery/shell-tests.json)已通过，再按原范围和默认限时完整复跑，不合并重试次数为更多测试。

本批正式运行入口为 [HTML](../evidence/web-reading-media-recovery/before-rain-stops.html)与[网站 ZIP](../evidence/web-reading-media-recovery/before-rain-stops-website.zip)，其[交付摘要](../evidence/web-reading-media-recovery/delivery.json)和[审计](../evidence/web-reading-media-recovery/audit.json)仅在最终同一对字节通过后发布。HTML 46,788,329 字节，SHA-256 `00feefe7cdd763bdea8924b5dbdd664dc6f7be03f565025746bd4d3725343f74`；网站 ZIP 35,374,778 字节，SHA-256 `d322ab25ade9bcc897dca6b17dc7288e777b8f9438170e113b0da815593e6de3`。

源工程与 25 条待人工记录沿 [#394](../evidence/web-story-plans-and-farewell)。九场景、两结局、9,772 字符、87 步演出、26 项素材及其 ID 保持，没有为界面修复增加剧情版本。旧 #394／#398 候选保留。

本轮开发期间，最初浏览器脚本假定舞台一定有 IMG，实际为 Canvas，定位超时后改为在浏览器图像解码输入边界注入损坏图片，不伪造 error／ended、剧情或几何。截图审查还补齐了菜单内“欣赏画面”的点击高度和暂停保护，最终必须重新导出、重新复测，不能沿用较早工作包摘要。

中间 work／visual-pass／final-work 的制作与完整路线报告保留作开发证据，不作为新的运行入口或累计验收次数。只提升 release-work 中最终九份浏览器报告、作者完整路线、回归和摘要对齐的同一对游戏；先核对所有待清理暂存文件摘要和直接子目录／非链接边界，再提升，最终两份核对完成后才删除本批暂存双游戏，保留报告／截图／原备份。冻结历史候选不删除。

## 尚未通过与下一批顺序

Windows WebKit 的内嵌音频解码／重试播放仍未通过。测试区分原生 error、播放 Promise 失败和观察期内没有进展；恢复入口能操作不等于声音已播放。不能用 Windows WebKit 或桌面触屏尺寸替代物理手机／Safari、自然听感与 20–30 分钟人工阅读计时。

受控时钟的 Firefox 指针复验两次出现恢复保护保存超时，提示拦截点按，包括其他浏览器结束后的[独立复测](../evidence/web-reading-media-recovery/press/isolated-firefox-controlled-storage-timeout.json)，不是仅由并行负载造成的已知结论。原失败报告／截图均保留。这是本机存储等待／计时问题的实际观察，独立追踪；真实时钟通过也不登记受控时钟通过或已修复，不隐藏提醒、强制穿透点击或放宽产品超时。

1. 继续完整作品的连续阅读、人物／语音节拍与演出衔接，先处理实读中的问题；同看本轮恢复保护超时是否在普通真实时钟／长期阅读中复现。25 条人工复核、自然听感和全文计时仍待验，不为重复验证升剧情版本。
2. 核对 26 项真实发行依据、九句系统 TTS 的再分发条件与公开署名。全部 pending、已确认 0；没有依据不写成许可通过，需要替换时沿稳定 ID 流程。
3. 继续 WebKit 声音、冷开设置偶发与物理主流手机／Safari 的旋转、后台／锁屏、长期续读，之后做获准 HTTPS 实际部署。长篇完整校验成本仍开放；Windows／Android 原生搁置。

## 重放

普通阅读专项：`node tools/run-web-reading-media-recovery.mjs`，另加 `--engine=firefox`／`--engine=webkit`；`--baseline` 使用冻结 #398 原 HTML。专项接受 STUDIO_READING_MEDIA_SOURCE_HTML／STUDIO_READING_MEDIA_OUTPUT_DIRECTORY，不修改冻结游戏。

回归：`node tools/run-web-reading-media-recovery-tests.mjs`；审计：`node tools/audit-web-reading-media-recovery.mjs`。作者导出沿 tools/run-web-auto-voice-continuity.mjs，须指定新的 STUDIO_AUTO_CONTINUITY_OUTPUT_DIRECTORY 和 `STUDIO_AUTO_CONTINUITY_SOURCE_DIRECTORY=evidence/web-story-plans-and-farewell`，生产预览默认 5195；禁止覆盖既有候选。

分支复验沿 tools/run-web-choice-keyboard.mjs，使用 STUDIO_CHOICE_KEYBOARD_SOURCE_HTML／STUDIO_CHOICE_KEYBOARD_OUTPUT_DIRECTORY 指向本批，默认备份仍读 #398 保留的原分支文件；明确指定的 HTML 缺失会失败，不偷偷换用另一个包。指针复验沿 tools/run-web-reading-press.mjs，使用其 STUDIO_READING_PRESS_SOURCE_HTML／STUDIO_READING_PRESS_OUTPUT_DIRECTORY，本批最终加 `--real-time`，不安装受控时钟；默认受控时钟的 Firefox 失败仍开放。运行新批次必须设置新输出路径，不覆盖旧批报告。
