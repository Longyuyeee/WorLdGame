# 《雨停之前》1.7.0 Web 候选展示资料

2026-10-16 更新。当前候选为**对白节拍与配音演出校订版 1.7.0**，不是已上线、已授权或 Stable 发行声明。下面的历史资料不能用于为新候选的旧档兼容背书。

## 当前作品与交付

一句话：一场雨，两条路。读完旧信，把下一次见面写进日历。

生活向中文视觉小说，9 场景、90 段旁白+9 句对白、两个结局、9,672 字符、74 步演出、25 项素材；每条路线有 60 段旁白和 6 句合成配音对白。1.7.0 将对白放回实际说话时机、减少重复转述、补未来行程和人物退场，并修正退票后的出发配音。纸色说话人恢复深色显示；保留原分支、全部既有稳定 ID 和 24 份未改媒体。

| 资料 | 当前路径 |
| --- | --- |
| 可编辑源工程 | `evidence/web-story-beats/before-rain-stops-project.zip` |
| 单文件游戏 | `evidence/web-story-beats/before-rain-stops.html` |
| Web 部署目录 | `evidence/web-story-beats/before-rain-stops-web.zip` |
| 待人工复核的 11 条记录 | `evidence/web-story-beats/before-rain-stops.worldreview` |
| 内容/演出修订与边界 | `release-notes-1.7.0.md`、`docs/337-web-story-dialogue-beats.md` |
| 当前三产物摘要 | `evidence/web-story-beats/artifact-audit.json` |
| 当前语音来源及技术指标 | `assets/rain-story/voice-revision-v1.7.json`、`source-manifest-v1.7.json` |
| 背景来源/完整提示词 | `assets/rain-story/source-manifest-v1.6.json`、`image-prompts-v1.6.json` |
| 实际手机尺寸对白图 | `evidence/web-story-beats/directory-leave-stmt_ui_196.png`、`directory-leave-stmt_ui_250.png` |

本地 HTML 和 HTTP 子目录分别完整走过两路线，移位对白的保存刷新读取与回想恢复通过。截图来自 Chromium 151 的实际 Player，390 px 不是物理手机。11 条校订任务只标记已修改、待人工复核；未测量真人篇幅时长，不发布“完整 20 分钟已验收”等承诺，语音不是全篇或真人配音，技术自然结束不等于人工听感验收。

**1.7.0 未核对为 1.6.0 或更早的旧档兼容版本。** 实际 1.6.0 备份导入会被拒绝；原 1.6.0 三产物保留在 `evidence/web-story-refinement`，1.5.4 在 `evidence/web-save-backup`，旧进度使用原版继续。1.6.0 修订记录见 `release-notes-1.6.0.md`。请保留旧游戏与备份，不用新候选覆盖玩家唯一的原版入口。

新背景通过内置 imagegen 对本项目图片作光照变体，生成来源与参考摘要可追溯，但许可和最终美术仍待确认；原系统合成语音的对外再分发许可同样未关闭。作者/发行者、联系方式、版权声明、渠道和发布日期不虚构。公开部署前仍需人工全文/听感、美术、实际手机与支持浏览器、来源许可和实际 URL 回查；当前未上传公网。

## 1.5.4 历史展示资料

日期：2026-10-14。面向部署与作品展示准备；**不是已上线或授权已完成的发行声明**。

### 作品介绍

一句话：一场雨，两条路。读完旧信，把下一次见面写进日历。

简介：列车晚点的雨夜，林远在车站收到小夏带来的一封旧信。新工作的地址、没有完成的画和迟迟未回的话，都需要一个具体的回答。留下等雨停，或去追最后一班车：两种选择通向不同的夜晚，却都要求他们认真安排下一次见面。

类型：中文生活向视觉小说 / 关系与成长 / 双路线。当前稿含 9 场景、90 段旁白及 9 句角色对白、2 个结局。每条路线呈现 60 段旁白和 6 句角色对白。旁白约 6,404 / 6,394 字；按 250–350 字/分钟预算约 18–25 分钟，**人工游玩时间尚未测量，暂不发布“20 分钟完整作品”宣传承诺**。

包含画面和音乐、雨声及九句明确标注的系统合成语音；不是全篇配音或真人配音。故事涉及异地沟通、职业变化和关系选择。没有按特定渠道完成年龄分级或内容审核，暂不填写“全年龄认证”。

1.5.1 校订稿在原等比画幅/长文阅读与个人字号、文字速度、六类音量、减动效、高对比和全屏基础上，校订四段旁白（总正文 9,626 字符），补齐慢钟伏笔、课程时间及次日行程。演出与素材保持；1.5.2 收纳标题工具，存读档采用原生弹窗并增加保存反馈，本地时间与焦点返回；成品画面隐藏开发状态。正文和素材不变。竖屏为备用阅读布局，不宣称与横屏有相同演出效果。全屏可用性依实际浏览器/嵌入权限，失败时保留普通窗口游玩；本轮 Chromium 155 检查不替代实际手机/Safari 或人工阅读；此前三引擎设置结果保留为 1.5.0 的历史。

### 交付与视觉资料

1.5.3 增加发布页旧版工程核对和导入新正文保护。1.5.4 继续增加当前进度/单槽位文件备份、导入核对/空槽位/覆盖确认、两窗口原子保护和显式读取；手机核对通过时收起导出区。本轮正文、演出和媒体保持，核对声明为 1.5.1/1.5.2/1.5.3；实际备份来源为 1.5.3 的会话，在 1.5.4 中完成隔离浏览器/不同来源迁移、离线和本地 HTML 恢复。内容变化仍拒绝，不宣称剧情变化迁移或物理设备通过。

