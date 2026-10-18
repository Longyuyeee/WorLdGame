# 392 完整作品的历史回看与分支上下文

2026-10-18，接 [#391 第一项](391-web-load-wait-and-cancellation.md)回《雨停之前》完整阅读流程，处理“回看刚才的话”和“回退改变阅读位置”混淆，以及历史里的人物、选择信息缺失。目标仍为 [#304 完整 Web Gal 制作与交付](304-web-complete-gal-delivery.md)，**作品 1.10.0 候选／技术 S0.41**；本批不改剧情、演出、素材或发行许可，不宣布 Stable／M1 完成。

## 实际问题与现在的操作

在 [#390 实际下载游戏](../evidence/web-voice-reading-continuity/before-rain-stops.html)中走到“留下”路线，打开历史查找林远的“进去读吧。我想先把今天的话说完。”：记录只有“对白 · 已读”，没有人物名；点击文字后，正式历史 cursor 从 65 回到 16。查找“今晚留下，把回信写完”则没有结果，历史只索引了选择提示，没有记录已选答案的阅读信息。[原版复现](../evidence/web-history-reading/baseline.json)及[截图](../evidence/web-history-reading/baseline-speaker-and-reading.png)保留实际 hash、cursor 与原 HTML 摘要；#391 没有修改这部分历史界面。

现在历史正文是可阅读、可选中的文本，点击正文或查找不会移动剧情。可回退的已读记录单独显示“回到这一句”；玩家明确点击后仍由原 Core 执行回退、恢复当前演出和语音，并停止自动／快进。当前句明确标为“当前”，不再提供无意义的自回退按钮；前方、归档和不可逆边界外的记录保持只读，查找不能给它们增加回退权限。

对白沿用实际阅读界面的角色名称，缺失／空名称回退为“对白”，不把内部角色 ID 当成人物名。查找同时支持人物名、正文、已选选项和结局，保持大小写／全半角归一、正文与注音查找。人物名不是全篇说话人推断：只有正式 dialogue 记录有角色标识，旁白中引用的话不会被擅自归给角色。

选择记录显示“已选择”的实际标签，回到尚待选择的位置则显示“等待选择”，不会借用记录中尚未在当前 cursor 消费的未来输入。换另一条路线后，活动历史显示本路线答案；归档显示其自己确有记录的答案，不能变成可回退的新入口。

手机短横屏压缩历史页装饰标题和重复搜索说明，保留有可访问名称的搜索框、清除、关闭与至少 44px 的回退操作。回退目标提示、已选答案和操作须能同时处于正文滚动区内；不是只验证按钮能点击。搜索标签及状态仍供读屏使用，较高窗口保留完整可见说明。

只读卡片沿用历史页的文字颜色，不再继承旧深色按钮专用的浅字色；纸色主题正文、人物、答案和操作保持可读。高对比模式明确使用黑底白字，保持作者自定义历史页与普通页面的卡片边界。

## 选择信息的依据与边界

新增的是 Shell 阅读用投影，不是故事解释器。只在历史页打开时，从已经成立的 Core 历史中配对 choice 与紧随其后的正式 `choiceSelected` 输入，核对连续历史索引、instructionId 与 optionId；活动记录还必须在当前 cursor 之前确已消费。显示文字取当前历史快照的选项标签，因而跟随快照语言，不用源语言旧标签覆盖译文。

活动历史和每个 archiveId 分别保存临时查找映射，不按相同 originalEntryId 把不同分支混在一起。缺输入、索引断开、未知选项或边界处没有配对记录时，不推断答案；旧归档未保留的结果不会补造。内存整理和正式保存／读取后仍从各自实际记录重新投影，不写入新的存储字段。

Core／Host／Runtime、正式历史和存档协议均未修改；原始事件、输入、完整历史、归档、校验及 Meta 合并规则保持。关闭历史时不建立选项映射，不给每次普通阅读额外扫描全篇；历史仍按每页最多 40 条显示，未减少正式保存内容。本批不重跑 #391 性能比较，也不宣称长篇计算提速。

## 作品与文件接续

创作源和人工记录继续使用 [#384 原工程](../evidence/web-story-arrival-and-night/before-rain-stops-project.zip)与[23 条待人工复核记录](../evidence/web-story-arrival-and-night/before-rain-stops.worldreview)。工程 SHA-256 仍为 `331a1b404ee39b89680a6a7a2c0d22dd7279b3b87ab9b60d4b5fe1a253baf5e8`。九场景、90 段旁白、九句对白、两结局、9,753 字符、86 演出、26 媒体及全部来源条件保持。

可下载运行候选仍沿 [#390 HTML](../evidence/web-voice-reading-continuity/before-rain-stops.html)和[网站 ZIP](../evidence/web-voice-reading-continuity/before-rain-stops-website.zip)。本批当前代码另经生产编辑器实际双导出，摘要见 [artifact-audit.json](../evidence/web-history-reading/work/artifact-audit.json)，不是覆盖旧候选。要在游戏中看到 #391 的取消读取与本批历史流程，需要用最新代码重新导出。同内容原 1.10.0 备份继续实测，不扩大到 1.9.0 或更早剧情存档兼容。

## 验证与审计

[1,045 项相关回归／113 文件](../evidence/web-history-reading/related-tests.json)通过，沿 #391 保留完整 Runtime／Host／Core、正式保存／恢复／备份、历史传输、Auto／快进、正文／语音接续、作者预览和双导出范围，新增 15 项历史阅读上下文专项。专项覆盖人物／注音／已选项查找、纯回看不导航、独立回退、当前／未来只读、归档隔离、正式保存／加载／内存整理、缺失配对不猜测、名称回退及快照语言。畸形配对测试是 UI 投影的防御检查，不替代正式存档验证。

类型检查、Editor／Player 双构建、23 项 Node 工具测试、118 便携／4 Node 适配文件架构及 N52-E5b 工程审计通过。既有 chunk 警告、jsdom 媒体方法提示和 N52 产品待验状态保持；没有运行全仓 check、远端完整 CI、全部版本升级或长期 soak。

最终样式收尾后，另重跑 [38 项 UI 定向回归](../evidence/web-history-reading/final-ui-regression.json)通过；它们是上述范围的子集，不另累计测试总数。纸色与高对比截图均实际查看。

[Chromium](../evidence/web-history-reading/chromium.json)、[Firefox](../evidence/web-history-reading/firefox.json)和[Windows WebKit](../evidence/web-history-reading/webkit.json)各七组专项通过，用同一当前 HTML 从实际入口游玩，检查人物与所选分支、正文点击不回退、四尺寸目标／答案／44px 操作同时可见、纸色与高对比文字颜色、回到选择点后不借未来输入、旧路线只读、刷新独立恢复及再读取原槽位后各自重新显示正确答案。原槽位规范字节长度／SHA、artifact／Runtime hash 在回看和搜索期间保持；Escape 先清除查询再关闭。使用即时文字和“本次先无声阅读”隔离历史操作，不把 WebKit 此项通过当作内嵌 data／Blob 原生音频通过。最终各引擎与同一实际导出摘要吻合，见 [任务矩阵](../evidence/web-history-reading/browser-matrix.json)。

[完整作品七组任务](../evidence/web-history-reading/work/browser-checks.json)继续实际导入原工程与 23 条记录、保存重开、双格式导出、核对全部内容／26 媒体及网站 37 个公开文件；本地 HTML 留下路线和断网 390px 网站远行路线各 66 段正文／六句原生语音，合计两结局，另核对原 1.10.0 备份明确导入和读取。不是全部格式×路线×引擎组合或人工听感验收。临时游戏验证后清理，保留原备份、摘要与截图，不覆盖旧交付。

审计结论：回看与回退操作已经分开，新增上下文只展示有实际依据的既有记录；查找、文字点击或旧分支记录不会绕过 Core 导航权限。没有修改原文、推断旁白说话人、把旧分支选择套到当前分支，或写回新的存档内容。仍保留 23 条人工复核、自然全文／听感与计时、26 项发行条件、物理手机／Safari、长期运行及获准 HTTPS 公网验收；#390 WebKit 内嵌音频未通过项不关闭。

重放：`npm run audit:web-history-reading`；`npm run audit:web-history-reading:browser`。后者先构建 Editor，需要默认 5195 对应的生产预览（可用 `STUDIO_UI_URL`，启动方式见 #389），自动从原工程制作、完成作品七组任务，再执行三引擎历史专项、核对统一摘要，成功后清理本次临时游戏。`node tools/run-web-history-reading.mjs --baseline` 只复现 #390 下载候选，不覆盖它。单独调试当前游戏可设置 `STUDIO_AUTO_CONTINUITY_OUTPUT_DIRECTORY=evidence/web-history-reading/work` 先运行 `node tools/run-web-auto-voice-continuity.mjs`，再运行历史专项。

## 下一批顺序

1. 将 #391–#392 当前代码统一纳入新的可下载运行候选，先实际复验完整作品、同内容备份、正文／声音中断恢复及发布文件一致性，再更新下载入口，保留旧候选。
2. 继续整篇连读和演出复核，只处理有依据的具体问题。23 条人工记录、自然阅读／听感和篇幅计时仍须真实确认，不能靠自动路线或已修改状态自行批准。
3. 继续发行条件、物理主流手机／Safari、长期连读和获准 HTTPS 实际部署；没有授权不上传。#391 长篇完整校验成本继续跟踪，Windows／Android 原生仍搁置。
