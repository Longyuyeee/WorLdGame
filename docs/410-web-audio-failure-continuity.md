# 中断与回看后的声音故障恢复

2026-10-18，接续 [#409](409-web-history-voice-readiness.md)和 [#304 完整 Web 作品](304-web-complete-gal-delivery.md)。本批处理正文声音已经失败、进入历史或暂停返回后却丢失重试入口的问题。仍为 **《雨停之前》1.11.0 候选／S0.41**，不改剧情、演出、素材、Core、Runtime 或存档／备份格式，不另建音频或存储框架。

## 失败提示被临时暂停覆盖

[#409 冻结游戏复现](../evidence/web-audio-failure-continuity/baseline/baseline-chromium.json)从原 #404 备份明确导入并读取。服务器对正文配音返回损坏的真实 HTTP 响应，浏览器产生可信的原生错误 4，界面最初提供媒体问题与重试。随后服务器恢复原完整文件，玩家进入历史重听同一句，再返回正文：正文原声音仍然错误 4，传输状态却被改成 `paused-by-policy`，故障入口消失。

原因是后台、快进和历史临时暂停直接覆盖 `playerPlayback`；界面只把 `error` 状态中的记录归为失败。底层错误或语音失败标记仍在，自动恢复又会跳过这些元素，于是既不能恢复，也看不到明确重试。[校正定位后的红测](../evidence/web-audio-failure-continuity/verified-red-tests.json)三项全部失败，分别覆盖语音／BGM 的宿主暂停返回和历史返回。原生复现确认历史路径；宿主和快进由受控测试单独覆盖。

## 错误归属与明确恢复

统一检查原生 `MediaError`、已登记的播放错误和语音失败标记。后两者也覆盖 `play()` 被拒绝但没有原生错误对象的情况。临时后台、快进或历史所有权仍会取消请求并暂停声音，但不再把已有失败改成健康的策略暂停；回来后继续显示原问题和重试入口。

失败元素不能因迟到的 `play`、`playing`、`canplay` 或 `ended` 事件自动变成正在播放或已完成。普通恢复路径不重试失败元素；只有玩家明确选择“重试媒体”，才沿原局部重试创建新的声音元素，从原记录的完整来源重新准备。单独音频故障的局部重试不重建健康音乐和其他声音，正文、段内位置、个人音量／静音和正式档保持；同时存在画面故障时，仍沿既有整体媒体重试范围，本批未拆分该入口。

明确替换素材地址也创建新的原生所有者，即使素材 ID 不变；否则旧失败会阻断用户换好的来源。仅保留当前音轨总线的地址与递增小键，不把大型 data URL 拼进 React 键，也不积累退役来源。只有实际地址改变的通道重建；若同一素材被多个总线共用，这些地址一同改变的通道均属新来源。无关音量／界面变化保留原元素，Auto 的语音归属也跟随新地址更新。

历史关闭时，只有失败所有者清理其历史中断标记并恢复错误提示；原来因项目策略而暂停的健康声音仍保留迟到播放保护，明确恢复后才继续。首次修复曾过早清掉该保护，已被既有回归发现并纠正，不放宽原断言。

玩家也可明确选择“本次先无声阅读”，释放当前音轨并继续当前句。再次“恢复当前声音”按原会话选择创建新元素，不复活损坏元素，也不改持久偏好。真正的解码／下载失败不被改称长等待，历史预览自身的故障不冒充正文失败。

## 真实作品与恢复操作

[Chromium](../evidence/web-audio-failure-continuity/current-browser/chromium.json)、[Firefox](../evidence/web-audio-failure-continuity/current-browser/firefox.json)和 [Windows WebKit](../evidence/web-audio-failure-continuity/current-browser/webkit.json)各六组任务通过，均使用同一新网站和原备份。流程覆盖可信原生解码错误、真实历史重听与返回、故障入口保留、明确局部重试后播放原完整文件、后续原生暂停／明确恢复和正常结束。实际 IndexedDB 槽位载荷摘要、正文状态和个人偏好保持，原失败元素释放来源，健康 BGM 保持原元素。

原生暂停通过调用实际媒体元素的 `pause()` 触发，**不是系统电话、耳机切换或锁屏模拟**。声音输出静音，不能当自然听感或真人计时。320×568、568×320、844×390、1280×900 的重试与无声阅读入口可完整滚入视区且至少 44px，每引擎八条实际尺寸记录；已查看短横屏恢复画面。

[健康重听回归](../evidence/web-audio-failure-continuity/final-healthy)为三引擎 HTTP 网站与 Chromium 本地 HTML，各六组任务；正文当前声降速至 0.2 用于检查临时所有权，历史预览保持原速。另有[三引擎等待回归](../evidence/web-audio-failure-continuity/final-wait)各六组，确认 #409 的准备等待、迟到响应、显式重试及返回正文仍成立。两者均不把 Windows WebKit HTTP 音频通过扩大为内嵌 data／Blob／离线音频或 Safari 通过。

[实际作者与路线](../evidence/web-audio-failure-continuity/final-work/browser-checks.json)从生产编辑器导入 #394 原工程与 25 条记录，保存、关闭、刷新重开并双导出，七组任务通过。Chromium 本地 HTML 留下线、390px 离线网站远行线各走过 66 段正文、六句原生声音结束、Auto／历史／保存重开，另行核对同内容原备份的明确读取；不是新包两格式×两结局的完整矩阵。

## 未通过的探针与开发回归

[Chromium 冻结探针](../evidence/web-audio-failure-continuity/verified-browser/chromium.json)调用浏览器生命周期接口后，未满足可信冻结／恢复事件和实际宿主转换的联合检查，30 秒超时；最后仍为 active，原错误 4 与错误提示状态保持。报告不足以区分联合条件中哪一项未满足，不猜原因，也不计后台／BFCache 验收。工具保留独立 `--freeze` 严格诊断入口，正常三引擎报告不依赖它，不伪造生命周期事件补过。

早期[红测草稿](../evidence/web-audio-failure-continuity/red-tests.json)含两项真实失败和一项历史关闭按钮的范围定位错误；[校正红测](../evidence/web-audio-failure-continuity/verified-red-tests.json)才作为三项产品红测。首次[定向回归](../evidence/web-audio-failure-continuity/targeted-initial-tests.json)39 项通过、一项既有策略暂停保护失败，促使前述历史标记修正。

[扩大回归](../evidence/web-audio-failure-continuity/targeted-expanded-tests.json)46 项通过、三项失败：测试把共用原型上的健康音轨恢复调用也计入坏音轨。改为按实际接收元素统计，不取消“不自动重试坏元素”的断言。[随后回归](../evidence/web-audio-failure-continuity/targeted-final-tests.json)82 项通过、两项测试超时，原因是快进用例在假时钟尚未恢复时等待 fake IndexedDB 读取；将假时钟严格限制在快进开始／停止的同步检查，读取前恢复真实时钟，未提高五秒期限。

后续审计补充[同 ID 换地址红测](../evidence/web-audio-failure-continuity/source-replacement-red-tests.json)，12 项通过、一项失败，确认旧元素被复用会阻断新来源。修正来源身份后的[一次核查](../evidence/web-audio-failure-continuity/source-owner-targeted-tests.json)84 项通过、一项失败，原因是该夹具两条总线共用同一素材，却错误要求换地址后音乐元素不变；最终明确验证两个已换地址的通道都重建，其他用例仍要求未变健康通道保持。

最后[定向回归](../evidence/web-audio-failure-continuity/final-targeted-tests.json)七文件／85 项通过，含新增 13 项：语音／音乐错误跨宿主、历史、快进启停，只有 Promise 错误的情况，四类迟到事件、重复中断、明确无声与恢复、同 ID 新来源，以及剧情／槽位／偏好保护。前述失败报告和[修正来源身份前的 84 项通过](../evidence/web-audio-failure-continuity/verified-targeted-tests.json)保留，不重复计入最终数量。

`work` 双游戏及原 `browser`／`final-browser`／`healthy-regression`／`wait-regression`、首轮相关／整合／工具报告属于来源身份修正前启动的开发检查，不作为最终包通过证据。最终重新构建和实际导出至 `final-work`，所有上述当前专项都重新执行并绑定该对字节；不套用早期包结果。

## 最终测试与审计

最终代码冻结、构建与浏览器结束后，沿既有超时、单工作进程顺序执行。[完整相关回归](../evidence/web-audio-failure-continuity/verified-related-tests.json)154 文件／1,427 项通过，[原始日志](../evidence/web-audio-failure-continuity/verified-related-tests.json.log)保留；[编辑器整合](../evidence/web-audio-failure-continuity/final-app-tests.json)两份不重叠文件／47 项通过，共 **156 文件／1,474 项功能测试**，含新增 13 项。[工具测试](../evidence/web-audio-failure-continuity/final-tool-tests.tap)89 项通过，含新增五项防覆盖检查；定向、早期检查和重复执行不累计数量。

类型检查和 Editor／Player 生产构建通过，既有大分包和 jsdom 媒体未实现提示保留。[汇总审计](../evidence/web-audio-failure-continuity/audit.json)核对最终报告、精确游戏对、来源／26 媒体和旧游戏／初稿保留；架构 118 个可移植文件／四个 Node 适配文件通过，N52-E5b 工程通过、产品验收仍 blocked。#408–#409 已有默认超时原因调查不因本批通过而关闭；本批也不代替全仓 check、远端 CI 或 Stable／M1 产品验收。

## 当前交付与后续顺序

新 [HTML](../evidence/web-audio-failure-continuity/before-rain-stops.html)46,837,000 字节，SHA-256 `8d874327042ea7c0d164b04524733580a56c350b16423c5df82a803433c7e812`；[网站 ZIP](../evidence/web-audio-failure-continuity/before-rain-stops-website.zip)35,423,449 字节，SHA-256 `5505fb17d9f5de6882dda977f730d8e5624ebc2ded9e83a4c52a7f019338ee1f`。均为实际编辑器导出的原字节，剧情载荷和 26 项媒体与 #409 完全相同。[精确交付记录](../evidence/web-audio-failure-continuity/delivery.json)通过本批工程门槛后提升同一对游戏，才清理 `final-work` 的相同副本；#409 原游戏、#394 可编辑源和记录、初稿游戏／历史报告与原备份保留。仍是工程候选，不表示关闭下面的产品门槛。

下一批回完整作品逐场阅读、人物／声音演出和多次中断续读的具体用户任务，先复现再修改；不为临时暂停继续扩展音频状态框架。原生播放开始后断流、真实后台／锁屏／BFCache、自然全文听读与计时、主流物理手机／Safari 仍待验；冷开设置偶发尚未稳定复现，不登记修复。

内容仍为九场景、两结局、9,772 字符、87 步演出、26 项媒体和九句系统 TTS。25 条 `fixed` 的 `checkedSourceHash` 仍为空，发行条件 pending 26、已确认 0；需取得 TTS 再分发依据、完成人工复核，再进入获准 HTTPS 交付。Windows WebKit 内嵌音频、长篇完整校验／快照／传输与物理内存、底层长期写入、长期续读及既有测试耗时波动继续开放，Windows／Android 原生产品化搁置。

## 重放

`node tools/run-web-audio-failure-continuity.mjs` 支持 `--engine=firefox`、`--engine=webkit`；`--baseline` 固定读取 #409 游戏，仅用于复现旧错误。`STUDIO_AUDIO_FAILURE_SOURCE_DIRECTORY` 指向待测游戏对，`STUDIO_AUDIO_FAILURE_OUTPUT_DIRECTORY` 必须指定新目录，已有报告拒绝覆盖。`--freeze` 仅用于 Chromium 当前包的独立诊断，本批未通过，不能作为后台验收入口。

`node tools/run-web-audio-failure-continuity-tests.mjs` 通过 `STUDIO_AUDIO_FAILURE_TEST_REPORT` 指定新报告，单工作进程、既有超时，并保留 `.log`。健康／等待回归沿 #402、#409 原工具，指定当前游戏与新的输出目录。汇总审计为 `node tools/audit-web-audio-failure-continuity.mjs`；实际导出、报告和精确游戏字节必须配套，不能复用旧包通过结果。
