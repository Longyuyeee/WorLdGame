# 历史重听的声音等待与恢复

2026-10-18，接续 [#408](408-web-backup-envelope-and-continuation.md)和 [#304 完整 Web 作品](304-web-complete-gal-delivery.md)，回到完整作品的声音与连续阅读。本批修复“点了历史重听，没有声音，却一直显示正在重听”的障碍，沿 [#11](11-gal-foundation-and-automation.md)历史语音要求和 #402 既有入口，不新增音频管理平台。仍为 **《雨停之前》1.11.0 候选／S0.41**，正文、演出、素材、Core、Runtime 和存档／备份格式不变。

## 原生播放前的误判

[#408 冻结游戏的复现](../evidence/web-history-voice-readiness/baseline-pending/baseline-chromium.json)从原实际备份明确导入、读取，再打开历史重听。服务器挂起真实配音响应；浏览器发出可信 `play`，但 6.5 秒后 `currentTime` 仍为 0、`readyState` 为 0，没有解码错误，界面却显示“正在重听”且没有重试入口。

原 Hook 在 `play` 和 `play()` 成功回调时清掉五秒计时器，并把 `paused === false` 当作已经有声音；原生开始请求即可满足前一个条件，不能证明收到数据。已经开始后的缓冲停滞也没有持续观察。[修复前受控红测](../evidence/web-history-voice-readiness/red-tests.json)四项中两项失败，分别对应初始请求和开始后无进展。

## 玩家恢复流程

每次明确重听建立独立归属，每 500ms 观察实际媒体时间；连续五秒没有进展时暂停该预览，明确显示等待，并提供“重试重听”和“停止重听”。正常长语音只要持续前进就不会因总播放时间超过五秒而暂停。`play` 不再表示已经播放；原生 `playing`／就绪状态只影响当前显示，不能延长无进展期限。重复事件、音量变化或组件重绘也不延长等待。

短暂缓冲恢复时保留同一次播放，实际时间继续前进便恢复“正在重听”；等待超时后则保留暂停，迟到网络响应不能擅自续播。“重试重听”从该记录的原语音重新准备；主动暂停后的“继续重听”保持原位置并开始新的观察期限。后台暂停回来仍需明确继续，不把后台时间登记为音频错误。

停止、关闭和卸载取消本次请求归属、清理观察与声音来源。当前正文语音继续沿既有临时所有权和恢复策略；历史预览的等待、结束和错误都不标记正文语音完成，不推进剧情、不写正式槽位，也不改个人静音或音量。健康 BGM 保持，预览实际播放／缓冲状态只沿原混音入口反馈。

## 真实作品与手机尺寸检查

[Chromium](../evidence/web-history-voice-readiness/verified-native/chromium.json)、[Firefox](../evidence/web-history-voice-readiness/verified-native/firefox.json)和 [Windows WebKit](../evidence/web-history-voice-readiness/verified-native/webkit.json)各六组任务通过，使用同一新网站和原 #404 备份：真实 HTTP 挂起、可信播放／暂停事件、超时重试、实际响应迟到一秒内不自动恢复、明确重试后原生播放结束、主动暂停继续、停止释放及返回当前正文。核对实际 IndexedDB 槽位载荷摘要、剧情摘要和个人设置，历史操作不写原档。

320×568、568×320、844×390、1280×900 均检查重试、停止与历史记录按钮；每份报告有 12 项原生尺寸记录。按钮至少 44px、可完整滚入视区，列表滚动区至少 96px；短横屏列表与重听控制需要在同一滚动区内切换，并非要求全部同时显示。已查看等待、列表与返回截图。

[健康重听回归](../evidence/web-history-voice-readiness/healthy-regression)覆盖三引擎 HTTP 网站与 Chromium 本地 HTML，各六组任务：正常重听、主动暂停继续、原生结束、真实无效音源的解码错误及原记录重试、保持当前声音位置、保存重开后再重听。该工具将正文当前声音降速至 0.2 以检查临时所有权；等待专项将正文降速至 0.1，但初始正文也在等待同一文件，不能用它证明健康声音恢复。历史预览均为原速度、输出静音。健康正文恢复由前一工具单独覆盖。

[实际制作与路线](../evidence/web-history-voice-readiness/work/browser-checks.json)从生产编辑器导入 #394 原工程和 25 条记录，保存、关闭、刷新重开并双导出，七组任务通过。Chromium 桌面本地 HTML 留下线、390px 离线网站远行线各经过 66 段正文、六句原生语音结束、Auto／历史／保存重开；另行检查同内容原备份明确导入读取。这不是新包两格式×两结局的完整矩阵，也不是自然听读或真机验收。

## 未通过的探针与测试修正

[持续半包](../evidence/web-history-voice-readiness/browser/chromium-stream.json)和[分段 Range](../evidence/web-history-voice-readiness/range-probe/chromium-stream.json)两次尝试都传输了真实 WAV 前半部分，但浏览器未开始播放、时间始终为 0，随后正常出现等待重试。它们没有触发“已开始后断流”，**不得计为该原生场景通过**；开始后停滞、短暂缓冲恢复和健康长时间播放目前由受控测试覆盖，仍需补充可用媒体／设备上的原生断流观察。重放工具保留 `--stream` 的严格前置检查，不用伪造事件完成它。

早期[初次探针](../evidence/web-history-voice-readiness/baseline-chromium.json)与[前置核查](../evidence/web-history-voice-readiness/baseline-verified/baseline-chromium.json)错误等待了同样被挂起的正文语音播放；[先放行正文的探针](../evidence/web-history-voice-readiness/baseline-native/baseline-chromium.json)又因媒体复用而完整播放结束，均未形成有效红测。最终冻结复现从导入后直接打开历史，真实响应持续挂起，未修改媒体来源或故事来达成结果。

新增用例早期两轮分别遇到 jsdom 的 `audio.error` 为 undefined 和原型缺少该属性的测试夹具问题；[初轮](../evidence/web-history-voice-readiness/development-tests.json)、[夹具核查](../evidence/web-history-voice-readiness/development-fixed-tests.json)保留。改为实例上的明确无错误状态；既有健康重听夹具补上真实已就绪状态，不再把 jsdom 默认 `readyState=0` 当作正常已播放。原等待提示断言随准确文案更新，剧情／存档等保护断言未删。

Firefox 的[尺寸核查](../evidence/web-history-voice-readiness/final-browser/firefox.json)在 `boundingBox()` 返回按钮高 43.999969px 时失败。最终沿既有健康回归方式直接读取页面 `getBoundingClientRect().height`，得到 44px；保留至少 44px 与完整可见条件，不改产品样式或放宽阈值。[先前新增列表检查的失败](../evidence/web-history-voice-readiness/verified-browser/firefox.json)也保留，不复用作最终通过。

## 回归与审计

[定向回归](../evidence/web-history-voice-readiness/targeted-expanded-tests.json)两文件／26 项通过，包含 13 项新增用例：早到事件、持续与重复无进展、健康进展、短暂缓冲、无 timeupdate 的真实时间变化、音量重绘、主动续听、旧 Promise、停止和卸载释放等。红测、夹具核查及定向结果不重复计入最终数量。

[首轮完整相关回归](../evidence/web-history-voice-readiness/related-tests.json)为 1,412 项通过、两项超过默认五秒：150 步恢复背压约 5.76 秒，编辑器保存期间新编辑约 5.05 秒；没有结果断言失败。[原文件单独核查](../evidence/web-history-voice-readiness/timeout-investigation.json)七项通过，未修改这两份测试或既有超时。原因仍待查，不登记为环境原因或已经修复。

代码冻结、构建与浏览器结束后，最后仍按单工作进程、既有超时顺序执行。[最终相关回归](../evidence/web-history-voice-readiness/verified-related-tests.json)153 文件／1,414 项全部通过，[原始日志](../evidence/web-history-voice-readiness/verified-related-tests.json.log)保留；[编辑器整合](../evidence/web-history-voice-readiness/app-tests.json)两份不重叠文件／47 项通过，共 **155 文件／1,461 项功能测试**，含 13 项新增测试。[工具测试](../evidence/web-history-voice-readiness/tool-tests.tap)84 项通过，其中新增四项防覆盖检查。最终通过不关闭前述耗时波动调查，各次重复执行不累计数量。

类型检查和 Editor／Player 生产构建通过，原大分包及 jsdom 媒体未实现提示保留。[汇总审计](../evidence/web-history-voice-readiness/audit.json)核对最终报告、精确双游戏、原生复现与待验边界、全部媒体及旧来源保留；架构 118 个可移植文件／四个 Node 适配文件通过，N52-E5b 工程通过、产品验收仍 blocked。工程审计不替代全仓 check、远端 CI 或 Stable／M1 产品验收；#408 既有默认超时的原因调查继续开放。

## 当前交付与接续顺序

新 [HTML](../evidence/web-history-voice-readiness/before-rain-stops.html)46,836,351 字节，SHA-256 `691c724168b19f85fe55b9a8bc1ad65da905b5986c525b0234f8a97533c456ed`；[网站 ZIP](../evidence/web-history-voice-readiness/before-rain-stops-website.zip)35,422,800 字节，SHA-256 `f840e073c52023ca667ab6538e78dc20af4a3df98d2f32d0421da02adaeb8b1b`。二者均由实际编辑器导出，不手改生成文件。[精确交付记录](../evidence/web-history-voice-readiness/delivery.json)通过全部本批门槛后提升同一对原字节，再移除暂存目录中的相同副本；源工程及记录沿 [#394](../evidence/web-story-plans-and-farewell)，#408 双游戏、历史报告、截图和原备份保留。该提升只更新工程候选，不代表关闭下面的产品门槛。

1. 继续完整正文、演出与当前声音的多次中断接续，先用现有候选复现具体障碍，不再为等待提示新建独立系统。补原生已开始断流时要观察正播放时间后的真实缓冲，而非把初始未就绪当作它。
2. 自然全文阅读、听感与计时、主流物理手机／Safari、真实后台／锁屏／BFCache 和长时间续读按独立验收补齐；桌面静音自动化不能代签。Windows WebKit 内嵌 data／Blob／离线声音仍未通过。
3. 25 条 `fixed` 的 `checkedSourceHash` 仍为空，26 项发行条件 pending、已确认 0，九句系统 TTS 的再分发依据仍待确认。取得依据并完成人工确认后，才进入获准 HTTPS 交付，不自行把记录改成批准。

九场景、两结局、9,772 字符、87 步演出与 26 项媒体保持。长篇完整校验／快照／传输和物理内存、底层长期写入、冷开设置偶发及既有测试耗时波动仍分别跟踪；Windows／Android 原生产品化继续搁置。

## 重放

`node tools/run-web-history-voice-readiness.mjs` 支持 `--engine=firefox`、`--engine=webkit`；`--baseline` 读取冻结 #408 游戏，仅用于复现旧错误。`STUDIO_HISTORY_READINESS_SOURCE_DIRECTORY` 指向当前待测游戏对，`STUDIO_HISTORY_READINESS_OUTPUT_DIRECTORY` 必须使用新目录，已有报告拒绝覆盖。`--stream` 是未完成的原生断流探针，不能作为通过入口。

相关回归用 `node tools/run-web-history-voice-readiness-tests.mjs`，通过 `STUDIO_HISTORY_READINESS_TEST_REPORT` 选择新报告；顺序单工作进程、既有超时，原始日志保存到报告名加 `.log`。健康专项沿 `tools/run-web-history-voice.mjs`，设置新来源和输出目录。汇总为 `node tools/audit-web-history-voice-readiness.mjs`；只有同次正式重导出、报告与精确游戏字节匹配，才能沿 `--promote` 发布到本批交付目录。
