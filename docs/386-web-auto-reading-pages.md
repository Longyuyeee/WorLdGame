# 386 长段落自动阅读与手机存档反馈

> #387 发现的计算提示与旧通知重叠、长篇 Auto／Skip 调度及停止保护在 [#388](388-web-long-playback-advance.md) 接续处理。这里的可下载游戏保持原文件，未被本批临时测试导出替换。

> 后续接续见 [#387 长篇推进与恢复的完整输入传输](387-web-session-input-transport.md)。当前完整作品源仍沿 #384、双游戏仍沿本批；以下保留本批验证与历史顺序。

2026-10-17，按 [#385](385-web-auto-voice-continuity.md) 的第一项接续检查完整作品的长段落、字号、旋转和跨浏览器阅读。围绕真实玩家流程修复翻屏退出 Auto、反馈遮挡和可选截图阻断保存，不扩模板、原生平台或版本管理。作品仍为《雨停之前》**1.10.0 内容候选／S0.41 技术基线**，目标仍是 [#304 Web 完整作品交付](304-web-complete-gal-delivery.md)。

## 用户问题与改动

原 #385 网站在 390×844、140% 字号下，首段需要分屏阅读。在 Chromium、Firefox、WebKit 中开启 Auto 后，未读下方能阻止自动翻句，但点文字看本段下一屏会退出 Auto，玩家需要反复开启。[修改前实际观察](../evidence/web-auto-reading-pages/baseline-reading.json)记录三个引擎的原段落、滚动和模式；[修改前组件回归](../evidence/web-auto-reading-pages/baseline-tests.json)中的四项失败是复现证据，不是最终通过报告。

[PlayerShell](../apps/player-shell/src/PlayerShell.tsx) 先检查输入权限，再区分本段翻屏与剧情推进。全文已显示且下方未读时，触屏、鼠标或键盘翻屏不退出 Auto，也不改变剧情 hash；到段尾后仍等待阅读节奏。实际手动翻句、显示全文、历史回退和明确停止仍切回手动，拖动释放或禁用输入不改变模式。说明文字明确“自动等待读完本段”和“点文字切回手动”，Auto 开启时收起非必要横屏提示，让停止入口保持可见。

实际截图还发现保存通知遮住底部阅读说明，320px 宽度下三枚顶部按钮换行会碰到通知。默认阅读布局在竖屏把反馈移到工具栏下方的画面空位，短横屏放到工具栏左侧；320px 按钮使用紧凑单行文字，保留原 44px 最小高度。作者自定义阅读布局不套用此位置修正。[遮挡前](../evidence/web-auto-reading-pages/before-feedback-overlap.png)和[窄屏换行前](../evidence/web-auto-reading-pages/before-narrow-toolbar-overlap.png)保留，最终几何检查同时保护工具栏、正文与阅读说明。

Windows 桌面 WebKit 的原生时钟检查另发现 IndexedDB 拒绝 Blob 截图，导致快速保存整体失败；并非受控时钟制造的问题。[原生失败诊断](../evidence/web-auto-reading-pages/before-webkit-preview-storage.json)记录普通／canvas／复制后的 Blob 均 UnknownError、Uint8Array 可写，前台序列化已正常完成。此观察不等同真实 Safari 或全部 WebKit 设备都存在问题。

[存储适配器](../apps/player-shell/src/player-save-store.ts) 第一次携带截图时，先在仅涉及截图的单仓事务探测实际 Blob，使用不属于任何槽位的保留键，成功也主动回滚，不落盘探测记录或触碰进度。这样避免本机 WebKit 在多仓 Blob 失败后不结束回滚的路径。只有截图 put 明确 UnknownError／DataCloneError 才降级；待探测完整回滚后，用现有 V3“截图不可用”表示提交同一份完整进度。后续真正写入若出现可处理的截图拒绝，也须完成回滚再重试。

正式写入和重试仍在事务内重新核对 CAS，其他窗口已改动槽位则不覆盖；不会修改调用方原备份。探测成功只在当前适配器复用能力判断；降级提交成功后才记住截图不可用，后续不重复捕获。首次探测有额外一次短事务，不宣称保存提速。保存和备份导入说明截图未保存，剧情与历史保留。配额、元数据写入、其他错误、损坏截图及降级提交失败仍按失败处理，保留原槽。没有改数据库版本、存档格式、Canonical、Core 或 Runtime，也没有缩短历史或放宽读取校验。

## 当前接续文件

| 用途 | 文件 |
| --- | --- |
| 可编辑工程、26 份媒体和内部来源台账 | [#384 工程 ZIP](../evidence/web-story-arrival-and-night/before-rain-stops-project.zip) |
| 23 条待人工复核记录 | [#384 校订文件](../evidence/web-story-arrival-and-night/before-rain-stops.worldreview) |
| 当前单文件游戏 | [HTML](../evidence/web-auto-reading-pages/before-rain-stops.html) |
| 当前纯公开上传文件 | [网站 ZIP](../evidence/web-auto-reading-pages/before-rain-stops-website.zip) |
| 双格式、摘要和公开清单核对 | [产物审计](../evidence/web-auto-reading-pages/artifact-audit.json) |

源工程仍为 SHA256 `331a1b404ee39b89680a6a7a2c0d22dd7279b3b87ab9b60d4b5fe1a253baf5e8`，66 源条目／九场景／90 旁白／九对白／两结局／9,753 字符／86 演出／26 媒体。真实生产编辑器导入、保存重开、再导出后源 ZIP 逐字节相同，23 条记录逐条保持且未人工批准。HTML 完整项目与媒体载荷、网站 26 份媒体和 37 个公开文件清单核对，不重复存储相同源 ZIP；#384／#385 原游戏保留。仅网站 ZIP 内公开文件用于部署，不整包上传工程、来源或校订资料。

当前 HTML SHA256 为 `36cd9f801bec80ae155757ca6aa9d926c7aca58c343bd34494ff8b0b60c2862c`，网站 ZIP 为 `209c28d62c42b9f27f94124cfc8dfec2ebb4b1419255c09bb0763b1a902f76ce`，均由实际生产编辑器导出，不是手工替换游戏内脚本。

## 测试与审计

[206 项相关回归／16 文件](../evidence/web-auto-reading-pages/related-tests.json)通过，包含八项新增翻屏场景和十项截图存储／并发保护场景。覆盖触屏对应输入、键盘、禁用／拖动、菜单／后台／停止、全文显示，及截图拒绝、异步探测失败的完整回滚、保留键不落盘／成功能力只探测一次、跨适配器读取、重试 CAS、回滚间隙外部写入、配额／元数据失败和降级提交失败。21 项 Node 工具测试、根类型、Editor／Player 构建及 118 便携文件＋4 Node 适配文件架构审计通过。既有 Vite 大 chunk 与 jsdom 媒体模拟提示保持；未跑全仓 check 或长期 soak。

存储改动再跑 [59 项存档兼容回归／11 文件](../evidence/web-auto-reading-pages/storage-tests.json)，与上面文件不重复，合计 **265 项／27 文件**。包括截图捕获／预览状态、保存卡片与显式读取、后台失败提醒、标题存档入口、备份严格校验、旧格式迁移、目录摘要、压缩封装、恢复记录和保存策略，全部通过。

最终 13 组浏览器任务通过，无捕获页面错误：[作者与完整路线七组任务](../evidence/web-auto-reading-pages/browser-checks.json)、[三引擎阅读与几何](../evidence/web-auto-reading-pages/reading-checks.json)和[三引擎原生时钟保存／刷新读取](../evidence/web-auto-reading-pages/native-save-checks.json)分开记录。前七组为 Chromium：核对生产服务实际构建字节，导入原工程与 23 条记录、保存重开和双导出；复验 #385 播放边界故障、重试后自然结束；桌面 file HTML 留下路线和断网手机尺寸网站远行路线各 66 正文／六语音、合计两结局，实际 Auto、历史回退、保存刷新读取保持。另从 #384 原游戏实际导出同内容 [1.10.0 备份](../evidence/web-auto-reading-pages/original-1.10.0.worldsave)，明确导入后显式读取恢复原 hash，Auto 关闭；不修改旧备份版本号或扩大成 1.9.0 迁移。

阅读专项使用真实导出游戏的首段，140% 字号、390×844／844×390／320×740／740×320 四种视口；Chromium 触屏上下文实际 tap，Firefox／WebKit 鼠标与键盘。受控时间验证 Auto 未读不推进、翻屏不退出、菜单暂停、段尾后继续与显式停止；字号 85%→140%、旋转往返、历史回退后段首和原 16:9 舞台保持。它不是自然阅读耗时、物理手机或 Safari 验收。原生时钟保存专项不安装或快进时钟，另做隔离的 Blob 能力诊断和实际游戏存取，不把静音当作音频验收。

三引擎原生时钟均实际快速保存，刷新后显式读取恢复相同正文、历史游标与 Runtime hash，Auto 关闭。WebKit 报告包含截图探测错误→单仓事务真实 abort→无截图的完整进度事务 complete，界面明确“快速存档已保存（截图不可用）”；Chromium／Firefox 保留截图。已查看最终 320px、390px 和短横屏截图，反馈不覆盖正文／说明／工具栏，三枚按钮至少 44×44；不把两个格式各一路扩写成三引擎全格式／全路线矩阵。

复验：构建 Editor／Player，在 5195 启动生产预览后运行 `node tools/run-web-auto-reading-pages.mjs`，会真实重新导出并覆盖本批游戏与报告，先保留需要的交付。`--read-only` 复用本批游戏重跑阅读；`--native-save-probe` 复跑原生时钟保存／刷新读取；`--baseline` 只用 #385 原游戏复现翻屏问题。沿用 STUDIO_UI_URL；子流程的 STUDIO_AUTO_CONTINUITY_OUTPUT_DIRECTORY 用于隔离本批产物，不改写 #385。工具启动先写进行中、失败写失败，loopback 高端口有冲突重试，避免 Windows 随机分配到浏览器禁止端口。

## 接续顺序与仍未完成的条件

1. 本批关闭 #385 的长段落／字号旋转定向问题后，接 [#353](353-web-history-search-and-reading-continuity.md)／[#373](373-web-history-result-transport.md) 的长篇剩余成本：先测完整输入发送、后台恢复、Worker 校验及结果重建，分别报告正文响应和总等待，不用截短历史或缓存跳过验证换指标。
2. 扩大异步推进前，成批处理 Auto／Skip 时钟、媒体副作用、停止边界和完整保存候选；普通单句通过不能替代自动与快进路径，保留原完整作品内容／演出复核。
3. 23 条人工校订、自然听感／真实阅读计时、26 项素材发行条件、物理主流手机／Safari、长期稳定性和获准 HTTPS 公网交付仍待完成。没有站点与发行信息，不擅自注册、上传或虚构身份／许可；Windows／Android 原生继续搁置，不宣布 Stable 或整体 M1 完成。

1.10.0 不兼容 1.9.0 或更早剧情存档。旧入口／原版继续保留，缓存不等于永久或换机备份，新旧共用槽位时先导出进度；本批同一内容版本的旧备份接续不扩大为旧剧情迁移。
