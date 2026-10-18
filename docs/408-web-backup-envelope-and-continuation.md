# 长篇备份的后台处理与安全接续

2026-10-18，接续 [#407](407-web-reading-meta-continuity.md)和 [#304 完整 Web 作品](304-web-complete-gal-delivery.md)。本批处理换设备接续中的具体卡顿：大备份的解析、摘要准备和打包占住主线程，让已有的取消入口不能及时响应。作品保持 **1.11.0 候选／S0.41**，不改正文、演出、26 项媒体、Core、Runtime、正式存档或备份文件格式。

## 玩家操作与保护范围

从当前进度或所选槽位生成备份、选择文件检查，都接入独立的一次性后台计算。UTF-8、JSON、规范化摘要、截图编码与检查沿原实现执行；生成结果以原字节回传，读取结果仅带已检查的槽位与受限截图。输入不被转移失效，不保留上一份大结果或复用校验结论。

取消准备会终止所属 Worker 并丢弃结果，释放其 Blob URL。取消、错误、消息解码错误及 15 秒后台处理期限结束后，迟到结果不生成下载、不出现导入入口，也不替换故事；玩家可以重新选择文件或重试。原八秒长等待提示、关闭／Escape、项目或存储切换和后台时的取消归属保持。这不表示撤销已开始的底层存储写入，或保证浏览器内部密码计算立即停止。

导入仍先通过备份信封、作品、截图检查，再经正式完整会话校验，并核对摘要、构建、场景、展示类型和标题。只检查文件不会写槽位；明确导入沿既有原子比较保护，明确读取后才替换故事，Auto 为 off。外层摘要正确不能代替完整剧情校验，备份中的历史和分支不截短。96 MiB 文件、64 MiB 会话和原截图限制保持。

宿主缺少 Worker 或构造被阻止时，沿既有严格本机兼容路径执行；该路径仍可能同步卡顿。线程已启动后失败则明确报错，不再偷偷把同一重任务同步重算。完整会话校验、接收后的快照重建、输入复制以及底层读取／写入仍有独立成本。

## 实际成本对照

[冻结基线](../evidence/web-backup-envelope/profile-frozen/baseline.json)读取 `7ca00eb` 的原备份与 Worker 模块，[当前测量](../evidence/web-backup-envelope/profile-frozen/current.json)使用同一输入规则。每个大小各三次；最大样本为 18,523,136 个会话字符、21,536,793 字节信封。它去掉截图，把真实备份的会话字符串重复用于压力测试，**不是合法的完整长篇存档**；正式会话检查前的显式探针会结束该测量，不把压力样本拿来导入故事，也不计完整导入或图片显示成本。

最大样本的主线程心跳间隔：原导出约 313–339 ms、原检查约 244–265 ms；后台版分别约 16–18 ms、13 ms。总等待没有提速：原导出约 313–319 ms、检查约 245–266 ms，后台版约 339–362 ms、302–323 ms。小文件也有线程启动开销。本批改善的是等待时的响应与取消，不是总体性能、手机内存或长篇完整校验验收。

不延迟结果的真实后台压力任务约 29 ms 取消，浏览器最终观察到零个遗留线程。早期探针在两个动画帧后立即检查退出，仍观察到一个线程并失败；[失败记录](../evidence/web-backup-envelope/profile-final/attempt-failure.json)保留。最终改为明确等待异步退出通知，仍要求零遗留；未修改产品代码或取消该检查。

## 真实作品接续验证

[Chromium 网站](../evidence/web-backup-envelope/browser/chromium-website.json)、[Firefox 网站](../evidence/web-backup-envelope/browser/firefox-website.json)、[Windows WebKit 网站](../evidence/web-backup-envelope/browser/webkit-website.json)和 [Chromium 本地 HTML](../evidence/web-backup-envelope/browser/chromium-html.json)各六组任务通过。每份观察八次原生后台任务及退出，覆盖检查取消／迟到结果、重试、篡改拒绝、明确导入读取、槽位备份和当前进度再次检查。核对原生 IndexedDB 载荷摘要；检查、取消和导出不写原槽位。320×568、568×320、844×390、1280×900 的取消按钮可滚入视区且至少 44px。

取消专项由宿主包装器暂缓交付实际可信消息，既不伪造结果，也不替换计算或校验；它检验迟到结果归属，与前述未延迟的 CPU 取消测量分开。已查看短横屏等待截图。桌面引擎与手机尺寸窗口不是物理手机、系统锁屏或 Safari 验收。

[实际作者与路线](../evidence/web-backup-envelope/work/browser-checks.json)从生产编辑器导入 #394 工程及 25 条记录，保存、关闭、刷新重开并双格式导出，七组任务通过。桌面本地 HTML 留下线、390px 离线网站远行线各经过 66 段正文、六句原生声音结束及 Auto／历史／保存重开；同内容旧备份另行恢复。声音输出静音，不计自然全文听感／计时或新包四格完整路线矩阵。[上一批续读回归](../evidence/web-backup-envelope/reading-regression/chromium.json)另有七组真实跨窗口事件、滚动与旧保存摘要接续检查通过。

## 测试与审计

[定向回归](../evidence/web-backup-envelope/targeted-final-tests.json)八文件／139 项通过，含新增 22 项后台客户端测试：原实际备份逐字节往返、完整校验不可省略、取消后不继续校验、重试、迟到／外来消息、错误／超时释放、畸形传输及无 Worker 兼容检查。早期两次测试各一项失败，分别暴露跨 realm 类型判断及测试自身的 TypedArray 比较问题；原报告保留，非玩家红测或最终通过报告。

首轮完整相关集为 1,400 项通过、一项既有长历史 Auto 测试超过默认 5 秒。[原失败报告](../evidence/web-backup-envelope/related-tests.json)和[单文件核查](../evidence/web-backup-envelope/timeout-investigation.json)保留；原测试与超时未改，单独重跑九项通过，Auto 用例约 2.8 秒。第二轮 Auto 约 2.5 秒通过，但[编辑器保存失败重试用例超时](../evidence/web-backup-envelope/final-related-tests.json)；[编辑器单文件核查](../evidence/web-backup-envelope/editor-timeout-investigation.json)中该用例通过，另一条保存期间再编辑的用例超时。各次失败都是原默认五秒期限，未发现结果断言失败；超时原因仍待查，不登记为环境原因或已经修复。

代码冻结、构建与浏览器结束后，最终仍以单工作进程、既有超时顺序执行。[最后一轮相关回归](../evidence/web-backup-envelope/verified-related-tests.json)152 文件／1,401 项全部通过，[原始日志](../evidence/web-backup-envelope/verified-related-tests.json.log)保留；[编辑器整合](../evidence/web-backup-envelope/app-tests.json)两个不重叠文件／47 项通过，共 **154 文件／1,448 项功能测试**，含新增 22 项。[工具测试](../evidence/web-backup-envelope/tool-tests.tap)80 项通过。前述失败、单文件核查与定向测试不重复计数；最后一轮通过不关闭既有超时原因调查。

类型检查及 Editor／Player 生产构建通过，既有大分包与 jsdom 原生媒体未实现提示保留。[汇总审计](../evidence/web-backup-envelope/audit.json)核对最终报告、精确双游戏、全部媒体、来源记录和旧版本保留；架构 118 个可移植文件／四个 Node 适配文件通过，N52-E5b 工程通过、产品验收仍 blocked。不是全仓 check、远端 CI 或 Stable／M1 验收。

## 当前交付与后续顺序

当前 [HTML](../evidence/web-backup-envelope/before-rain-stops.html)46,835,749 字节，SHA-256 `05129248f4d40e987950b3789da087de0bcb30a86678869259b67271d7b067b4`；[网站 ZIP](../evidence/web-backup-envelope/before-rain-stops-website.zip)35,422,198 字节，SHA-256 `aa4d443252c7f824b96d87b18a8c194be975bec2008e9bc669b2e6a7fc8a4801`。精确交付见 [delivery](../evidence/web-backup-envelope/delivery.json)。所有门槛核对后提升实际编辑器导出的同一对原字节，再移除暂存目录里的同一对副本；源工程及校订仍在 [#394](../evidence/web-story-plans-and-farewell)，#407 原游戏、历史报告、截图和旧备份保留。该批没有生成另一份正文或改变旧版兼容规则。

下一批回到完整作品正文、演出与声音的连续阅读和多次中断恢复，优先复现玩家真正遇到的障碍；不围绕备份新增独立存档格式或无限扩展存储框架。长篇完整校验／快照重建、传输与物理内存、底层长期写入等待、冷开设置偶发及本次测试耗时波动分别跟踪。

内容仍为九场景、两结局、9,772 字符、87 步演出、26 项媒体和九句系统 TTS。25 条 fixed 的 `checkedSourceHash` 仍为空，26 项发行条件 pending、已确认 0；TTS 再分发依据、自然阅读／听感／计时、主流物理手机／Safari、真实后台／锁屏／BFCache、长期续读和获准 HTTPS 仍待验。Windows WebKit 内嵌 data／Blob／离线音频未通过；本批本地 HTML 检查只覆盖 Chromium。Windows／Android 原生产品化继续搁置。

## 重放

`node tools/run-web-backup-envelope.mjs` 支持 `--engine=firefox`、`--engine=webkit`、`--html`；用新的 `STUDIO_BACKUP_ENVELOPE_OUTPUT_DIRECTORY` 保存报告，用 `STUDIO_BACKUP_ENVELOPE_SOURCE_DIRECTORY` 指向待检验游戏对。已有报告拒绝覆盖，退出关闭浏览器与本机服务器。

成本对照为 `node tools/profile-web-backup-envelope.mjs --baseline`，再不带参数运行当前版；必须使用新的 `STUDIO_BACKUP_ENVELOPE_PROFILE_DIRECTORY`，基线模块会从固定原提交提取并随报告冻结。相关回归用 `node tools/run-web-backup-envelope-tests.mjs`，通过 `STUDIO_BACKUP_ENVELOPE_TEST_REPORT` 指定新报告。汇总审计为 `node tools/audit-web-backup-envelope.mjs`；正式重导出、报告和精确游戏字节需重新配套，不能套用旧包通过结果。
