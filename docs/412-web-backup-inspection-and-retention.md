# 备份导入前的内容核对与旧档保留

2026-10-18，接续 [#411](411-web-history-input-boundary.md)和 [#304 完整 Web 作品](304-web-complete-gal-delivery.md)。本批处理换浏览器续读时，难以区分同一场景的备份位置、覆盖前难以辨认旧档的问题。仍为 **《雨停之前》1.11.0 候选／S0.41**，正文、演出、26 份媒体、Core、Runtime 和存档／备份格式不变，不新增整机迁移或云同步协议。

## 同一场景不能只靠名字和时间辨认

[#411 原网站复现](../evidence/web-backup-inspection/baseline/baseline-chromium.json)由真实界面生成两份备份：一份停在小夏归还书的段落，另一份停在林远想起画架的段落，均在“车站的雨”。在独立浏览器环境先把后者存入手动槽位，再检查前者并选择覆盖。文件中已有不同正文摘要和可用截图，但原导入页没有显示摘要／截图，覆盖确认也没有旧档正文。确认前实际槽位摘要和标题状态保持，复现针对的是辨认与保留流程，不是存档损坏。

备份原定义就是一份会话，不是整个浏览器的数据搬迁。本批把范围说清楚：包含该会话记录的已读／解锁、历史和可用截图，不批量迁移其他槽位或独立收藏／回想档案，个人设置与游戏素材仍需另行保留。没有用说明文字把尚未实现的迁移记作完成。

## 核对真实正文后再决定

导入文件仍先走原包络、摘要、作品／构建、截图和完整会话校验；全部通过后，从加载结果的正式展示快照提取正文或选择提示，沿既有规则移除 Ruby 注音并限制为 160 个 Unicode 码点。结局显示其实际名称，没有正文的位置明确提示。摘要仅用于核对，不加入文件、槽位或 Runtime，也不替代正式读取。

“备份内容核对”显示作品、记录位置、时间、来源、兼容情况、阅读类型和校验后的摘要。可选文件头 `readingExcerpt` 可能来自保存时的另一种语言，不作为该摘要的权威；没有这个可选字段的旧备份也可从完整会话得出内容。槽位原字节与保存时的显示信息保留，不改写旧文件或伪造内容兼容。

截图默认不展开，玩家点击后才创建展示 URL；收起、换文件或关闭时释放。截图不能解码或宿主不能建立 URL 时，保留已校验摘要与导入能力，截图仅供参考。文件仍需通过原来严格的截图字节／摘要检查，不能用显示回退放宽文件校验。

选择目标时显示该槽位记录的场景、正文摘要和时间；空槽与尚未核对的列表分别说明，旧档没有摘要则提示结合场景和时间核对。覆盖确认重复旧正文，并提供“先备份这个旧槽位”：明确选中对应导出来源、展开导出区并聚焦按钮，待导入文件和确认仍保留。下载后仍须玩家明确确认覆盖，导入后仍须单独读取；没有自动写入、自动读档或新的取消写入承诺。

目标在其他窗口变化时，原原子比较继续拒绝旧确认并刷新列表；不能拿已展示的对照当作覆盖授权。保留旧槽位导出与导入写队列、准备取消、迟到结果保护和版本拒绝均沿原实现。

## 实际文件与继续阅读

[Chromium](../evidence/web-backup-inspection/current-browser/chromium.json)、[Firefox](../evidence/web-backup-inspection/current-browser/firefox.json)、[Windows WebKit](../evidence/web-backup-inspection/current-browser/webkit.json)的网站和 [Chromium 本地 HTML](../evidence/web-backup-inspection/local-html/chromium-file.json)各六组任务通过。每份报告绑定同一新游戏对，使用实际界面生成的两份同场景备份，在独立浏览器环境核对、查看可用截图、保留原目标、取消、再次检查、明确覆盖与读取，然后刷新重开。保留旧槽位的下载文件与原后段备份具有完全相同的会话字符串；写入前标题状态和实际 IndexedDB 槽位载荷摘要保持，读取后回到核对过的前段且 Auto 关闭。

320×568、568×320、844×390、1280×900 的明确覆盖按钮可完整滚入视区且至少 44px；已查看竖屏核对和短横屏确认画面。内容较长时沿原弹窗滚动，不为凑一屏缩小按钮或隐藏核对文字。窗口与桌面引擎检查不替代物理设备／Safari 或读屏器验收。

[实际作者流程](../evidence/web-backup-inspection/work/browser-checks.json)从生产编辑器导入 #394 原工程和 25 条记录，保存、关闭、刷新重开并双导出，七组任务通过；包含两完整路线的后段历史／保存接续和原同内容备份读取。[独立四格矩阵](../evidence/web-backup-inspection/matrix/matrix.json)再覆盖 HTML／网站各两路线，每格 66 段正文、六句原生声音结束、Auto、明确读档和槽位保持，网站两线实际缓存后离线刷新、HTML 两线实际离开返回。另有[三引擎历史操作回归](../evidence/web-backup-inspection/history-regression)各六组，核对 #411 的输入边界、查找／重听和返回阅读。

这些声音输出静音，不计自然听感或真人计时；Windows WebKit 的 HTTP 任务不表示内嵌／离线音频或 Safari 通过。

## 开发检查中的修正

[初始红测](../evidence/web-backup-inspection/red-tests.json)13 项中两项通过、11 项失败；除尚未提供的新核对能力外，还含两个测试夹具问题。[首轮定向检查](../evidence/web-backup-inspection/targeted-tests.json)49 项通过、两项失败：一项把冲突后的列表刷新回调误认为成功写入；另一项给 `slots` 传入完整槽位而非正式摘要，导致原子比较始终不一致并超时。[单项核查](../evidence/web-backup-inspection/import-focus-tests.json)和[带阶段诊断的核查](../evidence/web-backup-inspection/import-diagnostic-tests.json)保留。

夹具改为真实 `listSummaries` 输出，明确断言冲突后目标不变、刷新列表但不读取；没有放宽原子比较、提高五秒期限或删除存档保护断言。临时诊断输出已移除。[最后定向回归](../evidence/web-backup-inspection/final-targeted-tests.json)五文件／56 项通过，包含新增 18 项摘要、同场景对照、保留旧档、显式读取与图片生命周期测试。图片组件单测隔离已校验 Blob 的展示归属；真实图片解码由前述实际备份文件检查承担。首轮类型检查的两个未使用测试导入已清理，随后根类型及双生产构建通过。

## 最终测试和交付

代码冻结、浏览器任务结束后，按既有超时和单工作进程执行。[相关回归](../evidence/web-backup-inspection/related-tests.json)157 文件／1,459 项通过，[原始日志](../evidence/web-backup-inspection/related-tests.json.log)保留；[编辑器整合](../evidence/web-backup-inspection/app-tests.json)两份不重叠文件／47 项通过，共 **159 文件／1,506 项功能测试**，包含新增 18 项。[工具测试](../evidence/web-backup-inspection/tool-tests.tap)100 项通过，含新增六项防覆盖检查；定向、红测和重复执行不累计。

根类型和 Editor／Player 生产构建通过，既有大分包及 jsdom 媒体未实现提示保留。[汇总审计](../evidence/web-backup-inspection/audit.json)核对精确双游戏、实际备份会话、原包络格式、全部媒体、来源和报告。架构 118 个可移植文件／四个 Node 适配文件通过，N52-E5b 工程通过、产品验收仍 blocked；不代替全仓 check、远端 CI 或最终作品验收。

新 [HTML](../evidence/web-backup-inspection/before-rain-stops.html)46,841,743 字节，SHA-256 `bd453092147827d1d37b5642794441afabbc69b6ea56f10fb6dc28aaadba6bf7`；[网站 ZIP](../evidence/web-backup-inspection/before-rain-stops-website.zip)35,428,192 字节，SHA-256 `09427c7a0b7e3c148bae5933874f39ba1ab639bfbfd8cd9834e0ed189060d790`。均为实际编辑器导出的原字节，剧情载荷和 26 项媒体与 #411 完全相同。[精确交付记录](../evidence/web-backup-inspection/delivery.json)通过门槛后才提升同一对游戏，核对根目录两份字节后清理 `work` 的相同副本；原 #411 游戏、#394 源和记录、各轮报告及所有实际备份保留。

## 接续与未完成项

可编辑源仍为 [#394 工程 ZIP](../evidence/web-story-plans-and-farewell/before-rain-stops-project.zip)与[校订记录](../evidence/web-story-plans-and-farewell/before-rain-stops.worldreview)。九场景、两结局、9,772 字符、87 步演出和九句系统 TTS 保持；25 条 `fixed` 记录的 `checkedSourceHash` 仍为空，发行条件 pending 26、已确认 0。

下一批回完整作品“完成一条路线→从已保存分歧体验另一条→回想后返回”的具体任务，审查结局前后的阅读和进度辨认；先复现再修改，不扩展整机备份或音频框架来替代作品验收。自然全文听读／计时、主流物理手机／Safari、真实后台／锁屏／BFCache、开始播放后的原生断流、WebKit 内嵌声音、长期运行和授权 HTTPS 交付继续开放。冷开设置偶发、既有默认超时原因、长篇完整校验／快照／传输与物理内存、底层长期写入成本不因本批关闭；Windows／Android 原生产品化仍搁置。

## 重放

`node tools/run-web-backup-inspection.mjs` 默认读取本批根目录的游戏对，支持 `--engine=firefox`、`--engine=webkit` 和 Chromium `--file`。`--baseline` 固定 #411 网站，仅复现原问题。`STUDIO_BACKUP_INSPECTION_SOURCE_DIRECTORY` 可指定当前待测游戏对；`STUDIO_BACKUP_INSPECTION_OUTPUT_DIRECTORY` 必须用新目录，已有报告拒绝覆盖。

`node tools/run-web-backup-inspection-tests.mjs` 按 #411 原集合加本批文件，维持单工作进程与既有超时；通过 `STUDIO_BACKUP_INSPECTION_TEST_REPORT` 指定新报告并保留 `.log`。完整矩阵和历史回归沿 #401、#411 工具，必须明确同一对游戏和新输出目录。汇总为 `node tools/audit-web-backup-inspection.mjs`，不能复用其他包的通过结果。
