# 400 保存异常后的连续阅读与进度保护

2026-10-18，接续 [#399](399-web-reading-media-recovery.md)，修复“提示说可继续，实际却挡住阅读”的进度保护流程。目标仍是 [#304 Web 完整 Gal 交付](304-web-complete-gal-delivery.md)，内容 **1.11.0 候选**／技术 **S0.41**。没有改剧情、演出、素材、存档协议或平台范围。

## 从用户任务发现的问题

在 #399 冻结游戏里，先读到候车室并确认当前恢复记录已经实际落盘，再延迟一次 85,121 字节会话打包的原生摘要返回。使用未修改的真实时钟，等待既有 8 秒保护时限后，提示“剧情可继续”的浮层覆盖 112px 正文，原生触摸被拦截；旧恢复记录未变。[原包复现](../evidence/web-progress-recovery/baseline-chromium.json)和[遮挡截图](../evidence/web-progress-recovery/baseline-chromium-blocked-reading.png)保留。这说明阅读障碍不只存在于上一批的 Firefox 受控时钟任务。

打包故障注入只延迟一次真实的 crypto.subtle.digest Promise，不替换保存内容、原生事务、Worker 回复或剧情。存储结果通过真实 IndexedDB 的只读查询核对；没有伪造错误事件、正文状态或几何。它验证超时下的用户恢复路径，不证明所有设备上的磁盘或编解码问题已修复。

## 阅读与保存如何接续

阅读中出现恢复保护、自动保存或检查点问题时，操作区保留“保存问题”及无障碍通知，提醒及时手动保存、不要直接关闭游戏。详情进入现有阅读菜单，不自动弹窗、不抢焦点、不挡正文或分支。玩家可返回原位置继续读，也可在菜单里核对实际错误和恢复记录，再采取行动。

恢复保护新增明确的“保存当前进度”，沿已有手动槽位／覆盖确认流程，不把保存说成读取，也不擅自覆盖旧槽。本次独立恢复打包未结束时，重复恢复重试仍禁用，手动保存可按原存储队列进行；手动档成功不会把独立恢复问题标成完成。旧记录、正式档和剧情保持原来的校验与隔离。

迟到的恢复保存仍说明“不一定包含最新进度”，不会清掉错误或自动替玩家读取。物理任务结束后，只有明确重试才保护最新段落。恢复成功后入口消失；刷新后仍须明确点击“恢复上次进度”，再由原完整校验恢复实际新记录。没有增加写入队列、放宽 5／8 秒时限、取消完整性校验，或让迟到结果覆盖当前剧情。

自动／检查点提醒保留原有“知道了”关闭能力，关闭只表示玩家已知晓，不补写失败槽位。若恢复保护仍有问题，其入口继续保留。存储空间不足、后台校验失败、未结束写入和已保存旧恢复点的解释保持不同，暂停宿主不可保存或重试。

保存与媒体同时失败时，窄屏优先保留一个“保存问题”入口，菜单内展示两类真实问题；无声阅读不会清除恢复错误。欣赏画面仍可从菜单进入，必要的声音恢复、停止 Auto 和菜单操作不被挤出屏幕。正文画幅、按键／点按归属及分支确认规则不变。

## 验证与当前交付

[Chromium](../evidence/web-progress-recovery/chromium.json)、[Firefox](../evidence/web-progress-recovery/firefox.json)、[Windows WebKit](../evidence/web-progress-recovery/webkit.json)在真实计时下完成同一完整任务：延迟一次打包，旧恢复记录保持；568×320 原生点按先翻本段下一屏，再明确进入新段；在恢复未结束时手动保存当前段；迟到保存保留警告，明确重试后保护最新段落，刷新明确恢复相同 hash，手动槽位保持。

五种窗口为 568×320、320×740、390×844、844×390、1280×900。问题入口与手动保存操作在视区、至少 44px；菜单／返回保留当前剧情和本段阅读位置。真实音频错误与保存问题合并入口后，仍能查看媒体详情并明确无声返回。上述三引擎为桌面浏览器运行与手机尺寸检查，不是物理手机／Safari、自然听感或全文人工计时。

最终作者流程见 [work/browser-checks.json](../evidence/web-progress-recovery/work/browser-checks.json)：实际生产编辑器导入 #394 工程／25 条记录，保存、关闭、刷新重开，再双格式导出。完整公开工程投影及 26 媒体与 #399 深比较相同，网站仍 37 个公开文件，长度／摘要逐项匹配，没有内部工程、校订或玩家备份混入。

桌面本地 HTML 留下、390px 断网网站远行各核对 66 段正文完整 ID 和六句原生语音自然结束，含 Auto、历史回看、保存重开和明确读取后停止 Auto。#394 同内容原备份明确导入读取，#398 保留的 #395 分支备份沿定向分支流程复验；不是所有格式和路线的交叉矩阵。声音输出静音，不当作听感验收。

三引擎 [media](../evidence/web-progress-recovery/media)复验上一批普通阅读／Canvas 故障、段内偏移和恢复操作，[choices](../evidence/web-progress-recovery/choices)复验原分支备份、长按确认保护、方向键／数字选择及可读性。[press-controlled](../evidence/web-progress-recovery/press-controlled)和[press-real](../evidence/web-progress-recovery/press-real)分别跑受控时钟与真实时钟，不相互代替；原生按住／松手、H 返回、键盘、横屏拖动和触摸翻本段、旋转及菜单返回均通过。

当前六份指针报告的 recoveryObservation 均为 ready，序列化诊断 active 0、已启动任务均完成；这轮没有重现 #399 的 Firefox 存储等待。它是本轮有限流程的观测，不是该等待已修复的结论，#399 原失败报告保留。另一个使用真实 8 秒时限和明确打包延迟的进度专项，独立验证了真的遇到超时后仍可阅读／保护进度，不依赖等待问题自然消失。合计十五份定向浏览器报告核对同一最终 HTML 摘要。

最终 [相关回归](../evidence/web-progress-recovery/related-tests.json)在单 worker、默认限时及浏览器任务全部结束后完整复跑，通过 139 文件／1,245 项；另跑 [编辑器主流程与自动保存](../evidence/web-progress-recovery/app-tests.json)两文件 47 项，与前者路径无重叠，合计 **141 文件／1,292 项不同测试**。新增进度恢复 11 项包含在其中，47 项定向及下述 12 项复验不重复计数。[交付工具测试](../evidence/web-progress-recovery/tool-tests.tap)48 项通过。类型检查、Editor／Player 生产构建通过；既有构建大包和 jsdom 媒体未实现提示不作为声音验收。架构审计 118 个可移植文件／4 个 Node 适配文件、N52-E5b 工程审计通过，后者产品门仍 blocked；本批没有运行或宣称全仓 check、精确提交 Windows CI 或长期 soak 通过。

首轮 [related-tests-first-run.json](../evidence/web-progress-recovery/related-tests-first-run.json)保留 1,243 通过／2 失败：既有 Auto 等价性与 150 步恢复背压两条长篇用例，控制台均报告默认 5,000ms 超时。这轮已在浏览器结束后运行，不能只归因并行浏览器负载。未改测试限时、跳过用例或为了通过改 Runtime／Core；独立限时复验及原范围完整复跑分开记录，不累计重复次数，也不把复跑通过说成所有负载下性能已稳定。JSON 报告器不一定保留控制台超时原文，审计核对具体文件／用例与耗时，保留原报告。

[独立复验](../evidence/web-progress-recovery/timing-retest.json)在相同默认限时下通过两文件 12 项；上述两条分别约 2,552ms／3,206ms，随后原范围完整复跑也通过（约 3,343ms／3,558ms）。长篇用例接近默认时限的波动继续跟踪，不能用这次复验消除首轮失败记录。

当前可编辑源及 25 条未获人工批准的记录沿 [#394](../evidence/web-story-plans-and-farewell)。本批运行入口为 [HTML](../evidence/web-progress-recovery/before-rain-stops.html)／[网站 ZIP](../evidence/web-progress-recovery/before-rain-stops-website.zip)，[交付摘要](../evidence/web-progress-recovery/delivery.json)／[审计](../evidence/web-progress-recovery/audit.json)按最终同一对字节发布。HTML 46,790,046 字节，SHA-256 `d63fc9280774f6260ee4a85b6496e08c86666a655f28af7d1b0464015181c864`；网站 ZIP 35,376,495 字节，SHA-256 `f4c11fc1fc754a904069008e3a88b6d988e356d49bf4edea650985ca72aeeaf1`。核对通过后才提升和清理本批暂存双游戏，报告／截图／原备份与 #394／#399 历史候选保留。

九场景、两结局、9,772 字符、87 步演出、26 媒体与全部稳定 ID 保持。26 项发行条件 pending、已确认 0，25 条校订未获人工批准；没有因运行恢复测试批准内容或许可。

## 未关闭事项与下一批顺序

本批修复的是错误后的阅读阻塞与明确保护路径。恢复存储／打包为什么在特定受控时钟或设备上迟迟不结束仍需追踪，不能把点按通过写成 IO／编解码或任意时钟问题治愈。Windows WebKit 内嵌音频仍未通过。长期读写、物理设备后台／锁屏、自然全文／听感／计时、发行依据、获准公网和长篇成本未关闭，原生产品化继续搁置。

1. 回完整作品连读、人物／语音节拍与演出衔接，同时跟踪真实读写／受控时钟的恢复诊断。出现具体使用障碍就按用户任务纠正，不为重复测试升级剧情版本。
2. 核对 26 项真实发行依据、九句系统 TTS 再分发条件与公开署名。未有依据保持 pending，需要替换时沿稳定 ID 流程，不制造批准记录。
3. 继续物理主流手机／Safari 的旋转、后台／锁屏、长期续读，再做获准 HTTPS 实际部署；保留 WebKit 声音和冷开设置偶发跟踪。

## 重放

进度专项 `node tools/run-web-progress-recovery.mjs`，另加 `--engine=firefox`／`--engine=webkit`；`--baseline` 使用冻结 #399。可设置 STUDIO_PROGRESS_SOURCE_HTML／STUDIO_PROGRESS_OUTPUT_DIRECTORY，输出应为新目录。专项需要真实 IndexedDB、可用的存储压缩／摘要链，不伪造保存绕过它。

回归 `node tools/run-web-progress-recovery-tests.mjs`；审计 `node tools/audit-web-progress-recovery.mjs`。作者重新制作沿 tools/run-web-auto-voice-continuity.mjs，设置新的 STUDIO_AUTO_CONTINUITY_OUTPUT_DIRECTORY 和 `STUDIO_AUTO_CONTINUITY_SOURCE_DIRECTORY=evidence/web-story-plans-and-farewell`，默认生产预览 5195，不覆盖冻结候选。

原媒体／分支脚本继续设置各自的新输出和本批 HTML；指针脚本 tools/run-web-reading-press.mjs 分别使用受控时钟默认模式和 `--real-time`，分别写 press-controlled／press-real。报告新增 recoveryObservation，将指针是否可读与恢复存储状态分开，不用真实时钟结果代替受控时钟结果，也不将 IO 错误改写成成功。
