# 多窗口手动保存与进度保护

2026-10-18，接续 [#405](405-web-save-list-recovery-and-verified-slots.md)，沿 [#304 完整 Web 作品](304-web-complete-gal-delivery.md)的保存、重开和连续阅读路线，处理真实双窗口使用中的进度覆盖风险。作品保持 **1.11.0 候选／S0.41**，不改剧情、演出、媒体、Core、Runtime 或存档格式。

后续澄清：[#407](407-web-reading-meta-continuity.md)已用原工程和真实备份精确证明，本页记录的 `92734b… → ae1db2…` 来自另一窗口正常阅读后的已读 Meta 合并，不是保存改变剧情；该特定来源不再待查。#407 同时修复其暴露的段内续读提示与位置缓存问题。下文保留 #406 当时的复现和交付范围，不据此认定其他状态变化都正常。

## 手动保存的用户流程

手动槽位现在使用备份导入已有的原子比较后写入能力。玩家第一次选择已有槽位时，固定当时看到的完整摘要；再次确认只允许替换这份进度。另一窗口在此期间修改了保存时间、进度或截图，保存会拒绝，不会悄悄覆盖新档。列表中的空槽同样必须在提交事务中仍为空，不能凭旧列表覆盖另一窗口刚写入的进度。

冲突后清除旧确认并刷新列表，明确说明“槽位已更新，本次未保存”。玩家可核对新进度后重新两次确认，或者选择另一空槽；程序不自动重试写入。刷新失败时保留冲突结论，先走列表重试，不能继续盲写。短横屏也保留重要结果和返回按钮。

正式 Web 适配器继续在同一个 IndexedDB 读写事务里比较和提交，不使用“先读取、再无条件写入”的替代方案。预览准备、保存队列等待期间目标发生变化也要拒绝；截图及保存时间仍取自玩家触发保存的边界。快速连点不会排入第二次同归属前台保存，卸载或更换工程／存储后尚未提交的准备不再写入。

未提供原子比较能力的旧宿主不再降级为不安全手动写入，窗口明确说明并禁用手动保存；读取和当前进度导出备份仍可使用。快速、自动及检查点保存保留既有覆盖策略，本批不把这些入口宣称为跨窗口人工确认保护。编辑器隔离外观预览补齐私有内存 Map 的同步比较和替换，仍不写真实 IndexedDB，关闭 iframe 即丢弃试存档。

## 保存结果的准确反馈

准备阶段失败会说明本次未提交写入。已经调用宿主写入但没有获得可靠成功结果时，只说明“保存结果尚未确认”，重新读取列表供玩家核对，不再一概声称“原存档保持不变”。测试覆盖了宿主实际提交后丢失成功回执的情况。

已确认提交成功但列表刷新失败，继续保留 #405 的“已保存；列表尚未刷新”反馈；重试只核对列表，不再次保存。实际写入没有增加取消或超时伪撤销，长期底层写入等待仍开放。

## 复现和审计纠偏

[冻结 #405 双窗口基线](../evidence/web-manual-save-safety/baseline-control/baseline-chromium.json)从真实界面导入同内容备份，第二窗口明确读取并推进后实际保存。第一窗口随后确认旧目标，旧游戏覆盖了第二窗口的载荷；旧列表中的空槽竞争也能覆盖。测试没有写假数据库或注入存储／剧情事件，存档核对只用原生只读事务和 SHA-256。

最初的新单测夹具没有等待后台自动保存完成，导致后续列表刷新与操作相撞；[初轮记录](../evidence/web-manual-save-safety/red-tests.json)及[第二轮记录](../evidence/web-manual-save-safety/red-valid-fixture.json)保留，但不作为纯产品红测或验收。夹具改为等待实际自动保存结果后操作，没有放宽超时。[13 项定向检查](../evidence/web-manual-save-safety/targeted-tests.json)随后通过。

最初浏览器脚本在配音仍播放时尝试推进，正常输入保护使故事没有改变；补等待原生语音自然结束后再操作。另有脚本把读档／保存准备前的 runtime hash 当作操作结束后恒定的值而失败，记录在 [baseline-native](../evidence/web-manual-save-safety/baseline-native/baseline-chromium.json)和 [browser](../evidence/web-manual-save-safety/browser/chromium.json)。独立的冻结版正常保存对照也出现 `92734b…` 到 `ae1db2…` 的变化，但当前句、历史位置和长度保持；本专项因此同时核对正文、历史位置、真实存档载荷和明确读档结果，不宣称所有活跃运行时 hash 恒定。这一变化的具体来源仍需单独追踪，不能以本次界面修复视为已经解释或消除。

[初轮相关回归](../evidence/web-manual-save-safety/development-related-tests.json)有 21 项失败，运行期间仍在整理，不作为冻结结果。其中 19 项旧内存夹具没有安全写入能力，一项快速保存仍期待旧失败文案，另一项发现真正的隔离外观预览适配器缺少新能力。补预览适配器及五项独立测试；旧内存夹具只补测试用比较能力，保留原写入／预览／故障断言，不用于证明真实事务原子性。八文件 [migration-tests](../evidence/web-manual-save-safety/migration-tests.json)仅剩一处等待文案断言，调整为实际提示；最终四文件 [release-targeted-tests](../evidence/web-manual-save-safety/release-targeted-tests.json)28 项通过，包含真实隔离预览页面保存。早期测试定义的类型错误已修正，最终构建类型检查通过。

上述预览纠偏发生在初稿包完成后，已重新构建和实际双导出；`work` 与 `browser-retest` 的早期通过记录只对应初稿，不能替代最终产物验收。

## 最终产物与验收

[最终作者流程](../evidence/web-manual-save-safety/release-work/browser-checks.json)从生产编辑器实际导入 #394 工程及 25 条校订，保存、关闭、刷新重开、导出 HTML 和网站 ZIP，七组任务通过。公开载荷、26 项媒体及网站 37 个文件核对保持。桌面本地 HTML 留下线、390px 断网网站远行线各经过 66 段正文、六句原生语音结束、Auto、历史、保存重开和明确读档后 Auto 停止；同内容旧备份也经真实导入与明确读取。范围不是新包两格式乘两路线完整矩阵或自然听读计时。

同一最终双游戏的 [Chromium](../evidence/web-manual-save-safety/final-browser/chromium.json)、[Firefox](../evidence/web-manual-save-safety/final-browser/firefox.json)、[Windows WebKit](../evidence/web-manual-save-safety/final-browser/webkit.json)各七组任务通过：旧确认拒绝、空槽竞争拒绝、四种窗口尺寸的冲突反馈、另存空槽、重新明确覆盖、两窗口同时争用同一空槽仅一方成功，以及重开后明确读取另一窗口保存的原进度。四份手动存档的实际载荷摘要核对，Auto 为 off。没有注入数据库写入或播放结束事件；声音输出静音，不登记听感通过。

最终包另跑 [Chromium 列表恢复七组回归](../evidence/web-manual-save-safety/final-list/chromium.json)，保留 #405 的未知列表／八秒等待／重试／迟到隔离、未知目标保护、已提交写入后列表失败、短横屏结果可见和重开明确读取。该专项受控延迟真实只读事务完成回调、注入 `getAllKeys` 异常，不冒充操作系统故障或物理 IO 取消。

构建和浏览器结束、代码冻结后，单工作进程、既有超时顺序运行：[相关回归](../evidence/web-manual-save-safety/related-tests.json)149 文件／1,354 项，[编辑器整合](../evidence/web-manual-save-safety/app-tests.json)两个不重叠文件／47 项，共 **151 文件／1,401 项功能测试通过**；新增 13 项玩家流程与五项隔离预览存储测试。[工具测试](../evidence/web-manual-save-safety/tool-tests.tap)74 项通过。开发、定向和初稿结果不重复累计。类型检查及 Editor／Player 生产构建通过，既有大分包和 jsdom 原生媒体未实现提示保留。

[汇总审计](../evidence/web-manual-save-safety/audit.json)核对精确双游戏、最终报告、原备份、#394 四产物及 #405 双游戏保持，架构审计及 N52-E5b 工程审计通过，产品验收仍 blocked。不是全仓 check、远端 CI 或 Stable／M1 验收。

当前 [HTML](../evidence/web-manual-save-safety/before-rain-stops.html)46,810,141 字节，SHA-256 `6f05b517be7b5cb03bb21b7116977d55ff2879b90fdaac8aff651587419affae`；[网站 ZIP](../evidence/web-manual-save-safety/before-rain-stops-website.zip)35,396,590 字节，SHA-256 `2869f4f492c354e663f33e66fb65b4decb7bcd05b8212a5dedb8403ca16cf8c1`。精确交付见 [delivery](../evidence/web-manual-save-safety/delivery.json)。最终门槛通过后提升这对文件，按原清单核对后仅清理本批两对临时游戏副本；所有源工程、旧正式包、各阶段报告、截图和真实备份保留。

## 下一步和交付边界

继续以完整作品正文、演出和声音的连续使用为主线，修复可复现的阅读／中断续读障碍；不要围绕列表或存储抽象无限扩展。单独调查上述活跃运行时 hash 变化、长历史 JSON／规范化备份信封／正式 Worker 校验／快照重建成本、底层写入长期等待及冷开设置偶发。普通手动保存的比较保护现已接入，不代表所有自动覆盖策略或底层 IO 问题关闭。

作品仍为九场景、两结局、9,772 字符、87 步演出、26 项媒体和九句 TTS。25 条 fixed 校订的 `checkedSourceHash` 仍为空，26 项发行条件 pending、已确认 0；九份系统 TTS 再分发依据仍待核实。自然全文阅读／听感／计时、主流物理手机／Safari、真实系统后台／锁屏／BFCache、长期续读及获准 HTTPS 部署仍待验，Windows WebKit 内嵌 data／Blob／离线音频仍未通过。原生 Windows／Android 产品化继续搁置，不宣布 Stable／M1。

## 重放

设置新的 `STUDIO_MANUAL_SAVE_OUTPUT_DIRECTORY` 后运行 `node tools/run-web-manual-save-safety.mjs`，支持 `--engine=firefox`／`--engine=webkit`；`--baseline` 固定读取 #405，`STUDIO_MANUAL_SAVE_SOURCE_DIRECTORY` 可指定另一对游戏。报告已有则拒绝覆盖，服务器仅监听本机高位端口，退出关闭浏览器和服务器。

相关回归运行 `node tools/run-web-manual-save-tests.mjs`，已有报告拒绝覆盖，可用 `STUDIO_MANUAL_SAVE_TEST_REPORT` 指向新文件。汇总审计为 `node tools/audit-web-manual-save-safety.mjs`。制作新包须经实际生产编辑器保存重开并双格式导出，在新目录验证精确字节，不能把旧报告套在新包上。
