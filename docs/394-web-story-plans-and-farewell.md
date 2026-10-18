# 394 远行见面计划与送别雨声

2026-10-18，按 [#393 第一项](393-web-reading-delivery-candidate.md)回到完整作品的正文和演出衔接。通读九个场景、原 23 条记录，再运行原下载游戏后，修正远行路线备用计划没有交代、送别后雨声仍沿用站台强度两处问题，通过实际编辑器制作 **《雨停之前》1.11.0 内容候选**。目标仍为 [#304 Web 完整 Gal 制作与交付](304-web-complete-gal-delivery.md)，技术 S0.41；不修改 Editor／Player／Runtime 产品代码，不宣布 Stable 或 M1 完成。

## 玩家实际遇到的问题

| 问题 | 处理 |
| --- | --- |
| 远行路线 217 段问“雨天的第二个计划”，具体安排却只在未走过的留下路线 133 段出现；234 段又直接按第二个计划行动 | 在远行自己的见面筹备中明确“先去海边，风雨太大则找店坐下继续说话”，让后文的备用安排有本路线依据；不改另一分支、不增加正确答案暗示 |
| 小夏上车后的 246 段写“雨比刚才小了”，环境音仍继承送别站台 10% 的雨声 | 小夏按原指令退场后，此段前用原 soft_rain 改为 6%；前面的送别仍为 10%，夜间回房仍按原指令停止。这里是作者音量设置，不把静音自动测试当作自然听感验收 |

[原 1.10.0 实际路线](../evidence/web-story-plans-and-farewell/baseline.json)完整走到远行结局，保留正文、实际背景／人物／环境音状态及横竖屏截图。217 段到达前没有走过 133 段，不是把两条路线拼在一起判断问题。精确编辑意图见 [editorial-v1.11.mjs](../assets/rain-story/editorial-v1.11.mjs)，它只作审计期待，不生成候选 ZIP。

两条问题先在真实预览中记录，再从写作和权威脚本修改，分别验证撤销／重做。原 23 条记录逐条不变，新增两条 fixed、checkedSourceHash 为 null；**25 条仍待人工复核**，没有自动批准旧记录或自然听感。

## 当前交付与旧版接续

| 用途 | 当前文件 |
| --- | --- |
| 可编辑工程、26 项媒体和内部来源台账 | [工程 ZIP](../evidence/web-story-plans-and-farewell/before-rain-stops-project.zip) |
| 独立单文件游戏 | [HTML](../evidence/web-story-plans-and-farewell/before-rain-stops.html) |
| 仅含公开文件的网站上传包 | [网站 ZIP](../evidence/web-story-plans-and-farewell/before-rain-stops-website.zip) |
| 25 条待人工复核记录 | [校订记录](../evidence/web-story-plans-and-farewell/before-rain-stops.worldreview) |
| 版本、内容、媒体和文件摘要 | [产物审计](../evidence/web-story-plans-and-farewell/artifact-audit.json) |

九场景、90 段旁白、九句角色对白、两结局和 26 项媒体保持。内容为 **9,772 字符、87 步演出**：只改一段旁白、新增一条环境音指令，全部原 ID、选项标签／目标、九句配音和原演出次序保持。非脚本文件除发布版本外逐字节不变，媒体及来源权限没有重生成或改写。公开网站仍只有 37 个文件，不含工程、内部记录、制作包或玩家备份。

工程 SHA-256 为 `43ef6e1673ed3dffbf705b4f178b2122fc960971eaf47286b33742fa285f0576`；HTML 为 `6e5dfb4dfb88b5e210354fbcaeb8ccc4e79d50aa935a1d449f750bde8fc822fa`；网站 ZIP 为 `25ef0ab90a396f01dcfb09e60f754fb31a82f59aedb8da869b4a199a59e8f19e`；校订记录为 `747534249345da6ce337054b4e7f47a1516556beda7079ef7b6d093e590bce8f`。正式提交前另核对暂存区原字节，HTML／记录禁用 Git 行尾转换。

剧情和演出变更后没有登记 1.10.0 存档兼容。发布界面实际核对原工程并提示内容变化；新游戏实际选择原 1.10.0 备份后提示拒绝，不提供写入入口，标题及 IndexedDB 槽位保持。需要继续旧进度时，使用保留的 [#393 HTML](../evidence/web-reading-delivery/before-rain-stops.html)、[旧网站 ZIP](../evidence/web-reading-delivery/before-rain-stops-website.zip)和 [#384 原工程](../evidence/web-story-arrival-and-night/before-rain-stops-project.zip)，不要强导入新剧情。本批没有实测完整旧版离线更新链，不能把保留文件当成浏览器缓存永久保留。

## 实际制作和阅读验证

[七组制作与玩家任务](../evidence/web-story-plans-and-farewell/browser-checks.json)从生产编辑器的实际构建入口开始，覆盖问题记录、正文与脚本编辑、撤销／重做、两个完整编辑器入口路线、保存重开、双格式导出和制作包重导入。两种制作包均核对同一源工程、25 条待复核记录和两个真实入口结局记录；不是脚本直接改包后绕过编辑器。

独立桌面本地 HTML 走留下路线，390px 断网网站走远行路线，各 66 段正文／六句原生语音，合计两结局。远行七个演出点核对本路线计划、见面前夜、雨中改计划、送别、退场后弱雨及夜间回房；原生环境音确有播放，输出静音。改动处均查看 390px／844px 横竖屏截图；舞台仍沿原等比布局，没有借此扩外观功能。

[冻结文件补充复验](../evidence/web-story-plans-and-farewell/player-only-checks.json)又按源场景顺序逐项核对两条路线的全部正文 ID、七个远行演出点、两个不同结局和三个保存／回退／刷新／明确读取位置。246 段读回后小夏仍已退场、雨声仍为 6% 且由原生媒体继续播放；不是恢复到旧站台状态。旧备份拒绝前后的 IndexedDB 槽位键也实际比对。此复验不重做作者操作或制作包，文件摘要与原制作产物一致。

## WebKit 冷启动设置复核

[#393 的一次设置未打开超时](393-web-reading-delivery-candidate.md)继续保留。本批旧 1.10.0 做 [20 次新上下文检查](../evidence/web-story-plans-and-farewell/webkit-cold-title-baseline.json)，新 1.11.0 分别做 [Chromium](../evidence/web-story-plans-and-farewell/chromium-cold-title.json)、[Firefox](../evidence/web-story-plans-and-farewell/firefox-cold-title.json)、[Windows WebKit](../evidence/web-story-plans-and-farewell/webkit-cold-title.json)各 20 次。每次第一个操作就是原生指针点击设置，不插入等待快照、合成点击或自动重试，记录 pointerdown／pointerup／click 和实际设置面板，均通过。

这是有限次数的复核，没有稳定复现原故障，不能据此写成已经修复或真机冷启动通过。因此没有猜测性修改启动、焦点或标题按钮逻辑。Windows WebKit 内嵌 data／Blob 音频未通过项也不关闭；冷启动面板通过不等于声音、Safari 或物理手机通过。

## 回归与审计结论

[1,045 项相关回归／113 文件](../evidence/web-story-plans-and-farewell/related-tests.json)通过，范围沿 #393 的完整 Runtime／Host／Core、保存／恢复／备份、历史传输、正文／声音接续、Auto／快进、预览及双导出。[44 项 Node 测试](../evidence/web-story-plans-and-farewell/tool-tests.tap)通过，包括新增七项严格内容审计、原 1.10.0 七项防回退、23 项文件／构建／轮询／端口工具和七项交付保护；不把重复复跑累计为更多测试。

新增专项拒绝恢复旧问题文字、改动另一分支、雨声缺失／错位／重复／错总线／错音量、改选项／ID／对白／媒体／来源权限、沿用旧兼容回执及擅自批准记录。类型检查、Editor／Player 双构建、118 便携／4 Node 文件架构和 N52-E5b 工程审计通过；既有 chunk 警告与 jsdom 媒体提示保持，产品验收仍 blocked。没有运行全仓 check、远端完整 CI、完整离线升级或长期 soak。

审计结论：本批按完整作品上下文纠正实际问题，没有扩展平台或抽象系统；1.11.0 只承载上述明确内容变化。25 条人工复核、全文自然阅读／听感与计时、26 项发行条件、物理主流手机／Safari、长期连读及获准 HTTPS 实际上线仍待完成，Windows／Android 原生仍搁置。

重放严格内容审计：`npm run audit:web-story-plans`。复验保留文件：`node tools/run-web-story-plans-and-farewell.mjs --play-only`，单独写 player-only-checks，不覆盖作者报告或重导出候选。首次从编辑器制作：`npm run audit:web-story-plans:browser`，需生产预览默认 5195（支持 STUDIO_UI_URL）；已有任一候选文件即拒绝覆盖，可用 STUDIO_STORY_PLANS_OUTPUT_DIRECTORY 指向新目录调试，源码改变仍须重新制作并验证，不能沿用旧报告。

## 下一批顺序

1. 继续从完整阅读任务检视人物、对白节拍、音乐和段落推进，只处理能在实际上下文说明的问题；保留自然听感／篇幅计时与 25 条人工复核，不因自动路线通过自行批准。
2. 继续发行前 26 项媒体的来源、署名和再分发条件核对；有明确条件缺口则补齐或替换，不用重复重发同版代替验收。WebKit 设置偶发未响应保持跟踪，有稳定复现再定位修复。
3. 在可用物理主流手机／Safari 上验证旋转、后台／锁屏和长期中断续读，再到获准 HTTPS 实际网址；不擅自上传、不恢复三端并行，长篇完整校验成本继续保留。
