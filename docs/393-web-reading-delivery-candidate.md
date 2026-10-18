# 393 完整作品的连续阅读运行候选

2026-10-18，按 [#392 第一项](392-web-history-reading-context.md)将最近两批代码纳入《雨停之前》的实际下载游戏，解决“编辑器代码已更新，但下载游戏没有读档取消和历史回看改进”的接续差异。本批不另加剧情功能；目标仍为 [#304 完整 Web Gal 制作与交付](304-web-complete-gal-delivery.md)，**作品 1.10.0 候选／技术 S0.41**，不宣布 Stable 或 M1 完成。

## 当前下载和制作入口

- [独立 HTML 游戏](../evidence/web-reading-delivery/before-rain-stops.html)：下载后本机打开；本批实测 Chromium 本地文件和 Chromium／Firefox HTTP 载体的原生声音流程。
- [网站上传 ZIP](../evidence/web-reading-delivery/before-rain-stops-website.zip)：解压全部文件，使用本地 HTTP 或获准托管环境运行，不把直接双击目录内 index.html 当作网站部署。Windows WebKit 的原生声音实测限在线 HTTP 网站。
- [可编辑原工程](../evidence/web-story-arrival-and-night/before-rain-stops-project.zip)和 [23 条待人工复核记录](../evidence/web-story-arrival-and-night/before-rain-stops.worldreview)：继续沿 #384，不把 HTML、玩家备份或网站 ZIP 当成工程导入。
- [旧 #390 HTML](../evidence/web-voice-reading-continuity/before-rain-stops.html)和[旧网站 ZIP](../evidence/web-voice-reading-continuity/before-rain-stops-website.zip)原字节保留，供对照和回退，不覆盖旧候选。

新的下载版包含 #391 的读档读取／完整校验提示、取消与重试、后台及迟到结果保护；也包含 #392 的只读历史正文、独立“回到这一句”、实际人物／已选答案查找、当前／未来／归档隔离，以及手机短横屏和高对比可读性。段内续读、原生语音重听和中断恢复继续保留，完整正式校验与存档内容没有缩减。

创作源 SHA-256 仍为 `331a1b404ee39b89680a6a7a2c0d22dd7279b3b87ab9b60d4b5fe1a253baf5e8`。九场景、90 段旁白、九句对白、两结局、9,753 字符、86 演出和全部 26 项媒体不变。记录仍是 23 条 fixed、待人工复核，未自行写入批准或 checkedSourceHash。

## 同一候选的实际任务

本批通过生产编辑器导入原工程和记录、保存重开、重新下载原工程并逐字节比对，再独立导出 HTML 与网站 ZIP。[完整作品七组任务](../evidence/web-reading-delivery/work/browser-checks.json)覆盖桌面本地 HTML 的“留下”路线、390px 断网网站的“远行”路线，各 66 段正文／六句原生语音，合计两结局；中途经历 Auto、历史回退、快速保存和刷新后明确读取。声音静音输出但由浏览器原生媒体完成，不是人工自然听感或阅读计时。

同一报告继续从原 #384 游戏实际导出 1.10.0 备份，在新游戏导入并明确读取，核对正式进度。保留[实测原版备份](../evidence/web-reading-delivery/work/original-1.10.0.worldsave)。兼容范围是同内容 1.10.0，不扩大到 1.9.0 或更早剧情存档；段内文字位置仍是本机辅助记录，不随备份跨电脑迁移。

[统一任务矩阵](../evidence/web-reading-delivery/browser-matrix.json)逐份核对实际运行产物摘要，具体覆盖如下，不把不同载体的结果互相替代。

| 范围 | 载体和检查 |
| --- | --- |
| 语音和连续阅读 | Chromium／Firefox HTTP HTML、Chromium 本地 HTML、Windows WebKit 在线 HTTP 网站，各 11 组；同句读取只重启当前语音，健康音乐保持，Auto 等待新语音，三次生命周期中断保留位置，菜单重听、迟到播放和四尺寸恢复提示保持 |
| 主动无声阅读 | Windows WebKit HTTP 内嵌 HTML 单独一组；没有原生错误回调时仍可主动选择无声继续，不算内嵌音频通过 |
| 历史回看 | Chromium／Firefox／Windows WebKit HTTP HTML，各七组；正文点击不导航，人物／已选项可查，四尺寸目标、答案与 44px 操作同时可见，纸色和高对比可读，归档只读、重开／读取按各自历史显示 |
| 读取取消和重试 | 上述三引擎 HTTP HTML，各五组；实际完整游戏原生 Worker 的完整成功回包被暂缓，取消后再交付不会替换当前段落或原槽位，Escape、四尺寸、后台取消后明确重试、冷恢复和标题最近存档保持 |
| 段内续读 | 上述三引擎 HTTP HTML，各九组；原生滚轮与 Range 定位、四尺寸重排、原槽位 hash 与已读知识合并、未读正文阻止 Auto、段首重读及损坏／拒写辅助记录后的正式进度保护 |

读取专项保留真实 IndexedDB 内容及规范字节摘要，不伪造故事、校验结果或 DOM 几何。暂缓真实 Worker 回包、pagehide／pageshow、受控 Auto 时钟和媒体播放边界故障均在报告中注明；它们不证明真实系统冻结、BFCache、自然阅读时长或物理手机／Safari 通过。#391 长篇成本不在本批重测，不宣称本次候选整体提速。

## 公开文件与保留检查

[产物审计](../evidence/web-reading-delivery/work/artifact-audit.json)逐项核对 HTML 原始 payload、网站剧情、26 项媒体原字节，以及网站 build-info 中全部文件的长度和摘要。网站仍只有 37 个公开文件，没有工程 ZIP、内部复核记录或玩家备份。

| 文件 | 字节 | SHA-256 |
| --- | ---: | --- |
| before-rain-stops.html | 46,784,758 | `e342827d80a0bd18944cc84655437ded37f25f901d81b4bf4229fd9d97080510` |
| before-rain-stops-website.zip | 35,371,207 | `6c54de35ed7dd3ba2a507c83204faeb479cfdc56c2b11921ad785c271a138676` |

所有浏览器检查结束后才提升这两份已测原字节，不重新构建一份未经复验的下载文件。提升前先检查两份目标，任一已有不同内容就拒绝覆盖；提升后再次核对两份摘要，才清理本批 work 中的临时游戏，保留报告、截图和实测备份。旧 #390 双游戏、#384 原工程和复核记录在提升前后再次核对摘要。

`.gitattributes` 对新 HTML 和本批备份禁用文本行尾转换，提交前还核对暂存区和实际下载文件字节一致，避免换电脑后游戏摘要或备份校验改变。

## 回归和审计结论

[1,045 项相关回归／113 文件](../evidence/web-reading-delivery/related-tests.json)通过，沿 #392 保留 Runtime／Host／Core、完整历史传输、保存／恢复／备份、Auto／快进、正文／声音接续、历史上下文、作者预览及双导出范围。[30 项 Node 工具测试](../evidence/web-reading-delivery/tool-tests.tap)通过，其中新增七项保护“只提升已测文件、两目标预检、拒绝覆盖不同旧候选、缺失或摘要不符不发布、保留诊断资料”。

类型检查、Editor／Player 双构建、118 便携／4 Node 文件架构及 N52-E5b 工程审计通过。既有大 chunk 警告和 jsdom 媒体方法提示保持；N52 的产品验收仍 blocked，不把工程审计换算成产品通过。本批没有运行全仓 check 或远端完整 CI。

首次读取专项把 #391 合成长篇的压缩回包断言误用于实际作品六条历史的短档，见[保留的失败报告](../evidence/web-reading-delivery/load/chromium-initial-probe-assertion.json)。代码实际只在至少 480 条时使用该编码；专项改为核对短档的真实 plain 完整成功回包，重新从编辑器制作并执行整批，不改正确的存档传输逻辑。最终通过范围只取统一矩阵对应的最终报告。

WebKit 的另一处[初次断言](../evidence/web-reading-delivery/load/webkit-initial-render-assertion.json)将原生回包误当成 React 状态已提交的屏障；改为等待实际 validating 界面状态后，五组读取任务通过。随后保留第二次导出的原字节，核对其长度、摘要、原工程及七组制作任务报告，再重跑全部 14 份浏览器专项报告。矩阵明确标记 `verifiedExportReused`，不把重放既有文件当作重新导出修改后的源码；两处均为测试假设纠正，没有因此改变产品逻辑。

最后 WebKit 续读尝试曾在初次点击设置后等待“文字显示”超时，见[原始失败](../evidence/web-reading-delivery/reading-resume/webkit-initial-settings-timeout.json)和[当时标题画面](../evidence/web-reading-delivery/reading-resume/webkit-initial-settings-timeout.png)。随后独立冷开检查均收到原生 pointerdown／pointerup／click 并打开设置，[五次正式保留的探针结果](../evidence/web-reading-delivery/reading-resume/webkit-cold-settings-probe.json)另存；同份 HTML 的原九组续读重跑通过，未加自动点击重试、放宽超时或修改产品。原因尚未稳定复现，保留冷启动设置响应的偶发待跟踪项，不登记为已修复。

最终提升通过 `--finalize-existing` 逐份重新核对这 14 份已测报告的通过状态、组数、无页面错误和同一文件摘要，再检查制作报告及两份原文件；矩阵明确标记 `verifiedBrowserReportsReused`。最后一份 WebKit 续读报告来自上述独立重跑，不宣称整套命令首次无失败通过。

审计结论：按计划补齐实际下载与当前功能的差异，没有改变原始剧情、媒体、正式存档协议或权限边界。Windows WebKit 内嵌 data／Blob 音频仍未通过，在线网站声音通过不能证明离线音频或 Safari。23 条人工复核、全文自然听感和计时、26 项发行条件、物理主流手机／Safari、长期连读和获准 HTTPS 实际上线继续开放；Windows／Android 原生仍搁置。本批只向 GitHub 推送仓库，不上传游戏到公网托管渠道。

回归：`npm run audit:web-reading-delivery`。制作与浏览器整批：`npm run audit:web-reading-delivery:browser`，需生产预览默认 5195（支持 `STUDIO_UI_URL`，启动见 #389）。整批从原工程制作新候选；它不会覆盖不同摘要的已发布候选，已保留文件不能为重跑而直接删除。后续代码应使用新批次的输出目录和下载路径，保留本候选。各专项可用新增环境变量选择本批独立输出，不覆盖 #390／#392 的历史报告。

在提升前调试测试工具，可用 `node tools/run-web-reading-delivery-batch.mjs --reuse-export` 重放 work 中已完成制作与文件审计的同一候选；缺文件、长度／摘要或原工程不符即拒绝。源码修改仍须重新制作。成功提升后 work 临时游戏已清理，该选项不自动重建或删除保留的下载版。

同份产物的专项单独复测完成后，`node tools/run-web-reading-delivery-batch.mjs --finalize-existing` 可核对全部既有报告后提升，不能跳过缺失、失败或不同摘要的任何关卡；它不运行新的浏览器任务，不能拿旧报告证明新源码。提升成功后同样清理 work 临时游戏，不覆盖已有不同候选。

## 下一批顺序

1. 回到 #392 第二项，逐场审阅开场、候车室、站台以及两条路线的正文／人物进出／声音衔接，同时复核 WebKit 冷启动设置偶发未响应。只围绕有实际依据的内容或操作问题修改；发生剧情变化才更新内容版本、工程和兼容说明，不为重复验证反复重发同版。
2. 继续自然全文、听感与计时，保留实际人工审批入口；自动路线完成和 fixed 状态不能代替 23 条批准。发行前逐项确认 26 媒体的来源、署名与再分发条件，条件不成立则替换。
3. 在可用物理主流手机／Safari 上验证旋转、系统后台／锁屏、中断读取与长时间连读；获得明确托管授权后再做 HTTPS 部署和实际网址接续。长篇完整校验成本继续跟踪，不恢复三端并行。
