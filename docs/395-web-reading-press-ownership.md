# 395 连续阅读的点按归属与误跳保护

2026-10-18，接续 [#394](394-web-story-plans-and-farewell.md)第一项，从完整作品的实际阅读操作查找问题。修复 Auto 换段期间松手会再跳过新段的问题，并将修复通过生产编辑器带入新的 HTML／网站包。仍以 [#304 Web 完整 Gal 制作与交付](304-web-complete-gal-delivery.md)为目标；作品内容 **1.11.0 候选**、技术 **S0.41** 不变，不新增剧情版本，不宣布 Stable 或 M1 完成。

## 实际问题与修复

在 [#394 原 HTML](../evidence/web-story-plans-and-farewell/before-rain-stops.html)中，按住对白框的公共区域不松手，让真实 Auto 时钟换段，再松手：历史游标先由 4 到 6，松手又到 7，Auto 变为 off；玩家还没阅读第二段，它就被这次旧点按跳过。[原包复现](../evidence/web-reading-press/baseline-chromium.json)保留正文、状态摘要和松手前后截图。定时使用受控浏览器时钟，不是自然阅读计时。

原因是对白框沿用同一按钮节点，原逻辑只判断是否拖动，没有记录点按所属的正文／活动界面。修复在现有 `useReadingSurface` 中管理一次指针序列，不增加推进队列、时间防抖、存档字段或另一套剧情状态：

- 换段、读取等待、菜单／其他面板、欣赏画面及 Host 暂停使旧点按失效；窗口失焦、pagehide、拖动、取消和上下文菜单也取消它。
- 只有同一活动正文上、同一主指针完成的按下／松开才能产生一次点按；第二根手指或不匹配的松开不借用旧操作。
- 取消只丢弃这次指针动作，不停止 Auto、不推进剧情，也不改已有阅读锚点；下一次明确点按仍可正常切回手动和继续。
- 键盘和辅助激活保留无指针序列的入口；原段内翻页、未读等待、全文显示及原生声音等待策略保持。

新增回归先在未修复代码上失败，再验证修复。没有稳定复现菜单返回丢位置或文字选择引发推进，因此没有猜测性改动这些逻辑；既有 WebKit 冷启动设置偶发未响应也没有登记修复。

## 当前交付与接续

| 用途 | 当前入口 |
| --- | --- |
| 新运行候选，已含本批点按保护 | [HTML](../evidence/web-reading-press/before-rain-stops.html)、[网站 ZIP](../evidence/web-reading-press/before-rain-stops-website.zip) |
| 可编辑工程、26 项媒体及内部来源台账，原字节沿用 | [#394 工程 ZIP](../evidence/web-story-plans-and-farewell/before-rain-stops-project.zip) |
| 25 条仍待人工复核记录，原字节沿用 | [#394 校订记录](../evidence/web-story-plans-and-farewell/before-rain-stops.worldreview) |
| 本批交付摘要与保留文件 | [delivery.json](../evidence/web-reading-press/delivery.json)、[产物审计](../evidence/web-reading-press/work/artifact-audit.json) |

九场景、两结局、9,772 字符、87 步演出及 26 项媒体保持；HTML 内完整公开工程投影与原 1.11.0 深比较相同，网站与 HTML 的公开工程、26 项媒体原字节一致。网站仍 37 文件，逐项核对 build-info 的长度和摘要；没有附带可编辑工程、内部校订或玩家备份。本批不复制无变更的工程／校订文件，也不批准任何人工记录。

HTML：46,785,618 字节，SHA-256 `62cef5a100e83767bd2d05f4a6a84702335f6cda05d52176480bf51546c775ce`。

网站 ZIP：35,372,067 字节，SHA-256 `f5df9798de96c6bf29269082ff7748fe500c0e4a0afea60dacd507d410235b89`。

生产编辑器实际导入 #394 工程和 25 条记录，保存、关闭、刷新重开，再导出两种游戏；重新导出的源工程摘要、记录内容保持。原 1.11.0 HTML 实际生成备份，新网站经明确导入／读取后还原同一状态，Auto 保持关闭；这是同内容的接续验证，**不是批准 1.10.0 或更早剧情存档**。旧 #394 四产物和 #393／#384 入口继续保留，内容变化的旧档边界仍按 #394；本批没有重测完整旧版离线升级链或重做制作交付包。

## 测试与审计

[真实制作与完整路线](../evidence/web-reading-press/work/browser-checks.json)通过：桌面本地 HTML 走留下路线，390px 断网网站走远行路线，各核对 66 段正文的完整 ID 顺序、六句原生语音自然结束及不同结局；包含 Auto 等待原生语音、历史回看、保存、刷新和明确读取。两项声音故障边界另以拒绝 play Promise／无效 WAV 触发原生错误，再用实际原生重试验证；未伪造 ended／error 事件，输出静音，不作为自然听感通过。

[Chromium](../evidence/web-reading-press/chromium.json)、[Firefox](../evidence/web-reading-press/firefox.json)、[Windows WebKit](../evidence/web-reading-press/webkit.json)对同一最终 HTML 分别完成七项行为检查（报告另含一份按下／松手观察）：旧段松手不跳新段且不停止 Auto、新点按仍可接管、欣赏画面返回后旧点按作废／新点击有效、Space、Enter、568×320 原生拖动与触摸点按段内翻页、390×844 旋转／菜单点按保留正文。没有合成指针／click 事件、伪造 DOM 几何或注入剧情状态；辅助激活、第二指针、后台切换等其余边界由组件回归覆盖，不冒充物理触摸、锁屏或真机验收。手机截图使用用户可选的最大个人字号作溢出检查，不是默认字号或新游戏画幅。

[1,058 项相关回归／113 文件](../evidence/web-reading-press/related-tests.json)和 [46 项 Node 测试](../evidence/web-reading-press/tool-tests.tap)通过；新增 13 项点按／中断回归及两项冻结游戏防覆盖工具测试。范围继续覆盖 Runtime／Host／Core、完整保存校验、历史传输、正文／声音接续、Auto／快进、预览及双导出。类型检查、Player／Editor 双构建、118 便携／4 Node 文件架构和 N52-E5b 工程审计通过；产品验收仍 blocked。保留既有 chunk 警告、jsdom 媒体未实现提示；没有运行全仓 check 或远端完整 CI。

测试工具初期的截图保留为 `*-failure.png`：基线最初落点会离开换段后缩小的按钮，不能证明松手误跳；实际复现改在前后共同按钮区域。另纠正了短横屏必须溢出 100px 的错误夹具假设，以及 Firefox 时钟安装后用 Node 当前时间暂停导致的“回到过去”错误。最终用实际未读判据及固定受控时刻完成三引擎重跑；这些工具问题不计为新增产品故障或额外通过项。

审计没有发现向原生平台、新系统或无关外观扩展的偏移。本批只改阅读输入归属；不改变故事、读档协议、Worker 验证、安全校验或声音时钟。正式入口只提升同一份已测 HTML／网站，提升前核对全部报告摘要及源文件保留，已有不同候选拒绝覆盖；暂存区另核对实际字节，HTML／备份禁用 Git 行尾转换。

## 重放及下一批顺序

已交付文件的点按复验：`node tools/run-web-reading-press.mjs`；另加 `--engine=firefox` 或 `--engine=webkit`。原包复现使用 `--baseline`。这些命令不重导出候选。

重新制作须选新的输出目录：设置 `STUDIO_AUTO_CONTINUITY_SOURCE_DIRECTORY=evidence/web-story-plans-and-farewell`、`STUDIO_AUTO_CONTINUITY_OUTPUT_DIRECTORY=<新目录>`，运行 `node tools/run-web-auto-voice-continuity.mjs`，生产预览默认 5195、可用 STUDIO_UI_URL 指定。已有任一游戏即拒绝覆盖；`--play-only` 只复验并写独立 player-only-checks，不能冒充作者重做。新源码必须重新导出和检验，不能复用本批摘要。

1. 回到完整作品的正文、人物／配音节拍与演出衔接，按实际路线处理具体问题；不为重复自动测试无变化地增加内容版本。25 条人工复核、自然全文／听感与篇幅计时保持待验。
2. 继续核对 26 项媒体的来源、署名与再分发条件，依据明确缺口补齐或替换；冷启动偶发问题有稳定复现再修复。Windows WebKit 内嵌 data／Blob 音频未通过项不因本次无声点按检查关闭。
3. 在可用物理主流手机／Safari 上验证旋转、后台／锁屏与长期中断续读，再做获准 HTTPS 实际部署。不擅自上传、不恢复 Windows／Android 原生并行，长篇完整校验成本继续保留。
