# 收藏列表辨认与原进度返回

2026-10-18，接续 [#414](414-web-replay-image-and-reveal-recovery.md)，按 [#304 完整 Web 作品](304-web-complete-gal-delivery.md)检查“完成结局 → 浏览收藏和回想 → 返回 → 下次续读”。本批修复返回去向不清楚、配置封面后手机列表重叠，以及收录音乐未呈现已配置封面的问题。仍为 **《雨停之前》1.11.0 候选／S0.41**，不改正文、演出、26 份媒体、Core／Runtime 或存档格式。

## 原问题和复现范围

[#414 实际游戏](../evidence/web-collection-reading/baseline-valid/baseline-chromium.json)由界面保存第一段正文，快进完成留下路线并查看收藏；关闭按钮始终显示“返回剧情”，实际却返回结局。标题入口也使用相同文字。新增返回去向测试中，标题／结局两项先失败，正文原行为通过，见[红测](../evidence/web-collection-reading/red-navigation-tests.json)。

当前样章的回想、音乐和结局列表没有配置封面，因此不能用它的正常截图证明封面排版正确。另以既有媒体演示工程，通过公开目录配置函数加入封面和中英文长标题，在原 #414 的 PlayerShell／CSS 上运行[独立 HTTP 夹具](../evidence/web-collection-reading/covers-original-http/chromium.json)。320×568 下，回想标题越出卡片并与“开始回想”重叠，列表横向溢出 53 像素；已收录音乐没有显示配置的封面。该夹具不是修改过的《雨停之前》，也不计作样章作者制作或完整剧情验收。

原回想列表把编号、可选封面、正文和按钮交给自动网格排位，手机样式却只定义两列；有封面时正文落入编号窄列。无封面的桌面列表也留下不必要的空列。音乐已解锁分支没有渲染封面，与未解锁分支不一致。

## 收藏界面调整

编号和可选封面归入独立视觉栏，标题／说明归入可伸展正文栏；回想按钮在窄屏放在正文下方。回想、音乐和结局采用相同的内容分栏，长英文连续串也能换行，不覆盖按钮或撑出卡片。手机缩略图使用 36×36，桌面保持 72×52；没有封面时不再因自动排位改变正文所在列。

已收录音乐沿原资源映射显示作者配置的封面，试听、错误提示、资源重试和解锁规则保持。仍使用原延迟图片组件与图片预算，不新增原生图片绕过或替代解码路径。未解锁名称、不可进入的回想和空分类仍沿原规则显示，不扩大剧透范围。

关闭附加内容时，标题页显示“返回标题”，结局页显示“返回结局”，正文／选择中仍为“返回剧情”。可见文字同时作为按钮的无障碍名称；实际关闭、播放模式恢复和焦点返回沿原处理，不将关闭变成重开故事或自动读档。自定义面板也使用这一真实去向。

## 实际作品与五种视口

新包的 [Chromium](../evidence/web-collection-reading/browser/chromium.json)、[Firefox](../evidence/web-collection-reading/browser/firefox.json)、[Windows WebKit](../evidence/web-collection-reading/browser/webkit.json)网站及 [Chromium 本地 HTML](../evidence/web-collection-reading/browser/chromium-file.json)各五组通过。每份报告覆盖标题关闭不启动剧情、五视口的三类列表、结局原点返回、真实手动档接回正文并进入／退出回想，以及刷新后保留独立解锁并明确读取原档。

视口为 320×568、568×320、390×844、844×390 和 1280×800。核对列表不横向溢出、标题可用宽度、按钮至少 44 像素高、原 Runtime／宿主／历史和正文返回，以及手动档内容摘要、独立收藏／回想记录保持。读取旧档允许合法合并新获得的已读／收藏元数据；从读取后的实际父检查点进入回想，退出则要求精确还原该检查点。

[封面夹具三引擎最终报告](../evidence/web-collection-reading/covers-loaded)分别检查三分类×五视口，封面均完成实际图片加载、原生宽度大于零，长标题与按钮无重叠、无横向溢出。320 宽回想标题可用宽度为 170 像素；已查看其竖屏及实际样章结局列表截图。报告绑定夹具、实际打包代码／CSS 和当前源文件摘要；原包对照固定在 `74f9874`，不依据修改后的 CSS 推断原行为。补核对在整批功能测试结束后执行，未与其并行；前轮排版报告保留，不累计为更多独立覆盖。

## 完整路线和原工程保持

[实际作者任务](../evidence/web-collection-reading/work/browser-checks.json)从 #394 可编辑工程和 25 条记录导入生产编辑器，保存、关闭、刷新重开并双导出，七组通过。[四格矩阵](../evidence/web-collection-reading/matrix/matrix.json)覆盖 HTML／网站各两条路线，每格 66 段正文、六句原生声音结束，包含 Auto、明确读档、槽位保持和重开；网站两线缓存后离线刷新，HTML 两线实际离开返回。

[正常双路线与回想](../evidence/web-collection-reading/route-regression/chromium.json)七组通过；[快速回想回归](../evidence/web-collection-reading/replay-regression/chromium.json)四组通过，包含八次旋转快退、原已读全文绘制保持和受控超限响应后的明确重试。它们绑定本批精确游戏字节，不把上一批通过记录充作新包结果。输出声音静音，程序推进和原生结束事件不计真人自然听读／计时。

## 探针修正与保留记录

首轮实际游戏探针把读档前后的完整哈希直接比较，未考虑新获得的已读／收藏元数据合并，检查失败；正文、历史位置和保存内容没有因此丢失。修正为核对逻辑阅读点和原手动档字节，并在读档后建立精确回想返回基准。原失败报告保留，未修改 Core／存档逻辑来迎合探针。

封面夹具初轮遇到临时“完成动效”按钮结束时卸载，以及采样错误地假定音乐已显示封面的问题；失败报告保留。实际加载补核对时又命中旧动作过期的探针超时，最终改为点击当前仍可用的“完成动效／继续下一句”，不保留过期按钮、不强制点击或增加超时。之后逐项读取真实封面状态，并使用固定旧源建立完整原版对照。WebKit 的 data 音频失败提示又遮挡了收藏入口；最终三引擎夹具统一由 HTTP 提供相同的媒体字节，布局通过不意味着内嵌音频问题已解决。

[首轮工具测试](../evidence/web-collection-reading/tool-tests.tap)121 项中 120 项通过，部署重定向自测得到 `NETWORK_ERROR` 而非 `REDIRECT`。旧自测使用 `listen(0)`，独立 200 次本地随机监听检查中，5061 端口出现 `fetch failed / bad port`；[受控诊断](../evidence/web-collection-reading/deployment-port-diagnostic.json)随后确认该端口没有收到任何请求，而仓库已有安全回环选择器返回的端口正常收到 302。首轮 TAP 没记录当时的端口，不能断言原次恰好是 5061，也不把所有网络错误归于此。

仅让部署自测服务器复用已有 `listenBrowserLoopback`，排除这个已复现的端口风险；部署检查产品代码、手动重定向策略和停滞响应期限不变。最终完整工具测试重新通过，原失败 TAP 与诊断保留，不靠修改产品结果或放宽错误断言得到绿色结果。

## 最终回归与交付

定向五文件／33 项通过，包括新增四项返回去向、原焦点／检查点和配置封面的测试；标题／结局各自的旧断言同步改为实际去向。[整批相关回归](../evidence/web-collection-reading/related-tests.json)单工作进程、既有超时，159 文件／1,484 项通过，308.09 秒，[原日志](../evidence/web-collection-reading/related-tests.json.log)保留。[独立编辑器整合](../evidence/web-collection-reading/app-tests.json)另两份不重叠文件／47 项通过，共 **161 文件／1,531 项功能测试**；红测、定向和重复执行不累计。[最终工具测试](../evidence/web-collection-reading/tool-tests-final.tap)121 项通过，含新增九项已有报告防覆盖。

根类型检查及 Editor／Player 生产构建通过，原分包体积和 jsdom 媒体未实现提示保持。[汇总审计](../evidence/web-collection-reading/audit.json)核对新游戏、实际作者任务、各轮对应包、最终原生布局／加载、完整路线、源和 25 条未人工批准记录及全部 26 媒体。架构 118 个可移植文件／四个 Node 适配文件通过；N52-E5b 工程通过、产品验收仍 blocked，不代替全仓 check、远端 CI 或最终作品验收。

新 [HTML](../evidence/web-collection-reading/before-rain-stops.html)46,844,460 字节，SHA-256 `105dc3dfb186df992fa1df887460a76380f5825ed1653fffb47137a9f80bb0bd`；[网站 ZIP](../evidence/web-collection-reading/before-rain-stops-website.zip)35,430,909 字节，SHA-256 `c3661566d08c887b160601ed1535b0caee41d5f7c6a4295bf2511ee041f10518`。为实际编辑器导出原字节，网站 37 个文件清单／摘要一致，剧情载荷和全部媒体与 #414 相同。[交付记录](../evidence/web-collection-reading/delivery.json)通过门槛后才提升这对游戏，核对两份根目录文件后只清理 `work` 中相同的两份游戏副本；源、旧游戏、备份及失败报告保留。

提交前核对 310 个入库文件，其中 252 份游戏／图片／真实备份等文件的 Git 索引与磁盘 SHA-256 完全一致，双游戏另与交付记录核对精确字节。无关 `.browser-diagnostic/` 未纳入。原失败 TAP 保留 Node 断言输出的空行空格，仅该生成记录声明空白检查例外，未清洗失败内容。

## 接续和验收边界

可编辑源仍为 [#394 工程](../evidence/web-story-plans-and-farewell/before-rain-stops-project.zip)和[校订记录](../evidence/web-story-plans-and-farewell/before-rain-stops.worldreview)。九场景、两结局、9,772 字符、87 步演出、26 媒体和九句系统 TTS 保持；25 条 `fixed` 的 `checkedSourceHash` 仍为空，26 项发行条件 pending、确认 0。旧源和 #414 原游戏保留，不用运行界面的改进冒充新剧情或人工批准。

下一批继续原完整作品的连续阅读与演出复核，先沿实际可配置文字／窗口动效检查“未显完 → 中断／回想 → 返回”的可读性和个人减动效，再回到逐场节奏和发布准备。不扩收藏迁移、输入／音频框架或原生产品化。

自然全文听读／计时、主流物理手机／Safari、真实后台／锁屏／BFCache、原生开始播放后断流、WebKit 内嵌声音、原生永久解码停滞、长期运行、发行依据及获准 HTTPS 交付继续开放。自定义皮肤和部分渐显不由本批默认皮肤／立即显示夹具覆盖；冷开设置偶发、既有默认超时、长篇完整校验／快照／传输／物理内存与底层长期写入成本也不因本批关闭。Windows／Android 原生产品化仍搁置。

## 重放

`node tools/run-web-collection-reading.mjs` 默认读取本批根目录游戏；`--baseline` 固定 #414，支持 `--engine=firefox`、`--engine=webkit` 和 Chromium `--file`。`STUDIO_COLLECTION_READING_SOURCE_DIRECTORY` 指定实际游戏对，`STUDIO_COLLECTION_READING_OUTPUT_DIRECTORY` 必须选择新的输出目录，已有报告拒绝覆盖。

`node tools/run-web-collection-covers.mjs` 构建独立封面夹具，`--baseline` 只从固定 #414 提取实际 PlayerShell／CSS，媒体使用相同 HTTP 来源；支持三引擎，`STUDIO_COLLECTION_COVERS_OUTPUT_DIRECTORY` 需用新目录。该夹具不导出为样章正式游戏。

`node tools/run-web-collection-reading-tests.mjs` 接续 #414 全部相关文件并加入新测试，单工作进程、既有超时；`STUDIO_COLLECTION_READING_TEST_REPORT` 可指定新报告。实际作者、四格、正常／快速回想沿原工具指向同一游戏对和新目录。最终汇总为 `node tools/audit-web-collection-reading.mjs`，通过后才用 `--promote` 提升原字节游戏；不把导出清单、快进、独立夹具或桌面引擎记作最终产品验收。
