# 404 换设备备份准备与取消接续

2026-10-18，接续 [#403](403-web-audio-readiness-and-continuation.md)，沿 [#304 完整 Web 作品](304-web-complete-gal-delivery.md)和 [#11 原始存读档要求](11-gal-foundation-and-automation.md)，处理换设备前“文件读取或备份准备一直等待，存读档窗口无法退出”的障碍。内容仍为 **1.11.0 候选／S0.41**，不修改剧情、素材、Core、Runtime 或存档协议。

## 玩家备份和接续

导出准备、导入前检查属于只读操作，现可明确取消；Escape 首次取消准备并保留窗口，再次按下正常关闭。窗口返回按钮也可取消准备后离开。等待八秒后解释当前仍未完成，可以重新选择文件或槽位，不把等待直接判成损坏。取消后恢复输入焦点，允许重选同一文件；已有完整下载仍保留，标成“上次生成”，不会让取消后的旧请求突然下载另一份文件。

实际文件读取采用可中止的 FileReader，退出时取消并移除监听；没有 FileReader 的回退宿主只能取消等待，不能声称已停止底层文件 IO。读取槽位、截图、Web Crypto 和正式会话校验的等待随所属操作取消，迟到结果或拒绝不更新新任务。后台／宿主暂停会取消只读准备，返回前不允许重新提交；作品、构建、存储环境变化或卸载时退役旧任务。

完整进度的生成与导入检查复用现有正式会话 Worker，校验结果只用于核对，不提前替换当前故事。备份仍为 `world.player-save-backup` schema 1，正式槽位 V3 和完整会话格式不变；大小、校验和、作品／构建、完整进度、元数据及截图校验仍全部执行。标题页等异步槽位列表到达后会选择可用的已有进度，避免默认停在不可用的“当前游玩进度”。

真正导入仍须明确选手动槽位、确认覆盖，通过原有写入协调和比较后写入保护。**已提交的导入写入不能靠取消撤销**，提交期间不提供取消／关闭，长等待说明要求核对结果而非重复提交。未确认的写入失败不再声称原槽位必然不变；已经写入但列表刷新失败，会明确说明已写入并要求重开核对。导入成功仍停在原故事／标题，必须另点读取才能接续，读取后 Auto 不自动开启。

审计另发现：导入已写入、列表刷新未返回时切换存储环境，旧成功提示会覆盖新环境说明。增加失败测试复现后补所属任务核对，保留旧存储真实写入，不把它当成新环境成功或已撤销。

## 原需求和内容边界

本批重新核对 #394 的九场景正文、两条结局和 25 条实际校订文本，与原始存读档／历史要求及 #304 的完整制作交付路线对齐，没有据此认定需要再改剧情。九场景、90 段旁白、九段对白、两结局、9,772 字符、87 步演出、26 份媒体和九句配音保持；没有为界面修复提高内容版本或制造新素材。

25 条 fixed 校订的 `checkedSourceHash` 仍全部为空，不能算人工批准。26 项发行条件全部 pending、已确认 0，九份系统合成语音再分发依据仍待核实。自然全文阅读、听感和计时、物理主流手机／Safari、真实旋转／系统后台／锁屏／BFCache、长期接续及获准 HTTPS 部署继续开放。Windows WebKit 内嵌 data／Blob／离线音频未通过，HTTP 分离资源可播放不等于修复该边界；冷开设置偶发仍保留。原生 Windows／Android 产品化仍搁置，不宣布 Stable／M1。

本批没有解决底层存储写入长期等待，也不宣称任意 96 MiB 备份都可随时抢占：JSON 解析、规范化备份信封及最终快照仍含主线程同步成本。完整长历史校验／重建成本应独立测量，不另造轻量解释器、跳过校验或扩大 Worker 回退来伪装提速。

## 复现记录

冻结 #403 游戏的[浏览器基线](../evidence/web-backup-continuation/baseline-chromium.json)选择真实 `.worldsave`，受控延迟实际文件读取结果，九秒后仍 busy，返回按钮禁用且没有取消入口，剧情不变。它证明界面在该等待边界无法退出，不冒充操作系统文件故障。

早期 [red-tests](../evidence/web-backup-continuation/red-tests.json) 和 [development-tests](../evidence/web-backup-continuation/development-tests.json) 中，测试没有等待异步存档选项到达，导出可能根本未开始；这些失败不能作为旧实现缺陷的证明。修正为等待真实槽位选项并核对 busy 后再取消，未延长默认超时或删除断言。纯读取测试另遇跨执行域 Uint8Array 深比较差异，改成逐字节数组比较，保留[最初记录](../evidence/web-backup-continuation/development-preparation-tests.json)。

[写入后旧刷新红测](../evidence/web-backup-continuation/post-write-owner-red.json)是有效产品复现：14 项中仅新所属环境用例失败，实际旧提示覆盖了新环境说明；修复后的[定向测试](../evidence/web-backup-continuation/final-targeted-tests.json)为四文件／38 项通过，其中新增 13 项取消／读取／完整校验和 14 项玩家操作边界，原 11 项备份用例保持。

初稿游戏的浏览器与布局报告保留在 `browser`／`browser-layout`，不替代写入后所属环境修复后的最终游戏验收。短横屏截图曾只滚到取消按钮，随后补核对整个等待说明可正常滚动到视区且不被吸顶标题遮挡，没有因此改 CSS 或伪造几何数据。

## 最终游戏的实际流程验证

[作者及路线报告](../evidence/web-backup-continuation/final-work/browser-checks.json)从生产编辑器实际导入 #394 工程与校订，保存、关闭、刷新重开并双格式导出。源工程摘要和 25 条记录不变，公开载荷及全部 26 媒体保持，网站 37 个公开文件逐项核对。桌面本地 HTML 留下线、390px 断网网站远行线各完成 66 段正文／六句原生语音结束，含 Auto、历史、保存重开及明确读档后停止 Auto；另实际导入并读取原同内容备份。这是两条限定格式路线，不是新包两格式乘两路线完整矩阵。

同一最终双游戏的 [Chromium](../evidence/web-backup-continuation/final-browser/chromium.json)、[Firefox](../evidence/web-backup-continuation/final-browser/firefox.json)、[Windows WebKit](../evidence/web-backup-continuation/final-browser/webkit.json)各七组流程通过：真实文件准备取消、迟到原生可信 load 隔离、关闭后同文件重试、既有正式 Worker 完整检查、明确导入、取消真实 Web Crypto 结果等待后不下载、重新导出实际 `.worldsave`，再在全新浏览器数据区导入并明确读取同一进度。实际读取后 runtime hash 与原备份一致，历史游标为 16，Auto 为 off；当前游玩进度也真实捕获并下载备份，原手动槽位载荷摘要保持。

存储检查只读实际 IndexedDB 内容并计算 SHA-256，没有写入伪造数据库、替换完整校验结果或注入剧情事件。文件读取及 Web Crypto 延迟作用于真实原生操作边界，取消后的原生可信 load 仍被记录并忽略，不冒充 OS 文件故障或实际手机。320×740、568×320、844×390、1280×900 的取消／返回按钮至少 44px、可滚动到视区，整个等待说明也可到达且不被标题遮挡。全新浏览器数据区验证了文件携带接续，不等于物理换机验收。

最终游戏另通过 [Chromium 本地 HTML 历史重听六项复验](../evidence/web-backup-continuation/history/chromium-file.json)，覆盖实际原声播放、可信 ended、错误重试、当前语音／BGM 归属、四尺寸与刷新明确读取。当前语音放慢到 0.2 倍观察归属，试听原速，声音输出静音；这些任务不作为自然全文听感或计时，也不复用 #403 的三引擎历史报告来宣称新包全矩阵通过。

所有构建与浏览器结束、产品代码冻结后，单工作进程、默认超时顺序运行：[相关回归](../evidence/web-backup-continuation/related-tests.json) 145 文件／1,318 项，[编辑器整合](../evidence/web-backup-continuation/app-tests.json)两个互不重叠文件／47 项，共 **147 文件／1,365 项功能测试通过**，含本批新增 27 项。[工具测试](../evidence/web-backup-continuation/tool-tests.tap) 70 项通过，含两项报告防覆盖保护；定向、早期失败及初稿结果不重复累计。类型检查、Editor／Player 生产构建通过，既有大分包和 jsdom 原生媒体未实现提示保留，不以 jsdom 充当真实播放证据。

[汇总审计](../evidence/web-backup-continuation/audit.json)检查精确游戏摘要、浏览器报告、原始备份、原 #394 四文件、#403 原双游戏及全部媒体与未批准记录。架构审计 118 个可移植文件／四个 Node 适配文件通过；N52-E5b 工程审计通过、产品验收仍 blocked。这里不是全仓测试、远端 CI 或 Stable／M1 验收。

## 当前交付

可编辑工程和 25 条未人工批准记录仍沿 [#394](../evidence/web-story-plans-and-farewell)。新的 [HTML](../evidence/web-backup-continuation/before-rain-stops.html)／[网站 ZIP](../evidence/web-backup-continuation/before-rain-stops-website.zip)只更新播放器，精确摘要见[交付记录](../evidence/web-backup-continuation/delivery.json)：HTML 为 46,805,164 字节，SHA-256 `48cc3c4f2cd96ba30fc25ed9dad774882e433d5aeccaab69c7acacbe053c1447`；网站 ZIP 为 35,391,613 字节，SHA-256 `43cfbfecb69eb4f8e2d086047e05bc85ef4b405a9b2233619e903ad7ee24761e`。

全部门槛通过后，已将这对已测原字节提升到当前下载入口，并清理本批两对临时游戏副本；原工程、历史已入库游戏、初稿及最终测试报告、截图和实际备份保留。初稿双游戏的摘要仍在 `work/artifact-audit.json`，不把初稿报告挂到最终游戏上。

## 后续开发顺序

1. 回到完整作品实际连读／演出／声音复核，按可复现的用户障碍修改；保持未批准的 25 条记录与内容版本边界，不重复导出充当内容定稿。
2. 分开测量长历史的 JSON／备份信封、Worker 正式校验及接收端快照成本；调查底层存储长期等待与冷开设置偶发，提交写入的未知结果不能靠“取消成功”掩盖。
3. 具备设备和发行依据后，补主流物理手机／Safari、系统中断与长期续读、真实素材许可和获准 HTTPS 验收。受控后台测试、桌面手机尺寸窗口及全新浏览器数据区均不代替这些验收。

## 重放方式

设置新的 `STUDIO_BACKUP_CONTINUATION_OUTPUT_DIRECTORY` 后运行 `node tools/run-web-backup-continuation.mjs`，另可加 `--engine=firefox`／`--engine=webkit`。默认只读本批正式双游戏，`STUDIO_BACKUP_CONTINUATION_SOURCE_DIRECTORY` 可指定另一对游戏；`--baseline` 固定读 #403。已有报告拒绝覆盖，服务器仅监听本机安全高位端口，退出释放服务器和浏览器。

相关回归为 `node tools/run-web-backup-continuation-tests.mjs`，汇总审计为 `node tools/audit-web-backup-continuation.mjs`。重新制作仍须从实际生产编辑器保存重开、双格式导出，用新目录保存结果；游戏哈希必须与其对应浏览器报告一致，不能以旧包通过记录替代新包。
