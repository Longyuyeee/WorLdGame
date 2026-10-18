# 文字动效下的全文显示与回想接续

2026-10-18，接续 [#415](415-web-collection-reading-and-return.md)，按 [#304 完整 Web 作品](304-web-complete-gal-delivery.md)检查“未显完 → 回想 → 返回”和个人／系统减动效。本批解决皮肤继续遮挡已显示全文、回想返回后渐显从零开始，以及减动效仍保留按钮位移的问题。仍为 **《雨停之前》1.11.0 候选／S0.41**，正文、演出、26 媒体、Core／Runtime 和存档协议不变。

## 原生页面复现

[固定 #415 原代码的对照](../evidence/web-reading-motion/baseline-settled/chromium.json)使用公开皮肤预设与独立小工程，正常界面完成段落、解锁回想，再从历史回到正文；没有注入解锁、存档或动画时钟。

“纸上来信”皮肤点击显示全文后，内部标志已为 `true`，实际 CSS 仍裁掉约 90.36% 的文字。完全显示过的正文返回回想后也重新播放墨迹动画，裁掉约 99.91%。原墨迹选择器比“全文已显示”规则更优先，不能以 `data-text-ready` 代替可读画面验收。

未完成段落的回想返回，动画进度从约 6.88% 退到约 0.09%。新增两项定时测试先失败，原十二项回想测试通过，见[红测](../evidence/web-reading-motion/red-replay-tests.json)。海风预设的个人／系统减动效下，悬停按钮仍立即上移 3 像素；系统减动效时，窗体还保留入场动画声明。

## 全文状态优先于皮肤装饰

墨迹效果只在段落尚未显示全文时参与动画。玩家明确显示全文、自然显示完成或返回已经显示全文的父段落后，文字不再被皮肤重新裁剪、模糊或淡入。普通逐字设置和原墨迹风格保持，不把所有阅读改成立即显示。

个人和系统减动效合并为有效显示策略，皮肤入场／文字动画及按钮悬停位移共同遵守；原项目与个人设置字段不被改写。系统偏好从首次渲染起生效，也响应运行中的变化。全局已有减动效与剧情演出的保护仍保留，本批不改变人物演出脚本或音频策略。

## 只恢复同一回想父段落的渐显进度

沿原临时回想返回记录，捕获进入回想时的显示时长、总时长和是否已完成。仍要求相同工程对象、父 Runtime／历史、段落与语言；返回时先恢复阅读锚点，再恢复这份局部显示状态。重放中的时间不计入原段落，尚未显示完的正文不会被强制变为全文。

CSS 从捕获的时长比例继续，计时器只等待剩余部分；若玩家在回想中调整逐字速度，则按同一比例映射到新时长。显示状态在绘制前对齐，避免先闪回起点再恢复。普通导航清零，明确显示全文保持完成，旧计时器随显示任务替换而清理。Auto 恢复后仍等待剩余渐显和未读正文，不越过段落。

这只是同一运行实例、同一父段落的回想接续，不持久化动画时间，不修改存档或备份，也不承诺逐帧像素／声音采样位置。菜单中进入回想前经过的时间仍按原显示策略处理；进程重启、物理后台与锁屏不由这份临时记录覆盖。

## 预设与实际作者流程

[Chromium](../evidence/web-reading-motion/browser/chromium.json)、[Firefox](../evidence/web-reading-motion/browser/firefox.json)、[Windows WebKit](../evidence/web-reading-motion/browser/webkit.json)独立原生页面各五组通过，核对明确全文、未完成段落返回、完整段落返回，以及个人／系统减动效。计算样式和原生动画进度在截图前采样，截图不使用完成动画的选项。全文均为透明度 1、无裁剪／模糊／文字动画；半显进度未倒退，减动效按钮无位移、窗体无入场动画。已查看竖屏全文返回实画。

[实际编辑器流程](../evidence/web-reading-motion/author-final/author-skin.json)在隔离工作区导入 #394 工程，选择“纸上来信”、应用、保存、实际导出检查配置，关闭刷新重开后仍保留墨迹设置。46 份场景／脚本／素材条目摘要保持。配置变体仅在本次浏览器工作区与内存下载中检查，不替换仓库的原样章来源。

作者外观预览本来就采用立即显示、静音和临时进度。本批保留该策略，桌面／手机预览均完整可读，不将它记为逐字或完整剧情验收。真正的逐字返回由前述原生页面和实际导出游戏分别验证。

## 实际导出作品的接续

[真实作者与导出](../evidence/web-reading-motion/work/browser-checks.json)仍从 #394 工程及 25 条记录保存、关闭、刷新重开、双导出，七组通过，不修改原工程、正文或媒体。[双格式双路线矩阵](../evidence/web-reading-motion/matrix/matrix.json)四格通过，每格 66 段正文与六句原生声音结束，包含 Auto、明确读取、原槽位保持和重开；网站两线缓存后离线刷新，HTML 两线离开返回。

本批实际游戏的 [Chromium](../evidence/web-reading-motion/work-browser/chromium.json)、[Firefox](../evidence/web-reading-motion/work-browser/firefox.json)、[Windows WebKit](../evidence/web-reading-motion/work-browser/webkit.json)网站各五组，[Chromium 本地 HTML](../evidence/web-reading-motion/work-browser/chromium-file.json)四组通过。由界面保存正文、快进一条路线解锁回想，再明确读取原档；沿作品默认显示，未显完时进入／退出回想，显示进度与原逻辑阅读字符保留，手动档内容和独立收藏／回想记录保持。

每份报告还保留八次旋转快退、已显示全文绘制和原图片预算保护；网站另覆盖受控超限响应后的明确重试。[正常回想与完整双路线](../evidence/web-reading-motion/route-regression/chromium.json)另七组通过。快进不计自然阅读，静音的原生结束事件不计真人听感／计时，Windows 引擎与手机尺寸不替代物理手机／Safari。

## 探针和断言修正

第一轮预设探针在手机布局中直接寻找收纳起来的“后退一步”，随后又在 React 返回效果尚未结束时读取标志。保留失败报告，改为通过实际桌面工具栏返回，再回到手机尺寸；返回后经过两次原生帧检查，仍复现原裁剪和进度倒退，才作为最终对照。没有增加产品或测试期限。

作者探针最初误认工程 UI 文件名和序列化层级，又等待外观预览出现逐字状态。核对实际 `ui/screens.json` 和预览实现后修正检查，保留失败记录，不修改产品预览策略来满足错误假设。定向测试中的速度选择也改用实际“逐字速度”控件和值；这些探针失败不计为新增产品缺陷。

## 最终回归与交付

[定向回归](../evidence/web-reading-motion/verified-targeted-tests.json)五文件／41 项通过。本批新增八项功能测试：五项渐显比例／剩余计时／普通导航／速度映射／Auto 保护，三项系统／个人减动效和动态变化。旧十二项返回、已读全文、工程替换和焦点保护共同执行。

源码与游戏冻结后，浏览器和整批功能测试分开执行。[相关回归](../evidence/web-reading-motion/related-tests.json)单工作进程、既有超时，160 文件／1,492 项通过，306.31 秒，[原日志](../evidence/web-reading-motion/related-tests.json.log)保留。[编辑器整合](../evidence/web-reading-motion/app-tests.json)另两份不重叠文件／47 项通过，共 **162 文件／1,539 项功能测试**。红测、定向和重复任务不累计。[工具测试](../evidence/web-reading-motion/tool-tests.tap)128 项通过，含新增七项报告防覆盖。

根类型检查及 Editor／Player 生产构建通过，原分包体积和 jsdom 媒体未实现提示保留。[汇总审计](../evidence/web-reading-motion/audit.json)核对固定旧源、当前代码／CSS／预设身份、真实作者任务、精确双游戏、各引擎报告、原工程／记录及全部媒体；架构 118 个可移植文件／四个 Node 适配文件通过。N52-E5b 工程通过、产品验收仍 blocked，不代替全仓 check、远端 CI 或最终作品验收。

新 [HTML](../evidence/web-reading-motion/before-rain-stops.html)46,845,174 字节，SHA-256 `f21eb61a3a8a1a4aca73d935caccd46ca8bf30d4add24ec2c420f98a9d2d67d0`；[网站 ZIP](../evidence/web-reading-motion/before-rain-stops-website.zip)35,431,623 字节，SHA-256 `a5510ba131555d065dc24566e5fa4ac093a0979e2d8fb5aa10982f4a1690651c`。为实际编辑器导出原字节，网站 37 份文件清单／摘要一致，剧情载荷和全部媒体与 #415 相同。[交付记录](../evidence/web-reading-motion/delivery.json)通过门槛后才提升这对游戏，核对根目录两份后只清理 `work` 的相同游戏副本；原工程、旧游戏、实际备份及失败报告保留。

提交前核对本批 98 个入库文件，其中 48 份游戏／图片／实际备份的 Git 索引与磁盘 SHA-256 一致，双游戏另与交付记录核对精确字节。无关 `.browser-diagnostic/` 未纳入。

## 接续与验收边界

可编辑源仍为 [#394 工程](../evidence/web-story-plans-and-farewell/before-rain-stops-project.zip)和[校订记录](../evidence/web-story-plans-and-farewell/before-rain-stops.worldreview)，九场景、两结局、9,772 字符、87 步演出、26 媒体和九句系统 TTS 保持。25 条 `fixed` 的 `checkedSourceHash` 仍为空；发行条件 pending 26、确认 0，#415 原游戏保留。

下一批回完整作品逐场阅读和演出节奏，优先检查成品中可感知的阅读／操作阻点与作者发布准备，不继续扩展通用动画、输入或音频框架。复杂自定义皮肤并非由两个预设样本全部覆盖；永久进程间动画恢复也不是本批交付目标。

自然全文听读／计时、主流物理手机／Safari、真实后台／锁屏／BFCache、原生开始后断流、WebKit 内嵌声音、原生永久解码停滞、长期运行、发行依据及获准 HTTPS 仍开放。冷开设置偶发、既有默认超时、长篇完整校验／快照／传输／物理内存与底层长期写入成本保持原边界。Windows／Android 原生产品化仍搁置。

## 重放

`node tools/run-web-reading-motion.mjs` 构建独立预设页面，`--baseline` 固定 #415，支持 `--engine=firefox`、`--engine=webkit`。`STUDIO_READING_MOTION_OUTPUT_DIRECTORY` 需指向新目录，已有报告拒绝覆盖。实际作者配置／保存重开／预览为 `node tools/run-web-reading-motion-author.mjs`，输出由 `STUDIO_READING_MOTION_AUTHOR_OUTPUT_DIRECTORY` 指定新目录。

`node tools/run-web-replay-recovery.mjs --partial --fault` 在既有快速回想任务中增加实际未完成正文与锚点返回，使用 `STUDIO_REPLAY_RECOVERY_SOURCE_DIRECTORY` 指向本批游戏、`STUDIO_REPLAY_RECOVERY_OUTPUT_DIRECTORY` 指向新目录；三引擎 HTTP 支持 `--fault`，Chromium `--file` 不加故障参数。旧默认行为保持，不能覆盖冻结报告。

`node tools/run-web-reading-motion-tests.mjs` 接续 #415 全部相关测试，单工作进程、既有超时；`STUDIO_READING_MOTION_TEST_REPORT` 可指定新报告。实际作者导出、四格、正常回想沿原工具指向同一游戏对和新目录。最终为 `node tools/audit-web-reading-motion.mjs`，全部门槛通过后才以 `--promote` 提升精确原字节，不将独立预设或作者立即预览替代最终作品验收。
