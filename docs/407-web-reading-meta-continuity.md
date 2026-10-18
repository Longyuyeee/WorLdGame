# 跨窗口已读合并与段内续读

2026-10-18，接续 [#406](406-web-manual-save-safety.md)，继续 [#304 完整 Web 作品](304-web-complete-gal-delivery.md)的连续阅读与中断续读。本批解释了上一批记录的特定状态摘要变化，并修复两个实际阅读障碍：合并已读记录后“从段首重读”入口消失，以及继续滚动的新位置没有更新到合并前的存档来源。作品保持 **1.11.0 候选／S0.41**，不改正文、演出、媒体、Core、Runtime 或存档格式。

## 状态变化的实际来源

[原工程与真实备份回归](../apps/player-shell/src/reading-meta-rain.test.ts)使用 #406 HTML 中的原工程和 #404 实际导出的同内容备份，经正式 Core 读取和推进，精确重现三份摘要：原窗口 `92734b…`，另一窗口读下一段后 `c04d22…`，把其已读记录合并回原窗口后 `ae1db2…`。

前后 Runtime 中除 `metaProgress` 之外的所有字段逐项相等，当前句、Host 演出对象、历史位置及长度保持；已读文本恰好多一项。它是原始需求中“已读／收藏元进度单调合并”的正常结果，不是保存偷偷改动剧情。不得为了让 hash 恒定而丢掉另一窗口的已读记录，也不能由这个结论推断其他 hash 变化都正常。

正式读档仍完整校验原存档；可选阅读位置按合并 Meta 之前的原保存摘要匹配，而不是拿合并后的摘要去查旧位置。本批没有把 UI 位置缓存升级为剧情依据，没有改变正式存档或历史校验。

## 玩家续读的改进

同一段文字、语言、工程和构建中，仅发生 Meta 合并时，保留“已回到本机记录的阅读位置”和“从段首重读”入口，不再因为摘要变了就消失。玩家主动点击“知道了”后，后续 Meta 更新不会让提示重新出现。

玩家在原存档对应的段落里继续滚动，位置也同步记到已知的合并前来源；重开后明确读取旧存档，可以回到后来真正读到的行，而不是较早的位置或另一窗口留下的段尾。主动从段首重读会同步更新来源标记，下一次明确读档从段首开始。恢复后继续点击正文，仍先读下方未显示的文字，不跳过整个段落；明确读档后的 Auto 为 off，原手动存档载荷保持。

别名只属于可选显示缓存。判定时要求同一段落身份、工程／构建／语言／正文摘要，以及当前 Runtime 除 Meta 外的全部字段引用保持；变量、游标、执行身份、音频或其他非 Meta 字段变化会重建范围。这里依赖正式 Meta 合并保持非 Meta 字段的既有性质，不用正文相同代替剧情等价，也不对长状态做额外 JSON 序列化。

每段最多八个已知来源，保留最初或明确校验过的来源及最近来源；整个缓存仍沿原八条上限和 schema 1。一次批量写入只读／写一次可选本机缓存，不为每个别名重复 IO。缓存失败不阻塞故事，段落／语言／工程变化、普通新开故事和历史导航不会自动恢复位置。数量上限意味着不能承诺所有旧存档的所有段内位置永久保留。

## 复现与测试

[冻结 #406 浏览器基线](../evidence/web-reading-meta-continuity/baseline-chromium.json)用实际游戏首段、140% 个人字号和 320×568 窗口产生真实滚动区域；从真实界面保存、读取，再由第二窗口正常阅读下一段触发可信 `storage` 事件。旧版会丢失恢复提示；另一个全新数据区在尚未明确读档的场景下，原保存摘要的标记落后于当前阅读位置。存档与位置缓存没有由测试写入，未伪造数据库或事件。

[两项玩家流程红测](../evidence/web-reading-meta-continuity/red-tests.json)分别在入口消失和位置仍为 420 而非 900 处失败，原工程 hash 溯源及其余八项通过。修正后的[四文件定向测试](../evidence/web-reading-meta-continuity/targeted-tests.json)55 项通过，覆盖 17 项别名范围／非 Meta 隔离与上限、四项批量缓存行为，以及提示、主动重读、取消提示和明确读档的接线。

最终包的 [Chromium](../evidence/web-reading-meta-continuity/browser/chromium.json)、[Firefox](../evidence/web-reading-meta-continuity/browser/firefox.json)、[Windows WebKit](../evidence/web-reading-meta-continuity/browser/webkit.json)各七组实际流程通过：可信跨窗口已读合并后保持当前段落、恢复提示与滚动位置；明确段首重读；重开后读取段首；继续阅读先滚动未读文字；尚未读档时更新旧摘要的位置；重开旧存档回到最新行；“知道了”只隐藏提示、不清除位置。

三引擎均核对真实手动槽位的原生 IndexedDB 载荷 SHA-256 保持；320×568、568×320、844×390、1280×900 的重读按钮可见、至少 44px 并能滚入视区。使用的是实际游戏文本和浏览器滚动，不用修改剧情或假几何代替浏览器验收。[Chromium 手动保存七组回归](../evidence/web-reading-meta-continuity/manual-regression/chromium.json)另核对旧确认／空槽竞争保护、重新确认和重开读取，没有复用旧游戏的通过报告。

## 正式制作与交付

[作者及路线报告](../evidence/web-reading-meta-continuity/work/browser-checks.json)从当前生产编辑器实际导入 #394 工程与 25 条校订，保存、关闭、刷新重开并双格式导出，七组任务通过。原工程、记录、全部 26 媒体及网站 37 个公开文件保持；桌面本地 HTML 留下线、390px 断网网站远行线各走过 66 段正文和六句原生语音结束，包括 Auto、历史、保存重开和明确读档。另实际导入同内容旧备份。此范围不是新包两格式乘两路线完整矩阵，也不是自然全文听读／计时；声音输出静音。

构建和浏览器结束、代码冻结后，单工作进程、既有超时顺序运行：[相关回归](../evidence/web-reading-meta-continuity/related-tests.json)151 文件／1,379 项，[编辑器整合](../evidence/web-reading-meta-continuity/app-tests.json)两个不重叠文件／47 项，共 **153 文件／1,426 项功能测试通过**，含新增 25 项；[工具测试](../evidence/web-reading-meta-continuity/tool-tests.tap)76 项通过。类型检查和 Editor／Player 生产构建通过，既有大分包与 jsdom 原生媒体未实现提示保留。红测和定向测试不重复累计。

[汇总审计](../evidence/web-reading-meta-continuity/audit.json)核对精确双游戏、最终报告、#394 四产物、#406 原双游戏及 26 份媒体／25 条未批准校订。架构审计 118 个可移植文件／四个 Node 适配文件通过，N52-E5b 工程通过、产品验收仍 blocked；不是全仓 check、远端 CI 或 Stable／M1 验收。

当前 [HTML](../evidence/web-reading-meta-continuity/before-rain-stops.html)46,811,136 字节，SHA-256 `d8fc175fc672e3f53b488b2c3ac6da03924bc029e31042be5f9c7259b5cecec8`；[网站 ZIP](../evidence/web-reading-meta-continuity/before-rain-stops-website.zip)35,397,585 字节，SHA-256 `8dfb434a6e8e503c8a02bb10d3fb4d953489fbbd51ff16f992f5ddf05fa4383c`。精确交付见 [delivery](../evidence/web-reading-meta-continuity/delivery.json)。全部门槛通过后提升这对原字节，核对后移除暂存目录里的同一对副本；历史游戏、源工程、报告、截图及实际备份保留。

## 后续顺序与验收边界

回到完整作品正文、演出与声音的连续使用，优先修复可复现的阅读／中断续读障碍，不把正常 Meta 合并当成错档，也不围绕显示缓存新增独立存档协议。长历史 JSON／规范化备份信封／正式 Worker 校验／快照重建成本、底层写入长期等待和冷开设置偶发继续分别调查。

内容仍为九场景、两结局、9,772 字符、87 步演出、26 项媒体和九句 TTS。25 条 fixed 的 `checkedSourceHash` 仍为空，26 项发行条件 pending、已确认 0；九份系统 TTS 再分发依据仍待核实。自然全文阅读／听感／计时、主流物理手机／Safari、真实后台／锁屏／BFCache、长期续读和获准 HTTPS 部署仍待验。Windows WebKit 内嵌 data／Blob／离线音频未通过；桌面 HTTP 音频与手机尺寸窗口不能替代。Windows／Android 原生产品化继续搁置。

## 重放

设置新的 `STUDIO_READING_META_OUTPUT_DIRECTORY` 后运行 `node tools/run-web-reading-meta-continuity.mjs`，支持 `--engine=firefox`／`--engine=webkit`；`--baseline` 固定读取 #406，`STUDIO_READING_META_SOURCE_DIRECTORY` 可指定另一对游戏。已有报告拒绝覆盖，服务器仅监听本机高位端口，退出关闭浏览器与服务器。

相关回归为 `node tools/run-web-reading-meta-tests.mjs`，已有报告拒绝覆盖；可用 `STUDIO_READING_META_TEST_REPORT` 指向新文件。汇总为 `node tools/audit-web-reading-meta-continuity.mjs`。重新制作必须走实际生产编辑器保存重开、双格式导出及精确字节验证，不能沿用旧包报告。
