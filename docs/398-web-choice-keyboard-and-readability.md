# 398 分支选择的键盘操作与可读性

2026-10-18，按 [#397](397-web-audio-preview-recovery.md)第一项回到《雨停之前》的连续阅读，修复到达分支时的误选、键盘导航及提问可读性。目标仍是 [#304 Web 完整 Gal 制作与交付](304-web-complete-gal-delivery.md)；内容 **1.11.0 候选**、技术 **S0.41** 不变。本批重新导出运行候选，不改剧情、演出、素材或存档协议。

## 原包问题与修复

[#395 原游戏复现](../evidence/web-choice-keyboard/baseline-chromium.json)中，玩家按住 Enter 连读到分支，重复按键会借用新选项的原生按钮激活，直接进入“今晚留下”；空格在重复按下后松开也会误选。选项自动获得焦点后，方向键和数字键反而被统一按钮过滤逻辑挡住。此前只向 window 发键的测试没有覆盖实际焦点目标。

现在先处理当前选项的键盘输入，再应用其他按钮／编辑控件的隔离规则：

- 上下方向键只移动焦点和选中状态，支持首尾循环，不提交路线。方向键连续移动不受“允许长按推进普通文本”限制。
- Enter／空格或 1–9 的有效数字需重新按下，重复键在选择界面被阻止，包括浏览器按钮默认激活；普通正文仍遵守原长按推进设置。
- 确认使用键盘权限，而不是上一次触摸／鼠标来源；不接管菜单、其他按钮、输入框、IME 或组合键。指针、触摸、手柄仍走原入口，后台／读取／面板的操作边界保持。

截图审查还发现纸色主题的提问沿用白字，落在浅纸色上难以阅读；[初稿短横屏](../evidence/web-choice-keyboard/first-pass-error-overlap.png)的声音错误会遮住提问和选项。修正后，提问使用主题文字与有底色的卡片，自定义皮肤沿用自身窗体／文字颜色，高对比保持黑底白字。选择区改为有限高度、可滚动的区域，媒体错误放在选项下方，仍保留重试和本次无声阅读，不压住分支，也不自动替玩家选答案。

当前作品在三个引擎、320×740／390×844／844×390 下，提问颜色与不透明底色的计算对比均超过本批 4.5 检查线，选项和错误恢复按钮至少 44px，焦点选项可滚动到视区，错误卡片不覆盖选项。[窄屏提问](../evidence/web-choice-keyboard/chromium-prompt-320.png)与[短横屏分支](../evidence/web-choice-keyboard/webkit-choice-844.png)已实际查看；这是当前作品的几何／配色检查，不是任意自定义配色或物理手机验收。

## 制作与当前交付

生产编辑器实际导入 #394 工程及 25 条记录，保存、关闭、刷新重开，再导出 HTML 和网站 ZIP。源工程原字节和校订内容保持；新游戏完整公开工程投影及 26 项媒体与 #395 深比较一致。网站仍 37 个公开文件，build-info 的长度／摘要逐项对应，没有加入工程、内部校订或玩家备份。

| 用途 | 当前入口 |
| --- | --- |
| 本批已测试的运行候选 | [HTML](../evidence/web-choice-keyboard/before-rain-stops.html)、[网站 ZIP](../evidence/web-choice-keyboard/before-rain-stops-website.zip) |
| 原字节可编辑工程及内部来源台账 | [#394 工程](../evidence/web-story-plans-and-farewell/before-rain-stops-project.zip) |
| 25 条待人工复核记录 | [#394 校订文件](../evidence/web-story-plans-and-farewell/before-rain-stops.worldreview) |
| 交付摘要与审计 | [delivery.json](../evidence/web-choice-keyboard/delivery.json)、[audit.json](../evidence/web-choice-keyboard/audit.json) |

HTML 为 46,786,769 字节，SHA-256 `1993d4da00f96063f1f25d0cca382f630c874e5d11055f2665f3c73221c11c93`。网站 ZIP 为 35,373,218 字节，SHA-256 `eeec07e8152cc7613886f8d4f85dd0d7936f5677bdfd24856b8441c4452eb92c`。

九场景、两结局、9,772 字符、87 步演出、26 项媒体和全部原 ID 保持，#394／#395 旧游戏均保留。新候选只提升最终复测的同一对字节；双目标先核对，已有不同文件拒绝覆盖。交付工具支持指定当前批次的直接子暂存目录，并拒绝链接／junction，不删除另一份工作文件。初稿验证包在最终文件通过后按摘要核对清理，保留其报告和纠偏截图，不作为正式候选。

## 实际游玩与回归

[最终制作与完整路线](../evidence/web-choice-keyboard/final-work/browser-checks.json)中，桌面本地 HTML 走留下路线，390px 断网网站走远行路线，各核对 66 段正文完整 ID 顺序及六句原生语音自然结束，包含 Auto、历史回看、保存、刷新和明确读取。输出静音，运行结束不等于自然听感／20–30 分钟篇幅计时；不是全部格式与路线的交叉矩阵。两项独立音频故障恢复沿原工具复验，没有合成 ended／error 事件。

[#394 同内容段落备份](../evidence/web-choice-keyboard/final-work/original-1.11.0.worldsave)已明确导入新网站读取。另从 #395 真正停在分支时导出[原分支备份](../evidence/web-choice-keyboard/original-choice-1.11.0.worldsave)，在 [Chromium](../evidence/web-choice-keyboard/chromium.json)、[Firefox](../evidence/web-choice-keyboard/firefox.json)、[Windows WebKit](../evidence/web-choice-keyboard/webkit.json)分别加载，恢复同一 hash／游标 54，再导航并明确选择远行。各引擎还核对 Enter／空格长按停在分支、重新确认只进入首段、方向键循环、数字选择、错误后无声阅读保留原选择和高对比。原 #395 指针误跳保护在同一最终 HTML 的 [press 报告](../evidence/web-choice-keyboard/press)复验，没有为键盘修复丢掉鼠标／触摸／段内翻页行为。

三个引擎的错误布局检查使用无效 WAV 地址触发真实媒体 error，再明确选择无声阅读；这不修改索引文件或伪造剧情。**Windows WebKit 内嵌音频解码仍未通过**，这些静音／故障任务不作为 Safari、自然听感或真机结论。

[扩展回归](../evidence/web-choice-keyboard/related-tests.json)137 文件／1,223 项，[App 与自动保存](../evidence/web-choice-keyboard/app-tests.json)另两文件／47 项，共 **139 文件／1,270 项不同测试通过，无失败或跳过**。新增 21 项分支输入／错误恢复测试；最初 19 项中的 16 项先在旧代码失败，[红色基线](../evidence/web-choice-keyboard/baseline-tests.json)保留，不将重复运行累计为更多测试。[48 项 Node 测试](../evidence/web-choice-keyboard/tool-tests.tap)包含新增三项指定暂存目录、越界目录与 junction 保护。类型检查、Editor／Player 双构建、118 便携／4 Node 文件架构及 N52-E5b 工程审计通过；产品验收仍 blocked。既有 chunk／jsdom 提示保持，没有登记全仓 check、远端完整 CI 或长期 soak 通过。

首轮扩展回归的既有 Auto 等价性测试在控制台报告默认 5 秒超时，1,222 通过／1 失败的[完整 JSON](../evidence/web-choice-keyboard/related-tests-first-run.json)保留，失败用例耗时约 5,640 ms。该 JSON 报告器的 failureMessages 只存 STACK_TRACE_ERROR，不保留控制台的超时原文；汇总审计纠正了最初匹配原文的假设，核对具体用例和耗时，不改写原报告。没有修改 Runtime、放宽时限或跳过用例，浏览器任务结束后按原范围完整复跑，最终结果见 related-tests；这不关闭所有负载下的计时稳定性问题。

审计未发现向原生平台或无关系统偏移。本批改分支输入和呈现，不改 Core／Runtime 的剧情解释、保存验证或声音等待策略。[素材审计](../evidence/web-choice-keyboard/media-audit.json)仍是 26 项原文件／九句配音关联，**26 项发行条件 pending、已确认 0，25 条校订未获人工批准**。

## 下一批顺序

1. 继续完整作品连续阅读、人物／配音节拍与演出衔接，优先实际路线中的问题；自然全文、听感、篇幅计时和 25 条人工复核继续待验，不为重复测试升剧情版本。
2. 核对 26 项真实发行依据、九句系统 TTS 的再分发条件和公开署名。依据不足保持 pending，需要替换时沿稳定 ID 流程处理。
3. 继续跟踪 WebKit 音频与冷开设置偶发，补物理主流手机／Safari 的旋转、后台／锁屏与长期续读，再做获准 HTTPS 实际部署。长篇完整校验成本保留，Windows／Android 原生仍搁置。

重放：`node tools/run-web-choice-keyboard.mjs`，另加 `--engine=firefox`／`--engine=webkit`；`--baseline` 会复验 #395 并重新生成原分支备份。扩展回归 `node tools/run-web-choice-keyboard-tests.mjs`；审计 `node tools/audit-web-choice-keyboard.mjs`。重做作者导出须为 `tools/run-web-auto-voice-continuity.mjs` 设置新的 STUDIO_AUTO_CONTINUITY_OUTPUT_DIRECTORY 和 `STUDIO_AUTO_CONTINUITY_SOURCE_DIRECTORY=evidence/web-story-plans-and-farewell`，生产预览默认 5195；不要覆盖既有报告或冻结候选。正式提升须六份最终浏览器报告和回归对齐，再使用审计的 `--promote`，不把初稿、player-only 或旧摘要当成新的作者完成记录。
