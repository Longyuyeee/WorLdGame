# 双路线存档接续与回想返回阅读

2026-10-18，接续 [#412](412-web-backup-inspection-and-retention.md)和 [#304 完整 Web 作品](304-web-complete-gal-delivery.md)。本批按“完成一条路线 → 读取已保存分歧体验另一条 → 回想后返回”核对完整作品，修复回想返回时的段内位置、键盘返回与 Auto 接续。仍为 **《雨停之前》1.11.0 候选／S0.41**，不改剧情、媒体、Core、Runtime 或存档／备份格式。

## 返回原剧情不应从段首重找

[#412 原游戏复现](../evidence/web-route-replay-continuity/baseline-native/baseline-chromium.json)完成两条实际路线，保留分歧和正文两份手动存档，刷新后再次读取正文。在 390px 宽、最大个人字号下，玩家滚动到 220px，再进入已解锁的“雨后的天明”并按 Escape 返回。Runtime、演出宿主、历史游标和正文均保持，但正文回到 0px，首个完整可见字符位置从 55 回到 0。旧行可能仍在较低位置可见，问题是原阅读位置丢失，不是剧情或存档损坏。

原 Shell 只保存回想前的播放控件，正文展示身份变化后重建阅读位置，没有取回段内锚点。本批在真正开始回想前，记录一份仅在内存中的阅读锚点；退出时，必须仍为同一工程对象、同一回想检查点的 Runtime／历史、同一段落和语言，才恢复到原正文。换工程、不同会话或段落不应用旧位置。沿用原字符／段首／段尾定位及重排能力，不建立新的持久化协议，不从旧存档猜造路线入口。

退出后焦点回到恢复的正文，使用 `preventScroll` 防止聚焦再次滚动。标题／结局仍沿相应入口返回；迟到聚焦会重新核对工程、构建对象及原 Runtime／历史，不能抢占新回想、换工程或读档后的界面。普通翻句和历史后退仍按原规则从目标段首开始。

## 键盘结束回想使用相同返回处理

初始新增七项回归中五项失败，均指向返回段首；另两项换工程／普通阅读保护通过。加入锚点后，退出按钮、Escape 和结束按钮通过，但回想结束的空格返回仍不能恢复正文焦点。单项检查同样失败，原因是原键盘主操作直接由 Core 返回父剧情，绕过 Shell 的播放控件与焦点恢复。

结局中的主操作现在调用与明确退出相同的 Shell 返回函数，保留 Core 原检查点返回。Enter／空格增加进入前 Auto 已开启的检查，回想中保持关闭，返回后恢复原模式；未读完的正文继续等待玩家阅读，不自动跳过。原生声音仍沿既有回想退出／重新建立来源策略，不把本批记作音轨采样位置的精确恢复。

## 完整作品检查

实际生产编辑器导入 #394 原工程和 25 条校订记录，保存、关闭、刷新重开并双导出；[作者检查](../evidence/web-route-replay-continuity/work/browser-checks.json)七组通过。剧情载荷、全部 26 媒体和记录原字节保持，两个完整路线、后段历史／保存重开及原同内容备份读取沿真实界面执行。

[独立四格矩阵](../evidence/web-route-replay-continuity/matrix/matrix.json)核对 HTML／网站各两路线，每格 66 段正文和六句原生声音结束，并检查 Auto、明确读档、原槽位保持；网站两路线实际缓存后离线刷新，HTML 两路线实际离开返回。

[Chromium](../evidence/web-route-replay-continuity/accepted-ready/chromium.json)、[Firefox](../evidence/web-route-replay-continuity/accepted-ready/firefox.json)、[Windows WebKit](../evidence/web-route-replay-continuity/accepted-ready/webkit.json)网站和 [Chromium 本地 HTML](../evidence/web-route-replay-continuity/local-html-ready/chromium-file.json)各七组专门任务通过。实际保存正文和分歧，走完首路线后明确读取分歧，再走另一条路线，两条各核对 66 段正文的实际顺序，手动槽位载荷保持。刷新后两条回想均可进入；从标题、第二结局和已读取的正文返回，原 Runtime／宿主／历史／正文保持。正文回想既覆盖 Escape，又覆盖完整结束后的按钮和原生空格，进入前已开启的 Auto 在返回后继续等待未读正文，然后明确关闭 Auto 继续旋转检查。

这组任务等待回想场景的实际图片准备好后再退出，不覆盖尚未呈现就立刻退出。四份报告的同尺寸非段首位置均从 220px 回到 220px，四种视口为 320×568、568×320、844×390、390×844，原逻辑字符保持可读、正文获得焦点，正式槽位及独立收藏／回想档案保持。已查看竖屏和 844px 横屏截图；大字号仍按段内滚动阅读，不把完整正文强塞进一屏。

自动化使用立即显示文字和减动效，逐字／渐显的已显示状态未因此验收；声音采样位置也未新增精确还原。所有声音输出静音，不计自然听感／真人计时。桌面引擎与手机尺寸不替代物理手机／Safari；Windows WebKit HTTP 声音不表示内嵌或离线声音通过。

## 检查夹具和重排定位

初次脚本把路线契约中已有的 ID 再当对象取 `.id`，首路线比较失败；下一次把正常轮换的自动槽也要求跨两条路线不变，随后又遇到阅读菜单内附加内容的名称选择错误。对应 `baseline`、`baseline-repro`、`baseline-final` 报告保留，均不算原问题复现通过。`baseline-verified` 还表明，仅判断旧字符是否在视区里，不能证明已滚离段首；最终基线明确执行真实滚动，并对照 220px 与 0px。

早期当前游戏报告还把 Auto 已关闭时的 `off`／`stopped` 展示状态当作模式变化。最终检查始终核对实际启用模式；Auto 开启的返回必须等待原图片准备好，并重新进入原等待状态。没有删除启用模式或正文／历史／槽位保护断言。

`final-browser` 和 `rotation-diagnostic` 的短横屏检查揭示了另一处夹具问题：重排会把更早字符带到同一行，但这些新出现的行首不是玩家重新选择的阅读位置。Firefox 在 390px 下的原逻辑字符为 55；连续重排得到的完整可见行首依次为 48、21、26，要求后一个画面保留前一个临时行首会错误失败。最终旋转检查保留各引擎自己原先的字符，Chromium／Firefox 为 55、WebKit 为 44，四次返回均要求其可读；同尺寸返回还要求滚动误差不超过 2px，不能以“旧字符仍在屏幕较下方”冒充保持原位置。未因此修改或放宽 `ReadingPosition`。

`accepted-native`／`local-html` 中的早期快速进入退出任务另有真实失败：Chromium 网站／本地文件和 WebKit 返回后，图片状态未就绪并出现媒体问题，等待三十秒未通过；Firefox 同轮通过。故障截图有背景缺失，不能记作单纯的状态展示错误。结合现有解码取消／隔离与预算保护，尚未呈现便退出可能触发仍在释放的保护，但这些报告没有直接保存故障的资源归属诊断，不能据此确认根因。最终正常任务增加“回想图片实际准备好”的操作前提，不将失败报告转绿，不提高期限，也不声称快速退出和显式画面重试已验收；后续脚本的失败记录增加只读资源诊断以便接续。

早期失败、定向检查和重复执行不累加到最终测试数；既有五秒期限保持，没有增加超时。

## 最终测试和交付

源码冻结、浏览器任务结束后，[相关回归](../evidence/web-route-replay-continuity/related-tests.json)158 文件／1,468 项通过，默认超时、单工作进程，约 309.48 秒，[原始日志](../evidence/web-route-replay-continuity/related-tests.json.log)保留。[编辑器整合](../evidence/web-route-replay-continuity/app-tests.json)另两份不重叠文件／47 项通过，共 **160 文件／1,515 项功能测试**，包括本批新增九项。[冻结定向检查](../evidence/web-route-replay-continuity/frozen-targeted-tests.json)四文件／49 项通过，不重复累计。[工具测试](../evidence/web-route-replay-continuity/tool-tests.tap)106 项通过，包括新增六项报告防覆盖检查。

根类型、Editor／Player 生产构建通过；原有大分包和 jsdom 媒体未实现提示保持。[汇总审计](../evidence/web-route-replay-continuity/audit.json)核对新游戏精确字节、同一包的浏览器／路线、原源工程与全部 26 媒体、25 条未人工批准记录和旧 #412 游戏保留。架构 118 个可移植文件／四个 Node 适配文件通过，N52-E5b 工程通过、产品验收仍 blocked，不代替全仓 check、远端 CI 或最终作品验收。

新 [HTML](../evidence/web-route-replay-continuity/before-rain-stops.html)46,842,644 字节，SHA-256 `ca8563fafc15bea90bcc4c3f7c4d6d9b60422f04c1c80cd4a4a2c502c51f6008`；[网站 ZIP](../evidence/web-route-replay-continuity/before-rain-stops-website.zip)35,429,093 字节，SHA-256 `c2cbb30e234630616c19996c86f043b8cc7afbecb0b0c924afb060405483e4f5`。均为实际生产编辑器导出的原字节，剧情载荷与 #412 完全相同。[交付记录](../evidence/web-route-replay-continuity/delivery.json)通过门槛后才提升这一对游戏；核对根目录两份后清理 `work` 的相同副本，源工程、旧游戏、实际备份和各轮报告保留。

交付记录明确标注 `normalReplayWaitsForImages: true`、`rapidExitAcceptance: open` 和 `defaultTextRevealAcceptance: needs-review`，并绑定三份真实快速退出失败报告；本批 `passed` 只对应上述明确范围，不是最终作品或全部回想边界验收。

提交前逐一核对 66 份图片／游戏／实际备份的 Git 索引与磁盘 SHA-256，并再次对照交付双游戏的精确字节；本批共 115 个提交文件，无关 `.browser-diagnostic/` 未纳入。

## 接续与验收边界

可编辑源仍为 [#394 工程 ZIP](../evidence/web-story-plans-and-farewell/before-rain-stops-project.zip)与[校订记录](../evidence/web-story-plans-and-farewell/before-rain-stops.worldreview)。九场景、两结局、9,772 字符、87 步演出、九句系统 TTS 保持；25 条 `fixed` 记录的 `checkedSourceHash` 仍为空，26 项发行条件 pending、已确认 0。#412 原游戏保留。

下一批先单独复现“回想未呈现即退出／连续快速切换”的图片故障，保存实际资源归属和释放诊断，验证原进度／锚点保护与明确画面重试；同时核对默认渐显模式返回时是否重新遮住已读正文，不能只沿立即显示的通过结果。之后再按“结局 → 收藏／回想辨认 → 返回正文或标题 → 下次继续”检查列表说明及手机可达性。仍以真实作品复现为修改依据，不扩建全新收藏、迁移或音频框架。自然全文听读／计时、主流物理手机／Safari、真实后台／锁屏／BFCache、开始播放后的原生断流、WebKit 内嵌声音、长期运行和获准 HTTPS 交付继续开放。冷开设置偶发、既有默认超时调查、长篇完整校验／快照／传输／物理内存和底层长期写入成本不因本批关闭，Windows／Android 原生产品化仍搁置。

## 重放

`node tools/run-web-route-replay-continuity.mjs` 默认读取本批根目录游戏，支持 `--engine=firefox`、`--engine=webkit` 及 Chromium `--file`；`--baseline` 固定 #412 原游戏。`STUDIO_ROUTE_REPLAY_SOURCE_DIRECTORY` 指定待测游戏对，`STUDIO_ROUTE_REPLAY_OUTPUT_DIRECTORY` 必须为新输出目录，已有同名报告拒绝覆盖。

`node tools/run-web-route-replay-tests.mjs` 使用 #412 全部相关文件加本批回归，单工作进程与既有超时不变；`STUDIO_ROUTE_REPLAY_TEST_REPORT` 可指定新报告，保留原始 `.log`。作者流程沿 #385、四格矩阵沿 #401，均须绑定实际新游戏对。汇总为 `node tools/audit-web-route-replay-continuity.mjs`，交付提升用 `--promote`，不能把其他批次或早期诊断的通过结果记为最终包验收。
