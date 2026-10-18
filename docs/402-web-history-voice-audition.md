# 402 历史语音重听与当前阅读接续

2026-10-18，接续 [#401](401-web-work-continuity-matrix.md)，按 [#304 Web 完整作品交付](304-web-complete-gal-delivery.md)回查实际内容、声音与演出使用流程。九个场景及原校订记录回查后，本批处理“找到了过去的对白，却必须回退故事才能重听”的缺口，落实原始 [#11 保存读取与历史、音频与语音](11-gal-foundation-and-automation.md)中的历史语音重播要求。没有为修改而改剧情，仍为 **1.11.0 内容候选／S0.41 技术基线**。

## 玩家如何使用

阅读中从菜单打开“历史”，查找已读对白；有保留声音关联的主线记录显示“重听语音”。点击后只试听该句，不回退当前段，不写入存档或已读知识。玩家可以暂停、继续、停止或再次重听；停止后焦点返回原记录，原记录已被查找过滤时返回搜索框。没有声音关联的句子不猜测配音，缺少已关联的音频资源时明确显示不可用。

重听期间临时暂停当前正在播放的语音，背景音乐保持原节点与进度，按原语音 ducking 设置调整音量。关闭历史后，只对原本正在播放、仍属于当前句且尚未结束的语音按项目的中断恢复策略继续原位置；原本已结束的不会重播，项目不允许自动恢复时保留明确恢复入口。重听的结束不会被当成当前句语音结束，Auto 在历史面板内仍暂停，返回后按原规则重新等待。

个人音量、静音和本次无声阅读均保持；静音时重听区域会说明声音已静音，不擅自打开声音。宿主暂停会停止试听，返回后须明确继续重听。浏览器权限拒绝、真实文件错误或播放请求久未完成均在历史面板内解释，可重试或停止，不污染当前舞台媒体错误、不改变正文。尚未就绪的播放请求 5 秒后提供可操作的等待提示；离开／停止后清理临时音源并隔离迟到结果。

## 声音关联与范围

声音来自已提交的正式 History 效果记录，或已有的文本 ID／语言语音映射，不重新解释脚本、不执行历史剧情，也不把当前正在播的声音套到所有旧句。历史已提交的 voice 播放、停止、取消和作者音量参与关联，沿用原语言回退逻辑；只在历史面板打开时构建关联，列表继续按原分页显示。

本批覆盖**当前主线的过去与当前记录**。前方记录及只读归档不提供重听；内存保护已经释放的前缀缺少效果记录时不猜关联。没有扩展 Runtime、Core、Session Save、正式槽位格式或归档格式，不能写成所有历史语音策略已经完成。普通“回到这一句”仍沿原受保护的真实回退路径，与重听分开。

## 实际验证

在 [#400 原游戏](../evidence/web-progress-recovery/before-rain-stops.html)找到第一句配音后，实际只有回退按钮，没有重听入口，[基线报告](../evidence/web-history-voice/baseline-chromium-file.json)及截图保留。该问题不是把原本“重听当前语音”的菜单功能当作历史语音重听。

最终专项使用同一对 release-work 游戏字节：[Chromium 本地 HTML](../evidence/web-history-voice/release/chromium-file.json)、[Chromium 网站](../evidence/web-history-voice/release/chromium-website.json)、[Firefox 网站](../evidence/web-history-voice/release/firefox-website.json)、[Windows WebKit 网站](../evidence/web-history-voice/release/webkit-website.json)，各六项检查通过。实际读到第二句配音，再查找并重听第一句，核对原生 currentTime／paused／可信 ended、原音轨归属、暂停继续、失败重试、关闭接续和真实读档后重新建立关联。正式 IndexedDB 槽位元数据及实际保存载荷字节摘要前后相同。

四种窗口为 320×740、568×320、844×390、1280×900，重听操作和原句重听按钮均可滚动到视区、至少 44px。截图审查曾发现短横屏重听区挤占历史列表：已将重听区放入同一历史滚动区，移除嵌套滚动限制，正文记录仍有至少 96px 的可用滚动区；修正后重新构建、实际双导出和完整复验。故障使用无效 WAV 触发原生解码错误，不合成 ended／error；当前故事语音在归属检查时放慢到 0.2 倍，历史试听保持自然速度，全部声音输出静音。因此不把这些结果当作自然听感、正常全文计时或物理手机验收。Windows WebKit 本轮使用 HTTP 独立资源网站，不关闭既有内嵌 data／Blob 音频问题。

首次 [WebKit 事件观测失败](../evidence/web-history-voice/webkit-website.json)保留：脚本看到 ended 属性后立即读取事件数组，没有等可信 ended 事件到达就断言。改为分别等待原生状态及事件，在新目录复验通过；未放宽默认等待、伪造事件或据此声称修复底层音频。中间 work／final-work／verified-work 的制作报告、浏览器记录、截图与备份保留为过程证据；各暂存游戏仅在核对自身摘要并发布最终游戏后清理。最终验收只引用 release-work 与 release，不混用不同构建的摘要。

最终 [作者与完整路线](../evidence/web-history-voice/release-work/browser-checks.json)从生产编辑器导入 #394 工程和 25 条校订，实际保存、关闭、刷新重开，再双格式导出。公开工程投影及全部 26 媒体与 #400 一致，网站 37 个公开文件逐项核对长度／摘要，没有混入源工程、内部校订或玩家备份。桌面本地 HTML 留下线、390px 断网网站远行线各核对 66 段正文／六句原生语音结束，包含 Auto、历史、保存重开及读取后停止 Auto；另明确导入读取原同内容备份。该新包并未重新跑 #401 的四格式／路线组合，不沿用旧包报告冒充新包全矩阵。

所有最终浏览器和构建结束、产品代码冻结后，按单工作进程和默认超时重跑：[相关回归](../evidence/web-history-voice/related-tests.json) 141 个文件／1,264 项，[编辑器流程](../evidence/web-history-voice/app-tests.json) 2 个互不重叠文件／47 项，共 **143 个文件／1,311 项功能测试通过**，包含本批 19 项新测试；[工具测试](../evidence/web-history-voice/tool-tests.tap) 66 项通过，包含两项已有报告防覆盖测试。开发中间结果以 development-* 单独保留，不重复累计。类型检查、编辑器与播放器生产构建通过，仅保留既有分包体积提示；架构审计覆盖 118 个可移植文件与四个 Node 适配文件，通过。N52-E5b 工程审计通过，但原有产品验收仍为 blocked。本批不是全仓测试、远端 CI 或长期压力验收。

## 当前交付

可编辑源和校订仍沿 [#394](../evidence/web-story-plans-and-farewell)。新的 [HTML](../evidence/web-history-voice/before-rain-stops.html)／[网站 ZIP](../evidence/web-history-voice/before-rain-stops-website.zip)只更新播放器；[交付摘要](../evidence/web-history-voice/delivery.json)及[汇总审计](../evidence/web-history-voice/audit.json)核对最终同一对字节后发布。HTML 46,796,876 字节，SHA-256 `e36bed9690c371f7b13f31c5a160ab2594397ba0f6bde24be7544501038fee93`；网站 ZIP 35,383,325 字节，SHA-256 `ec0be847598dedd22caa12ceb2d2dbbf45bbe73283f0fa4f97448fc1fbec2ae6`。旧 #394／#400 正式文件保留，不覆盖历史候选。

九场景、两结局、9,772 字符、87 步演出、26 项媒体、九句配音及所有稳定 ID 不变；25 条 fixed 校订仍未获人工批准。26 项发行条件全部 pending、已确认 0，九句系统 TTS 再分发条件不因可播放而获准。技术功能不替代内容定稿与发行依据。

## 后续顺序

继续以完整作品的连续阅读和声音／演出使用问题为入口；历史归档／已释放前缀的语音关联仍有明确边界，不为补历史音轨改存档权威。自然阅读全文、听感和篇幅计时仍需完成；继续跟踪底层存储／受控时钟等待、冷开设置偶发和长篇成本。随后在可用物理主流手机／Safari 上做旋转、后台／锁屏、BFCache 和长期续读，再完成真实发行依据与获准 HTTPS 部署。Windows／Android 原生产品化继续搁置，不宣布 Stable／M1。

## 重放

选择新的 `STUDIO_HISTORY_VOICE_OUTPUT_DIRECTORY` 后执行 `node tools/run-web-history-voice.mjs --file`，或不加 --file 运行 HTTP 网站；网站支持 `--engine=firefox`／`--engine=webkit`。默认只读本批正式游戏；可用 `STUDIO_HISTORY_VOICE_SOURCE_DIRECTORY` 指向另一对游戏。`--baseline --file` 固定读取 #400。脚本遇到已有报告会拒绝覆盖，监听仅限本机安全高位 loopback 端口并在退出时关闭。

相关回归 `node tools/run-web-history-voice-tests.mjs`，最终审计 `node tools/audit-web-history-voice.mjs`。重新制作仍沿 `tools/run-web-auto-voice-continuity.mjs`，设置 #394 源目录和新的输出目录，不能覆盖冻结游戏或把旧报告改成新构建的验收。
