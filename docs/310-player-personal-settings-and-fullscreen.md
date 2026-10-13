# 玩家个人设置与全屏阅读交付包

日期：2026-10-14。接续 6c5dc78、#304/#309。

## 实施前代码审阅与范围

PlayerShell 直接使用作者工程的 GalSettingsApplication；除语言/Auto 节奏外，玩家没有字号、文字显示或音量入口。音乐室原生试听音量也没有与作者/玩家音量合成。手机已有阅读菜单与等比画幅，但缺少用户主动的全屏入口。纸色主题结局的 secondary 按钮沿用浅青文字，目视对比不足。

本批按 #304 的玩家设置主流程及 #11 2.1/2.2/2.6/2.8 推进：标题与阅读中进入同一设置面板，提供个人字号/显示速度、六类音量/静音及减动效/高对比，恢复作品默认和按工程隔离的本地偏好；调整即时生效，不写作者工程、运行时/存档/历史。覆盖层保护继续沿用正式播放器，不改变画幅或建立第二份剧情权威。加入仅用户点击触发、仅本播放器所有的全屏与失败反馈，退出恢复宿主布局。纸色/高对比下标题、结局和新设置入口可读。

全屏遵循 [Fullscreen 标准](https://fullscreen.spec.whatwg.org/)的用户激活、异步结果和 fullscreenchange；不自动请求、不锁屏幕方向、不承诺 iPhone 或所有 WebView 支持。不支持或被拒绝时保留当前剧情，普通窗口仍可玩。没有物理手机和发行输入，真人计时、许可、实际托管/公网及旧性能债务不标为通过。

通过生产编辑器 UI 从 1.4.0 工程配置 1.5.0，重新导出三产物、完整走两路线，并验证设置/全屏/保存刷新及源字节；定向回归、类型/双构建、必要静态审计、目视和文档更新后提交推送。旧证据及无关 `.browser-diagnostic/` 保留。

## 实际交付与权威边界

1. 标题、正文、结局可进入同一玩家设置：桌面设置入口、手机阅读菜单内设置。独立可滚动面板、返回故事、首焦点/Tab 范围/Escape/手柄 cancel；打开时 Auto 暂停、Skip 停止，底层点击/按键不推进，等待视频/演出完成沿用 state/Host hash 绑定的延后确认。后台期间不消耗确认，返回同一段落。
2. 个人字号 85–140%、逐字速度 0.5/1/1.5/2×、作品默认/立即/逐字显示。以作品原设定为基准，不改导演画幅、坐标、Canonical 或原文；字号变化重新测量下方未读内容，原长文滚动/点按下一屏和 Auto 等待保持。当前作品原字号倍率实际为 **1.15**，个人 125% 的合成结果为 1.4375，不是把作者设定强改成 1。
3. 总音量、BGM、Voice、SFX、Ambient、UI 六个独立 0–100% 系数和全部静音，乘以既有作品/source 混音及 ducking。当前音轨即时变化，不因设置而重建/从头播放；视频使用总音量，音乐室试听进入时也采用总音量/BGM。静音不更改剧情或跳过语音时序。音乐室仍有原生播放控件，不声称已经完成所有角色级静音/响度/蓝牙策略。
4. 个人高对比、减动效可启用；作者已经要求的高对比/减动效不会被个人关闭覆盖，系统减动效仍保留。补纸色结局/错误页 secondary 按钮、结局标识和高对比文本/新菜单控件颜色，原画幅规则不动。点击通过不等于完整无障碍认证。
5. 偏好按 projectId 存在本浏览器独立 key，schema/枚举/范围/有限数值/六通道严格读取，坏值或拒绝读取回默认。拒绝写入仍即时应用，并明确提醒重开可能不保留。换工程不泄漏偏好，作者热更新仍与个人系数合成；恢复默认只清本页的个人覆盖，保留存档、语言和既有 Auto 节奏，不冒称跨设备同步。
6. 全屏只由设置内点击触发，requestFullscreen 的目标是本播放器 main，而不是整个编辑器/外部页面；忙时不重复请求，其他元素全屏不抢占，拒绝/不支持有可理解提示。不锁定方向、不自动请求。fullscreenchange 同步浏览器退出，成功时只覆盖本 main 的宿主 offset 为 0、等比容纳舞台，退出恢复版本/离线栏预算；不修改 Runtime state。
7. 实际目录完整游玩发现外部栏展开首帧正文 bottom=874 > 844、固定按钮仍按旧位置定位。先补 open 属性 MutationObserver 的微任务预算，但重新导出仍失败。进一步实测发现 offset 已从 68 更新到 170px，舞台高度却仍为旧 776px：原减动效规则给所有元素设置 `.01ms transition-duration`，隐含初始 `transition-property: all`，反而为高度/位置新增了极短过渡。最终系统/项目减动效明确 `transition: none`，保留既有动画极短完成事件；不靠等 100ms 跳过问题。open 属性微任务、toggle/resize/ResizeObserver 回退都保留，组件及真实目录首帧继续验证。没有删除外部栏或改用裁切舞台掩盖它。

源工程 1.5.0 保持 9 场景/两结局、90 段旁白+9 句角色对白、9,544 字符、71 步演出、22 项素材。源 ZIP 的 62 条目相对 1.3.0（以及 1.4.0）的内容只变 manifest 发布版本。没有新增故事/素材、许可结论或修改 Runtime/存档/历史格式。

## 失败、修正与验证记录

新组件首轮发现 label 同时包裹 output 和 range，测试/辅助定位出现两个 labelable 目标；改为普通值文本和 range aria-valuetext，不靠绕过用户标签查询修正。逐字慢速 option 最初写成 `.5`，与 React 的 `0.5` value 不一致；统一为 `0.5` 并补选择/默认恢复回归。媒体单元 fixture 初期停在 awaited 入场，未建立 audio/video，改用明确的多通道/即时文字 fixture；jsdom 不具备 fullscreenElement，模拟标准 DOM 事件/属性而不当真浏览器成功。浏览器偏好检查曾误假设作者字号 1.2；读取实际 1.15 后按合成规则检查，没有更改工程去迎合测试。

第一次整链在目录外部栏展开时失败，保留 `before-host-bar-checks.json`；微任务补丁后仍失败的准确几何与截图为 `before-reduced-motion-checks.json`、`before-reduced-motion-layout.png`。`failure-editor.png` 不是失败播放器画面或最终通过证据；`http-layout-inspection.png` 是等待布局完成后的定位截图，不能证明首帧没有问题。修正前跨引擎结果不能替代最终导出包；每次产品改动后重新构建/导出。

最终定向回归 **16 文件 / 161 项通过**，日志 `evidence/web-player-settings/regression.log`，包含个人偏好校验/隔离/坏值/拒绝、即时字号音量、原音轨不替换、Auto/背景点击、延后视频/后台、作者热更新、全屏拒绝/所有权/标准事件退出、原阅读/Player/输入/挂载/语言媒体/附加内容/存档预览及正式导出/离线/试玩。之前 13/93/160 项复测不累计。视频声音绑定和延后完成有组件检查；当前《雨停之前》不含视频，不将这次实播九句 TTS 宣称为新视频实际游玩证据。

typecheck、Editor/Player 生产构建及架构/需求映射/工作区/整合基线静态审计通过。Editor 和新增体积后的 Player 均有 >500kB chunk 提示，不作为已优化或预算达标；未跑完整 check/全仓/所有 golden/两小时/旧长帧基准，jsdom 媒体未实现日志不当播放证明。

浏览器验证由 `run-web-player-settings.mjs` 正常 UI 生成 1.5.0 及本地 HTTP `/gal/`：复用 #309 的八组任务（含 320/390 画幅、菜单/存档/历史/尺寸变化、三条各全部 60 段/六场景路线、真实 Auto clock、1,400 字实际 touch 压力），再用本机已安装 Chromium、Firefox、Windows Playwright WebKit 各走设置/字号/音量/静音不推进/Auto 暂停/恢复默认/快速保存刷新/偏好还原、等比画幅、全屏请求与结果、60 段完整路线/六句 TTS 自然结束、结局回到标题。不是直接更改数据库制造正式作品，也不以原生 controls 或 page.setViewportSize 冒称手机真机。

最终代码的八组阅读/导出任务通过；额外三引擎组的完整结果在 `settings-checks.json`。原 Auto 标准首段实际 22,335ms，预期 22,280ms，不是人工阅读时间。工具补充普通动效文字案例后，在同一最终产物重新运行三引擎组（仅工具改动，未改变 Player/导出 bytes，不累计前次重复路线）：Chromium 原逐字 duration 4,994ms，个人慢速 9,027ms，切立即显示为 0，当前 Runtime hash 不变且下一次点击进入下一句。这些是程序显示预算/行为，不是人工计时。

产物及数据报告见 `evidence/web-player-settings/browser-checks.json`、`settings-checks.json`、`artifact-audit.json`，日志 `browser.log`（整链）、`settings-final.log`（工具追加案例后回查）；总计八组加三引擎组 **11 组通过，异常为空**，每次所选完整路线都呈现 60 段旁白/六场景，语音检查等原生 currentTime 推进及 ended。素材/正文/62 源条目、HTML/目录 Canonical 与 build-info digest 审计通过，公开发行许可及最终完整作品标志仍为 false。没有累计修正前通过或重复运行的段落数量。

实际全屏结果需要分别记：Chromium 151.0.7922.34、Firefox 153.0 在本机标准 API 进入/退出成功，窗口 offset 恢复且 hash 保持；Windows Playwright WebKit 26.5 的标准 API 不可用，**进入全屏未通过**，窗口错误提示/继续游玩和完整远行路线通过。不能因为三引擎任务整体 passed 就宣称全部支持全屏或 iOS Safari 兼容。最终设置/大字/全屏或不可用/结局截图已目视核对，纸色回到标题不再用浅青字；未进行完整无障碍对比度矩阵或认证。

最后产物审计大小/摘要（未压缩原始素材，HTML 的 Git bytes 保持不转换行尾）：

| 产物 | 字节 | SHA-256 |
| --- | ---: | --- |
| 可编辑 ZIP | 24,180,243 | `25d418942e64b4256ff2b39ea9d20fa796ace07056aa962f70675a3c7ae9b2bf` |
| HTML | 32,763,336 | `edcd15ed2c6a0a391851c90b56ddec4488d055e43c3058f14cf495408a646713` |
| 目录 ZIP | 24,750,654 | `054678276fdb04f47ebf511fd57d12c4633b6e047e7b1eceecb74c1f5e629394` |

## 接续与未关闭项

当前开发分支 `codex/n60-e1-debugger-session`，本批起点 6c5dc78；1.5.0 当前可编辑工程/HTML/目录为 `evidence/web-player-settings/before-rain-stops-project.zip`、`before-rain-stops.html`、`before-rain-stops-web.zip`。1.4.0 及旧证据保留，HTML 新增 -text 属性保持换机摘要。偏好保存在本浏览器、不会自动随 ZIP 或存档迁移；没有做 1.4.0→1.5.0 玩家旧档跨构建兼容验收。

复现：安装依赖、typecheck、构建 Editor/Player，`apps/editor` 中运行 `npx vite preview --host 127.0.0.1 --port 5193 --strictPort`。设置 `STUDIO_UI_URL`（默认 5193）和 `STUDIO_CHROME` 为实际 Chromium 路径，运行 `node tools/run-web-player-settings.mjs`。正常模式先通过 Editor UI 导出，再跑全部三个引擎；`STUDIO_SETTINGS_ONLY=1` 仅诊断现有导出包，不用于最终代码改动后的全链结论；`STUDIO_SETTINGS_ENGINES` 可选安装的引擎，最终报告必须明确实际列表。没有下载新浏览器或新增锁定依赖。设置 `STUDIO_STORY_OUTPUT=evidence/web-player-settings`、`STUDIO_STORY_VERSION=1.5.0` 后运行产物审计。未指定外部目标，不发布公网。

下一整包：两路线人工自然节奏/发音/演出校订及实际计时；主流手机真实浏览器、前后台/耳机与横屏完整游玩；确认来源/声线再分发、署名、托管目标及更新旧档政策后实际 URL 的上线/离线/更新回查。Windows 上的三个浏览器引擎不等于 Android Chrome/iOS Safari 真机通过，尤其全屏可用性必须按实际宿主记录。旧 616.6ms 长帧、长期运行、跨结构页运行中试玩、全仓/历史脚本与最终作品/M1 仍开放，Windows/Android 原生主线继续搁置。

2026-10-14 后续 [#311](311-web-preview-structure-continuity.md) 已关闭上段的跨结构页运行中试玩债务，并覆盖作者其他工作区往返；同时纠正正式预览的跨场景演出来源和代理白底。#310 的 1.5.0 源工程/HTML/目录及本页历史结论不变，人工/真机/发行授权/公网和其余质量门继续开放。
