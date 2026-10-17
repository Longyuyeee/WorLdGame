# 384 人物出场、昼夜与分支表达校订

2026-10-17，按 [#383](383-web-cache-space-and-selected-cleanup.md) 回到 [#304 Web 完整作品交付](304-web-complete-gal-delivery.md)。实际阅读九场景源脚本、查看现有素材并运行原 1.9.0 游戏后，修正四处读者可见的问题，通过真实编辑器制作 **《雨停之前》1.10.0 内容候选**。本批不扩展版本管理或模板，不改 Runtime、Editor 或 Player 产品代码；技术基线仍为 S0.41，不宣布 Stable。

## 实际问题与修改

| 读者遇到的问题 | 本批处理 |
| --- | --- |
| 开场林远独自等候，小夏下一段才走来，画面却已显示她 | 把原 `stmt_ui_4` 出场指令移到 `stmt_ui_7` 前；第一段 `stmt_ui_5` 不再提前出现小夏，原 ID、立绘和后续配音保持 |
| 远行路线 `stmt_ui_219` 写“见面前夜”，仍显示白天工作室 | 段前增加已有 `night_studio` 背景指令；217 仍是白天工作室，221 仍按原指令切到次日车站 |
| 结尾 `stmt_ui_238` 的“照片是修复作业”容易误读为照片修复课程，与旧书修复设定不清 | 明确新照片拍的是小夏在课程上修好的第一本书；保留共享旧海边照片题字，不借用另一分支经历 |
| 最后选择“等雨停／追最后一班车”没讲清两条路线继续约定的方式，列车此时已停靠 | 改成“今晚留下，把回信写完／今晚出发，在路上继续”；保留选项 ID、顺序、目标和提示语，不新增优劣路线 |

修改前的实际游戏观察见 [baseline.json](../evidence/web-story-arrival-and-night/baseline.json) 及同目录四张 baseline 截图；不是只从文本推断演出。精确修改意图在 [editorial-v1.10.mjs](../assets/rain-story/editorial-v1.10.mjs)，仅用于审计，不生成候选工程。

先从真实预览记录四条问题，再修改写作／权威脚本，验证脚本批次撤销和重做，保存重开后导出。旧十九条记录逐条不变，新增四条均为 fixed、`checkedSourceHash: null`；**二十三条仍待人工复核，不把“已修改”当作人工通过**。

## 当前交付与一致性

| 用途 | 当前文件 |
| --- | --- |
| 可编辑工程、完整素材及内部来源台账 | [工程 ZIP](../evidence/web-story-arrival-and-night/before-rain-stops-project.zip) |
| 独立单文件游戏 | [HTML](../evidence/web-story-arrival-and-night/before-rain-stops.html) |
| 仅含公开文件的网站上传包 | [网站 ZIP](../evidence/web-story-arrival-and-night/before-rain-stops-website.zip) |
| 二十三条待人工复核记录 | [校订记录](../evidence/web-story-arrival-and-night/before-rain-stops.worldreview) |
| 精确内容、素材与产物核对 | [产物审计](../evidence/web-story-arrival-and-night/artifact-audit.json) |

工程仍为 66 条目、九场景、90 段旁白、九句角色对白、两结局；现为 **9,753 字符、86 步演出、26 项媒体**。相对 #380 的 1.9.0，只改一段旁白、两个选项标签、移动一条出场指令并新增一条背景指令；所有原 ID、分支目标、九句配音及其原有顺序保持。26 份媒体、来源台账及除发布版本清单外的其他非脚本文件逐字节不变，未重生成素材、修改来源权限或沿用旧兼容回执。

源工程 SHA256 为 `331a1b404ee39b89680a6a7a2c0d22dd7279b3b87ab9b60d4b5fe1a253baf5e8`；HTML 为 `1225194e7c79da7c1e139a07875143110af9e9da04b2a5dcfff00639014dfc2f`；网站 ZIP 为 `bce93486c09b117240231f784e9228351b97a6ddfe159d66b91f9d889d6a861f`。HTML 与网站的完整脚本投影相同，26 份内嵌／外链媒体对源摘要核对，网站 37 个公开文件逐一核对清单字节和摘要。工程、来源台账、校订和制作包不上传玩家网站。

实际同时导出两种内部制作交付包，逐包核对相同源工程、23 条记录和两条从入口完成的真实试玩回执；其中网站制作包另实际回导到另一编辑器，重新导出的源工程逐字节一致。制作包在本次工具的临时目录验证后清理，不额外存储两份大包；换机使用上表工程 ZIP 加校订记录，不能用 HTML 替代可编辑工程。

## 测试与审计结果

- [81 项相关回归／14 文件](../evidence/web-story-arrival-and-night/related-tests.json)通过，覆盖校订任务、写作序列、工程与制作包、双格式导出、阅读、旧档拒绝及备份。
- 25 项 Node 工具测试通过：新增七项精确差异守卫，加原部署／fixture／轮询的十八项。守卫在真实导出副本上拒绝人物再次提前出场、昼夜位置错误、漏指令、额外改文、分支／ID／配音变化、素材或来源权限变化、旧兼容回执及人工记录被篡改。
- 根类型检查、Editor／Player 构建、118 个便携文件＋4 个 Node 适配文件的架构审计通过。Vite 大 chunk 警告保持；没有运行全仓 check 或长期 soak。
- [Chromium 九组实际任务](../evidence/web-story-arrival-and-night/browser-checks.json)通过，无捕获的页面错误；使用当前生产构建，入口 HTML 与 JS／CSS 按实际服务字节核对，不是旧开发页面。

作者从故事入口完整走两条路线，实际到达两个不同结局，当前入口覆盖 2/2；保存、重开、导出及制作包回导贯通。独立游戏为桌面 file HTML 留下路线和 390×844 网站断网远行路线，各 66 段正文、六句静音观察的原生语音自然结束，合计两结局；不是全格式×全部路线矩阵，也不是全篇配音。

两条独立路线分别核对六处／八处舞台状态。网站路线在 390×844、844×390 均检查人物出场、昼夜转换及结尾，保持 16:9 舞台，不拉伸成屏幕比例；关键点保留截图。137（留下）、219 和 238（远行）的快速保存、历史回退、刷新及显式读取恢复原 Runtime hash、舞台／音轨和历史，结局收藏不会因读取旧槽位而被清掉。静音只验证媒体实际播放生命周期，不代替听感。

实际原 1.9.0 HTML 导出的 `.worldsave` 在新游戏被拒绝，不提供槽位写入；未把版本号相邻视为兼容。另用真实 #383 的 1.9.0 网站在同一 loopback 地址更新到本批 1.10.0：下载、等待所有旧窗口关闭后自动启用，再断网打开保留的旧入口，原开场立绘、原槽位 hash 和备份保持；并行打开 1.10.0 仍拒绝旧备份，不改原槽位。此为 Chromium 本机实际升级，不是公网、Safari 或真机升级验收。

浏览器工具初轮曾因选项包含数字快捷键的断言及临时目录前缀守卫中止；修正工具后，原版观察及最终完整流程均重新退出 0，没有以修改产物或降低内容断言补过。

## 兼容与接续

**1.10.0 不兼容 1.9.0 或更早剧情存档。** 原 1.9.0 [源工程／记录](../evidence/web-story-branch-context)、[HTML](../evidence/web-version-retention/before-rain-stops.html) 和 [网站](../evidence/web-cache-management/before-rain-stops-website.zip) 原样保留；旧玩家用原游戏与进度备份接续，新候选从头开始。旧浏览器入口依赖同一站点、同一浏览器的缓存，不是永久、换机或完整游戏备份。新旧游戏共用槽位，继续前先导出需要的进度副本；`.worldsave` 不能单独替代原版游戏。

复验命令：`node tools/audit-rain-story-arrival-and-night.mjs`；`node --test tools/audit-rain-story-arrival-and-night.test.mjs tools/export-deployment-check.test.mjs tools/player-fixture-build.test.mjs tools/poll-browser-state.test.mjs`。构建 Editor 并在 5195 启动生产预览后，可运行 `node tools/run-web-story-arrival-and-night.mjs` 重做制作／导出／全部实际任务，支持 STUDIO_UI_URL；该命令会更新本批产物和报告，先保留需要的交付。`--play-only` 复用现有产物；`--baseline-only` 仅观察原 1.9.0 的四处问题，不修改原版。

下一批沿完整作品实际阅读复核，优先连读中的 Auto、历史回退与中断续读，检查与昼夜／语音／长段落的配合；发现具体痛点再改相关代码或正文，没有新问题不新增装饰或扩版本管理。仍保留二十三条人工复核、自然阅读与听感／实际篇幅计时、26 项素材发行条件、物理主流手机／Safari、长期稳定性、获准 HTTPS 实际部署与 #353／#373 长篇剩余成本。没有真实站点授权不注册或公开上传；Windows／Android 原生继续搁置。