| 资料 | 仓库位置 |
| --- | --- |
| 可编辑源工程 | `evidence/web-save-backup/before-rain-stops-project.zip` |
| 单文件试玩 | `evidence/web-save-backup/before-rain-stops.html` |
| 完整目录包 | `evidence/web-save-backup/before-rain-stops-web.zip` |
| 标题封面源图 | `assets/rain-story/station-night-v2.png` |
| 512×512 作品图标 | `assets/rain-story/letter-icon.png`，可编辑源 `letter-icon.svg` |
| 上一包兼容恢复标题（1.5.3） | `evidence/web-save-updates/compatible-recovery-title.png` |
| 当前手机尺寸/备份 | `evidence/web-save-backup/mobile-backup-preview.png`、`mobile-overwrite-confirmation.png`、`mobile-migrated-progress.png` |
| 上一包完整路线（1.5.2） | `evidence/web-player-entry/desktop-stay-title.png`、`desktop-stay-ending.png`、`mobile-leave-ending.png`（结局含剧透，本轮未重跑） |
| 历史横竖屏画幅参考（1.5.0） | `evidence/web-player-settings/phone-390-landscape.png`、`phone-390-reading.png`；本轮未复测横竖屏 |
| 历史设置与全屏（1.5.0） | `evidence/web-player-settings/chromium-settings-text.png`、`chromium-fullscreen.png`；本轮未复测全屏 |
| 当前离线备份/并发拒绝 | `evidence/web-save-backup/mobile-offline-reexport.png`、`concurrent-import-rejected.png`、`wrong-work-backup-rejected.png` |
| 上一包更新与作者核对（1.5.3） | `evidence/web-save-updates/old-save-offline.png`、`editor-compatibility.png`、`editor-stale-compatibility.png`；范围见 #314 |
| 来源与提示词 | `assets/rain-story/README.md`、`image-prompts-v1.3.json`、`source-manifest-v1.3.json` |
| 开发/验收记录 | `docs/315-web-player-save-backup.md`、`release-notes-1.5.4.md`；素材制作来源见 #308 |

截图是实际浏览器进程的游戏画面，默认 Chromium，含引擎名称的按文件名/报告区分；手机尺寸截图不是物理手机通过证明。未经裁剪的源背景/立绘不当成实际游戏截图。

作者/发行者署名、联系信息、渠道链接、发布日期及版权措辞待项目所有者确认，不虚构联系人、帐号或上架状态。

### 来源与发行待办

文本来自仓库原创制作样例；六张新插图使用内置 imagegen，表情以已有小夏立绘为参考，保留完整提示词与输出。其他立绘/背景、音乐/雨声/提示音来源见素材 README。图标是本项目 SVG 原始设计。旧站台测试图在 1.3.0 的当前资源绑定中已替换，旧 1.2.0 证据工程仍保留历史。

九句语音来自本机 Microsoft Kangkang/Huihui 系统声线。**其输出的对外再分发许可待核实**；可以用于当前开发验证，不把技术生成成功视为发行授权。公开发布前核实/替换，并按所选渠道要求声明生成式图片与合成语音。图片、正文、音乐和图标的最终授权确认同样保留为待办。

### 实际部署清单

1. 按平台无关的静态目录交付。公开部署前核对作品资料、素材来源和实际网址；当前没有上传任何公网网站。
2. 目录 ZIP 解压**全部文件**，以 `index.html` 为入口；不要只上传 HTML，不要混用不同构建的资源。当前已验证本地 HTTP `/gal/` 子路径。
3. 先在预发布地址核对封面/图标/版本 1.5.4、全部资源 HTTP 响应和控制台错误；用实际浏览器点击开始后核对音频权限，个人静音/音量和失败恢复。
4. 分别走留下/远行，核对候车室、列车、画室、角色表情、全部正文与结局；中途保存、刷新、读取。存档依赖浏览器本地数据和网址来源；清理数据或换环境前，在“存读档→备份”导出 .worldsave 文件。在新环境打开相同/核对过的兼容作品，核对备份后导入手动槽位并显式读取；个人设置/其他槽位分别保留，不自动迁移。
5. 在约定的手机/浏览器上核对工程等比画幅、竖屏上图下文、设置/返回焦点、触控长段滚动/点按下一屏、Auto 等未读下方、横竖屏、全屏成功/拒绝/退出、失焦恢复和音频；做实际人工节奏计时。当前三个 Windows 引擎不能宣称主流手机普遍兼容。
6. 更新前在发布设置核对上一版完整工程 ZIP，保存后重新生成，完整替换目录；范围见 save-compatibility.json。#314 已检查等待/启用和正文变化拒绝；本版额外检查 1.5.3 档文件携带到 1.5.4、显式读档/断网重开和再导出原会话字节。覆盖需确认，两窗口改目标会拒绝过期确认；详见 release-notes-1.5.4.md。内容变化后需要保留原版入口，备份文件不自动实现剧情变化迁移。
7. 在实际 URL 完成以上回查后，再记录地址、构建摘要、已验证环境和剩余限制，并按渠道的嵌入尺寸/上传限制适配。单文件 HTML 为便捷试玩；是否允许下载或嵌入按选定渠道规定另行确认。

尚未关闭：逐段自然阅读/配音听感与演出定稿、来源许可、公网、真机/物理跨设备/旋转、长期运行与既有长帧问题、完整全仓与所有浏览器兼容、剧情变化迁移；当前目录缓存下载、断网、等待更新和核对过的旧档读取、手动文件携带已检查，测试范围分版记录。结构页试玩已在 #311 交付。Windows/Android 原生产品化继续搁置。
