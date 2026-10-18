# 当前候选交接与跨浏览器完整游玩

2026-10-18，接续[#418](418-web-story-new-city-rooms.md)，按[#304完整Web作品](304-web-complete-gal-delivery.md)推进正式交付与玩家连续游玩。核对当前九场景正文、人物出入场、天气及背景／声音指令后，没有确认新的内容矛盾，因此不为本批制造剧情改动。发现展示资料仍把1.10.0和旧下载标为当前，已纠正为**《雨停之前》1.12.0候选／技术S0.41**。

## 当前入口和原文件保持

[展示资料](../release/rain-before/press-kit.md)顶部集中提供当前工程、记录、HTML、网站及摘要清单，[1.12.0更新说明](../release/rain-before/release-notes-1.12.0.md)说明实际差异和存档边界。原1.10.0及更早资料保留在明确的历史章节，不删除旧下载，不把旧候选继续当作当前游戏。

四产物仍是#418实际编辑器导出文件，目录为[evidence/web-story-new-city-rooms](../evidence/web-story-new-city-rooms/delivery.json)。本批没有修改工程、游戏、媒体、校订记录、存档协议或产品代码，也没有重新导出或提升内容版本。九场景、两结局、90段旁白和九句对白、9,772字符、87步演出、28媒体均保持。

## 换机继续制作

1. 拉取当前分支`codex/n60-e1-debugger-session`。安装项目既有依赖并启动编辑器；从首页导入[1.12.0工程ZIP](../evidence/web-story-new-city-rooms/before-rain-stops-project.zip)，不要从HTML尝试恢复作者工程。
2. 在检查页导入[28条.worldreview记录](../evidence/web-story-new-city-rooms/before-rain-stops.worldreview)，核对并明确合并。28条仍为`fixed`、`checkedSourceHash:null`，是已修改待人工复核，不是人工定稿。
3. 从当前版本入口试玩两条路线后保存，关闭工程、刷新、重开再继续。#418已有两条编辑器入口到达记录；新浏览器没有这些作者本机记录时，不把0/2解释成剧情缺少结局。若需要迁移这些记录，应在原编辑器生成明确勾选所需记录的制作交付包；本批四文件并非完整作者本机状态备份。
4. 发布前查看内部发布准备清单和来源台账。只把最终网站公开文件交给玩家，不上传工程、校订／试玩记录、制作交付包或内部来源证据。

## 玩家本地打开和中断续读

单文件[HTML](../evidence/web-story-new-city-rooms/before-rain-stops.html)需完整下载后打开。[网站ZIP](../evidence/web-story-new-city-rooms/before-rain-stops-website.zip)需完整解压39个文件并保持`media/`结构，通过静态HTTP／HTTPS服务访问，不双击其中的`index.html`。网站离线需要主动选择下载离线内容并等待缓存完成，不能把首次打开当作全作品已缓存。

在有项目依赖的本机，可用以下命令临时查看解压后的网站；目录参数换成实际的解压目录，从仓库根运行。仅绑定本机，不是公网上线：

```powershell
node node_modules/vite/bin/vite.js "<网站ZIP解压目录>" --host 127.0.0.1 --port 5196 --strictPort
```

标题恢复和槽位读取都需要玩家明确选择。跨浏览器、来源或电脑时，先在原游戏导出`.worldsave`，在相同内容版本中导入、核对目标槽位并明确读取；单会话备份不会迁移整机收藏、所有槽位或作者记录。

**1.12.0没有批准1.11.0及更早剧情存档兼容。** 旧玩家保留[#416原1.11.0 HTML](../evidence/web-reading-motion/before-rain-stops.html)或[原网站包](../evidence/web-reading-motion/before-rain-stops-website.zip)及从原游戏导出的备份继续阅读，新1.12.0从头开始。不修改备份版本、不把旧档强行写入新剧情；保留完整旧游戏比只留备份更重要。

## 本批完整格式和路线检查

矩阵工具允许Firefox执行与Chromium相同的严格任务，仍拒绝把Windows WebKit称作完整音频矩阵；已有报告拒绝覆盖，未放宽语音、正文、槽位或离线断言。本批不修改旧冻结矩阵，而在新目录分别保存实际运行报告。

| 桌面引擎 | 单文件HTML | 缓存后离线网站 |
| --- | --- | --- |
| [Chromium](../evidence/web-candidate-handoff/chromium/matrix.json) | 留下和远行，从标题到对应结局 | 留下和远行，断网重载后到对应结局 |
| [Firefox](../evidence/web-candidate-handoff/firefox/matrix.json) | 留下和远行，从标题到对应结局 | 留下和远行，断网重载后到对应结局 |

每格逐项匹配66段正文稳定ID和六句真实原生语音结束；验证Auto等待、快速保存、明确读档后停止Auto，以及正式槽位元数据和载荷摘要保持。HTML实际离开页面并后退，必要时明确恢复；网站主动下载缓存、浏览器断网并通过原生Service Worker重载，在后段再次离线刷新和明确恢复。未注入语音结束、剧情、生命周期或数据库写入来代替玩家操作。输出静音，不作为自然听感或真人阅读计时。

此八格不包含新浏览器导入1.12.0备份、1.11.0到1.12.0整站离线升级、服务器进程停服、真实BFCache命中、后台／锁屏或物理手机。#418的三引擎在线网站和实际作者流程为上批范围，不计作本批新增运行。

## 审计和测试

交接审计重新核对原四产物字节与SHA-256、28媒体仓库／源工程／HTML／网站原字节、网站39项清单和内部作者资料隔离；核对当前展示入口、更新说明和本篇链接，以及旧四文件保持。它逐格验证两引擎报告对应当前相同文件、完整正文和原生语音，拒绝部分／重复路线、错误版本／引擎、无声结束冒充通过、在线重载冒充离线、读档改变剧情及旧下载误作当前入口。结果保存为`evidence/web-candidate-handoff/audit.json`。

浏览器任务结束后，[相关功能回归](../evidence/web-candidate-handoff/related-tests.json)162文件／1,506项通过，单工作进程、原有超时，305.41秒，[原日志](../evidence/web-candidate-handoff/related-tests.json.log)保留。[App整合](../evidence/web-candidate-handoff/app-tests.json)另两份不重叠文件／47项通过，共164文件／1,553项相关功能测试；本批没有新增产品功能测试。

[最终工具回归](../evidence/web-candidate-handoff/tool-tests-final.tap)163项通过，较#418新增11项：十项交接内容／反向变异检查、一项Firefox报告防覆盖。前置17项定向和汇总检查补齐前的163项运行均不重复累计。[最终类型与架构检查](../evidence/web-candidate-handoff/static-final-checks.json)通过，架构仍核对118个可移植及四个Node适配文件；最终检查绑定本批四份工具／测试的规范化源码摘要。既有jsdom媒体未实现提示保留；本批未重新构建产品、未运行全仓check或远端CI，游戏继续使用原生产导出的冻结字节。

两份TAP保留既有空参数用例名称末尾的空格，只对这两份原报告设置Git空白检查例外，不清洗输出或放宽源码检查。入库核对冻结证据的Git索引与磁盘原字节，当前四产物及旧源／旧游戏不进入本批改动，无关`.browser-diagnostic/`保留。

## 下一批顺序与仍待验收内容

1. 在本机现有可用引擎继续验证真实1.11.0到1.12.0的离线更新、待激活窗口、旧档拒绝与旧游戏返回，保护已有槽位和备份；不能只用本批单版本矩阵宣布整链完成。不为此新建存档迁移协议。
2. 当前作品自然全文听读、篇幅计时和28条人工复核仍需实际内容确认。只在发现具体前后文、人物动作、画面或声音问题时修改源工程和素材，不用更多机器到达记录替代定稿。
3. 所有者补齐28项发行条件、尤其九句系统TTS再分发依据，确定公开署名与获准HTTPS目标后，才进行实际上传及公网站点回查。本批没有代填发行身份、许可、发布日期或托管授权。

旧`tools/run-web-version-retention.mjs`仍固定1.8.0到1.9.0和历史证据目录，不能直接拿来复跑当前升级或覆盖旧记录。下一批应读取#416与#418实际网站包、当前更新／旧版返回入口及保存规则，为1.11.0到1.12.0任务使用全新输出目录；保留已有失败、原始包和真实备份，不把探针假设修改当作产品修复。

本机Windows WebKit的data／Blob及离线原生声音已有[#341独立对照](341-web-audio-recovery-and-runtime-baseline.md)，本批未反复修改Worker或另造声音引擎绕过；实际Safari／macOS／iOS环境仍待验。物理主流手机、后台／锁屏、原生开始后断流及永久解码停滞、长期运行、冷开设置偶发、长篇完整校验／快照／传输／物理内存与底层写入成本保持开放。28项发行条件批准0，人工定稿批准0；仍非Stable／M1。Windows／Android原生产品化继续搁置。

## 复跑

先分别设置`STUDIO_WORK_CONTINUITY_SOURCE_DIRECTORY=evidence/web-story-new-city-rooms`和全新输出目录`STUDIO_WORK_CONTINUITY_OUTPUT_DIRECTORY`，运行`node tools/run-web-work-continuity-matrix.mjs --matrix --version=1.12.0 --engine=chromium`或`--engine=firefox`。目录中已有报告即拒绝覆盖，不把不同引擎写入同一报告。默认版本仍为1.11.0，未知内容版本与WebKit完整音频矩阵仍拒绝。

`npm run audit:web-candidate-handoff`先执行交接和矩阵工具的17项定向测试，再重新核对冻结产物、两个最终报告及交付链接。已有最终`audit.json`时拒绝覆盖；只需只读重核可从模块调用`auditCandidateHandoff()`，不重跑浏览器、不更新旧报告或游戏。
