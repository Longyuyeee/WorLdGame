# 新城市房间与路线画面接续

2026-10-18，接续 [#417](417-web-release-review-and-handoff.md)，按 [#304 完整 Web 作品](304-web-complete-gal-delivery.md)回到原作品逐场阅读与演出。九场景正文和对应指令核对后，本批集中解决“已经到新城市，画面却回到旧家”的空间辨认问题。新候选为 **《雨停之前》1.12.0／技术 S0.41**；不改正文、分支选择、九句配音或播放器框架。

## 玩家看到的问题

远行路线的第一天、海边归来、见面前夜和送别后回房，都沿用留下路线家中画室的日夜背景。旧画室有固定画架、墙上旧画和同一窗外景物；文字在讲旅馆及新城市生活，连续阅读却容易误认角色没有离开。留下路线的后日谈也已写明之后去了新城市，画面仍回到旧家。

[原1.11.0游戏对照](../evidence/web-story-new-city-rooms/baseline-chromium.json)从标题正常走完两条网站路线，每条66段正文、六句原生配音结束；实际截图和背景ID共同确认上述复用，不依靠修改运行状态制造问题。此检查不是自然听读或人工定稿批准。

## 新房间只用于实际迁入之后

通过内置图像生成制作[新城市日间房间](../assets/rain-story/new-city-room-day-v1.12.png)，再以该图为编辑目标制作[同布局夜景](../assets/rain-story/new-city-room-night-v1.12.png)。窗外改为城市屋顶与轨道，室内以临时行李、书桌、少量草稿和信封表达初到新地方，不再复用旧家画架与旧画墙。夜景保持同一房间布局，改用台灯和城市夜光；没有新增人物或替换既有美术。

两图均为1672×941、各1,573,352像素，原图共4,080,915字节。[生成记录](../assets/rain-story/source-manifest-v1.12.json)保存完整提示词、夜景输入依赖、文件摘要和字节；来源只记生成事实，发行条件仍待所有者确认。没有改变图片预算或据此承诺真机内存表现。

| 位置 | 原背景 | 本批背景 |
| --- | --- | --- |
| 车窗与海开场 `stmt_ui_200` | 家中日间画室 | 新城市日间房间 |
| 车窗与海离开海边 `stmt_ui_58` | 家中日间画室 | 新城市日间房间 |
| 见面前夜 `rain110_meeting_eve` | 家中夜间画室 | 新城市同房间夜景 |
| 再一次见面送别后 `stmt_ui_74` | 家中夜间画室 | 新城市同房间夜景 |
| 留下路线后日谈 `rain18_epilogue_room` | 家中日间画室 | 新城市日间房间 |

留下路线第二天的远程合作、整理旧稿和小夏来访仍使用旧家画室；海边、车站、小夏出入场和室内停雨不变。只替换五条已有背景指令的素材引用，原ID、顺序、转场、所有旁白／对白／选项及音频原字节保持。仍为九场景、两结局、90段旁白、九句对白、9,772字符、87步演出。

## 实际作者制作与接续

生产编辑器实际导入#394工程与25条记录，先在三处原位置记下画面问题，再逐张导入新PNG、填写待确认来源、编辑脚本并核对撤销／重做。发布版本改为1.12.0，核对上一版工程时明确提示内容变化。新增三条问题只标记已修改待复核，旧25条内容与状态原样保留。

[首次制作报告](../evidence/web-story-new-city-rooms/author.json)在完成两条编辑器路线、保存重开并实际导出源ZIP后，被审计中的错误假设拦住：新增素材理应更新`.world-assets/bundle.json`，却被要求保持旧字节。没有修改导出包；核对实际汇总结构后，改为严格检查28素材、28 Blob及原总量加两张新图的引用字节总量，并补反向测试。

[接续制作报告](../evidence/web-story-new-city-rooms/author-final.json)从这份真实导出的工程和28条记录重新导入，复跑两条入口路线、保存／关闭／刷新重开，再次导出的源ZIP与前次逐字节相同。随后实际生成HTML、网站包及两种制作交付包，在全新浏览器中导入实际制作ZIP并明确合并两种记录，保留28条待复核、两个当前稿结局到达记录及28项待确认素材。失败报告和失败实画保留，最终作者路线截图取接续那次。

没有通过脚本写出替代工程ZIP；`editorial-v1.12.mjs`仅是严格审计期望。原26份媒体和来源记录均保持，新图也逐项核对仓库、源ZIP、HTML和网站的原字节。

## 独立游戏和最终回归

[Chromium](../evidence/web-story-new-city-rooms/chromium.json)、[Firefox](../evidence/web-story-new-city-rooms/firefox.json)、[Windows WebKit](../evidence/web-story-new-city-rooms/webkit.json)网站各三组通过：两条完整路线及原1.11.0备份拒绝。每条路线逐项匹配66段正文和六句原生声音结束，输出静音；每引擎核对11个背景／人物／雨声样本，并在留下后日谈、远行见面前夜和最后回房三处实际保存、回退、刷新、明确读取，恢复相同段落、状态及背景。旧备份检查保持标题与槽位键，不提供写入入口。

实际截图保持390×844竖屏、844×390短横屏，舞台为原16:9等比结构；已查看Chromium日夜及两路线实画、Firefox日景、WebKit夜景，不以外层背景ID代替画面检查。桌面引擎和视口尺寸不替代物理手机／Safari，静音结束不替代听感。

[Chromium两格式×两路线矩阵](../evidence/web-story-new-city-rooms/matrix/matrix.json)四格通过，每格66段正文、六句原生配音结束，包含Auto、明确读档停止Auto、原槽位保持和实际重开。网站两路线主动缓存后离线刷新，HTML两路线实际离开／返回；未将网站一次成功扩大为旧版到新版离线升级整链通过。

浏览器任务结束后，[整批相关回归](../evidence/web-story-new-city-rooms/related-tests.json)单工作进程、原有超时，162文件／1,506项通过，319.11秒，[原日志](../evidence/web-story-new-city-rooms/related-tests.json.log)保留。[独立App整合](../evidence/web-story-new-city-rooms/app-tests.json)另两份不重叠文件／47项通过，共 **164文件／1,553项相关功能测试**。本批只改作品及验证工具，没有新增播放器／编辑器功能测试，也不把旧测试或重复运行算作新增。

[Node工具回归](../evidence/web-story-new-city-rooms/tool-tests.tap)152项通过，较#417新增19项：十项实际导出内容及反向变异检查、七项报告防覆盖、两项矩阵版本边界。前置23项定向与最终汇总再次执行的十项不重复累计。类型检查、Editor／Player生产构建、118个可移植／四个Node适配文件架构审计通过；N52-E5b工程通过、产品验收仍`blocked`，既有构建体积及jsdom媒体提示保留。

[最终审计](../evidence/web-story-new-city-rooms/audit.json)和[交付记录](../evidence/web-story-new-city-rooms/delivery.json)已通过，绑定实际四产物、最终源码、三引擎、四格矩阵、28媒体及旧四文件保持。不代表全仓check、远端CI或最终作品／许可验收。入库前另核对冻结证据、两张新图与四产物的Git索引原字节，无关`.browser-diagnostic/`不纳入。

两份TAP原样保留空参数用例名称末尾的空格，仅对这两份冻结原报告设置Git空白检查例外；没有清洗测试输出或放宽源码检查。

## 新旧内容和保留入口

背景指令和资源清单发生变化，1.12.0没有登记1.11.0存档兼容。旧进度请继续使用保留的[#416 HTML](../evidence/web-reading-motion/before-rain-stops.html)／[1.11.0网站包](../evidence/web-reading-motion/before-rain-stops-website.zip)；[#394工程](../evidence/web-story-plans-and-farewell/before-rain-stops-project.zip)和[25条旧记录](../evidence/web-story-plans-and-farewell/before-rain-stops.worldreview)也保持。不要把旧备份强行写入新剧情，完整旧游戏比只保留一份备份更重要。

当前四产物位于[本批目录](../evidence/web-story-new-city-rooms)：[可编辑工程](../evidence/web-story-new-city-rooms/before-rain-stops-project.zip)、[HTML](../evidence/web-story-new-city-rooms/before-rain-stops.html)、[网站ZIP](../evidence/web-story-new-city-rooms/before-rain-stops-website.zip)、[28条校订记录](../evidence/web-story-new-city-rooms/before-rain-stops.worldreview)。换机继续制作应使用工程和校订记录，或在编辑器生成含所需作者资料的制作交付包；玩家游戏不能恢复作者工程。

| 产物 | 字节数 | SHA-256 |
| --- | ---: | --- |
| 工程ZIP | 38,560,984 | `75453d918fa5ef47d5038b397b3aeeb4c5ad67e5dbab0594e696f29020e25f4c` |
| HTML | 52,288,411 | `f5527aaa073f11982aa10bcacd4c8e85b6212920e4d6ab07c528d5698746da2b` |
| 网站ZIP | 39,516,021 | `e2ce402c7a0ce4558d627d0379c3c8c0f19fb4913026aea0cc145ca84715cf6b` |
| 校订记录 | 25,590 | `1ad95d42c7960ee4db48f50a10108069c35d61e08a1470ec45f582c5a8ad9624` |

## 接续与验收边界

28条记录仍为`fixed`、`checkedSourceHash:null`，人工批准0；28项媒体发行条件仍待确认，确认0，九句系统TTS再分发依据未补齐。日夜布局及截图的本次视觉检查不替代人工完整美术／自然听读／篇幅计时。

下一批继续沿实际完整作品检查前后文、人物动作、天气与背景／声音衔接，只在发现具体矛盾时修改源工程或素材；随后补齐所有者的发行依据与实际获准HTTPS交付。不要把更多运行记录或重复导出当成人工定稿，也不扩建通用动画、输入、音频或审批框架。

主流物理手机／Safari、真实后台／锁屏／BFCache、WebKit内嵌／离线声音、原生开始后断流及永久解码停滞、完整旧版到新版离线升级、长期运行和公网验收仍待完成。冷开设置偶发、既有默认超时、长篇完整校验／快照／传输／物理内存及底层写入成本保持原边界。Windows／Android原生产品化继续搁置。

## 重放

`node tools/run-web-story-new-city-rooms.mjs --baseline`从原#416网站包正常走两路线作画面对照；`--author`执行首次实际制作，已有候选或报告即拒绝覆盖。`--author --resume-author`只用于保留的本批索引审计失败接续，从原真实导出重开，不重写源ZIP／记录。

`node tools/run-web-story-new-city-rooms.mjs --engine=chromium`及`firefox`、`webkit`复验冻结网站包，报告拒绝覆盖；调试使用`STUDIO_STORY_ROOMS_OUTPUT_DIRECTORY`指向新目录。矩阵沿原工具，显式加`--version=1.12.0 --matrix`并设置源／输出目录；默认仍核对1.11.0，不隐式放宽旧批版本或文件数量。

整批功能执行`node tools/run-web-story-new-city-rooms-tests.mjs`，沿#417全部相关文件、单工作进程及原超时；独立App文件另跑。`npm run audit:web-story-rooms`执行本批严格内容反向测试及最终汇总，全部门槛通过后才更新最终交付记录。汇总接受干净首次作者五组通过，或本批保留的失败／严格修正后接续路径；不要求重演探针错误。旧`audit-current-rain-sources.mjs`保持原1.11.0冻结范围，新28素材由本批审计核对，不把旧26项报告当作当前报告。`delivery-inventory.json`只是最初的精确产物清单，不是最终验收结论。
