# 391 长篇读档等待、取消与重试

2026-10-18，接 [#390 第一项](390-web-voice-reading-continuity.md)，处理长篇存档读取的等待反馈，并分开测量总等待、完整校验和接收端重建。目标仍是 [#304 完整 Web Gal 制作与交付](304-web-complete-gal-delivery.md)，作品 **1.10.0 候选／技术 S0.41**，不增加剧情版本、不扩原生平台、不宣布 Stable 或 M1 完成。

## 玩家问题与本批行为

原代码已经用后台 Worker 完整校验存档，但槽位确认后“取消读取”被禁用，Escape、原生弹窗取消和手柄取消也被 busy 状态挡住。标题“继续最近存档”和独立恢复记录同样没有取消入口；本机记录读取与后台校验只显示笼统等待。切后台后仍可能等到超时，玩家无法分清是否应该重试。

现在槽位、最近存档和独立恢复共用一次明确读取的请求归属，区分“读取本机记录”和“完整校验、准备故事”。等待条保留取消入口，不显示虚假的百分比。取消槽位读取返回列表；取消最近存档或独立恢复保留原入口，可以再次明确读取。同一请求未结束时不重复排队。

取消立即撤销这次读取的提交权，单独中止它的 Worker 请求；更换工程、存储或卸载也使旧结果失效。读取排在其他保存之后时，取消不会终止前面的保存，轮到该读取也不会再向 Worker 发包。已经开始的 IndexedDB 读取可能迟到完成，但不提交旧结果，也不被当作存档损坏。这里没有声称能撤销已开始的存储事务。

Host 转为后台时取消未完成的明确读取，保留当前阅读和原记录，返回前台后由玩家重新读取，不自动重放旧请求。普通阅读／语音暂停返回仍沿 #389／#390，不是自动读档。读取期间手动推进、Auto 和快进不能提交替代剧情；成功后仍先完成原有完整校验、artifact／槽位元数据核对、Meta 合并与正文／语音接续，再替换当前故事。失败不替换进度，后台计算失败保留重试入口。

没有修改 Core、Host、Runtime、数据库、存档、备份或工程协议；没有截断历史、跳过检查点或缓存校验结论。原有无 Worker／构造失败时的同步兼容路径保持完整校验；同步 JavaScript 已开始后不能被点击打断，本批不把它描述成可抢占计算，也未扩大兼容模式性能承诺。

## 测量方法与结果

基线冻结 `f8616873c04eb2efcc0d7157d7ee850cd2039c99` 的 Runtime／Host／Core／Shell 源码，主线程与子 Worker 都使用冻结源码。两边由同一夹具通过真实界面自然推进到 120／480／960 步，每个长度三次保存、继续、明确读取；使用原生 Worker 与 IndexedDB，不注入预制历史。

测试构建中的轻量计时包装分开记录 Worker 内公开 Runtime load、Core 完整准备、回包编码、主线程历史重建与接收回调。Runtime load 是 Core 准备的子集，历史重建是接收回调的子集，不能把这些数相加。总等待还包含界面确认、本机 IO、队列、传输、渲染和观测帧，不等于后台耗时。公开 Runtime load 仍逐次执行规范字节／身份／artifact／完整历史／检查点链／Meta 检查；夹具没有回想目录，不能代表真实复杂回想重建的上限。

[冻结基线](../evidence/web-load-wait/profile/baseline.json)、[当前原始记录](../evidence/web-load-wait/profile/current.json)和[比较摘要](../evidence/web-load-wait/profile/comparison.json)均通过；下表为同机三次中位数，单位 ms：

| 完整历史步数 | 基线总等待 | 当前总等待 | 当前 Worker 准备 | 其中 Runtime load | 当前接收重建 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 120 | 175.7 | 164.0 | 24.3 | 15.1 | 0.0 |
| 480 | 294.0 | 294.6 | 146.5 | 94.2 | 1.6 |
| 960 | 657.3 | 641.1 | 443.1 | 292.5 | 4.6 |

120 步尚未使用紧凑历史回包，极短解包计时为 0.0 不代表零成本。960 步基线 Worker 准备 471.0 ms，其中 Runtime load 319.4 ms；接收重建 5.4 ms。各长度的九组规范保存字节长度／SHA、artifact／Runtime hash、正文、cursor 和完整历史长度与基线逐项相等，内存保护及冷启动恢复也保持；卸载后的原生 Worker 为零。冻结与当前构建的 bundle／CSS／夹具身份复核通过。

本批交付可理解、可取消、可重试的等待流程，不以后台化、小包或上述单次运行波动宣布整体提速，完整校验与准备成本仍开放。计时包装只存在于测量构建，不进入生产 Editor／Player 或实际导出的游戏。

## 作品与运行文件接续

可编辑工程、23 条未批准校订继续使用 [#384 原工程](../evidence/web-story-arrival-and-night/before-rain-stops-project.zip)和[原校订记录](../evidence/web-story-arrival-and-night/before-rain-stops.worldreview)。工程 SHA-256 为 `331a1b404ee39b89680a6a7a2c0d22dd7279b3b87ab9b60d4b5fe1a253baf5e8`。九场景、90 段旁白、九句对白、两结局、9,753 字符、86 演出和全部 26 媒体保持。

**可下载的当前运行候选仍是 #390**：[单文件 HTML](../evidence/web-voice-reading-continuity/before-rain-stops.html)和[网站上传 ZIP](../evidence/web-voice-reading-continuity/before-rain-stops-website.zip)。本批代码通过生产编辑器临时双导出验证，摘要留在本批 work 证据；不是覆盖旧下载文件，重新导出当前代码才能获得本批取消流程。同内容原 1.10.0 备份继续使用，不扩大到 1.9.0 或更早剧情存档的兼容。

## 验证和审计范围

[1,030 项相关回归／112 文件](../evidence/web-load-wait/related-tests.json)通过，保留 #390 的 Runtime／Host／Core、历史传输、保存／恢复／备份、Auto／快进、正文／语音接续、作者预览与双导出范围；新增 15 项请求隔离、取消后迟到成功／失败、再次读取、项目／存储／后台／卸载边界及排队读取不影响先行保存。旧槽位／标题测试按可取消读取和真实本机读取阶段迁移，不移除原有键盘与成功／失败保护断言。

类型检查、Editor／Player 双构建、23 项 Node 工具测试、118 便携／4 Node 适配文件架构和 N52-E5b 工程审计通过。既有大 chunk 提示、jsdom 未实现媒体方法提示和 N52 产品待验状态保留。

审计结论：本批产品改动局限于 Shell 请求归属、输入等待门与反馈；公开加载链和正式保存权威不变。取消后迟到结果、读取失败和换工程边界未覆盖当前阅读，原槽位／独立恢复记录在取消路径未改写。正常读取仍有完整计算等待，不能把新增取消入口当作长篇性能问题已经解决。

[Chromium](../evidence/web-load-wait/browser/chromium.json)、[Firefox](../evidence/web-load-wait/browser/firefox.json)、[Windows WebKit](../evidence/web-load-wait/browser/webkit.json)各六组专项通过：真实界面形成 480 步完整历史，保留原生 Worker 已完成的实际回包，再取消并释放迟到结果；这不是伪造成功结果或替换验证器。覆盖槽位、后台返回、冷启动恢复、最近存档、再次读取和卸载资源；比较原槽位规范字节长度／SHA、artifact 与 Runtime hash。320×740、844×390、568×320、390×844 检查取消可见且至少 44px 高。受控 Host 暂停和延迟回包是故障注入，不冒充操作系统锁屏、真实 BFCache 或真机测试。

[完整作品七组任务](../evidence/web-load-wait/work/browser-checks.json)通过生产编辑器实际导入 #384 原工程与 23 条记录、保存重开、双导出并[逐项核对内容与全部媒体](../evidence/web-load-wait/work/artifact-audit.json)。本地 HTML 留下路线和断网 390px 网站远行路线各 66 段正文／六句原生语音，Auto、历史定位、保存刷新读取及原 1.10.0 备份明确导入读取通过。两条路线合计两结局，不是格式×路线×引擎全组合，也不是自然全文／人工听感／计时通过。临时 HTML／网站包验证后清理，保留摘要、截图和原备份，不覆盖 #390 下载候选。

重放入口：`npm run audit:web-load-wait`；`npm run audit:web-load-wait:browser`。性能比较须独占运行：`npm run audit:web-load-wait:profile`；准确构建复核为 `node tools/run-web-load-wait.mjs --baseline --audit-only` 和 `node tools/run-web-load-wait.mjs --current --audit-only`。完整作品任务沿用 `tools/run-web-auto-voice-continuity.mjs`，设置 `STUDIO_AUTO_CONTINUITY_OUTPUT_DIRECTORY=evidence/web-load-wait/work`，先构建 Editor 并启动 #389 所述生产预览（默认 5195）。

本批没有重跑全仓 check、远端完整 CI、全部旧版本升级／公网部署矩阵，或宣布物理手机、Safari、长期运行、许可及人工内容验收通过。Windows WebKit 内嵌 data／Blob 音频的 [#390 未通过项](390-web-voice-reading-continuity.md)保持，本批无媒体的长篇 Worker 成功不能覆盖它。

## 下一批顺序

1. 回当前完整作品继续整篇阅读与演出复核，优先处理能复现的上下文、连读、中断返回问题，不为清空历史性能账而无限扩建验证平台。23 条人工记录、自然全文／听感与阅读计时仍须真实验收，不能自行批准。
2. 保留本批长篇成本基线。若继续优化，先细分公开 Runtime load 中的规范编码、摘要与完整检查点遍历，以及 Core 准备／真实回想重建；只有证明重复工作可安全移除才修改，不缓存校验结论，不截短历史，不把取消能力当作算得更快。
3. 继续核对 26 项素材发行条件、物理主流手机／Safari、长期连读和获准 HTTPS 公网。未获授权不上传，未取得证据不批准许可；Windows／Android 原生仍搁置。
