# 历史回看的键盘操作和剧情保护

2026-10-18，接续 [#410](410-web-audio-failure-continuity.md)和 [#304 完整 Web 作品](304-web-complete-gal-delivery.md)。本批修复回看历史时，键盘移到背后按钮、未经明确选择便改变正文位置的问题。仍为 **《雨停之前》1.11.0 候选／S0.41**；没有改写正文、演出、26 份素材、音频策略、Core、Runtime 或存档格式，可编辑工程和 25 条校订记录仍沿 #394。

## 历史打开时正文被后退

[#410 冻结网站复现](../evidence/web-history-input-boundary/baseline-native/baseline-chromium.json)通过实际界面开始阅读、快速保存并打开历史。从面板关闭按钮连续按两次 Shift+Tab，焦点依次到了背后的历史按钮和“后退一步”；按 Enter 后，历史仍打开，正文却从信封段落退到了画架段落，游标由 11 变成 9。正式自动档与快速档的实际 IndexedDB 载荷摘要保持，问题是当前阅读位置发生了非预期变化，不是存档损坏。

历史原先声明为非模态，既没有自己的 Tab 边界，背后控制也未 inert；推进入口虽拦住普通正文点击，却仍允许背景后退／前进。两条路线、信件去向与既有校订的源工程审查没有形成新的明确正文修改项，因此本批针对已复现的操作问题，不为增加改动而改写剧情或升级内容版本。

## 回看和回退分开

历史改为模态操作。Tab 与 Shift+Tab 只在当前面板内的可用控制间循环，包含查找、分页、已读记录、重听以及作者布局中的控制；每次从当前 DOM 取目标，过滤隐藏、禁用、inert、负 tabindex 和折叠 details 内部控件，按正 tabindex 再按正常顺序移动。查找结果或重听区更新后不复用已移除按钮。

背景正文、历史工具栏、播放控制和存档区在回看期间 inert；剧情入口同时拒绝背景后退／前进等意图，不能只靠视觉遮挡或焦点循环保护。只有玩家明确选择已记录行的“回到这一句”，才交给原 Core 校验并回退。没有给未来或只读归档增加回退能力。

Escape 保持两步操作：有查找词时先清空，下一次才关闭历史。桌面返回仍可见的历史按钮；窄屏上原按钮已收起时返回阅读菜单按钮。明确回到某句后聚焦正文。原来的段内位置、Auto 暂停、历史声音临时归属与个人音量逻辑保持。

## 实际玩家流程

[Chromium](../evidence/web-history-input-boundary/current-browser/chromium.json)、[Firefox](../evidence/web-history-input-boundary/current-browser/firefox.json)和 [Windows WebKit](../evidence/web-history-input-boundary/current-browser/webkit.json)各六组任务通过，绑定同一新游戏对。覆盖双向键盘循环、查找与两次 Escape、明确行回退、保存刷新读取，以及原生语音重听后过滤掉发起行、用键盘停止重听并返回查找框。回看与停止不改变正文或原槽位摘要，明确读档回到保存前的正文且 Auto 关闭。

320×568、568×320、844×390、1280×900 四个窗口中，最后一个键盘目标能实际进入视区且高度至少 44px，关闭后回到可见入口；已查看短横屏截图。这是桌面引擎窗口验证，不是物理手机或读屏器验收。

[健康重听回归](../evidence/web-history-input-boundary/healthy)另行覆盖三引擎 HTTP 网站与 Chromium 本地 HTML，各六组任务，检查暂停／继续、真实结束与解码失败重试、关闭后原正文声音归属和正式档保持。正文当前声降速至 0.2 用于检查归属，重听声原速、输出静音；不计自然听感或真人计时，也不把 Windows WebKit HTTP 声音通过扩大为内嵌／离线音频或 Safari 通过。

[实际制作](../evidence/web-history-input-boundary/work/browser-checks.json)从生产编辑器导入 #394 源和记录，保存、关闭、刷新重开并双导出，七组任务通过；两条路线各 66 段正文、六句原生语音结束，包含后段历史查找回退、保存重开和原同内容备份明确导入读取。[独立四格矩阵](../evidence/web-history-input-boundary/matrix/matrix.json)再覆盖 HTML／网站各两条路线，每格相同正文与声音数量、Auto、明确读取和原槽位保持；网站两线实际离线缓存刷新，HTML 两线实际离开与浏览器返回。

## 诊断记录

最初两次浏览器诊断分别把“已有槽位总数应为一”和快速槽 ID `quick` 当成前提，未进入目标复现就失败；[原报告](../evidence/web-history-input-boundary/baseline)和[第二次报告](../evidence/web-history-input-boundary/verified-baseline)保留。改为核对实际 `quick-1` 并保留自动档后，才得到前述原生键盘复现。

[最初红测](../evidence/web-history-input-boundary/red-tests.json)九项中两项通过、七项失败；六项属于本次目标问题，一项错误要求桌面也必须返回菜单按钮。桌面历史入口实际仍可见，校正测试预期，不改变原返回策略。[最终定向回归](../evidence/web-history-input-boundary/targeted-tests.json)五文件／38 项通过，含新增九项 Shell 与五项焦点筛选测试；初始和重复执行不累计到最终测试数量。

## 最终测试与交付

浏览器任务结束后，按原超时、单工作进程执行。[相关回归](../evidence/web-history-input-boundary/related-tests.json)156 文件／1,441 项和[原始日志](../evidence/web-history-input-boundary/related-tests.json.log)保留；另外[两份编辑器整合测试](../evidence/web-history-input-boundary/app-tests.json)47 项通过，与前者文件不重叠，共 **158 文件／1,488 项功能测试**，含新增 14 项。[工具测试](../evidence/web-history-input-boundary/tool-tests.tap)94 项通过，含新增五项防覆盖检查。定向、红测和重复执行不累计。

类型检查、Editor／Player 生产构建通过；既有大分包和 jsdom 媒体未实现提示保留。[汇总审计](../evidence/web-history-input-boundary/audit.json)核对精确游戏对、完整矩阵、原工程／记录和媒体；架构 118 个可移植文件／四个 Node 适配文件通过，N52-E5b 工程通过、产品验收仍 blocked。本批不代替全仓 check 或远端 CI，也不关闭以前的默认超时原因调查。

新 [HTML](../evidence/web-history-input-boundary/before-rain-stops.html)46,837,824 字节，SHA-256 `6a669333942bfb1fb478e4bc653c8ae6e4309180fb2161210dd14fefd2bab684`；[网站 ZIP](../evidence/web-history-input-boundary/before-rain-stops-website.zip)35,424,273 字节，SHA-256 `30d253550b9e083fd364a62058d7e2e0002348016f4c23e23f4b82c7291a27cd`。两者均为实际编辑器导出原字节，剧情载荷和全部媒体与 #410 相同。[交付记录](../evidence/web-history-input-boundary/delivery.json)通过工程门槛后提升同一对游戏，才删除 `work` 中完全相同的两个副本；报告、原备份和旧游戏保留。

可编辑源仍为 [#394 工程 ZIP](../evidence/web-story-plans-and-farewell/before-rain-stops-project.zip)与[独立校订记录](../evidence/web-story-plans-and-farewell/before-rain-stops.worldreview)，摘要分别保持 `43ef6e1673ed3dffbf705b4f178b2122fc960971eaf47286b33742fa285f0576` 和 `747534249345da6ce337054b4e7f47a1516556beda7079ef7b6d093e590bce8f`。换电脑先从这对源文件接续，不把网页游戏当工程导入。

## 后续顺序和产品边界

继续完整作品的逐场阅读、人物演出与多次中断续读；只有明确用户问题才扩展代码，不继续泛化音频或输入框架。当前九场景、两结局、9,772 字符、87 步演出、26 项媒体、九句系统 TTS 保持。25 条 `fixed` 记录的 `checkedSourceHash` 仍为空，不能当人工批准；发行条件 pending 26、已确认 0，需取得 TTS 再分发依据后才能进入获准 HTTPS 交付。

自然全文听读与计时、主流物理手机／Safari、真实后台／锁屏／BFCache、播放开始后的原生断流、WebKit 内嵌声音及长期续读仍待验。冷开设置偶发、既有默认超时调查、长篇完整校验／快照／传输和物理内存、底层长期写入成本继续开放。Windows／Android 原生产品化仍搁置。

## 重放

`node tools/run-web-history-input-boundary.mjs` 默认测试本批根目录的已提升游戏；可加 `--engine=firefox` 或 `--engine=webkit`。`--baseline` 固定 #410 原游戏，仅复现旧问题。`STUDIO_HISTORY_INPUT_SOURCE_DIRECTORY` 指定其他当前游戏目录；`STUDIO_HISTORY_INPUT_OUTPUT_DIRECTORY` 必须使用新目录，已有报告拒绝覆盖。

`node tools/run-web-history-input-boundary-tests.mjs` 按 #410 原相关集合加本批两文件，保留单工作进程与既有超时；新报告由 `STUDIO_HISTORY_INPUT_TEST_REPORT` 指定，并保留 `.log`。完整矩阵沿 `run-web-work-continuity-matrix.mjs --matrix`，健康重听沿 `run-web-history-voice.mjs`，均需明确同一游戏对和新输出目录。汇总门槛为 `node tools/audit-web-history-input-boundary.mjs`，不复用其他字节的报告。
