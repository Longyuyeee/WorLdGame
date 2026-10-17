# 403 声音长时间未就绪时的阅读接续

2026-10-18，接续 [#402](402-web-history-voice-audition.md)，沿 [#304 完整 Web 作品](304-web-complete-gal-delivery.md)的实际运行与连续阅读流程，处理“声音没有报错却一直不开始，Auto 一直等待”的障碍。内容仍为 **1.11.0 候选／S0.41**；没有改剧情、素材、Core、Runtime 或存档格式。

## 玩家遇到等待时

当前音轨在前台持续八秒没有原生播放时间变化，按一秒间隔检查后显示声音等待入口。准备未完成与已就绪后无进度分别说明，不把等待当成损坏、解码不支持或语音结束，也不自动选择无声阅读。短暂停顿不提示；正常时间推进和循环回绕重新计算等待，结束／错误／权限拒绝沿原路径处理。

配音迟迟未就绪时停止 Auto，保留当前句、段内阅读位置、正式存档与个人音量；背景音乐单独等待不强停健康语音的 Auto。玩家从现有“媒体问题”进入详情，可以继续等待、只重试未就绪的音轨，或明确选择本次无声阅读。详情不新增正文浮层；手机窄屏及短横屏的按钮可滚动到达。

重试只替换被标记的通道，释放旧源，不重建健康 BGM 或当前剧情。原请求后来正常返回并开始推进时，等待提示自行消失，但不会擅自重开 Auto 或翻页。无声继续沿原会话级路径释放声音，不写成永久静音；玩家仍可手动推进、保存和重新读取。

观察窗口随实际音轨节点保留，不因音量或菜单渲染反复重置。后台／宿主暂停、快进策略暂停、权限阻止及历史重听临时接管不计作等待；回到前台重新观察。卸载或更换音轨时清理监听和计时器，不让旧节点的迟到结果污染新声音。

## 复现与验证

[#402 原游戏的基线](../evidence/web-audio-readiness/baseline-chromium.json)使用真实 HTTP 服务器挂起第一句配音请求。九秒后，原生 readyState 为 0、currentTime 为 0、error 为空，健康 BGM 正常播放；Auto 仍为 waiting-voice，未提供相应等待反馈。新组件用例先在未接线的旧 PlayerShell 上失败，见 [红测](../evidence/web-audio-readiness/red-shell-tests.json)。

最终同一对游戏的 [Chromium](../evidence/web-audio-readiness/browser/chromium.json)、[Firefox](../evidence/web-audio-readiness/browser/firefox.json)、[Windows WebKit](../evidence/web-audio-readiness/browser-retest/webkit.json)各六组任务，覆盖真实网络等待、明确重试、原生可信 ended、迟到 HTTP 返回、无声继续、刷新后明确读取。四种窗口为 320×740、568×320、844×390、1280×900，两个操作按钮均至少 44px 且可滚动到视区。直接只读实际 IndexedDB 槽位并比较保存载荷摘要，不用伪造音频事件、改剧情状态或写数据库代替操作。

WebKit 首次脚本在提示入口出现后立即断言 Auto 状态，读到了停止 effect 提交前的 waiting-voice；[失败报告](../evidence/web-audio-readiness/browser/webkit.json)随后记录的实际界面已为 stopped。脚本改为等待实际停止状态，在新目录复验，不延长默认超时、不覆盖失败、不因此修改产品实现。

开发中两项新断言和一项原历史重听断言也发现了已存在的 400ms 收藏写入时序：在初次收藏提交前截取整个 localStorage，随后把正常提交误认作声音操作的改动。新用例先触发原有离页提交；原历史用例明确等待当前句进入收藏后再取快照，继续比较完整快照、剧情与正式档，不删减保护要求。[最初记录](../evidence/web-audio-readiness/development-targeted-tests.json)与[复验](../evidence/web-audio-readiness/development-targeted-retest.json)分开保留。最初纯观察器测试另把 jsdom 未实现的 error 属性 undefined 预设成 null，已改为检查空错误；真实浏览器仍严格要求 error=null。

最终 [作者与路线报告](../evidence/web-audio-readiness/work/browser-checks.json)从生产编辑器实际导入 #394 工程与校订，保存、关闭、刷新重开并双格式导出；公开工程投影及全部 26 媒体不变，网站 37 个公开文件逐项核对。桌面本地 HTML 留下线、390px 断网网站远行线各走完 66 段正文／六句原生语音结束，包含 Auto、历史、保存重开和读档后停止 Auto；另明确导入、读取原同内容备份。该批没有重跑新包的两格式×两路线完整矩阵，不沿用 #401 旧包报告替代。

同一最终游戏的 [Chromium 本地 HTML](../evidence/web-audio-readiness/history/chromium-file.json)、[Chromium 网站](../evidence/web-audio-readiness/history/chromium-website.json)、[Firefox 网站](../evidence/web-audio-readiness/history/firefox-website.json)、[Windows WebKit 网站](../evidence/web-audio-readiness/history/webkit-website.json)各六项历史语音专项通过，核对原音轨／BGM 归属、暂停／继续、可信 ended、原生错误重试、四尺寸及刷新明确读档；正式槽位载荷摘要保持。此专项的当前故事语音放慢到 0.2 倍以观察归属，历史试听保持原速，声音输出静音，不作为自然全文听感或计时。

全部浏览器与构建结束、产品代码冻结后，单工作进程、默认超时顺序运行：[相关回归](../evidence/web-audio-readiness/related-tests.json) 143 文件／1,291 项，[编辑器流程](../evidence/web-audio-readiness/app-tests.json)两个互不重叠文件／47 项，共 **145 文件／1,338 项功能测试通过**；含本批 15 项观察器和 12 项玩家流程测试。[工具测试](../evidence/web-audio-readiness/tool-tests.tap) 68 项通过，含两项新报告防覆盖测试。中间、定向和红测结果单独保留，不重复累计。类型检查、Editor／Player 生产构建通过；既有大分包提示与 jsdom 原生媒体未实现提示保留，后者不作为真实播放证据。架构审计 118 个可移植文件／四个 Node 适配文件通过；N52-E5b 工程审计通过、产品验收仍为 blocked。没有宣称全仓测试、远端 CI 或长期压力验收完成。

## 当前交付与边界

可编辑工程和 25 条未人工批准的校订仍沿 [#394](../evidence/web-story-plans-and-farewell)。新 [HTML](../evidence/web-audio-readiness/before-rain-stops.html)／[网站 ZIP](../evidence/web-audio-readiness/before-rain-stops-website.zip)只更新播放器，精确字节见[交付摘要](../evidence/web-audio-readiness/delivery.json)及[审计](../evidence/web-audio-readiness/audit.json)。HTML 为 46,799,698 字节，SHA-256 `f65366bdab455c7f41b2c958703dfac00fd074f5dd1a49afebba917aaa631bd1`；网站 ZIP 为 35,386,147 字节，SHA-256 `0812a76a9d41dded4e6ac43fe739d1f3fe1e384f1a018396c117f6d6b6e435e1`。#394 源及 #402 正式双游戏均保留。

九场景、两结局、9,772 字符、87 步演出、26 项媒体、九句配音及稳定 ID 保持。26 项发行条件仍全部 pending，已确认 0；25 条 fixed 校订的 checkedSourceHash 仍为空。实际播放进度不代替听感、内容定稿或素材再分发依据。

本批的 HTTP 挂起／恢复不是 WebKit 内嵌 data／Blob 或离线音频修复。[#341 独立对照](341-web-audio-recovery-and-runtime-baseline.md)已经定位本机原生媒体加载路径的边界，不为此另造播放器、改 UA 或旁路 Worker。真实 ready 音频卡住及受控宿主时序由单元测试覆盖；浏览器网络任务不冒充物理后台／锁屏。声音输出静音，不作为自然听读、全文计时或物理手机／Safari 验收。

## 后续顺序

继续完整作品的内容、声音与演出复核，按实际障碍推进，不再把重复导出当成内容完成。保留自然阅读全文／听感／计时、长篇校验成本、底层存储等待与冷开设置偶发。具备设备后补主流手机／Safari 的旋转、系统后台／锁屏、BFCache 与长期续读，再核实发行依据并在获准 HTTPS 地址验收。前方／归档与已释放前缀的历史重听范围沿 #402；原生 Windows／Android 产品化仍搁置，不宣布 Stable／M1。

## 重放

设置新的 `STUDIO_AUDIO_READINESS_OUTPUT_DIRECTORY` 后运行 `node tools/run-web-audio-readiness.mjs`，另可加 `--engine=firefox`／`--engine=webkit`；默认只读本批正式双游戏，`STUDIO_AUDIO_READINESS_SOURCE_DIRECTORY` 可指定另一对游戏。`--baseline` 固定读取 #402。已有报告会拒绝覆盖，仅监听本机安全高位端口，退出时释放服务器、挂起响应与浏览器。

相关回归为 `node tools/run-web-audio-readiness-tests.mjs`，汇总审计为 `node tools/audit-web-audio-readiness.mjs`。重新制作沿实际生产编辑器及 `tools/run-web-auto-voice-continuity.mjs` 的新目录双导出，不覆盖历史游戏或用旧包报告替代新包验收。
