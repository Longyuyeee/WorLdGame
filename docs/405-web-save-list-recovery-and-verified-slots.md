# 405 存档列表读取恢复与已写入结果核对

2026-10-18，接续 [#404](404-web-backup-preparation-and-continuation.md)，沿 [#304 完整 Web 作品](304-web-complete-gal-delivery.md)和 [#11 存读档要求](11-gal-foundation-and-automation.md)处理进度接续的实际障碍：列表还没读出却显示为空，读取失败无明确重试，写入成功后的刷新异常又被正常成功提示掩盖。内容仍为 **1.11.0 候选／S0.41**，不改剧情、媒体、Core、Runtime 或存档格式。

## 玩家看到的列表状态

标题和存读档窗口现在区分读取中、已核对、读取失败。第一次读取未完成时，卡片和备份目标显示“尚未核对”，不冒充空槽位；刷新旧列表时保留上次摘要，但明确标成尚未核对最新列表。槽位卡片的保存／读取、标题最近存档及备份导入目标必须等当前列表核对后才可操作，已有手动覆盖确认在列表失效时清除。固定快速保存的既有独立入口仍沿原覆盖策略，不把列表当作正式进度校验。

列表等待八秒仍未完成时，说明列表读取异常不等于存档丢失，提供“重试读取存档列表”；正常读取失败也可从标题或窗口直接重试。单独读取列表不锁住返回故事，不截断阅读、关闭游戏或清理本地数据；宿主暂停时禁用新重试。实际保存／导入的收尾仍沿前台操作保护，写后列表也有八秒等待阈值，超时按未核对反馈，不作为物理 IO 已取消。重试仅重新读取，不会重新保存或导入。

正在进行的初次列表和打开窗口共用一次读取；写入完成后必须重新读取，不能复用写入前的结果。超时、重试替代、换工程／存储环境或卸载会退役旧等待，迟到成功／失败不得清空新列表。这里取消的是等待，不宣称物理存储 IO 已中止。

## 写入和列表刷新分开反馈

手动／快速保存已经完成，但列表刷新失败或超时，现在明确显示“已保存；列表尚未刷新”，要求重试列表核对而非重复保存，不把它误报成写入失败。备份导入已经完成但刷新失败，会进入 #404 已有的“已经写入目标槽位”提示，不能再由 Shell 吞掉异常后显示普通导入成功。未提交导入前仍可检查文件并保留检查结果，但目标列表未核对时不能导入；列表恢复后须核对目标再明确提交。

正式读取继续走既有完整验证，导入比较后写入保护保持。列表恢复本身不替换当前故事、不自动读档或启动 Auto。提交写入仍不提供假撤销；本批也没有增加普通手动保存跨窗口的比较后写入保证，不以列表刚刚核对替代并发写入保护。

重要的“已保存但列表未刷新”结果不会再随短横屏的普通状态摘要一起隐藏。明确重试成功后，保存提示更新为列表已刷新，已提交导入的旧刷新错误也会更新；只清除对应写入的刷新问题，不误清除随后发生的文件导出或其他备份错误。

## 复现和开发验证

[冻结 #404 浏览器基线](../evidence/web-save-list-recovery/baseline-chromium.json)先从真实界面导入同内容 `.worldsave`，确认实际存档载荷；重开时受控延迟原生只读事务完成回调，窗口仍把已有手动槽位显示为空，且没有列表重试入口。随后在导入第二份槽位后，令读取列表的 `getAllKeys` 在 API 边界抛错，实际第二份存档已经存在，旧界面却显示普通导入成功。没有写伪造数据库或替换存档内容，受控回调／错误不冒充操作系统故障。

[接线前红测](../evidence/web-save-list-recovery/red-shell-tests.json)三项失败分别对应未知列表误标为空、保存后刷新失败未单独提示，以及真实 Shell 吞掉导入后刷新失败。新测试覆盖等待合并、八秒超时、晚到结果、强制写后刷新、换工程／存储／卸载、返回故事、标题重试、宿主暂停、实际存档未改及保留已检查的导入文件。

初轮 [开发回归](../evidence/web-save-list-recovery/development-related-tests.json)保留 16 项失败，其中 15 项旧流程未等待列表就绪，另有一项刷新 API 整理期间的中间不一致；该运行期间仍在编辑，不能作为最终门槛。原测试改为等待真实列表／按钮就绪，继续检查覆盖、焦点、截图、归档、已核对旧档、后台与恢复隔离，未删断言或放宽默认超时。整理后的[八文件／131 项定向复验](../evidence/web-save-list-recovery/development-migration-retest.json)通过。最早的新测试类型定义错误也已修正，最终类型检查通过；早期记录不覆盖、不重复累计。

[首轮浏览器任务](../evidence/web-save-list-recovery/browser/chromium.json)完成前六组后，在重开环节等待“继续最近存档”超时；[截图](../evidence/web-save-list-recovery/browser/chromium-failure.png)显示正常的可恢复进度优先入口，列表已 ready、三份手动存档均保留。脚本改为从“读取存档”明确选择手动存档 3，不改恢复优先级、不加点击重试、不放宽超时，也不覆盖失败报告。

[Firefox 首轮](../evidence/web-save-list-recovery/browser-retest/firefox.json)读取原生 select 的 `innerText` 得到空串，不能由此认定选项丢失；界面已保留检查结果且禁用未知目标。断言改为核对选项的 DOM `textContent`，保留禁用状态和实际数据库载荷检查，在新目录复验，没有修改产品或延长超时。

截图复核另用[初稿反馈基线](../evidence/web-save-list-recovery/feedback-baseline/feedback-baseline-chromium.json)实际确认：568×320 隐藏已保存结果，重试后仍保留旧导入／保存刷新提示；[两项反馈红测](../evidence/web-save-list-recovery/feedback-red-tests.json)对应失败。已中断当时尚未结束的回归，保留[未完成标记](../evidence/web-save-list-recovery/interrupted-related-tests.json)，不算通过。纠正后重新构建和制作游戏；定向复验见 [release-targeted-tests](../evidence/web-save-list-recovery/release-targeted-tests.json)，五文件／42 项，包含不误清除无关导出错误的检查。反馈首轮的一项旧导入用例也补等待目标可用，仍保留“另一窗口改档后拒绝读取”的完整断言与默认超时。

## 最终构建的实际流程

[最终作者和路线报告](../evidence/web-save-list-recovery/release-work/browser-checks.json)从生产编辑器实际导入 #394 工程及 25 条校订，保存、关闭、刷新重开并双格式导出；原工程、记录和全部 26 媒体保持，网站 37 个公开文件逐项核对。桌面本地 HTML 留下线、390px 断网网站远行线各完成 66 段正文／六句原生语音结束，包含 Auto、历史、保存重开及明确读档后停止 Auto；另实际导入原同内容备份。该范围不是新包两格式乘两路线完整矩阵，也不是自然全文听读或计时。

同一最终双游戏的 [Chromium](../evidence/web-save-list-recovery/final-browser/chromium.json)、[Firefox](../evidence/web-save-list-recovery/final-browser/firefox.json)、[Windows WebKit](../evidence/web-save-list-recovery/final-browser/webkit.json)各七组任务通过，覆盖未知列表、八秒等待、标题／窗口重试、迟到可信事务完成事件隔离、未知目标禁止导入、已提交导入后的列表失败、已提交手动保存后的列表超时、明确读取和重开。重试只读列表，不重复写入；三份手动存档的原生 IndexedDB 载荷 SHA-256 保持，读取仍为原 runtime hash，Auto 为 off。

受控延迟的是实际只读事务 complete 回调的投递，不假称磁盘仍在工作；`getAllKeys` 错误在真实浏览器 API 边界注入。核对存档仅原生只读，不写假数据库、不替换载荷或注入剧情／媒体完成事件。320×740、568×320、844×390、1280×900 的列表重试／返回按钮至少 44px、说明可滚动到视区；三引擎另核对 568×320 的已保存结果确实可见且完整处于视区，重试后的旧提示不残留。

最终游戏另通过 [Chromium 备份专项七组复验](../evidence/web-save-list-recovery/final-backup/chromium.json)：实际文件读取／Web Crypto 等待取消、关闭／重试、完整 Worker 检查、真实下载 `.worldsave`、全新浏览器数据区导入明确读取，以及当前进度导出且原手动槽位保持。这里不复用 #404 的旧三引擎报告替代新包验收；全新数据区也不等于物理换机。输出静音，不登记听感通过。

所有构建和浏览器完成、产品代码冻结后，单工作进程、默认超时顺序运行：[相关回归](../evidence/web-save-list-recovery/related-tests.json) 147 文件／1,336 项，[编辑器整合](../evidence/web-save-list-recovery/app-tests.json)两个互不重叠文件／47 项，共 **149 文件／1,383 项功能测试通过**，含新增 12 项列表生命周期与六项玩家流程测试。[工具测试](../evidence/web-save-list-recovery/tool-tests.tap) 72 项通过，含两项新报告防覆盖保护；开发、红测、中断和定向结果不重复累计。类型检查、Editor／Player 生产构建通过；既有大分包及 jsdom 原生媒体未实现提示保留，不以 jsdom 代替实际声音播放。

[汇总审计](../evidence/web-save-list-recovery/audit.json)复核精确游戏摘要、最终报告、原备份、#394 四产物、#404 原双游戏及 26 媒体／25 条未批准记录。架构审计 118 个可移植文件／四个 Node 适配文件通过，N52-E5b 工程审计通过、产品验收仍 blocked。不是全仓 check、远端 CI 或 Stable／M1 验收。

## 当前交付

可编辑源工程和未批准记录仍沿 #394。当前 [HTML](../evidence/web-save-list-recovery/before-rain-stops.html)为 46,808,171 字节，SHA-256 `9dabe35ec398313913f0e584485ecfd103fde287d3077834f9885e393ef6b981`；[网站 ZIP](../evidence/web-save-list-recovery/before-rain-stops-website.zip)为 35,394,620 字节，SHA-256 `3d22df92aae0bb1e81e5f1c119856be895172c558143fbe42f8fb3ee42f8c1cd`。精确交付状态见[交付记录](../evidence/web-save-list-recovery/delivery.json)，最终作者及三引擎报告均对应这对原字节。

全部门槛通过后已提升最终文件，逐项核对路径、长度及摘要后清理本批三对临时游戏副本；历史已入库游戏、源工程、各阶段报告、截图及实际备份保留。初稿／中间包的摘要在 `work`／`final-work` 的 `artifact-audit.json`，不作为最终包的通过记录。

## 保持的交付边界和后续顺序

源工程和 25 条未人工批准校订仍沿 [#394](../evidence/web-story-plans-and-farewell)，九场景、两结局、9,772 字符、87 步演出、26 项媒体及九句配音保持。25 条 fixed 的 `checkedSourceHash` 仍为空；26 项发行条件 pending、已确认 0，九份系统 TTS 再分发依据仍待核实。没有因本批界面修复提高内容版本。

下一批继续完整作品的正文／演出／声音连读复核，围绕实际可复现问题推进；分开调查长历史 JSON／规范化备份信封／正式 Worker 校验／快照重建成本、底层存储写入长期等待及冷开设置偶发。列表八秒等待反馈不是这些问题已经提速或修复。

自然全文阅读／听感／计时、主流物理手机／Safari、真实系统后台／锁屏／BFCache、长期续读、发行依据和获准 HTTPS 部署仍待验。Windows WebKit 内嵌 data／Blob／离线音频未通过；桌面窗口、受控 API 异常和静音自动化不替代这些验收。原生 Windows／Android 产品化仍搁置，不宣布 Stable／M1。

## 重放方式

设置新的 `STUDIO_SAVE_LIST_OUTPUT_DIRECTORY` 后运行 `node tools/run-web-save-list-recovery.mjs`，可加 `--engine=firefox`／`--engine=webkit`；默认只读本批正式双游戏，`STUDIO_SAVE_LIST_SOURCE_DIRECTORY` 可指定另一对游戏。`--baseline` 固定读取 #404。已有报告拒绝覆盖，服务器仅监听本机安全高位端口，退出释放浏览器及服务器。

相关回归为 `node tools/run-web-save-list-tests.mjs`，最终默认报告为 `evidence/web-save-list-recovery/related-tests.json`；开发诊断可用 `STUDIO_SAVE_LIST_TEST_REPORT` 指定另一份报告。汇总为 `node tools/audit-web-save-list-recovery.mjs`。重新制作须经实际生产编辑器保存重开、双格式导出，并在新目录验证精确游戏摘要，不能以旧包报告替代。
