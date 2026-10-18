# 纯网站目录、部署核对与离线升级接续 · 2026-10-16

接续 `a1fe07b` / [#339](339-web-asset-provenance-and-release-preparation.md)，沿 [#304 完整 Web 作品](304-web-complete-gal-delivery.md) 的部署与玩家接续环节推进。先阅读正式导出、预览服务器、发布准备、Service Worker、备份与兼容读取代码。没有新增原生平台、账户或托管服务，也没有擅自公开发布。原先需要所有者提供的发行依据和 HTTPS 地址仍缺失；本批完成不依赖这些外部条件的交付工具和本地真实升级链，不虚构许可或上线结果。

## 用户现在能完成什么

1. 导出网页目录 ZIP，完整解压，双击 `check-deployment.cmd`，选择“生成纯网站目录”。电脑需要 Node.js 22+，无需安装 npm 依赖。其他系统运行 `node deployment-check.mjs --prepare`。
2. 工具先核对全部公开文件的大小、SHA-256 和离线清单，再复制到独立 `website-ready-<版本>-<随机值>`。只上传这个文件夹内的内容，包括 `build-info.json`，最后上传 `sw.js`。不必手工挑文件，也不会把作者助手、工程、内部来源/校订报告一起上传。
3. 已有获准的网站时，用同一入口选择“只读核对已部署网站”，输入最终 HTTPS 目录地址；命令行为 `node deployment-check.mjs --url=https://example.invalid/game/`，此地址仅是格式示例。逐份 GET 本包清单文件并核对字节/类型，错误明确定位漏传、混版、登录/SPA 回退、跳转或超时。不上传、不登录、不修改网站，不自动跟随跳转猜地址。
4. 本地仍可用 `start-preview.cmd` 或 `node preview.mjs` 试玩；启动前从仅检查三个入口改成全目录核对，漏掉媒体、损坏文件或离线清单不一致时先给出错误。只绑定本机，公开游戏文件以外的助手和内部文件返回 404。
5. 玩家更新失败时看到“重试更新”，明确原离线内容保留、当前故事不切换；补齐网站缺失文件后再点一次，会重新获取新版 Worker。真正缺失当前缓存时仍使用“重试离线下载”修复当前版本。

发布页、内部准备清单、包内使用说明已统一到上述流程。生成目录不覆盖、不合并、不删除原目录；先验证源，再复制到专属暂存目录，复核成功才改为 ready 名称。失败可能留下 `.website-building-*` 暂存目录，不能拿它上传。清单严格限制公开路径、文件数量/大小和重复记录，拒绝目录穿越、绝对路径、私有文件和链接文件/目录；远端只接受无账号/查询参数/片段的 HTTPS 地址，本机 loopback 可用 HTTP。文件检查不是代码签名或来源可信证明，也不是许可、完整游玩、设备或离线生命周期验收，报告对应标志始终为 false。

## 离线重试的实际缺陷与修正

原实现中，新 Worker 因漏传媒体而安装失败，按钮会变成“重试离线下载”；下一次点击向**旧 active Worker**发送 CACHE，而不是重新检查更新，可能只缓存旧版就显示就绪。两个针对更新失败的回归在旧实现失败，修复后通过；第三个回归保留真正的旧缓存修复路径。

现区分更新失败和当前缓存修复。没有增加强制刷新或 skipWaiting：新版下载完成仍等待所有游戏窗口关闭，不能中途替换玩家剧情。等待窗口与激活的标准行为参见 [Service Workers 生命周期规范](https://www.w3.org/TR/service-workers/)。状态提示同时改成“离线内容已就绪（文件已缓存）”，要求在目标浏览器断网重开核对画面、声音和存读档，不把文件完整等同于原生媒体必然可播放。

## 当前作品与换机入口

**候选版本 1.7.2**，不是已公开发行。通过真实编辑器导入 #339 工程，修改版本、核对上一版 1.7.1 工程，保存、刷新重开，再正式导出源工程、HTML 和目录。已核对列表保留 1.7.0、增加 1.7.1；本批现场旧备份来源是实际 1.7.1，1.7.0 的现场读取为 #338 历史，不重复计数。

9 场景、90 段旁白+9 句对白、9,672 字符、74 步演出、25 项素材、两结局不变。相比 #339 只允许 manifest 的发布版本/兼容回执改变，其他 **64 个源条目**逐份大小/摘要不变；25 份交付媒体与原源文件逐份相同，来源台账也完全保持，全部 pending、确认许可数 0。没有代填作者、发行者、确认人或日期。公开 payload 不携带内部来源台账。

| 当前文件（均在 `evidence/web-deployment-flow`） | 字节 | SHA-256 |
| --- | ---: | --- |
| `before-rain-stops-project.zip` | 31,682,984 | `4706ed70109b5cf665ddb76535750f5951b9c8df43b091cbd05a99c8436e5f6d` |
| `before-rain-stops.html` | 42,814,356 | `cb21dc581c240775ea50aa68d186392fc1d6c1c641e2424bab2a93368d45374d` |
| `before-rain-stops-web.zip` | 32,327,985 | `fedc2e9e0ef40855a5454d7cded72ad816d91b2591212267ea7fe899aaa5533b` |
| `before-rain-stops.worldreview` | 9,208 | `7e0e2f2f809a671f09f6bf33da1e67850b42d24b766ac2f4976a3f4864bf23be` |

换机先导入本批源 ZIP，再在检查页单独导入同目录 `.worldreview`；11 条原记录字节保持，均 fixed / checkedSourceHash=null，仍待人工复核，不是人工 verified。老游戏与源没有覆盖；1.7.1 在 `evidence/web-mobile-continuity`，含台账旧源在 `evidence/web-release-preparation`，1.7.0 在 `evidence/web-story-beats`。1.6.0/更早已变剧情仍不承诺迁移。更新前保留原游戏并导出 `.worldsave`。

## 实际测试、审计和边界

`npm run audit:web-deployment-flow`：**34 文件 / 206 项不同相关测试通过，无跳过**（33 个 Vitest 文件/193 项，1 个 Node 文件/13 项；新增 16 项）。覆盖 #339 相关基线、严格清单/文件/链接/纯目录复制、只读远端缺失/混版/MIME/跳转/超时、独立分发脚本不依赖 npm，以及离线重试。根类型、Editor/Player 双构建和工作区/架构/需求/交付基线四项审计通过；保留既有大 chunk 警告，没有运行完整全仓/长期 soak。

实际浏览器报告 `browser-checks.json` 为 **10 项检查通过，matrixComplete=false**：作者制作并保存重开正式双导出；实际内容修改生成不兼容测试包；下载包内 Node 工具生成纯网站并用真实预览服务器核对；Chromium 151.0.7922.34 / Firefox 153.0 各三项完整升级链；另有 Chromium 本地 HTML 旧备份恢复。具体包括：

- 原版 1.7.1 下载离线内容，断网重开、显式读取原快速槽位到同一运行状态。
- 同址 1.7.2 下载等待，当前页保持旧版，第二窗口也保持旧版；关一个窗口仍等待，全部关闭后新 Worker 激活。
- 新版断网重开读取旧快速槽位；现场导出的真实 1.7.1 `.worldsave` 离线导入手动槽位，只有显式读取/必要确认后切换；图片准备完成，雨声和 BGM 原生 audio 均无错误且实际播放/时间推进。原快速槽位打包记录指纹保持，不把独立预览 Blob 数据库也说成已做全量字节比较。
- 故意漏传不兼容测试包的一份 WAV，更新失败但旧版可继续断网重开；补齐后一次“重试更新”确实再次请求 Worker，并下载新版，不只是 CACHE 旧版。
- 测试包是通过真实编辑器改第一段旁白形成的 `1.7.3-test-only`，不是正式候选。激活后拒绝旧档且标题状态和原槽位不变；同址回滚兼容 1.7.2 后，旧档仍能断网读取。测试包/玩家备份只留 `.browser-diagnostic`，不混入正式作品。
- 单文件 HTML 在新浏览器环境导入真实旧备份、显式读取、媒体可用，文件页刷新后再次手动读取到相同状态。

实际下载包生成的纯网站恰好 **36 份公开文件**，逐份字节相同；额外加入的作者私有文件和所有助手未进入该目录，真实预览服务器亦不对外提供它们。`deployment-kit-checks.json` 的地址始终为 loopback，没有测试或上传实际公网。本批没有重跑两条完整剧情路线；#337/#338 的路线、声音自然结束、横竖屏等只能引用为历史，不是新版本全流程复验。最终代表截图已实际查看，包括更新失败/重试、Firefox 离线恢复、拒绝不兼容旧档、回滚和 HTML 恢复。

### 未通过：WebKit 离线音频，不能写成三引擎验收

Windows Playwright WebKit 26.5 下，`context.setOffline(true)` 连“仅返回固定文本”的最小 Service Worker 页面也产生内部错误。独立脚本 `tools/probe-webkit-offline.mjs` 不依赖游戏，复现该现象；与 [Playwright 上游问题 #42775](https://github.com/microsoft/playwright/issues/42775) 的描述相近，但本批不据此断言具体根因。改用停止本地 origin 服务的对照：受控页面返回固定文本且 fromServiceWorker=true，Node 直连失败；无 Worker 页面在此 Windows 传输环境得到 502/空正文、fromServiceWorker=false，而不是被误写成正常页面。结果见 `webkit-offline-probe.json`。这是**origin 不可达测试，不是全局网络已关闭或真机离线验收**。

在该对照下，WebKit 实际游戏的缓存文档、图片、旧档状态和 1.7.1→1.7.2 等待激活可以接续，**但离线读档后的雨声/BGM 原生播放失败：error=4、readyState=0、paused=true**，因此严格流程失败。同期 JS 对相同缓存媒体的 Range bytes=0-1 请求返回正确 206/Content-Range/两字节，这只能证明 fetch 路径可读，不能证明 audio 解码/播放。范围请求是应检查的独立媒体路径，参见 [Service Worker 范围请求说明](https://web.dev/articles/sw-range-requests)，这里没有据其推导支持矩阵或确定根因。

原始 1.7.1 目录同样复现两音轨错误，摘要 `2fe7df77fd75b3ad7fb063a08af4da619f1334f08b0b1a90398782662e901ca4`，见 `webkit-original-1.7.1-media-baseline.json`。清理缓存响应 hop-by-hop 头、同源 CORS、缓存 Blob URL 三项实验均未恢复播放（`media-diagnostic-experiments.json`），仅在隔离测试 DOM/Cache 内进行，未作为产品修复。根因仍未确定；不笼统宣称 Safari/iPhone 不支持，也不增加全素材预加载或绕过媒体错误来凑通过。

最终候选再次严格复测仍失败，`browser-failure.json`、`media-failure-diagnostic.json` 和 `failure.png` 是**当前开放问题证据**，不是过期成功前的过程错误。通过的两个引擎报告独立保留，不能据 `passed=true` 忽略 `requestedEngines` 和 `matrixComplete=false`。WebKit 后半段故障重试/不兼容拒绝/回滚没有走完，不能从 Chromium/Firefox 推定通过。

### 测试过程纠偏

最初单测把 details 留在折叠状态，修正夹具后才得到更新重试的两个真实失败；未删保护或跳过用例。浏览器脚本纠正实际导航/脚本按钮、发布页恢复步骤、已经打开的阅读菜单，以及导入后真实“确认读取”交互；没有直接改数据库充当玩家导入。上述自动化定位问题不作为产品缺陷数。内部错误与原生音频错误分别诊断，最终未隐藏媒体失败。

## 下一批按此顺序

1. **先解决已发现的离线原生音频路径。** 做与游戏解耦的缓存 WAV/原生 audio 最小对照，区分 Windows WebKit 媒体栈、编码、缓存/Range、Blob 与播放器生命周期；补明确回归，修复需遵守有界资源/释放/失败恢复，不能一次预载全部媒体。修复后重跑严格三引擎完整链；真实 Safari/设备另记，不用 Windows 模拟代替。
2. 由所有者核实 25 项发行条件，尤其系统 TTS 再分发；缺依据则通过现成入口替换，公开署名需明确确认。拿到实际获准 HTTPS 地址后，再用新工具准备/核对真实站点，现场完整两路线、媒体、保存刷新、离线升级/旧备份和回滚；不代建公开站点或宣称已上线。
3. 继续 11 条人工全文/听感/美术/计时与主流手机系统键盘、锁屏/后台、低内存检查。历史约 616.6 ms 长帧、全仓/soak 仍开放，Stable/M1 未完成；Windows/Android 原生继续搁置。

复跑：`npm run audit:web-deployment-flow` 跑相关单测和现有产物审计，不需要启动浏览器。`npm run audit:web-deployment-flow:browser` 构建 Editor 后通过界面重建本批产物，默认 UI 地址 `http://127.0.0.1:5195/`（需已有生产预览），默认跑三引擎，**当前预计在 WebKit 音频处失败**。环境 `STUDIO_BROWSER_ENGINES=chromium,firefox` 可单跑通过子集，报告不会称全矩阵通过。先 `node tools/probe-webkit-offline.mjs` 建立环境对照；`--reuse-artifacts` 需用 `STUDIO_INCOMPATIBLE_GAME` 指向本机上一完整制作流程留下的不兼容测试 ZIP（路径见浏览器报告 scratch），换机没有它时应重新跑制作，不伪造兼容证据。仅核对四产物用 `node tools/run-web-deployment-flow.mjs --audit-only`。
