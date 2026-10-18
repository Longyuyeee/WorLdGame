# 发布前复核清单与换机交接

2026-10-18，接续 [#416](416-web-reading-motion-continuity.md)，按 [#304 完整 Web 作品](304-web-complete-gal-delivery.md)的作者发布准备推进。本批把文字／演出校订和当前稿结局试玩记录带入发布准备及制作交接，不新建审批或发布平台。仍为 **《雨停之前》1.11.0 候选／S0.41**；剧情、演出、26 媒体、播放器／Core／Runtime 和玩家存档格式不变。

## 从实际作者任务发现的问题

在隔离的生产编辑器导入 #394 源工程与 25 条校订记录。[旧版页面对照](../evidence/web-release-review/baseline/browser-checks.json)中，检查页正确保留 25 条待复核记录，但下载的发布准备清单没有任何一条问题，也没有结局试玩事项。换电脑后，单看这份清单无法知道还要核对哪些文字、演出和路线。

[八项初始红测](../evidence/web-release-review/red-tests.json)均失败，表明原准备报告没有这些信息。本批不把已有提醒再标成新开发成果：发布页原来的校订提醒、结局进度、记录导入导出和原始制作交付能力均已存在，改动在于贯通清单、快照、附带选项及接续入口。

## 一个内部清单串起作品复核和交接

发布页的作品信息、生成、试玩与部署三个位置均汇总当前可用记录，可以直接处理文字／演出，或从故事开头复查路线，返回时保留所选导出格式。未应用草稿、构建中等原禁用条件保持，不新增本地验证导出的人工审批门槛。

内部 TXT 与制作交付包的 `release/preparation.json`、`release/准备上线.txt` 增加：

- 当前运行源码摘要；按实际场景与语句排序的问题、稳定 ID、问题类别、记录时内容和当前内容。原位置被删仍保留并提醒核对；当前内容取前 400 个 Unicode 字符，超出加省略号，选择包含提问／选项，结局使用实际名称。
- 待修改、已修改待复核、内容已变需复核及当前稿已复核分别计数。`fixed` 不转为 `verified`，导出／启动／到达均不自动确认记录。
- 当前可列出的结局与到达记录，按场景和结局 ID 匹配；同名结局不混淆，重复到达不多计，旧稿和无法匹配的记录不计当前稿。没有可列出结局时要求先做故事检查，不显示“0/0 已完成”。

单独下载汇总当前作者会话可用记录；制作交付包只汇总明确勾选附带的原始记录。未附带用 `not-included` 和空计数标明，不伪装成零待办／已验收；有记录读取或保存异常时为 `incomplete`，不把部分信息当成完整清单。

校订存储异常时，若作者选择附带校订，生成会给出明确错误而不产生不完整交付。可以核对／备份原记录，或明确取消附带后继续；原浏览器损坏记录不被清空。试玩进度原有保护保持。原始作者记录仍在 `review`，其摘要在 `release`，两者均不进入玩家文件。

## 实际制作、恢复与范围

[Chromium](../evidence/web-release-review/final-chromium/browser-checks.json)九组、[Firefox](../evidence/web-release-review/final-firefox/browser-checks.json)六组、[Windows WebKit](../evidence/web-release-review/final-webkit/browser-checks.json)六组通过。实际导入工程／原始记录，核对独立下载清单、处理校订与从头试玩的返回路径，再保存、关闭、刷新重开及双格式制作交付。三引擎均检查 320×740、390×844、844×390 下新增区域不横向溢出、按钮不少于 44px；已查看竖屏实画，不当成物理手机／Safari 验收。

三引擎的 HTML／网站制作包均实际下载，校验清单内每份文件的大小与摘要、原始源工程和 25 条未人工批准记录。公开文件分别为一份 HTML 和 37 份网站文件，逐字节与 #416 相同。Chromium 另检查两格式取消附带，确认 `review` 原始文件及 `release` 摘要都不泄漏未勾选的记录；最后在全新浏览器数据区导入实际制作 ZIP，明确合并两种记录，仍保留 25 条待复核，不自动批准。

可查看本次实际下载的[含当前问题的准备清单](../evidence/web-release-review/final-chromium/standalone-preparation.txt)与[明确不附带记录的清单](../evidence/web-release-review/final-chromium/html-excluded-preparation.txt)。清单为作者内部资料，包含问题及剧情内容，不上传玩家网站。

源码和浏览器任务冻结后，[相关回归](../evidence/web-release-review/related-tests.json)单工作进程、原超时，162 文件／1,506 项通过，319.38 秒；[原日志](../evidence/web-release-review/related-tests.json.log)保留。[独立 App 整合](../evidence/web-release-review/app-tests.json)另两份不重叠文件／47 项通过，共 **164 文件／1,553 项相关功能测试**。新增 14 项：十项复核／到达／内容摘要规则、三项作者操作与异常恢复、一项双格式可选交付隔离；红测、定向与重复运行不累计。

[工具回归](../evidence/web-release-review/tool-tests.tap)133 项通过，含新增五项冻结报告防覆盖。根类型检查、Editor／Player 生产构建通过，既有分包体积及 jsdom 媒体未实现提示保留。[汇总审计](../evidence/web-release-review/audit.json)核对最终源码、所服务生产文件、实际导出清单、原工程／记录、26 媒体与原游戏摘要；架构 118 个可移植文件／四个 Node 适配文件通过，N52-E5b 工程通过、产品验收仍 `blocked`。不替代全仓 check、远端 CI 或最终作品验收。

本批冻结下载和报告按原字节保存，源码摘要仅允许 LF／CRLF 等价，不放宽其他内容差异。入库前另核对冻结证据的 Git 索引与磁盘摘要，无关 `.browser-diagnostic/` 不纳入。

## 探针与回归修正

首轮 Chromium 已完成八组，但把约 80 MB 的实际制作包用内存文件接口回传时触及 Playwright 的 50 MB 限制。改为使用原实际下载路径，在全新浏览器中完成导入；原失败报告保留，不算产品工程导入失败或恢复验收通过。早期定向用例先漏选了“附带校订记录”，随后又在选项变更后，未等原有异步检查恢复便点击禁用按钮；改为明确选择选项，并等待“按钮已可用”的真实条件，不提高超时、不放宽断言，保留两份超时报告。

初版清单里选择步骤只显示 `choice`。检查实际下载文件后补齐提问／选项和结局名称，并加入 Unicode 摘录边界测试，再重新构建并执行三引擎整链。旧 `chromium`、`chromium-final`、`verified-*` 报告保留对应当时范围，只有 `final-*` 绑定本批冻结源码、最终实际清单和制作包。

## 保留的工程与玩家候选

本批临时制作交付 ZIP 用实际下载文件核对，在测试浏览器生命周期内检查，不新增冗余游戏／源 ZIP 入库。当前可编辑源仍为 [#394 工程](../evidence/web-story-plans-and-farewell/before-rain-stops-project.zip)与[原始校订记录](../evidence/web-story-plans-and-farewell/before-rain-stops.worldreview)；当前玩家候选仍为 [#416 HTML](../evidence/web-reading-motion/before-rain-stops.html)／[网站 ZIP](../evidence/web-reading-motion/before-rain-stops-website.zip)。没有提高作品内容版本或重发同字节游戏。

隔离作者浏览器清单中的 0/2 表示本次未导入或产生编辑器结局到达记录，不表示删除了已经开发的两结局，也不否定 #416 独立导出游戏的完整路线证据。编辑器到达记录本身也不是人工自然阅读、配音听感或全部分支验收。

## 接续与未关闭边界

完整作品保持九场景、两结局、9,772 字符、87 步演出、26 媒体和九句系统 TTS。25 条原始记录均为 `fixed`、`checkedSourceHash:null`，没有人工批准；发行条件 pending 26、确认 0。清单、运行记录或工具都不能提供缺失的发行依据。

下一批优先按这份逐场清单复核实际正文／前后文、人物出入场和声音衔接，遇到具体问题再改原工程；若改变剧情或演出，应提升内容版本、保留旧游戏并重新核对旧档拒绝／接续，不能靠补运行记录宣布定稿。不继续扩建通用输入、动画、音频或审批框架。

自然完整听读／计时、主流物理手机／Safari、真实后台／锁屏／BFCache、原生开始后断流、WebKit 内嵌声音、永久原生解码停滞、长期运行、发行依据和获准 HTTPS 仍待验。冷开设置偶发、既有默认超时、长篇完整校验／快照／传输／物理内存与底层写入成本保持原边界。Windows／Android 原生产品化仍搁置。

## 重放

先构建 Editor，并让 `STUDIO_UI_URL` 指向该生产构建（默认本机 5195）。`node tools/run-web-release-review.mjs` 运行 Chromium 实际作者任务，`--engine=firefox`／`--engine=webkit` 使用对应桌面引擎；`STUDIO_RELEASE_REVIEW_OUTPUT_DIRECTORY` 必须使用新目录，冻结报告拒绝覆盖。`--baseline` 只检查所服务旧构建的缺口，不替你构建旧版本。

`node tools/run-web-release-review-tests.mjs` 接续 #416 全部相关功能文件并加入本批新文件，使用单工作进程和原超时；`STUDIO_RELEASE_REVIEW_TEST_REPORT` 可指定新报告。两份 App 整合文件另行执行，不重复累计。浏览器／构建和大回归分开运行，最终使用 `node tools/audit-web-release-review.mjs` 汇总，不提升新游戏。
