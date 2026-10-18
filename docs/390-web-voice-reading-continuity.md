# 390 语音中断恢复与连续阅读

2026-10-18，按 [#389 第一项](389-web-reading-resume.md)继续完整作品的语音、读档和多次中断连读，目标仍是 [#304 Web 完整 Gal 制作与交付](304-web-complete-gal-delivery.md)。本批修复同句读档不出声和暂停后迟到播放，补重听及主动无声阅读入口，并重新导出当前运行候选。剧情仍 **1.10.0／技术 S0.41**，不是新剧情版本或正式发行。

## 玩家遇到的问题

用上一批 `6766e26` 源码构建生产编辑器，从 #384 原工程实际导出游戏。在“进去读吧。我想先把今天的话说完。”保存，等原生语音结束，再明确读取同一快速槽：正文回来了，播放器却仍沿用已经结束的同一个 audio 元素，`ended` 和完成标记都为 true，没有重新播放。背景音乐和正式存档并没有坏。另在保留页面的暂停边界延迟一个真实 play 请求，释放后原生播放仍能启动，而 Host 已是 suspended。

[原游戏两项对照](../evidence/web-voice-reading-continuity/baseline.json)保留准确音轨状态、规范快速槽摘要和 #389 临时导出 SHA；[初始三项组件复现](../evidence/web-voice-reading-continuity/baseline-tests.json)还覆盖历史返回同一音源的情况。实际作品在对白后明确停止语音，历史同源持续轨道的额外边界由组件夹具覆盖，不把它冒充本篇剧情使用方式。

## 现在如何继续听和读

成功完成校验的读档／恢复，以及真正移动位置的后退、前进、历史定位和回想切换，会给当前语音新的播放归属，从本句开头播放；同一句读档也不再借用“已结束”的旧音轨。失败读档或被阻止的历史移动不重启当前语音。健康背景音乐不因语音重置而重启，正文位置继续沿用 #389；语音播放秒数不进入正式存档或本机阅读锚点。

普通后台暂停／返回不是读档：未完成语音沿原音轨和原播放位置继续，遵守作品的中断恢复策略；已经完成的语音不因返回前台再次播放。当前声音的 play、pause、ended 必须属于仍连接的实际音轨，迟到 play 还须满足 Host、快进与应播放状态；否则取消请求并立即暂停。换语音或暂停会清理原语音压低背景音乐／手动等待的标记，旧事件不能清掉替代音轨的状态。

阅读菜单增加“重听当前语音”：从头重听，关闭 Auto／快进并返回正文，不改变剧情、当前滚动位置、健康背景音乐、存档或个人音量。恢复声音仍是用户手势中的原生 play；权限拒绝不当作文件损坏或播放完成。

声音中断时可直接恢复，也可“本次先无声阅读”；即使原生请求既不开始也不报错，阅读菜单也保留主动无声选择，不要求玩家先制造一个媒体错误。该选择关闭自动／快进、保留当前句与个人设置，仍可显式恢复当前声音。它不代替视频完成，不绕过剧情选择、存档或媒体等待校验。

恢复提示在菜单、历史、存读档、设置、计算或媒体错误操作期间让位，避免同时叠放两条声音／视频恢复条。旧保存通知和段内续读提示让位于当前声音恢复。窄屏竖屏提示放在画面区，手机横屏沿 #389 底部说明区留位，不压住正文或右侧存档按钮；较窄横屏的说明保留给读屏，主要操作仍可见且至少 44px 高。

## 当前工程和运行文件

| 用途 | 当前接续 |
| --- | --- |
| 可编辑工程与内部来源 | [#384 原工程](../evidence/web-story-arrival-and-night/before-rain-stops-project.zip)，SHA-256 `331a1b404ee39b89680a6a7a2c0d22dd7279b3b87ab9b60d4b5fe1a253baf5e8` |
| 23 条未批准人工记录 | [#384 校订记录](../evidence/web-story-arrival-and-night/before-rain-stops.worldreview)，逐条保持 |
| 当前单文件游戏 | [本批 HTML](../evidence/web-voice-reading-continuity/before-rain-stops.html) |
| 当前公开网站上传包 | [本批网站 ZIP](../evidence/web-voice-reading-continuity/before-rain-stops-website.zip) |
| 文件及素材摘要 | [产物审计](../evidence/web-voice-reading-continuity/work/artifact-audit.json)与[最终任务矩阵](../evidence/web-voice-reading-continuity/browser-matrix.json) |

本批运行文件包含 #387–#390 当前实现，替代 #386 作为新的下载入口；[旧 HTML](../evidence/web-auto-reading-pages/before-rain-stops.html)和[旧网站包](../evidence/web-auto-reading-pages/before-rain-stops-website.zip)原样保留。只有全部实际任务及摘要核对通过，才把临时导出晋为交付文件；重复运行工具不能覆盖内容不同的既有交付。

HTML 和本批原备份沿用 Git `-text` 保护，避免换机检出时改写换行导致交付摘要变化；暂存区与实际验证文件的 SHA 一并核对。已晋为交付的游戏可用 `node tools/run-web-voice-reading-continuity.mjs --published` 定向复验，按需加 `--file` 或 `--engine=webkit --website`；这不是将 WebKit 内嵌失败改记为通过的入口。

九场景、90 段旁白、九句角色对白、两结局、9,753 字符、86 演出和全部 26 媒体逐项保持，不新增素材或许可结论。原同内容 1.10.0 备份已实际导入并明确读取；仍不兼容 1.9.0 或更早剧情存档。网站 ZIP 仅含 37 个公开文件；工程、来源、校订记录和 `.worldsave` 不随整包证据目录上传。文件生成不等于已上线，本批没有重跑服务器版本切换或全部旧版本升级矩阵。

## 验证与审计

[1,015 项相关回归／110 文件](../evidence/web-voice-reading-continuity/related-tests.json)保留 #389 全部范围，新增 12 项语音接续测试：同句已结束／播放中读档、失败读档保护、真实历史移动与被阻止前进、显式重听、三轮暂停返回、已完成音轨不重播、权限拒绝后无声选择、三类面板让位，以及无错误的播放悬挂仍可主动无声阅读。Runtime／Host／Core、完整历史、保存／恢复／备份、Auto／快进、作者预览和双导出继续回归。

类型检查、Editor／Player 双构建、23 项 Node 工具测试、118 便携／4 Node 适配文件架构及 N52-E5b 工程审计通过。只调整 Shell 的播放归属、事件门和界面，没有新 Core、Host、数据库、备份、工程或兼容协议。既有 chunk 警告、jsdom 媒体提示和 N52 产品待验状态不变；未跑全仓 check 或远端完整 CI。

[最终浏览器矩阵](../evidence/web-voice-reading-continuity/browser-matrix.json)明确区分载体：Chromium／Firefox 的回环 HTTP 单文件游戏、Chromium 直接打开本地 HTML，以及 Windows WebKit 的在线 HTTP 网站包。四组各 11 项检查：原生语音结束后同句读档新归属、健康音乐不变、重新开启 Auto 等待新语音、三轮暂停返回、菜单重听、320×740／844×390／568×320／390×844 提示与正文／存档不交叠、按钮边界、无声选择与刷新后独立恢复。原快速槽规范字节长度／SHA、artifact hash 和 Runtime hash 保持。

语音用原文件的原生播放，部分加速／减速以观察边界，没有伪造 play、pause、ended 或替换音频。120 秒受控 Auto 时钟只证明等待门，不是自然阅读计时；保留页面的 pagehide／pageshow 与延迟 play 请求是明确的故障注入，不冒充操作系统锁屏、真实 BFCache 命中或物理设备后台验收。

Windows WebKit 的内嵌 HTML 原生语音检查仍超时，见[未通过记录](../evidence/web-voice-reading-continuity/webkit.json)；这与 [#341 已测 data／Blob 限制](341-web-audio-recovery-and-runtime-baseline.md)一致，不能用 HTTP 网站成功覆盖这项失败。另用当前内嵌 HTML 验证[主动无声阅读及手动继续](../evidence/web-voice-reading-continuity/webkit-inline-fallback.json)，矩阵保持 `inlineWebKitAudioAccepted=false`；没有声明离线音频已修复，也不推断真实 Safari 同样失败。

[生产作者与完整作品七组任务](../evidence/web-voice-reading-continuity/work/browser-checks.json)覆盖原工程／23 条记录导入、保存重开、双格式导出、全部内容／媒体／公开文件，重跑语音请求拒绝与重试归属。桌面 HTML 留下路线和断网 390px 网站远行路线各 66 段正文／六句语音，合计两结局；历史、Auto、保存刷新读取和原 1.10.0 备份保持。不是全部格式×路线×引擎的全组合，也不把静音原生时间推进当人工听感通过。

同一当前 HTML 另重跑 [#389 段内续读九项浏览器检查](../evidence/web-voice-reading-continuity/reading-resume/chromium.json)，核对旋转、段首重读、Meta 合并和坏缓存不会被这批语音／提示改动破坏。

复验：`npm run audit:web-voice-reading`；`npm run audit:web-voice-reading:browser`。后者构建 Editor，需要 5195 对应的生产预览，可用 `STUDIO_UI_URL` 指定其他已启动地址；启动方式见 #389。工具先实际制作，再按载体执行检查，只有全部成功才保留并公布新下载文件。基线为 `6766e26` 的实际再导出，基线临时游戏验证后清理，只保留摘要、原备份与证据，不覆盖旧交付。

## 下一批顺序

1. 按 #389 第二项与 #388 未闭项，分开测量长篇读档总等待、接收端重建及完整校验成本，优先解决真实后段阅读／读档的等待反馈；保持完整历史和逐次校验，不凭后台任务或小包传输宣布整体提速。
2. 用当前运行候选继续整篇内容与演出核对，处理有依据的具体问题；23 条人工校订、自然全文／听感和阅读计时仍需真实验收，不自行批准。
3. 26 项素材发行条件、物理主流手机／Safari、长期运行及获准 HTTPS 公网仍开放。没有授权不上传，没有依据不批准许可；Windows／Android 原生继续搁置，不宣布 Stable／M1 完成。
