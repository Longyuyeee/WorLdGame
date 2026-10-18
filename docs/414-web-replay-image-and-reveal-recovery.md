# 回想快退的画面恢复与已读正文保持

2026-10-18，接续 [#413](413-web-route-replay-reading-return.md)的两项开放问题，仍按 [#304 完整 Web 作品](304-web-complete-gal-delivery.md)处理成品使用中的具体障碍。本批修复快速退出回想后画面被暂时释放保护阻断，以及默认渐显重新遮住已读正文的问题。仍为 **《雨停之前》1.11.0 候选／S0.41**，不改剧情、26 份媒体、Core、Runtime 或存档／备份格式。

## 快退故障不是总预算不足

使用 #413 原游戏，由实际界面保存正文、快进完成留下路线以解锁回想，再读取原正文进行八次“进入回想 → 旋转 → 立即退出”。没有注入解锁、存档或媒体事件；这项快进任务不替代完整正文阅读。

[带诊断的原包复现](../evidence/web-replay-recovery/diagnosed-baseline/baseline-chromium.json)八次中七次出现图片预算提示。只读原生资源记录显示，退出后旧 `createImageBitmap` 尚未结束，`ordinaryQuarantinedDecodes` 短暂为 1；旧解码结束后计数已回到 0，但新画面的预算错误仍然保留。计账峰值 45,990,114 字节，低于 67,108,864 字节总预算。此时明确重试可以恢复画面，原 Runtime／宿主／历史／正文、手动槽位及独立收藏／回想记录保持。

首轮不旋转的快退没有触发故障，不能据此关闭问题。`rotating-baseline` 的 Chromium 检查又因故障详情尚未打开而等待超时，保留其资源轨迹；随后改为通过真实“媒体问题”入口读取具体原因，得到上述七次故障和明确恢复证据。没有将这个探针超时当成图片真实释放花费三十秒。

## 等待实际释放而不取消预算保护

普通图片解码保留原立即拒绝分配的隔离保护，只把“另一份解码正在退役”细分为内部错误类型。展示组件遇到这一类错误，可等待那份原生操作实际成功或失败，然后再申请一次画面。等待期间不分配新画面、不启动新解码，不轮询重试；取消、换场景或关闭后，不允许迟到结果再申请图片。

等待最多五秒，仍受原十五秒画面期限约束。等待被取消或超时，不释放仍在原生操作中占用的内存；只有实际完成才关闭迟到 Bitmap 并解除原保留。真实编码／像素／活跃画面总预算超限仍立即拒绝，等待后的第二次失败也继续保留明确重试，不形成递归重试或无预算 IMG 回退。未增加总预算、原生解码期限或测试超时。

新增受控测试覆盖空闲／预取消、实际成功或拒绝后唤醒、等待取消／超时不强制释放、组件退出后的迟到结果，以及真实预算失败不被自动重试掩盖。既有直接分配拒绝风暴、超大响应、画幅、真实来源与释放测试保留。

## 已经读完的正文不再重新渐显

原包在未启用系统减动效、沿作品默认文字显示的情况下，正文已完整显示；退出回想后 `data-text-ready` 又变为 `false`，重新进入约 6,387ms 的渐显。[初始红测](../evidence/web-replay-recovery/red-reveal-tests.json)原有九项通过，新增的自然完成／点击全文两项失败，说明不能仅以立即显示文字的流程推断默认体验。

沿 #413 的临时返回锚点一并保留“全文已显示”状态，只在同一工程、原 Runtime／历史、段落和语言的正式返回时消费一次。自然显示完成或玩家点击全文后，都不再重新遮住已读正文；未完成的文字不强制变为全文，普通翻句／历史导航仍使用原渐显规则。没有把这一状态写进存档，也不声称恢复逐字动画的精确中间时间或声音采样位置。

[定向回归](../evidence/web-replay-recovery/targeted-tests.json)五文件／72 项通过，新增十二项：九项图片等待／预算／取消保护，三项全文保持和未完成／普通导航保护。原读取恢复、场景回想与 Atlas 相关检查共同执行。

## 实际制作和完整作品

[实际作者任务](../evidence/web-replay-recovery/work/browser-checks.json)从 #394 原工程及 25 条记录导入生产编辑器，保存、关闭、刷新重开并双导出，七组通过。正文、演出、全部媒体和记录原字节保持；包含两条完整路线、后段历史／保存重开及原同内容备份明确读取。

[四格矩阵](../evidence/web-replay-recovery/matrix/matrix.json)覆盖 HTML／网站各两路线，每格核对 66 段正文和六句原生声音结束，包含 Auto、明确读取、原槽位保持；网站两线实际缓存后离线刷新，HTML 两线实际离开返回。[双路线与正常回想回归](../evidence/web-replay-recovery/route-regression/chromium.json)另七组通过，核对分歧存档、两个结局、刷新后入口、完整结束返回及四视口锚点。

[Chromium](../evidence/web-replay-recovery/verified-browser/chromium.json)、[Firefox](../evidence/web-replay-recovery/verified-browser/firefox.json)、[Windows WebKit](../evidence/web-replay-recovery/verified-browser/webkit.json)网站各四组专项通过，[Chromium 本地 HTML](../evidence/web-replay-recovery/verified-html/chromium-file.json)三组通过。每份任务完成八次不等待回想画面就退出的真实旋转快退，四个视口为 320×568、568×320、844×390、390×844；均无画面失败，原逻辑阅读字符、Runtime／宿主／历史／正文、手动存档与独立记录保持。Chromium 实际走过退役等待分支，同时等待者峰值为 1、结束后为零；其他引擎未据此推断同样走过该等待分支。

另在未启用减动效、使用作品默认显示的条件下完成自然渐显，再进入回想并返回。[原包绘制采样](../evidence/web-replay-recovery/visual-baseline/baseline-chromium.json)此时透明度约 0.0026、水平裁剪约 99.7%，仍在播放渐显；新包四份报告均为透明度 1、无裁剪、无动画。样式在截图的动画处理之前采样，不仅依据内部“已显示”标志判断；已查看新包竖屏实画。

所有声音输出静音，快进或程序停留不计自然全文听读／真人计时；桌面引擎和手机尺寸不替代物理手机／Safari。

## 故障探针的范围修正

第一版 HTTP 探针临时给原背景请求返回三个无效字节，Chromium／WebKit 进入故障并可重试，但 Firefox 仍能呈现健康画面，等待故障入口的检查失败。该版本没有记录请求归属，不能把原因直接定为缓存，也不把健康回退记作产品故障。

最终探针改为对实际背景请求返回受控的 24 字节 PNG 头，声明 4097×4097，以确定地触发已有像素预检拒绝，并记录命中的实际请求。随后恢复原响应，仍由玩家明确重试，核对画面、阅读点、进度和原记录。它验证预检与恢复，不是实际分配／解码一张超大图片，也不改动游戏包中的原素材。

## 最终测试与交付

源码和双产物冻结，浏览器与功能测试分开运行。[相关回归](../evidence/web-replay-recovery/related-tests.json)单工作进程、既有超时，158 文件／1,480 项通过，约 299.07 秒，[完整日志](../evidence/web-replay-recovery/related-tests.json.log)保留；[编辑器整合](../evidence/web-replay-recovery/app-tests.json)另两份不重叠文件／47 项通过，共 **160 文件／1,527 项功能测试**，含新增十二项。定向、红测和重复检查不累计。[工具测试](../evidence/web-replay-recovery/tool-tests.tap)112 项通过，含新增六项报告防覆盖。

根类型及 Editor／Player 生产构建通过，原有大分包与 jsdom 媒体未实现提示保留。[汇总审计](../evidence/web-replay-recovery/audit.json)核对精确导出游戏、真实原包复现、新包专项及路线报告、原来源／25 条待人工记录与全部 26 媒体；架构 118 个可移植文件／四个 Node 适配文件通过，N52-E5b 工程通过、产品验收仍 blocked。不代替全仓 check、远端 CI 或最终作品验收。

新 [HTML](../evidence/web-replay-recovery/before-rain-stops.html)46,843,422 字节，SHA-256 `f7b9ba77c472060ca13c620a1f5fbf129fefd43349b130b2f5d8e043ed491553`；[网站 ZIP](../evidence/web-replay-recovery/before-rain-stops-website.zip)35,429,871 字节，SHA-256 `ed95fd60712015a1c68137e25e8e6f9e0162a7ad0c85a505b0f7bdf807e1c02e`。为实际编辑器导出的原字节，剧情载荷及全部媒体与 #413 完全相同。[交付记录](../evidence/web-replay-recovery/delivery.json)通过门槛后才提升这对游戏，核对根目录两份后清理 `work` 的相同副本；原工程、旧游戏、真实备份与各轮报告保留。

记录将快退限定为桌面引擎样本通过，将默认渐显限定为完整显示过的正文保持；原生永久解码停滞仍为 `controlled-only`。没有把 #413 的两项开放问题扩大为全部物理设备、皮肤、动画时刻或最终产品验收完成。

提交前核对本批 53 份游戏／图片／真实备份的 Git 索引与磁盘 SHA-256，并对照交付双游戏的精确字节；共 103 个提交文件，无关 `.browser-diagnostic/` 未纳入。

## 接续和验收边界

可编辑源仍为 [#394 工程](../evidence/web-story-plans-and-farewell/before-rain-stops-project.zip)与[校订记录](../evidence/web-story-plans-and-farewell/before-rain-stops.worldreview)，九场景、两结局、9,772 字符、87 步演出和九句系统 TTS 保持。25 条 `fixed` 的 `checkedSourceHash` 仍为空，26 项发行条件 pending、已确认 0；#413 原游戏及各轮失败报告保留。

下一批回“结局 → 收藏／回想辨认 → 返回正文或标题 → 下次继续”，检查列表说明、手机可达性及连续阅读；自定义文字／窗口动效和部分渐显中途返回需沿实际外观另核对，不以本批样章默认效果覆盖全部皮肤。自然全文听读／计时、主流物理手机／Safari、真实后台／锁屏／BFCache、原生开始播放后断流、WebKit 内嵌声音、长期运行、发行依据及获准 HTTPS 交付继续开放。真实原生图片解码永久未完成仅有受控保护测试，不计真机验收；冷开设置偶发、既有默认超时、长篇完整校验／快照／传输／物理内存与底层长期写入成本不因本批关闭。Windows／Android 原生产品化仍搁置。

## 重放

`node tools/run-web-replay-recovery.mjs` 默认读取本批根目录游戏；`--baseline` 固定 #413，支持 `--engine=firefox`、`--engine=webkit`、Chromium `--file`。HTTP 的 `--fault` 增加受控超限头与明确重试任务，不能用于本地文件。`STUDIO_REPLAY_RECOVERY_SOURCE_DIRECTORY` 指定实际待测游戏对，`STUDIO_REPLAY_RECOVERY_OUTPUT_DIRECTORY` 必须选择新目录，已有报告拒绝覆盖。

`node tools/run-web-replay-recovery-tests.mjs` 使用 #413 的全部相关测试文件，单工作进程、既有超时；`STUDIO_REPLAY_RECOVERY_TEST_REPORT` 可指定新报告，并保留 `.log`。作者／四格／正常回想分别沿 #385、#401、#413 工具，必须指向同一实际游戏对和新输出目录。汇总为 `node tools/audit-web-replay-recovery.mjs`，通过门槛才使用 `--promote`；不能把快进、受控故障或旧包报告当作当前包完整阅读／物理验收。
