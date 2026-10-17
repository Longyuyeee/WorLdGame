# 385 自动阅读与语音恢复接续

2026-10-17，按 [#384](384-web-story-arrival-and-night.md) 检查完整作品的 Auto、历史回退和中断续读，修复语音失败后卡住与重试后提前翻句两处实际问题。仍为《雨停之前》**1.10.0 内容候选／S0.41 技术基线**，不改剧情或素材，不另增作品版本。工作继续服务 [#304 Web 完整作品交付](304-web-complete-gal-delivery.md)，不扩模板或版本管理平台。

## 用户问题与修复

原游戏在“进去读吧。我想先把今天的话说完。”处开启 Auto：播放请求直接以 NotSupportedError 拒绝、没有原生 error 事件时，界面已经报告声音失败，Auto 却一直等语音结束。另一条路径中，语音实际解码失败后立即“重试媒体”，Auto 仍使用旧音轨的时钟，会在重新播放的语音结束前翻句。[原版浏览器观察](../evidence/web-auto-voice-continuity/baseline-browser.json)分别记录卡住的同一 hash 和提前推进后的 hash；最初六项定向组件测试中四项失败，见 [修改前回归](../evidence/web-auto-voice-continuity/baseline-tests.json)。

修复集中在 [PlayerShell.tsx](../apps/player-shell/src/PlayerShell.tsx) 与 [auto-playback-clock.ts](../apps/player-shell/src/auto-playback-clock.ts)：只有当前音轨持有者可以通知时钟播放失败；通知保留原阅读截止时间，不重计整段时间，也不伪造原生 error。语音重试、替换或从本次无声阅读恢复后，取消旧时钟并绑定新音轨，等待其真实 ended 加尾停。只重试背景音乐不会重置语音时钟。退出／停止 Auto 后清理监听与通知订阅，旧请求、旧音轨与迟到结果不能推进新状态。

NotAllowedError 仍按权限受限提示“恢复声音”，不会当作损坏或播放完成而跳过。真正失败沿原策略在剩余阅读时间后继续，玩家仍可停止 Auto、重试或选择本次无声阅读。菜单、历史、后台暂停和未读下方保护保持，回到阅读重新等待，读档不自动开启 Auto。不改 Core 调度器、Runtime、存档格式或兼容校验。

## 当前工程与游戏

| 用途 | 接续文件 |
| --- | --- |
| 可编辑工程与 26 份素材、内部来源台账 | [#384 工程 ZIP](../evidence/web-story-arrival-and-night/before-rain-stops-project.zip)，本批真实再导出 SHA256 相同 |
| 23 条待人工复核记录 | [#384 校订文件](../evidence/web-story-arrival-and-night/before-rain-stops.worldreview)，真实导入／导出逐条不变 |
| 当前单文件游戏 | [HTML](../evidence/web-auto-voice-continuity/before-rain-stops.html) |
| 当前公开网站上传包 | [网站 ZIP](../evidence/web-auto-voice-continuity/before-rain-stops-website.zip) |
| 双格式与文件核对 | [产物审计](../evidence/web-auto-voice-continuity/artifact-audit.json) |

源工程保持 `331a1b404ee39b89680a6a7a2c0d22dd7279b3b87ab9b60d4b5fe1a253baf5e8`：66 条目、九场景、90 旁白、九对白、两结局、9,753 字符、86 演出、26 媒体。生产编辑器实际导入、保存重开、导出后源工程逐字节相同；23 条记录仍未人工确认。新 HTML 的完整项目／媒体载荷与原 #384 HTML 相同，网站同项目、26 份媒体逐份核对，37 个公开文件按清单核对字节和摘要。只更新 Player 运行文件；网站 ZIP 才是公开上传内容，工程／来源／校订资料不整包上传。

当前 HTML SHA256 为 `ad2613df9619a5b8872d6906bd1f0317806b82fd47d8ce8312bd1c9142404e97`，网站 ZIP 为 `b9ae8d13b4950fd67a9183ffebc03e2ea428d9427ed2f4b475fe19b608126ac0`。原 #384 双游戏保留，本批不重复存储相同源 ZIP。

## 测试与实际运行

[179 项相关回归／14 文件](../evidence/web-auto-voice-continuity/related-tests.json)通过，包含新增八项组件场景和两项时钟守卫，以及原声音恢复、Auto／Skip、菜单／后台、历史查找、阅读位置、存档备份与双格式导出。覆盖直接拒绝但无原生 error、替换后等新语音、无声阅读中重开声音、权限受限、旧请求迟到、暂停／返回、只重试音乐不重计时和主动停止。另有 18 项 Node 工具测试、根类型检查、Editor／Player 构建及 118 个便携文件＋4 个 Node 适配文件架构审计通过。Vite 大 chunk 与既有 jsdom 媒体模拟提示保持，不将单元环境当作真实音频播放；未跑全仓 check 或长期 soak。

[Chromium 七组实际任务](../evidence/web-auto-voice-continuity/browser-checks.json)通过，无捕获页面错误：当前生产编辑器的实际服务 HTML／JS／CSS 与构建字节核对，导入原作品和校订、保存重开并重新导出两种游戏；核对载荷与网站清单；在真实导出网站复现播放请求拒绝、原生解码错误与重试后自然结束，再跑完整作品和原备份接续。

故障场景明确在浏览器播放边界注入：直接拒绝 play Promise；或临时给当前原生 audio 一个无效 WAV 地址，得到浏览器实际解码错误，再用原媒体重试、放慢其真实播放速率以验证等待。没有修改工程／游戏载荷、调快游戏计时或合成原生 ended/error 事件。原版与修复版都运行这些条件；不会把注入故障表述成玩家正常环境必然发生。

正常完整作品不注入播放失败：桌面 file HTML 留下路线与 390×844 网站断网远行路线，各精确走过 66 段正文／六句语音、各一个不同结局；第一句语音由 Auto 继续，其余等待真实原生结束。137／219 处分别快速保存、查找历史并回退上一段，刷新后显式读取恢复原 Runtime hash、历史游标和背景，Auto 关闭。游戏按 CSS 正确服务，检查工程 16:9 舞台，手机保存重开与桌面语音等待截图已查看；不把无样式页面的早期工具结果当成最终 UI 验收。

另从原 #384 HTML 实际导出 [1.10.0 备份](../evidence/web-auto-voice-continuity/original-1.10.0.worldsave)，在新网站明确导入空手动槽位后显式读取，恢复相同 hash 并保持 Auto 关闭。此为同一内容 1.10.0 的原备份接续，不是 1.9.0 剧情迁移，也没有篡改旧文件版本号或补造兼容回执。

复验：构建 Editor，在 5195 启动生产预览后运行 `node tools/run-web-auto-voice-continuity.mjs`，支持 STUDIO_UI_URL，会重新生成本批双游戏与报告；先保留需要的交付。`--play-only` 复用当前游戏重跑玩家任务，`--baseline-only` 只在原 #384 HTML 复现两处问题。工具启动先把本次报告设为进行中，异常写失败报告，不沿用旧通过结果。定向测试为 `npx vitest run apps/player-shell/src/player-auto-continuity.test.tsx apps/player-shell/src/auto-playback-clock.test.ts --maxWorkers=1`。

## 下一批接续与剩余条件

1. 继续当前完整作品的长段落 Auto、字号／横竖屏和声音恢复实际连读，补 Firefox／WebKit 定向复核，发现明确用户痛点再改；不把 Chromium 手机尺寸等同物理设备。
2. 跟进 #353／#373 保留的长篇其他推进路径与复制成本，不扩无关装饰。当前存读档、演出和完整校验边界保持。
3. 23 条人工校订、自然听感与真实阅读计时、26 项素材发行条件、物理主流手机／Safari、长期稳定性和获准 HTTPS 公网部署仍待完成；取得站点与发行信息后再做公开交付，不擅自注册或上传。

1.10.0 不兼容 1.9.0 或更早剧情存档，原游戏继续保留；旧浏览器入口不是永久或换机备份，新旧共用槽位时先导出进度。Windows／Android 原生继续搁置，不宣布 Stable。
