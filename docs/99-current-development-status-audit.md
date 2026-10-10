# 当前开发情况：Atlas 普通纹理兼容交付与迁移回退贯通

## 最新审计：2026-10-11 已发布 Atlas 的兼容交付完整任务

代码事实：正式 Player 使用普通图片元素；既有 Dicing Worker 重建时校验当前原图与 Atlas，不能直接将它当作“不带原图的正式原生图集播放器”。因此对齐 #11 §3.5 的普通纹理回退要求，新增 `atlas-export.ts` 和 `AtlasExportSettings.tsx`，只做构建阶段已发布 Atlas→受验证普通 PNG 的兼容发布。本轮不是 GPU 共享纹理/切块绘制，也未宣称全部 Atlas 接入完成。上一 #89 接续范围较广，本轮关闭兼容出口及其作者任务，原生运行部分继续列明，不以新编码算法替代原需求。

功能与安全：保存显式组选择（最多 8），读取现有 lifecycle 发布根并显示当前源摘要匹配名称；不把“摘要匹配名称”说成已完成像素验收。构建检查清单/页摘要、组成员、重叠、源编码和像素预算，复用既有 Worker 校验当前源/Atlas。使用 Canvas 编码兼容 PNG，再按浏览器默认颜色路径逐像素对照源图和输出，动画 PNG/不支持能力/失败回退，不复制 PNG 元数据且选项中明确告知。每组全部校验成功后才提交更小候选；比较全工程去重资源字节，避免多个 ID 共用同一源文件导致虚假收益。单源重建 ≤4,194,304 像素、Atlas 合计 ≤8,388,608 像素、组源/页编码各 ≤32 MiB、≤32 个成员，Worker 沿用 20 秒超时。全量源读取/打包及 Canvas 编码仍非流式，未解决立即取消或整体峰值预算。

交付与回退：HTML/目录 ZIP 继续走正式媒体 URL 和播放器，不夹带开发工具/未接入的 Atlas。报告逐组区分采用和保留当前素材，逐文件输出真实摘要/大小；IDAT 选项独立，先处理后再验证 Atlas 兼容候选；无收益/缺失/过期时保留该基础结果。恢复原素材按钮清除两种选择，重新构建得到原文件；设置变化沿用旧下载失效保护。Canonical 原 AssetIndex 和 Blob 不改。Portable ZIP 仍只携带原素材及组选择，不带派生；换电脑后先回退，需重新分析发布。这是可用迁移降级，不是派生缓存迁移完成。

真实作者任务：在已有三场景媒体短篇内经 UI 替换两张确定性 256×256 未压缩 PNG，分析/编码发布同一组；原编辑器预览在选择/保存重开前后 canvas 摘要一致，HTML/目录 ZIP 报告一致，背景/立绘浏览器像素一致。源图替换后现有组出现 source-mismatch，整组回退；撤销恢复，点击恢复原素材后逐字节一致。导出可编辑 ZIP，再在本次脚本拥有的隔离浏览器环境清空工程存储、重新导入，组缺失明确回退且背景原字节不变。两版正式 HTML 均实际呈现立绘并达海风结局，异常 0。资源 526620→7394 字节，HTML 1176645→484800，目录 ZIP 507718；这些是刻意未压缩的测试图，收益来自普通 PNG 兼容重编码，不能作为真实资产压缩率或图集运行收益宣传。

验证：相关 8 文件 66 项、独立设置 UI 3 项、App 集成 45 项，共 114 项通过；最后定向 UI/策略 9 项复跑通过。typecheck、Editor 生产构建、7 Golden、架构审计、资产性能 4 项通过。生产浏览器 `node tools/run-n80-web-export-browser.mjs --atlas-compatibility-workflow` 通过，报告/设置/播放器截图已人工代理视觉检查（不等于真人产品验收）。构建保留既有大 chunk 警告，未运行完整本机 `npm run check`。

证据：`evidence/authoring/atlas-compatibility-workflow.json`、`atlas-compatibility-report.json`、`atlas-compatibility-settings.png`、`atlas-compatibility.png`、`atlas-original-player.png`、`atlas-optimized-player.png`、`rainy-promise-atlas-compatible.zip`；可用同一浏览器脚本复现，不注入 React 私有状态。旧头 `9629d01` 的完整 CI run `38075924458` 在本轮核对时仍运行，不能写成功；本轮新 head 推送后另行核验。既有 `.browser-diagnostic/` 不修改、不提交。

接续：#89 顶部的原生 Atlas 媒体契约→正式 Preview/Player 调度与呈现→采样/透明/缩放验证→损坏与能力回退→实际包体/峰值预算→迁移重建整项。构建兼容路径可作为基线，但原生共享纹理、Draw Call、Android 真机及真人验收均未完成，M1 未关闭。

## 最新审计：2026-10-11 资源优化到正式导出的完整作者任务

前置代码与需求审计对齐原 PRD 资源容量/源素材不可破坏要求、Gal Dicing 与 #89 接续。既有 Atlas 有发布/验证入口但没有接入 `formal-web-export.ts`，Portable ZIP 也仍以原 AssetIndex/Blob 为权威。本轮不改变该事实；新增严格 PNG IDAT 无损重压缩作为正式可用的导出选项，而非宣称全资源/图集优化已交付。

实现：`lossless-png-export.ts` 纯算法、独立 Worker 与超时回退、`export-optimization.ts` 持久化开关及逐素材报告，接入两种正式 Web 构建；复用 Canonical 保存、原 SHA-256 完整性检查和正式播放器。仅更新导出字节/URL，原工程索引、原 Blob 不修改。目录中优化文件使用自身摘要命名，清单/离线缓存使用实际交付摘要；源工程引用继续指向原 Blob。重复同 MIME/摘要只优化一次。失败或不适用只保留原文件，不写坏源工程。保存的开关可回退，改动后原下载失效，未提交输入/发布草稿期间不允许切换。

安全边界：32 MiB 编码/16 MiB 滤波数据/4096 边长预算，8 位非交错静态 PNG；CRC、Adler、滤波类型、解码长度检查，重压缩前后逐字节验证，元数据及其他非 IDAT 块不变，候选不小则放弃。15 秒 Worker 超时回退；Worker 不可用、通信失败、APNG/16 位/交错均保留原文件。不支持的 PNG 不是“已验证”，报告区分 verified 与回退原因。整体导出仍全量内存打包，没有大项目流式/立即取消保证，不减少解码/GPU 内存，不测量加载提速。

用户验收：真实 UI 在 `rainy-promise-media.zip` 中替换相同像素、level 0 IDAT 的背景源文件；生产 Worker 优化，保存/重开保持开关，两格式构建报告一致，背景浏览器解码像素摘要相等，原版/优化版 HTML 均实际渲染立绘并到达海风结局，立绘像素也一致；点击恢复后重新构建原字节完全一致，可编辑 ZIP 保留源 Blob。原图 653→261 字节、立绘 109→106、音频保持 1644；去重资源总计 2406→2011，HTML 477632→477220，优化目录 ZIP 501854 字节。素材很小，仅证明机制，不能宣传大型游戏收益。首次浏览器测试把恢复提示纳入整个页面文本比对导致误报，现以实际结局和已渲染媒体像素断言，不删除玩家恢复机制。截图发现原双列布局使按钮竖排，已改单列并断言按钮宽度/高度，复跑成功。

本地验证：7 文件 47 项（PNG/两格式导出、资源修复 UI/模型、Portable ZIP、IndexedDB 资源、Canonical 保存）；`App.test.tsx` 独立 45 项；typecheck、Editor 生产构建、7 Golden、架构审计、资产性能 4 项均通过。真实浏览器 `node tools/run-n80-web-export-browser.mjs --export-optimization-workflow` 通过且异常 0；导出报告及播放器截图已视觉复核。构建仍有既有 >500 kB chunk 提示。未运行完整 `npm run check`，未以此代替远端 CI。

远端：上一精确提交 `70ea37e06980eee73beb50c54aaec0e5f65bda8f` 的完整 CI run `38068685766` 已核实成功。本轮提交推送后需按新 head 单独核验，不能沿用旧头成功。证据：`export-optimization-workflow.json`、`export-optimization-report.json`、`export-optimization.png`、`export-original-player.png`、`export-optimized-player.png`、`rainy-promise-export-optimized.zip`，均在 `evidence/authoring/`。

接续与剩余：按 #89 顶部完成 Atlas 正式交付契约/视觉一致/过期派生回退/迁移/原素材恢复的整项任务；不得直接把既有 dicing Loader 测试当正式发布验收。路线评审多次覆盖、更多翻译范围、外部评审链接、Android 真机和真人验收未关闭，M1 未完成。`.browser-diagnostic/` 是已有本地未跟踪目录，本轮不修改、不提交。

## 最新审计：2026-10-11 路线摘要、修复复验与评审交付

对齐 Gal #11 §6.1 和上一 #89 接续，读正式 Route 图、Runtime History 停靠投影、资产演出引用、翻译源条目/状态和现有下载生命周期。现有数据不支持“全语句覆盖”或“资源可读性已验收”，因此本轮没有用静态可达/登记冒充验证。新增 `route-review.ts` 与 `RouteReviewPanel.tsx`，在 Flow 按钮主动生成报告，不随每次渲染重复分析。沿用既有 Canonical、Compiler 图及翻译状态，语言源提取新增可跳过附加目录选项，默认旧行为不变，评审不再重复编译目录或为各语言反复编译。

报告：场景步骤数、非空白对白/旁白字符数、300 字符/分钟阅读量估算、演出 asset/transitionAsset 登记与未登记引用、所选语言 missing/draft/outdated/reviewed/locked 清单、编译诊断、最近一次正式 Preview History 的场景/语句停靠与已选选项。源码 hash 在正式编译启动时捕获，报告同 hash 才计当前观察；包含起点/状态/结局/buildId，保留到退出试玩后，刷新清空，失败的新编译不复用旧成功记录。兼容热更新自动回放得到的 History 不是真人重新验收，不宣称历史停靠集等于每条中间指令或全分支覆盖。

用户保护：有未提交输入/跨场景脚本草稿不生成；工程、语言或试玩记录变化时旧报告提示过期，下载链接移除并释放 URL。UI 每页 24 场景，每场景每类待办最多 3 个定位入口；完整数据在导出。缺引用/翻译源/诊断直接回原语句，无自动修改或第二套剧情。翻译仅场景内容，不含附加目录/媒体；资产只检查登记，未读取 Blob；估算不含循环、媒体、等待、选项耗时等，不能宣传真实游玩时长。

交接输出：同 sourceHash 的完整 JSON、无脚本/无外部请求的离线 HTML（场景锚点、折叠明细、浏览器查找）、带方向 SVG（确定布局，前 200 场景及最多 400 条已显示节点间连接，明确截断）。用户文本均转义，HTML 配置 default-src none，恶意标签字符串有测试；原始 JSON 是数据，不注入脚本。SVG 不复制编辑器全部视觉布局；离线文件不等于已部署交互链接，报告不能替代工程 ZIP/游戏构建。

真实浏览器：导入 Beginner 作品，通过原 UI 完成恒假出口闭环的诊断定位/修复/撤销重做/双路线试玩。首次生成无记录可定位场景，修复后旧试玩标 stale；保存刷新重开后无记录，再次两条路线完成，最终报告只记书店的书香结局，海边不标当前已观察。下载三格式并对 hash，导出 `rainy-promise-reviewed.zip`；HTML/SVG 真正打开、截图视觉复核，异常 0。`evidence/authoring/route-review-workflow.json`、`route-review.json/html/svg`、`route-review.png`、`route-review-html.png`、`route-review-svg.png` 为证据。短篇没有目标语言/资源，资源及翻译不同状态和定位入口来自自动测试，不伪称浏览器都覆盖。

CI 纠偏：前序 `725bce9` run `38067861176` 已失败，日志为 route-map-app 的 130 场景完整交互用例超过默认 5000ms。原全页 role 查询反复计算无关侧栏的可访问名称；改为 Route region 内查询和原 aria-label，所有交互/断言、场景数量、超时与性能门限不变。同机定向 2608ms→828ms。远端新头必须单独验证，不用本机成功替代。

验证：9 文件 91 项 Preview/热更新/Route/翻译/App 相关回归通过；补充资源登记/翻译状态与 24 场景分页后，新报告相关 2 文件 5 项通过。前序 CI 失败的正式 `audit:n41-sequence-exit` 入口完整复跑通过：9 文件 53 项及 App 45 项。类型/Editor 构建、7 项 Golden、架构审计通过；正式 Route 性能 9/9，10k 同步 P95 112.84ms<500ms，未放宽门限；既有 bundle 大小警告保留，未声称全仓 check。

下一完整任务：既有资源优化能力与真实作品交付验收，先读素材检查/裁切图集/派生资源/导出实际实现，再做风险发现→优化→预览对照→保存重开→导出试玩→原资源恢复。多次/多版本累计覆盖、全类型资源验证、媒体/目录翻译、在线评审、动态可行性、Android 真机及真人验收仍未完成，不关闭 M1。接续以 #89/#289 顶部为准。

## 最新审计：2026-10-11 常量条件与假出口作者任务

需求对齐 Gal #11 §6.1 的永真/永假条件和无出口路线提示，接续 #89 顶部任务。核对 `story-language/expression.ts`、`runtime/runtime.ts` 正式求值、Compiler 场景控制流/缓存、Route 结构投影和 QA 回源。原结构条件双路会把恒假跳转误当潜在出口，本轮用无变量常量证明补足，不修改 Runtime 来迎合诊断。

实现：`constant-condition.ts` 保守执行合法布尔常量，短路、数值/字符串操作与 Runtime 差分验证；任何 identifier、无效语法/类型、除零或非有限中间值、超过 512 AST 节点均不作断言。常量诊断为非阻断 warning，明确成立则跳转、不成立继续下一步及修复建议，QA 归可达性，复用源 Scene/Statement 定位。

`condition-exits.ts` 从既有编译缓存生成只读指令投影，按已证明分支和标签重新遍历，剔除假出口和恒真跳转跳过的结局，再计算诊断范围内入口可达场景并复用跨场景强连通分量分析。含变量继续双路保守；调用保留返回后的可能，未求动态栈。原 IR 指令、缓存条目/hash、工程/存档格式、结构图连接和结局目录不变，旧缓存复用仍重新派生诊断。图上保留条件连接以供编辑；结构路径/目录不是可行性证明。超界表达式不分析，不宣称全语言求解；有意常量与循环仍允许。

真实作者验收：导入既有 Beginner 短篇，通过 UI 建立五场景作品，雨巷在循环跳转前插入 `1 > 2 -> 约定终章`。首轮测试误将条件插在跳转后，被原不可达逻辑排除；修正测试为正式“语句上移”，未改变产品语义。坏工程保存刷新重开后恒假提示与闭环同时出现，Flow 和 QA 都定位准确，健康书店路线仍到书香结局。条件改 true 后闭环消失且出现恒真解释，再用变量条件生成器改为同行次数 >= 0，常量提示消失。两次 Undo/Redo 恢复/清除对应风险；保存重开脚本逐字一致，两条路线再次到约定达成/书香结局。截图已人工式视觉复核，恒假说明、类别和定位按钮可读，浏览器异常 0。新证据 `evidence/authoring/constant-condition-repair.json/png` 和 `rainy-promise-constant-repaired.zip`，旧成果未覆盖。

验证：Compiler/Route/Runtime/Editor 最终 15 文件 178 项相关回归通过，覆盖完整/增量/全缓存复用一致、修改单场景与撤销、局部标签恒假/恒真、跨场景假出口、默认值不推断、无效表达式、除零/溢出/深 AST 保守处理、不可达条件不额外报告、真实 App 定位修复和试玩。类型检查、Editor 构建、7 个 Golden、架构审计通过；正式 Route 性能 9/9，10k 同步 P95 270.86ms < 500ms（本轮同机浏览器与其他检查期间测量，不据此宣称性能提升），门限不变。已有 bundle >500kB 警告保留；未声称全仓 check。

CI：检查时前序 `8b28906` run `38067322916` 仍运行中，`6618432` 已取消，不作为通过证据；本轮提交后核对自己的精确头。下一完整任务是路线评审交付：先审计资源/翻译/试玩轨迹真实来源，再落实摘要检查→定位→复验→导出交接资料。资源优化、Android 真机、真人验收及所有其他原需求未关闭，不宣称 M1 完成。接续以 #89/#289 顶部为准。

## 最新审计：2026-10-11 跨场景死路/闭环作者任务

需求对齐：PRD §3.2 的循环/不可达提示和 Gal §6.1 的死路/无出口循环。已读正式 Compiler 的控制流和 reachable/endings 缓存、Route 的诊断定位、QA 分类和源语句返回，确认过去仅有单场景闭环与全局至少一个结局检查；一条健康分支可掩盖另一条跨场景闭环。此次没有修改 Runtime 来适应测试，而是在正式完整/增量编译公共链路加入 `cross-scene-exits.ts`。

分析：从入口结构可达集出发，对结局、潜在 return 或语义未知场景作反向出口传播；剩余图用非递归强连通分量寻找无外出边闭环。源 choice/jump/condition/call 进入无出口区时产生 `CROSS_SCENE_NO_EXIT`，闭环内部源语句产生 `CROSS_SCENE_CLOSED_CYCLE`。每个风险源一条警告，目标消息最多列 3 个并显示总数，源码位置保留 stable Scene/Statement。仅是结构风险提示，用户仍可有意保留循环。QA 出口/循环分类接入，原定位按钮直接进入相同 Sequence Inspector。

保守边界：条件双路不折叠；任意编译 return 都作为潜在逃逸，未求实际调用栈或局部 return 可达性；语法/引用错误交给原错误诊断，不在未知语义上追加确定闭环断言。单场景 SCENE_NO_EXIT/NON_INTERACTIVE_LOOP 不被误作出口，能提示上游跨场景连接。不可达场景不追加新跨场景风险，仍保留旧不可达诊断。可能漏报常量假出口/不可达 return，不能将“无新增警告”解释为全部路线可结束。IR、缓存条目、工程和存档 schema 未改变，全局诊断每次重新派生。

验证：Compiler/Route/Editor 12 文件 148 项通过；覆盖健康结局旁的闭环、链式死路、单场景自跳、不可达闭环、无效目标、返回与实际 call/return 保守处理、修改单场景后的完整/增量一致、撤销恢复以及 10,000 场景深环无递归溢出。最终可读名称调整后新增相关 7 项复跑通过。正式性能入口 9/9，最终 10k 同步 P95 90.21ms<500ms，未改门限；类型、Editor 构建、Golden 审计及 diff 检查通过。未声称执行全仓 check，原 bundle 警告保留。

浏览器实证：导入已有 Beginner 短篇，经真实 UI 创建两个场景并插入跳转，海边→雨巷→海边形成闭环，同时书店正常结局仍可试玩。先保存刷新重开，再经 Flow 与正式 QA 都定位雨巷源跳转；选择约定终章后警告消失，Undo 恢复、Redo 消除；保存重开源码逐字一致，两路线再次到约定达成/书香结局，异常 0。截图经过检查，诊断可读场景名与“定位并修复”可见。证据 `evidence/authoring/cross-scene-repair.json`、`cross-scene-repair.png`、`rainy-promise-cross-scene-repaired.zip`。浏览器覆盖跨场景闭环，链式死路和其他边界来自单元测试，未混同。

复跑：构建 Editor、设置 `WORLD_STUDIO_BROWSER_PATH`，执行 `node tools/run-n80-web-export-browser.mjs --cross-scene-repair-workflow`。CI：`11a8467` 已被取消，不算成功；`6618432` run `38066580963` 当前仍在运行，本次新头独立确认。下一完整任务是常量条件误配/假出口解释与修复，不以变量默认值代替可满足性证明。所有剩余摘要/评审/资源优化/Android/真人验收及 M1 均未关闭，接续以 #89/#289 顶部为准。

## 最新审计：2026-10-11 Route 作者规划任务

本轮先完成下节记录的 10k 性能纠偏并推送 `11a8467`，再核对 PRD §3.2 / Gal #11 §6.1 与 `route-graph.ts`、Compiler、FlowView、SceneFlowPanel、route-repair 和原有集成测试。不是所有剩余 Route 都缺少实现，也不是每个“下一步”都应再造新画布。

| 原需求 | 实际代码与本轮判定 |
| --- | --- |
| 章节/场景、标签/结局、选择/条件连接及局部分支 | 已有正式 Compiler 投影、场景节点 facts 和局部步骤/目标，不是自由拖拽局部节点图；原 P0 没有单独要求自由拖拽 |
| 分组/折叠/搜索/过滤/局部加载/布局保持 | 已有 Layout Sidecar、分组及 64 节点/256 边窗口；本轮不重复建设 |
| 作者连接目标选择与修改 | 原 UI 只给当前窗口 ID 候选；本轮补全工程名称/ID 搜索、24 项分页、同名区分和修改前后说明，复用原稳定 ID 事务 |
| 缺目标、不可达、循环/死路 | 已有缺目标、场景可达性及单场景无交互闭环；不能据此宣称所有跨场景闭环/条件可行性已覆盖，作为下一整体任务 |
| 起点/结局路径、轨迹与更多摘要/评审输出 | 现有入口到结局结构候选、定位和实际轨迹；不等于任意起点与条件可满足性证明。资源/翻译/覆盖摘要和评审交付仍需按原需求补验 |

安全与行为审计：搜索/分页不写剧情；只在点击应用时复验来源/选项/目标，失败不变更。显示当前与待应用目标、同名 stable ID 和自指循环提醒；切换选项重建搜索状态。原始 ID 输入保留，缺失目标中文提示如何恢复。新增结果每页 24 项，不把全部 10k 场景挂入 DOM；模型测试覆盖 10k 搜索、同名、无结果及越界页。新结果区可滚动，修正截图发现的旧三列排版挤压，新按钮至少 44px。没有增加缓存信任捷径或改变 Runtime/工程格式。

真实浏览器 UI：导入 `rainy-promise-beginner.zip`，结构页创建 62 个占位草稿及新目标，总计 66 场景。保持图搜索 Start，按名称找到第 66 场景；错误 ID 拒绝→正确应用，源码只替换目标 ID，Undo/Redo 逐字一致。改前海风结局，改后重逢结局，书店分支仍书香结局；保存刷新重开后两分支再次通过，异常 0。证据 `evidence/authoring/route-planning.json`、`route-planning.png`、`rainy-promise-route-planned.zip`。占位草稿是局部加载用例，不宣称完成 66 场景作品；真实浏览器不是 10k 渲染验收。测试脚本显式重新选择试玩后的来源场景，并在 ZIP 导入后选择 Beginner，不假定 ZIP 会保存本机布局偏好。

验证：13 文件 148 项相关回归通过；类型检查、Editor 构建、diff 检查通过；Compiler Golden 审计、正式性能 9/9 见下节。未执行全仓 check，本轮新头需远端独立确认，`11a8467` CI run `38066018186` 尚在运行。下一任务为跨场景死路/无出口循环完整修复路径，详见 #89/#289；M1/Android/资源优化/真人验收保持未完成。

## 2026-10-11 接续前置纠偏：10k Route 性能

上轮 `99d889e` 完整 CI run `38064174977` 失败：10k 单场景同步 P95 556.52ms > 500ms，主要耗时在增量编译分析，而不是 Project Service 或局部查询。代码审计确认分析和正式编译的回想目录多次对每个场景扫描所有结局，形成场景数×结局数的重复遍历。现按本次可达结局建立 scene→endingIds 索引，同步复用到目录有效性、回想生成与缺封面诊断；保留输入顺序、重复 ID、不可达排除和失效引用报错，没有改缓存信任边界、IR 或测试门限。

本机正式性能入口修复前 9/9、P95 218.02ms；修复后 9/9、82.77ms。不是用本地速度否定 CI 失败：新头仍需远端验证。Compiler/Route 6 文件 75 项通过，新增多结局顺序、不可达场景、控制流改动后的目录失效及完整/增量诊断一致性回归；Golden 审计通过。原始 Route P0 的作者任务继续按 #89 进行，不把本次性能修复当作全部 Route 完成。

## 最新审计：2026-10-10 Beginner 作者完整任务

需求依据：PRD §3.6 的无损布局切换、UX #04 §3.2 的低频参数披露及 #89/#289 当前接续。检查了 experience-level、App 导航/SceneRail/Sequence/资源窗口/预览、生产 CSS 与既有渐进披露及保存恢复测试。确认偏移不是底层能力缺失，而是 Beginner 隐藏 `.rail-card-stack` 和整个正式 `.statement-toolbar`，导致素材、旁白、选择、条件等入口不可用，连插入失败原因也隐藏。

处理：正式插入栏与阻碍提示重新可见，旧重复对白快捷栏在 Beginner 收起；创作任务导航复用原工作区/视图与 Scene/Statement，不创建内容副本，未提交输入时禁用。资源生命周期/安全回收/Dicing 技术区用原生可展开区披露，Beginner 默认折叠，Pro 默认展开，子组件不卸载；导入/改名/替换/引用修复不折叠。已有 Runtime 诊断折叠能力保留，不重做。顶部既有保存仍是唯一编辑器保存实现，说明本地保存不等于跨电脑传输。

验证：8 文件 57 项相关回归通过，涵盖 App 基线、Beginner/Pro 上下文及重开、素材编辑导入、创作导航、两个布局下错误草稿阻断/定位/修复/历史及正式调试。类型检查、Editor production 构建、diff 检查通过，原大 bundle 警告不变。没有声称跑完全仓。新测试最初漏换一处 Pro 的 QA 选择器，改为使用 Beginner 用户实际的任务入口后通过，未修改产品逻辑来绕过断言。

真实 Chromium：`--beginner-writing-workflow` 从空工程创建《雨后的约定》，两角色/三场景/变量/两结局，插入→两路线试玩→修改→保存刷新重开→两路线再通过→工程 ZIP；路线/QA 往返选中步骤不变。`--beginner-assets-workflow` 在同名已有媒体工程完成类型拒绝/替换/撤销重做/缺失引用定位修复/重开/Canvas 像素变化/原结局。两条任务不切回 Pro，异常均 0；插入及文件选择器验证真实可见，技术折叠可展开。两条证据来自两个独立浏览器工程，不能说成一次连续新建到全部媒体修复的操作。

证据：`evidence/authoring/beginner-writing.json`、`beginner-writing.png`、`rainy-promise-beginner.zip`；`beginner-assets-workflow.json`、`beginner-assets-preview.png`、`rainy-promise-beginner-assets.zip`。390×844 只核对新任务导航边界和按钮高度，未验收整个移动布局或 Android。浏览器复跑前构建 Editor，并设置 `WORLD_STUDIO_BROWSER_PATH` 指向可用 Chromium。

CI：上阶段精确头 `70766a0` run `38062852317` 已成功，本次新头待推送后确认。下一整体任务是原始 Route P0/全局与局部规划修改能力差距审计和补齐，具体顺序以 #89/#289 顶部为准；现有局部步骤列表不冒充自由节点画布。资源优化、Android 真机、真人完整 UI 验收及 M1 保持未完成。下方素材审计为历史成果。

## 最新审计：2026-10-10 素材引用故障恢复

已核对资源列表/导入、IndexedDB Repository、Canonical 适配、演出 Inspector、原子 Index 写入、生命周期和保存代码。底层既有 importAsset 允许同 ID 更新，但 UI 只能手抄稳定 ID，没有从资源列表编辑或定位使用位置的入口；选择文件还会覆盖元数据。此次复用既有机制加入改名/替换入口，编辑已有资源时锁定 ID/类型并保留名称，拒绝跨类型替换，保留 tags/扩展字段。资源发布统一使用当前工程/剧情并标记 dirty，避免异步闭包覆盖后来编辑及“资源变了但未提示保存”。

恢复路径：已提交演出 asset/transitionAsset 的实际参数生成使用位置，缺失 ID 可直接打开同一 Scene/Statement 的演出参数；若有错误草稿则回 Script。最近一次已有资源更新记录前后索引条目，撤销/重做读回原不可变 Blob 并重新走 lease/CAS 事务，不覆盖原字节、不删除数据；目标条目已被别的更新改变时拒绝。历史仅当前编辑会话一级，不持久化；新导入不提供删除式撤销，跨重开使用已有备份。源文件验证只读，缺失/异常/大小不符分别给出重新导入或备份恢复路径，不把列表存在当作文件可读。

真实浏览器从 `rainy-promise-repaired.zip` 完成：改名→源文件校验→错误 WAV 替换图片被拒绝且索引保持→正确 PNG 替换→撤销/重做→点击使用位置→制造缺失 Asset ID→跳回 Inspector 修复→脚本撤销/重做→保存刷新重开→正式预览。源码逐字一致，角色 X=65 保持，Canvas 像素摘要由 `56fe8180…902` 变为 `2e68375b…7c5`，导出的 ZIP 索引名称及 source digest 与替换 PNG 相符，最终结局不变，异常 0。测试位图只是功能样本；不是正式美术。证据 `evidence/authoring/asset-repair-workflow.json`、`asset-repair-preview.png`、`rainy-promise-assets-repaired.zip`。

测试过程区别：初次浏览器脚本按旧 DOM renderer 等待角色 img，但正式渲染为 Canvas，导致错过检查点并走到结局；改为既有 Canvas ready/实际像素读取，不修改产品 renderer 或降低判据。实际缺失引用恢复经 UI 通过；源 Blob 缺失/损坏读取/大小不符由测试替身覆盖，未声称在浏览器中删除真实文件完成故障验证。只读文件检查按索引 revision 显示，替换后不沿用旧“通过”结果。

验证：9 文件 / 88 项（资源模型/UI、Repository、导入、App 基线、Canonical 适配、正式导出、前阶段排错回归、文件读取），另隔离 autosave 1 项，共 89 项通过；TypeScript、Editor 构建和 diff 检查通过，既有大 bundle 警告不隐藏。未改变 Runtime/工程/存档 schema，不宣称全仓或 M1 验收完成。`.browser-diagnostic/` 仍为未提交本机缓存。

远端与接续：前序 `7d9c54c` 的完整 CI [run 38061674879](https://github.com/Longyuyeee/WorLdGame/actions/runs/38061674879) 在本轮收尾时确认成功，包含 Route 性能门；旧 `9e1a621` 的 P95 523.03ms 失败未在该头复现，期间未放宽门限，不能反向把旧失败改为成功。本次推送后仍需按新精确头检查。下一整体任务为 Beginner 完整创作路径的 UI/入口/错误反馈一致性，不再扩展资源底层审计或打包支线。未完成边界继续见 #89 顶部。

## 最新审计：2026-10-10 多视图作者任务

对齐 #89/#289 当前完整任务，先读 App、Studio Session、事务输入、正式预览、Debug/QA 和保存实现。确认单场景草稿隔离及恢复原本存在，但全工程试玩/构建仅判断当前场景：新增产品测试首次失败，证明切场景后可绕过阻断。现在统一收集所有有效场景的未提交草稿，跨视图保留说明和修复入口，阻断正式启动/重启/调试启动/构建，并清除过期构建及拒绝异步旧产物；仍允许其他场景编辑、本地保存草稿与使用 QA 检查。当前场景编辑锁不被全局锁替代，避免一个错误冻住整个工程。

定位修复：QA 草稿诊断直接进入该场景 Script；运行错误增加 `修复运行错误`，采用 Compiler Source Map 已映射的诊断 Scene/Statement ID。单元测试覆盖“先呈现旁白，再执行失败赋值”的回滚路径，确认修复入口指向赋值而非旧游标。既有返回当前源码入口保留。多草稿保存恢复后只修复/丢弃一处时，其他草稿继续可见。

真实作品全链：UI 导入 `rainy-promise-lifecycle.zip`，修改旁白、Script 撤销重做，制造缺引号草稿、切书店保存并刷新；QA 定位到海边 Script 修复。Stage 点选到 X=65，撤销/重做与源文本逐字比较；Flow 返回同场景，调试启动、前进/后退/前进；再用合法表达式 `1 / 0` 触发正式 Runtime 错误，准确定位 set 改回 2。最终保存重开源文本完全一致，正式试玩到“平常的告别”，异常 0。新证据为 `evidence/authoring/repair-workflow.json`、`repair-draft.png`、`rainy-promise-repaired.zip`，旧证据不覆盖，不注入 React/Runtime/存储状态代替作者操作。

真实差异记录：浏览器脚本初次使用不存在的“旁白内容”控件，改为既有类型化 Inspector；Stage 测试初次用子内容区计算坐标，与产品的舞台外框不同，改为真正事件接收表面的坐标后精确得到 65，不放宽断言。截图还发现顶部保存文字被挤压，已允许历史操作换行、禁止控件文字挤压。新增草稿区在 390×844 右边界 363<390、按钮高 44px；这是该区域验证，不是全站移动端或 Android 验收。

验证：11 文件 / 107 项相关测试通过，含 App 基线、Studio Session、事务输入、Route、正式预览及 Debug/QA/断点/Watch；TypeScript 和 Editor production 构建通过，保留原 bundle 警告。不修改 Runtime/工程/存档版本，不运行无关全仓专项，不声称所有 P0 完成。此前 `.browser-diagnostic/` 缓存仍未纳入提交。

推送前远端核查：上阶段 `9e1a621` 的 CI [run 38060509222](https://github.com/Longyuyeee/WorLdGame/actions/runs/38060509222) 最终失败于 10k Route 单场景编辑同步性能门，P95 523.03ms 超过 500ms。当前本机按正式 `npm run audit:route-performance` 复测 9/9，P95 210.32ms；没有放宽门限或改语料，不能据此认定远端失败已修复，也不能直接归因环境。普通 Vitest 配置不含 tools 下的性能测试，必须用此专用入口。接续首先核查本次精确头 CI；若同项仍失败，先分析增量编译与投影开销并纠偏，再开展新功能。

接续：按 #89 顶部开展素材引用故障恢复整条任务，属于整体 UI/剩余 P0，不转向包装增强。自由局部画布、剩余 Route、资源优化、Android 真机及真人验收仍未完成；“本作品完整路径通过”不等于所有任意跨视图编辑都已验证。

## 最新审计：2026-10-10 变量生命周期整体任务

对齐 #89 当前计划与 Gal #11 §2.7，已核对实体编辑、Compiler、正式 Runtime、Player Core、游戏存档、预览与导出，而非以字段存在判完成。发现 scope 原来未进入执行语义，已修复：新 IR 1.2 携带默认值与章节拓扑，统一在 choice/jump/condition/call/return 转移时重置 scene/chapter；story/meta 本局保留，重新开始全默认。History/读档恢复原值，不执行额外重置；跨场景返回不恢复调用方局部变量。作者界面和需求文档明确说明这些边界。

真实 UI 作者任务通过：在《雨后的约定》中新增默认值 3 的 chapter/scene/meta 变量，赋值 9，经过共享嵌套调用、跨章节汇合、条件修改及工程保存刷新重开，四次路线执行均正确。正式导出玩家在结局后读档、刷新后读档，变量、游标及调用栈恢复一致，未捕获异常 0。证据 `evidence/authoring/variable-lifecycle.json`，接续 ZIP `rainy-promise-lifecycle.zip`；没有使用脚本注入工程替代作者操作。IndexedDB 只读核验游戏存档，保存/加载仍由真实界面触发。

审计过程差异：初次用完整 State hash 判断结局后读档相等不正确，因为独立 metaProgress 会保留新学到的结局/已读记录；改为精确核对本任务要求的变量、游标和调用栈，未更改产品的进度合并规则。新增类型转移用例最初使用缺失 endingName 的无效测试工程，修正样本后再验证。旧语料分片测试直接调用因缺少环境参数失败，改走仓库正式分片入口后 10,000 seed / 20,000 执行通过，失败 seed 0，digest 仍为 `01556a8c979e080cc653817713ad26f7d2882445e9ebdc727049f415da4863a9`，未放宽预算或改金标。

兼容审计：旧 IR 1.0/1.1 继续支持且不追加新重置语义，1.2 缺失/非法生命周期信息拒绝；旧播放器不保证识别新 IR。运行 State 和存档 schema 未变，build identity 与编译金标随新 IR 合法变化，不承诺旧构建存档自动迁移。chapter 映射沿用 Canonical 章节展开后的场景顺序，改章节归属/变量默认值会进入重新编译产物，debug/release 一致。

本地验证：12 文件 / 227 项相关测试（Compiler、Runtime、Player Core、Shell/Save、Editor 预览/调试/实体编辑/编译/导出）；TypeScript、Editor production 构建、7 个 Golden 项目审计、checkpoint 审计通过，仍有既有大 bundle 警告。浏览器流程两次通过。未运行全仓所有测试，不声称远端 CI 或 M1 全绿；精确提交 CI 推送后查询。`.browser-diagnostic/` 为此前本机诊断缓存，未纳入提交。

下一步按 #89/#289：同一作品多视图编辑→定位与修复问题→撤销重做/调试→保存重开，核实内容与上下文一致性；不以新增控件或包装功能代替整体任务。未完成项仍包括剩余 Route P0/自由局部画布、整体 UI、资源优化、Android 真机及真人产品验收。本轮只完成变量生命周期基础作者任务，不代表所有复杂变量表达式或跨周目永久变量功能。

## 2026-10-10 本轮整体结论

推送后补充检查：发现前两轮远端 CI 已在旧 `App.test.tsx` 的整段文本选择器失败（连接文字新增“修改”后不再等于“去天台”），此前定向集未覆盖它。现改为在路线连接区域按真实编辑按钮的可访问名称定位，同时仍断言路线文字可见；整个 App 基线 45 项通过。加本轮相关 47 项，共 92 项本地测试通过，未降低产品行为断言。远端完整 CI 仍需确认，不以本地结果声称远端全绿。

原计划要求完整作者路径，前几轮只完成内部切片；本轮补齐场景内逐步走向与定位，并实际完成《雨后的约定》从 Flow 条件修改到双路线正式试玩、保存刷新重开、结局互换。作品含两调用方共享片段及嵌套调用，返回后能正常汇合，变量值 2/0，未捕获异常 0。真实浏览器结果/接续 ZIP/截图已更新至 `evidence/authoring`，47 项相关回归、Editor production 构建及 diff 检查通过。

上轮浏览器未启动不是应用功能失败：本机将 9185–9284 设为 TCP 排除范围，工具固定端口 9236 被拒绝；改为 19236 后完成测试。旧段落的“浏览器未通过”已被本轮结果替代。当前界面是可导航的场景内流程列表，不宣称自由节点画布或条件可行性证明。下一阶段按完整变量生命周期任务推进，见计划 #89 顶部；不把 47 项测试换算成 M1 全部完成。

> 最新审计（2026-10-10）：此前图事实遗漏 return，且调用只展示目标、不说明后续位置。本轮按 Runtime 调用栈语义补 return 说明、调用后续定位、末尾调用提示及编辑入口；派生概览读取器同步支持新增事实。43 项相关测试、Editor 构建通过，包括正式调用返回试玩；没有改 Runtime，没有新浏览器证据，不关闭完整路线图或 M1。

> 最新增量：已补可读条件摘要和本地条件源语句编辑入口；仅投影正式 Compiler AST，不修改运行语义。40 项相关回归及 Editor 构建通过，涵盖表达式保真、变量改名、Flow 修改后的摘要更新。浏览器主路径仍未通过，本轮未改写旧浏览器证据；完整局部控制流、调用/返回关系和 M1 仍未完成。

> 2026-10-10 最新审计：原路线要求多视图同源，实际代码只给 Choice 生成路线边，跨场景 jump/call/condition 在 Runtime 可执行但 Flow 缺线。本轮已纠偏，直接投影 Compiler 场景目标，并补名称展示和源语句定位；同名本地标签不误画为跨场景边，Choice 修复只操作选项。32 项受影响回归与 Editor 构建通过，包括界面修改跳转、图刷新、保存加载后正式试玩命中新结局。真实浏览器未通过（浏览器调试端口启动失败），没有伪造或覆盖前序证据；扩展好的条件作品浏览器脚本待新环境复跑。完整条件摘要、局部分支、返回关系与真实短篇 Flow 路径仍待完成，接续步骤见计划 #89 顶部。

> 最新进度：同一媒体工程经真实 UI 编排两路线赋值 2/0、汇合场景条件结局；条件从 `>= 2` 改成 `== 0` 后，保存重开，两路线实际结局互换。修复 UI 允许场景目标、Compiler/Runtime 却只支持本地标签的 `MISSING_LABEL` 缺口，并补条件图形比较入口。接续工程 `evidence/authoring/rainy-promise-conditions.zip`；实际结果 `condition-workflow.json`。Editor 构建、112 项受影响回归及浏览器主路径通过。下一步是路线图理解与定位修改完整分支，不转向打包；M1/全功能未完成。以下为前序阶段记录，以计划 #89 顶部为准。

> 最新阶段：沿用《雨后的约定》经真实 UI 导入背景/角色/音频、在旁白前编排、预览后修改角色位置、保存重开；真实画布像素和音频播放进度通过。修复异步媒体就绪后 Canvas 不重绘的实际缺陷。成果 `evidence/authoring/rainy-promise-media.zip`；测试素材不是正式美术/配乐，未人工听音。下一阶段为选择、变量和条件共同决定剧情走向，具体以开发计划 #89 顶部为准。以下写作阶段记录为前序成果。

> 当前阶段按完整作者任务验收，而不是按控件拆分。已通过 UI 从空工程完成《雨后的约定》：两名角色、三个场景、一个数值变量、两条结局，预览后修改、保存、刷新重开并再次走完两条路线。修复结局后插入内容不可达的问题，并补对白说话人选择。6 项定向测试、Editor 构建及真实 production 浏览器路径通过，未执行全仓验收。

> 可接续工程：`evidence/authoring/rainy-promise.zip`（首页“导入工程 ZIP”）；结果：`evidence/authoring/continuous-writing.json`。这只是短篇基本闭环，未完成全部编辑 P0/M1。下一阶段围绕同一作品完成素材导入、演出编排、实际预览和保存重开。权威计划见[开发计划 #89](89-engine-product-delivery-plan.md)顶部，打包支线继续后置。

## 历史审计记录

以下日期、授权节点和“下一步”保留追溯用途，不替代当前开发计划。

> 审计日期：2026-09-23
> 当前分支：`codex/n60-e1-debugger-session`；N62-E5 实现头为 `5f3f70c7cc081dbd331b7dc60c859f0d9b2dbb5a`
> 权威基线：N41 集中 Authority `codex/m1-integration-n41-governance`，节点提交 `11bf31313edcc380ff9db03e3286b710e0a65679`，Draft PR #61，尚未合入 `main`
> 当前授权：历史 **RA-N21-011 checkpoint 窄范围修订**身份继续保留；2026-09-03 Additional Content 窄范围修订准入到 N62 Engineering，N62 Product Acceptance、N70 Engineering、M1 与发布继续阻断，2026-09-27 16:00:00（UTC+8）到期
> 最新证据：[N62-E4 隔离场景回想审计 #287](287-n62-e4-isolated-scene-replay-audit.md)、[N62-E5 作者目录展示覆盖审计 #288](288-n62-e5-authored-catalog-presentation-audit.md)
> 权威功能状态：[M1 需求与验收追踪矩阵](90-m1-requirement-traceability.md)

## 1. 当前结论

2026-09-23 最新结论是：**N52、N60、N61 与 N62-E1–E5 Engineering 已关闭。** E5 继续由 Compiler 自动生成四类成员，只在 Canonical `ui/screens.json` 保存标题、排序、封面和解锁前展示的稀疏覆盖；目录标题复用既有 Localization stable key，Player Core 统一执行翻译与防剧透。Production 显示自动条目和缺图数量，非法目标/封面 fail closed，缺图为非阻断诊断。定向 `47/47`、普通 `1010/1010`、完整构建与 Chrome production 双视口均通过；实现头 `5f3f70c` 的 exact-head run `35762476885` / job `106863672405` 成功。后续文档头 `84c544d` 的 Windows 门又真实暴露并已修复 Auto 在 `stopPoint` 后可能排出下一计时器的竞争；本地 Shell `54/54` 连续 6 轮、E4b 合同、Shell build 与全仓 TypeScript 已通过，下一步须先取得修正头 exact-head 远端绿色。其后唯一切片为只显示已发现内容的玩家自动 Route。N62 Product Acceptance、N70 Engineering、M1 与发布继续阻断。完整证据和接续顺序见[#288](288-n62-e5-authored-catalog-presentation-audit.md)。

Editor 的完整流程试玩已把 Canonical Project 交给 N30 Project Compiler，再把 IR 交给 N31 Runtime；E7 又把 Editor 私有 Effect Host 收敛为 portable `@world-studio/runtime-host`，并由真实浏览器 Worker 与 Node 比较同一 receipt/snapshot Golden。五分钟 Benchmark 首次按正式链实测时暴露旧 Direction 和缺失变量，本轮已修正；两条结局路线与 Back/Forward 均在 production browser 真实通过。

N32 的历史出口复审发生在正式 Player 建立之前；其中“Player 不存在”只描述当时事实。N50-E1–E6 现已补上正式 Core、真实媒体 adapter 与 Web 嵌入边界，但旧 `playable-web-export` 独立解释器仍不能冒充新 Player，N32/N50 Product Acceptance 也不会因此自动通过。

- 当前工程节点：**N40 Route Map、N41 Sequence、N42 Stage、N43 七模式、N50 Player Shell 与 N51 Gal Settings Engineering 出口已通过；N50/N51 Product Acceptance 仍被实体 Host、跨节点和真人证据阻断**；
- N21 真人：**0/1，pending-participant**；
- N23 真人：**0/2，pending-participants**；
- N30/N31：**Engineering 已有退出证据，Product Acceptance 未通过**；
- N32 Product Acceptance：**被阻断**；
- N40/N41/N42/N43/N50 Engineering：**出口已通过**；**N51 Engineering 已关闭，N52 Engineering 已关闭，N60 Engineering 已关闭，N61 Engineering 已关闭，N62-E1–E5 已关闭**；N62 Engineering 下一切片为玩家自动 Route；全部 Product Acceptance、N70+ Engineering、M1 Stable、Public Release：**被阻断**；
- **N60-E2 断点集合与运行边界已实现**：[审计 #268](268-n60-e2-breakpoint-boundary-audit.md)以 stable ID 管理多断点启停/移除/定位；Continue 通过正式 Source Map 和 Runtime History 命中下一断点，并明确呈现 Choice、awaited Effect、Barrier、Ending、Error。新产品路径首次 `0/1`，实现中真实暴露“重复命中当前断点”差异并修复；定向 `3 files / 19 tests`，production desktop/mobile overflow `0`、E2 移动控件 `44px`。本机完整门仅既有 VM 10k 为 `94.671s > 90s`、隔离 `96.507s`，未放宽预算；精确实现头 `4e29559` 的 Windows run `33491890189` / job `99805042362` 用时 `14m36s` 全绿，VM `69.36s`，关闭环境差异。N60 总 Engineering 与所有产品门不提前关闭；
- **N60-E3 Watch 与变量来源/变化已实现**：[审计 #270](270-n60-e3-debugger-watch-audit.md)复用 Story Language parser、正式 Runtime evaluator、History checkpoint 与 Compiler IR/Source Map，未建立 React 私有求值器。产品红测首次 `0/1`；修正后 N60 聚合 `7 files / 87 tests`，production 真实工程显示表达式 `1 → 2`、变量 `0 → 1`、stable 写入来源和非法表达式非破坏性错误。390×844 根宽 `375/375`、新增交互 `44px`、console `0 error`。本机全门普通回归 `157/985` 通过，但既有 autosave 5 秒门连续三次未达、VM 10k 为 `119.409s > 90s`，未放宽预算；精确实现头 `9d5d597` 的 Windows run `33580208407` / job `100092698639` 用时 `10m17s` 全绿，autosave `2.312s`、VM `40.656s`，关闭本机环境差异。下一步先关闭 PRD 3.10 P0 QA Golden 产品路径，不用 P1 Solver/覆盖率回避剩余 P0；
- **N60-E4 P0 Story QA 已实现**：[审计 #271](271-n60-e4-p0-story-qa-product-closure-audit.md)直接复用 Compiler/Source Map，将不可达、无出口、悬空引用、缺失资源、非交互循环做成五类总览、筛选与 stable source 修复入口。真实 App 红测 `0/1` 暴露分类 UI 缺失，修正后 N60 `8 files / 88 tests`；故障 Golden 五类全检出，正常校园工程五类全为 0。production 1440×900 与 390×844 overflow `0`、console error/warning `0`。下一步做 N60 Engineering 总出口复审；
- **N60-E5 当前场景启动已实现**：[审计 #272](272-n60-e5-scene-debugger-start-audit.md)确认正式 Runtime 已有 Scene Fresh Run，但 Debug & QA 仅暴露 Entry/Statement；真实 App 首次 `0/1` 精确失败于按钮缺失，修正后可从所选场景首语句启动，并保留全部调试控制。N60 `8 files / 88 tests`、TypeScript 通过；下一步继续核对诊断抑制理由/报告交付的真实用户必要性；
- **N60-E6 诊断抑制与 Engineering 出口已关闭**：[审计 #273](273-n60-e6-diagnostic-suppression-and-engineering-exit-audit.md)完成 stable finding ID + 必填理由、Canonical 重开追溯、活动报告重算与恢复；真实 App `0/1→1/1`，production 390×844 document `375/375`、恢复按钮 `44px`、console `0`。PRD 3.10 与 Delivery Plan 逐项完整，N60 Engineering 关闭；
- **N61-E1 本地化生产入口与状态闭环已实现**：[审计 #274](274-n61-e1-localization-production-audit.md)复用现有 Production、Canonical localization 和 Story 稳定 ID；完成源/目标语言、五种状态、非法代码恢复、保存重开及源文过期。真实 App `0/1→1/1`、受影响回归 `3 files / 4 tests`，下一步 N61-E2 CSV/XLSX 往返；
- **N61-E2 CSV/XLSX 翻译交换已实现**：[审计 #275](275-n61-e2-localization-csv-xlsx-exchange-audit.md)以真实 CSV/XLSX 完成稳定键导出、外部修改、导入差异预览、错误批次阻断、确认写入及 Canonical 重开；首次入口 `1/2`，修正后定向 `2 files / 3 tests`，下一步 N61-E3 Runtime 语言选择与缺失译文回退；
- **N61-E3 Runtime 语言切换与回退已实现**：[审计 #276](276-n61-e3-runtime-localization-switch-audit.md)由正式 Player Core 消费 Compiler catalog 并只在 snapshot 投影语言；画面/History 即时切换，缺失/过期回退且显示数量，Web 重开恢复偏好。产品红测 `0/1→1/1`、受影响 `4 files / 81 tests`，下一步 N61-E4 CJK/Ruby/禁则与字体回退；
- **N61-E4 CJK/Ruby/禁则与字体回退功能已实现**：[审计 #277](277-n61-e4-cjk-ruby-font-fallback-audit.md)把 Story `｜基底《注音》` 安全渲染为语义 Ruby，并在对白、Choice、Ending、History 应用语言字体栈与严格 CJK 换行；项目字体失败时不中断剧情且显示回退。产品红测 `0/1→1/1`、受影响 `4 files / 60 tests`；production 双视口实际断行复验保留为接续首项，不提前关闭 N61；
- **N61-E5 语言媒体与 Voice Asset 映射已实现**：[审计 #278](278-n61-e5-localized-media-voice-mapping-audit.md)让正式 Player 按 Canonical locale 变体选择图片/视频、按 stable text ID 选择 Voice，并在目标语言缺失时回退源语言且显示数量。真实路径 `0/1→1/1`、受影响 Player/Localization `5 files / 61 tests`、production build 通过；真实 PNG/SVG/WAV 已跑通 `en → zh-Hans → ja`；
- **N61-E6 Production 语言媒体与配音已实现**：[审计 #279](279-n61-e6-localized-media-production-audit.md)复用真实 Blob、媒体检查和 Asset Index，让创作者按 stable text ID/基础 Asset ID 绑定 locale 文件、维护状态、恢复失效绑定并保存重开。真实 App 在四项 PNG/WAV 导入成功后 `0/1→1/1`，受影响 `5 files / 8 tests`、TypeScript/build 通过；production 桌面与实际 375×844 overflow 0、移动交互至少 44px。下一步 N61-E7 贯通同一 Canonical 到 Compiler/Player，并完成 Engineering 出口复审；
- **N61-E7 与 Engineering 出口已关闭**：[审计 #280](280-n61-e7-localization-engineering-exit-audit.md)用同一 Editor 保存 Canonical/IndexedDB Blob 直接贯通 Compiler/Player，新增真实跨应用路径首次 `1/1`；E4 390×844 CJK/Ruby/禁则、overflow、触控和 console 证据同步闭合。N61 Goal 与 8 项 Implementation 全部完成；Product Acceptance 和 N62 不提前通过；
- **N52 main-target 聚合集成候选已建立**：[审计 #266](266-n52-main-target-integration-candidate-audit.md)确认 main/N41 Authority 祖先、behind `0`、121 个开放 PR head 无遗漏；直接面向 `main` 的 Draft PR #122 为 mergeable，候选头 `3ce53f5` 的 Windows run `33473899313` / job `99749040172` 用时 `12m55s` 成功。原分片 PR 保留为审阅索引；该动作不等于合并，也不改变 N21/N23 pending 与全部产品阻断；
- **N52-E5e History 总出口复审已关闭 N52 Engineering**：[复审 #265](265-n52-e5e-history-engineering-exit-reaudit.md)逐项核对七项工程矩阵、真实代码所有权、N52 `101/101` 及 E5b–E5d 精确远端证据；四项 History 状态从旧 checkpoint 的 blocked 更新为 complete。候选头 `9ea1666` 的 Draft PR #121 Windows run `33471267182` / job `99741333074` 用时 `10m21s` 成功。USP-09、REQ-RUNTIME、AC-16 仍为“实现中”，下一步是 main-target 集成候选与 N21/N23 真人验证，不进入 N60；
- **N52-E5d Shell/production Engineering 已关闭**：[审计 #264](264-n52-e5d-player-history-shell-production-audit.md)记录新增路径 `0/3→3/3`、扩展 `6/6`、N52 `101/101`、N51 `131/131`；1440×900 与 390×844 overflow `0`、控件 `44/48px`，false 策略/热应用、Barrier、真实 IndexedDB 保存刷新读取及 console `0` 均通过。实现头 `08bfb5c` 的 Draft PR #120 Windows run `33468762702` / job `99734003643` 用时 `9m26s` 成功。下一步 E5e，不提前换算 Product Acceptance；
- **N52-E5c Settings/Core Engineering 已关闭**：[审计 #263](263-n52-e5c-gal-history-policy-player-core-projection-audit.md)记录实现前新结果 `0/5`、原有 `42/42`，修正后受影响范围 `147/147`、Core `25/25`。Settings strict v6 只增加 Forward 策略；Core 不复制 History，直接投影 Runtime active/archive identity，archive 不可导航，Barrier 和策略阻断可解释，Session Save 重开一致。实现头 `cce203b` 的 Draft PR #119 Windows run `33465730199` / job `99725069881` 用时 `13m38s` 成功。下一步 E5d 完成 Shell 与桌面/390×844，产品状态不提前换算；
- **N52-E5b Runtime History v2 Engineering 已关闭**：[审计 #260](260-n52-e5b-runtime-history-v2-audit.md)证明旧 Forward 已由 Runtime 保存为确定性、只读、不可导航且含完整要求证据的摘要；10,000 总界限 fail closed。Session Save v2 新写、v1/v2 双读，v1 保留旧 artifact identity。Runtime `63/63`、Formal Preview `15/15`、10k seeds/20k replay 零失败，v2 digest `01556a8c…63a9`，State/Outcome 金标不变。实现头 `78a19ec` 的 run `33457956272` / job `99701844659` 用时 `9m45s` 成功；交接头 `1a39394` 的 run `33458762331` / job `99704253946` 用时 `12m41s` 亦成功；
- **N52-E5a History 跨层授权与入口合同已关闭**：[审计 #259](259-n52-e5a-history-contract-authority-audit.md)确认 Player Save 只封装 opaque Session Save，故不升 v4；冻结 Runtime History/Session Save v2 只读 branch summary、v1 hash 后归一、Gal Settings v6 Forward 项目策略，以及不改 Runtime State/IR/Scheduler 的禁止边界。实现头 `8d2c6d5` 的 Draft PR #117 Windows run `33418919492` 复跑全绿；后续证据头又使同一真实磁盘 suite 在另一用例复现 5 秒超时/`ENOTEMPTY`，已纠偏为局部 15 秒与清理 retry。稳定头 `f7483a7` 的 run `33422870060` / job `99589275850` 用时 `13m41s` 全绿：两次 Node Directory `9/9`，普通 `154/967`、VM `65.87s`、Route P95 `204.28ms`、Asset 总计 `3240.49ms`。下一唯一代码切片为 N52-E5b Runtime branch archive；
- **N52 Engineering 总出口与 N60 治理 checkpoint 已完成**：[审计 #258](258-n52-engineering-exit-and-n60-governance-checkpoint.md)确认旧 Forward entries 被删除而非归档、Core snapshot 只有四个位置字段、Shell 只有三段 Back/Forward 控件；纠正了“子切片全绿即可关闭总出口”的假设，结论为 N52 总出口失败。冻结 N52-E5 Player History / Barrier 跨 Runtime→Core→Shell 契约，N60 仍不准入；
- **N52-E4f 移动端 cold production 与 E4 Engineering 出口已关闭**：390×844 Auto、Toggle/Hold × Skip Read/All 五向量准确停止，首次发现的两个 30px select 已纠偏为 48px；document overflow 与 console 均为 0。实现头 `b5681a7` 的 Draft PR #115 Windows run `33408391033` / job `99541585012` 用时 `15m04s` 绿色，远端普通 `154/967`、VM `74.02s <90s`、Route P95 `162.72ms`、Asset 总计 `3494.96ms`。E4 矩阵 `7/7`；N52 总出口、Product Acceptance 与 N60 授权仍待下一 checkpoint；
- N52-E1 本地完整门：普通 `149/890`、N50 `41/41`、N51 `96/96`、N52 `31/31`、VM `28.69s`、Route P95 `72.55ms`、Asset dicing `1667.44ms`，全部未调整预算；桌面/390×844 cold production-browser overflow/console 均为 0；
- N52-E2 已建立 Core Session Save/Load bridge、三个严格手动槽位、独立 IndexedDB Host、embed API `1.1.0` 和 Load-only rehydrate；本机最终完整门普通 `150/898`、N52 `51/51`、VM `28.30s`、Route P95 `56.82ms`、Asset dicing `1482.87ms`，Autosave 测试体 `4.35s <5s`（长链总时长 `6.40s`、隔离总时长 `2.81s`）；冷 production browser 跨刷新、双视口、overflow/console 与 44px 触控门通过；实现头 `bdb3c73` 已推送至 Draft PR #99，同头 Windows / Node 22 run `33180215962` / job `98879258847` 用时 `12m48s` 绿色，远端普通 `150/898`、N52 `51/51`、Runtime corpus `66.643s <90s`；E2 Engineering 关闭；
- N52-E3 入口契约已按实际代码冻结：v1 不静默扩展，v2 使用 copy-on-write；chapter/scene 取正式 Canonical，route/custom 在正式来源前 fail closed；截图归 Host compositor 且 Blob 与元数据分离；manual 12/每页 6、auto 5 环形、quick 1、checkpoint 3 但等待 build-authored marker。入口头 `3c319da` 已推送至 Draft PR #100，同头 Windows / Node 22 run `33183970309` / job `98892048310` 用时 `12m40s` 绿色，远端普通 `150/898`、N52 `51/51`、VM `63.321s <90s`；入口只关闭设计与审计前置，不代表 v2、截图、分页或自动/快速保存已实现；下一代码切片为 E3a；
- N52-E3a v2 元数据与截图 Engineering 已关闭：Store 2.0/DB2 严格兼容 v1 并在下次成功保存 copy-on-write；chapter/scene 只取 Canonical + cursor，route/custom fail closed；12 个手动槽每页 6 个且覆盖二次确认；Host compositor 提供的合规 PNG/WebP 与元数据同事务写入并做 SHA-256 校验，可见槽位延迟读 Blob，捕获失败仍提交明确无预览的有效 Session。Web Host 不伪造截图；Product Acceptance 未开始；
- N52-E3b Auto / Quick Engineering 已关闭：auto 5 槽空槽优先/最旧轮转，Build+scene 同身份合并；quick 固定 1 槽；所有写入经单 FIFO 串行，失败保留旧槽且不堵塞后续写；Player 提供快速存取及三类槽视图。最终头 `86f053c` 的 Draft PR #102 Windows run `33193037698` / job `98923083117` 用时 `13m35s` 绿色；
- **N52-E3c1 Recovery / Migration Museum Engineering 已关闭**：DB3 新增隔离 `recovery-sessions` 且 DB2 正式槽无损保留；稳定可呈现 State Hash 写最新恢复，启动必须显式恢复/清除；Session/Build/State/scene/presentation/title 校验、FIFO 失败保留、损坏隔离及五个 Museum 原始向量已有证据。实际代码没有 build-authored checkpoint marker，故 checkpoint 转入 E3c2 跨节点入口合同。本地完整门普通 `153/919`、Runtime corpus `14.621s`、VM `28.75s` 全绿；实现头 `2130c49` 的 Draft PR #103 Windows run `33257145099` / job `99112755230` 用时 `10m17s` 绿色，远端普通 `153/919`、Runtime corpus `21.109s`、VM `51.864s`、Route P95 `102.52ms`、Asset dicing `3666.92ms`。真实强杀与 Product Acceptance 未完成；
- **N52-E3c2 checkpoint 入口合同已关闭**：最初 Gal/CL-04 需求和 VM Spike 的 `checkpoint(stepId)` 已核实，正式链路遗漏已登记为实现偏移；冻结显式 `checkpoint @id(statementId)`、IR `1.1.0`、非表现 marker event、Save v3 严格迁移与 checkpoint 3 槽策略。现有 RA-011 不覆盖 Story Language/Compiler/Runtime IR/Save schema 修改，故本步未改产品代码；入口头 `65f7879` 的 Draft PR #104 Windows run `33259082765` / job `99117811154` 用时 `13m0s` 绿色；E3c3 等待产品负责人明确扩展跨层授权；
- **E3c3 跨层授权已建立并完成审计**：产品负责人在获知精确授权条件后要求从该接续点继续；RA-011 仅增加 checkpoint 所需的 Story Language、Compiler IR 1.1、Runtime 双读/非表现事件和 Save v3/三槽权限，最大节点仍为 N52，其他语义与全部产品门继续阻断。治理头 `59b975e` 的 Draft PR #105 Windows run `33260853201` / job `99122426648` 用时 `13m2s` 绿色；
- **N52-E3c3 checkpoint marker Engineering 已关闭**：正式 Story 语法、Compiler IR 1.1/Source Map、Runtime 1.0/1.1 双读与非表现事件、Player 精确 Session candidate/继续播放/History 跳过已贯通，并由 PR #106、run `33263549231` / job `99129464102` 证明；Save 仍严格保持 v2 且没有 checkpoint 槽，下一步为独立 E3c4；
- **N52-E3c4 Save v3 + 三 checkpoint 槽 Engineering 已关闭**：在既有 DB3 正式槽中增加 strict schema v3，v1/v2 只读归一且成功事务后 copy-on-write；三个 checkpoint 槽空槽优先、满槽按时间/槽 ID 替换，同 Build+step 合并；Shell 消费 E3c3 精确 candidate 并列出/读取，失败保留且剧情继续，读档不反向再写。Migration Museum v2 七向量与定向 `6 files / 66 tests` 已通过；1440×900 与 390×844 production browser 三槽/Save 3.0/44px/overflow/console 门通过；本地完整门普通 `153 files / 929 tests`、Runtime corpus `10,000 seeds / 20,000 replay`、VM `5/5`、Route P95 `61.74ms`、Asset dicing `1543.68ms` 全绿。实现头 `612578e` 已推送至 Draft PR #107，同头 Windows / Node 22 run `33266310582` / job `99136878399` 用时 `13m20s` 绿色；
- **N52-E4 Auto/Skip 入口合同已关闭**：真实代码确认 N31 Scheduler 已有 Normal/Auto/Skip Read/All、Hold/Toggle、5/10/20/40/Instant 与 stop reason，但 Player Core intent/State/Snapshot、Shell 控件和 embed observation 均未接线。机器合同冻结 Runtime/Core/Shell/Host/Playback Policy 所有权、Forward History、真实语音时长、媒体分类和停止清理。首次审计预期只缺四份文档，实际恰为四项且无额外代码偏差；Runtime `61/61`、10k corpus、N52 `67/67` 通过。两次本地完整门分别暴露 App 5 秒与 Asset 3/3/5 秒累积负载差异，同规模同预算隔离复跑为 App `1.31s`、Dicing/Atlas/总计 `1261.79/1857.91/3119.70ms` 并通过。入口头 `e7bd5cc` 的 Draft PR #108 Windows run `33351442390` / job `99365490775` 用时 `14m06s` 全绿，关闭本机差异；入口不登记播放功能完成，下一唯一代码切片为 E4a；
- **N52-E4a Player Core Scheduler bridge Engineering 已关闭**：Player Core `0.5.0` 直接复用 N31 Scheduler，policy 是 canonical Runtime policy 别名，snapshot 发布 mode/activation/speed/stop/count/delay；Forward History 返回 `history` 且 State/History/presentation 不变，内部 checkpoint candidate 可真实加载，不可用 Stage effect 不提交 Host operation。首轮预期旧 15 通过、新 3 因 API 缺失失败，实际完全一致；修正和扩展后 Core `20/20`。完整门两次检出 90 文档旧 required token 回归，按全部 N52 合同枚举恢复后第三轮全绿。实现头 `ed37edd` 的 Draft PR #109 Windows run `33355351685` / job `99376310859` 用时 `13m32s` 绿色：普通 `153/934`、N52 `72/72`、Runtime corpus `10,000/20,000`、VM `67.53s <90s`、Route P95 `141.4ms`、Asset 总计 `3282.46ms`。下一步接续 E4b，不提前登记 Shell Auto 或 AC-15；
- **N52-E4b Shell Auto real clock Engineering 已关闭**：Web Shell 新增 Playback Policy `1.0.0` 和独立 Auto，真实 `window.setTimeout` 只调用 E4a Core bridge；文字揭示、实际 voice duration/currentTime/tail、metadata/ended、手动输入及 Host suspend/resume 均进入清理状态机。首轮预期旧 `30/30`、新 `0/4`，实际完全一致；修正无障碍 status 冲突与 React 两阶段观测后 Shell `34/34`，含策略定向 `42/42`。cold production 1440×900/390×844 证明约 7.4 秒真实推进、暂停 4 秒零推进、恢复 fresh delay、`terminal/stopped`、44/48px、overflow/console 0。旧 E4 入口审计偏差修正后第二轮本地完整门普通 `154/946`、N52 `76/76`、VM `76.12s` 全绿；实现头 `02d4e6c` 的 Draft PR #110 Windows run `33359334689` / job `99387522859` 用时 `12m46s` 绿色，远端普通 `154/946`、N52 `76/76`、VM `68.25s`、Route P95 `127.47ms`、Asset 总计 `3226.25ms`；
- **N52-E4c Skip / media / embed Engineering 已关闭**：Shell 新增 Skip Read/All、Hold/Toggle、5/10/20/40/Instant，并只通过 Core 调用唯一 Runtime Scheduler；Policy `1.1.0`、现有 text/stage/audio 加速与停止恢复、Embed API `1.2.0` playback observation 已接线。首次定向 `40/54`，修正后 `54/54`；cold production 首轮 history 9 `budget/active=false`，修正后 history 17 `waiting-choice/input/active=false`。本地第三轮完整门普通 `154/954`；实现头 `be73358` 的 Draft PR #111 run `33364046411` / job `99400937472` 用时 `14m14s` 绿色，远端 VM `69.00s`、Route P95 `154.41ms`、Asset 总计 `3286.45ms`。390×844 E4c rerun、video、Stop Point source、三端与 Product Acceptance 均未完成；
- **N52-E4 Engineering 当时的出口复审未通过**：[出口复审 #253](253-n52-e4-engineering-exit-reaudit.md)当时得到 `完整 4 / 阻断 3`，随后 E4d–E4f 已逐项关闭并最终达到 `7/7`。该段保留历史差异，不代表当前 E4 状态；
- **N52-E4e formal Player video Engineering 已关闭**：[审计 #256](256-n52-e4e-player-video-policy-audit.md)在不新增语法、IR 或 Scheduler 的前提下，用 Canonical video + 既有 awaited Effect 建立正式 renderer；Policy `1.2.0` 固定 Auto `wait-for-end`、Skip `cancel-and-continue`，Host suspend/resume、错误与 cleanup 完成。首次 `49/60`，最终跨层 `96/96`；cold production 真实 WebM 覆盖 Auto、两种 Skip 与 Host 生命周期，overflow/console 0；完整门普通 `154/967`、17 builds、Route P95 `62.59ms`、Asset 总计 `1560.71ms` 全绿。实现头 `3eb8f35` 的 PR #114 Windows run `33395026116` / job `99497387582` 用时 `12m31s` 绿色。E4 矩阵已收敛为 `完整 6 / 阻断 1`，唯一接续点为 N52-E4f 390×844 E4c cold production 复验与出口复审；
- E3a 提交前复审补回 Preview SHA-256 写前/读取校验与 Blob 篡改反例；最终本地完整门普通 `150/905`、N52 `58/58`、VM `24.48s`。实现头 `2f3e7b2` 已推送至 Draft PR #101，同头 Windows run `33188226007` / job `98906671499` 用时 `13m51s` 绿色：远端普通 `150/905`、N52 `58/58`、Runtime corpus `30.995s`、Route P95 `159.77ms`、Asset `3277.93ms`、build/architecture 均通过；
- 暂停点：治理提交 `568da54` 已推送至 Draft PR #97；run `33158924466` 在暂停快照时仍为 `in_progress`，N52 产品代码为零改动；恢复时先收束治理同头 CI，再进入 E1；
- M1 纵向验收：**0/27 完整通过**；
- GitHub 集成：**N00–N41 集中 Authority 仍在 main-target Draft PR #61；后续开放链已延伸至 N52-E5e PR #121。当前 tip 完整包含 PR #1–#121 全部 head，新的 N52 main-target Draft PR #122 已成为聚合入口且候选头全门绿色；在维护者实际合并前，不得把堆叠 PR、聚合 PR 或本地/远端绿门换算为 main 已集成**。
- N50-E3 由 Draft PR #86 承载；Windows / Node 22 run `33038517971` / job `98406610224` 用时 `11m23s` 绿色，普通回归 `140/796`，Route P95 `138.75ms`，两个本机长链性能首红项远端为 `311.47/260.58ms <500ms`。这仍不等于 `main` 已集成或 Product Acceptance 通过。
- N50-E4 由 Draft PR #87 承载；实现头 `3901da4` 的 Windows / Node 22 run `33041221691` / job `98415037714` 用时 `9m6s` 绿色，普通回归 `141/801`、N50 `19/19`、VM `5/5`、autosave `2.703s`，Route P95 `112.88ms <500ms`。这只关闭 E4 Engineering，不等于实体输入设备、`main` 集成或 Product Acceptance 通过。
- N50-E5 由 Draft PR #88 承载；实现头 `8137784` 的 Windows / Node 22 run `33043581781` / job `98422396914` 用时 `11m58s` 绿色，普通回归 `141/804`、N50 `22/22`、VM `67.313s <90s`、autosave `4.153s`、Route P95 `133.25ms <500ms`。这只关闭 E5 Engineering，不等于 Windows/Android 正式宿主、`main` 集成或 Product Acceptance 通过。
- N50-E6 由 Draft PR #89 承载；实现头 `001a92f` 与最终头 `6580b34` 的 Windows / Node 22 完整门均绿色。普通回归 `142/808`、N50 `26/26`、VM `53.581s <90s`、Route P95 `122.31ms <500ms`。范围消歧后 N50 Engineering 通过，但 `main` 未集成、三宿主 Product Acceptance 仍失败。
- N50→N51 治理由 Draft PR #90 承载；治理实现头 `649fc08` 的 Windows / Node 22 完整门 run `33050123723` / job `98443305419` 用时 `12m14s` 绿色，普通回归 `142/808`、VM corpus `68.403s <90s`、Route P95 `146.72ms <500ms`。这只关闭 N51 Engineering 准入检查点，不表示 N51 功能已经实现。
- N51-E1 由 Draft PR #91 承载；实现头 `963ee1b` 建立 23 字段 portable typed core，default/project/platform 继承、来源、reset、严格解析和序列化专门门 `12/12`。本机完整门普通 `143/820`、VM `69.80s <90s`、Route P95 `122.07ms <500ms`；远端 run `33053868990` / job `98455699350` 用时 `12m9s` 绿色，VM `64.544s`、Route P95 `129.30ms`。E1 Engineering 关闭，不等于完整 N51 或 Product Acceptance。
- N51-E2 已实现 23 字段 runtime-frozen catalog、Basic `16`/Advanced `23`、双语/NFKC 搜索和原子 editing service；本机最终完整门普通 `144/832`、N51 `24/24`，修改前同切片 VM 精确计时 `53.33s <90s`，最终代码第二轮同预算门通过；证据复核 Route P95 `223.74ms <500ms`、Asset dicing `3458.41ms <5000ms`。实现头 `e4fa4b5` 的 Draft PR #92 Windows / Node 22 run `33058884556` / job `98472432704` 用时 `11m28s` 绿色，普通 `144/832`、VM `66.876s <90s`、Route P95 `134.46ms <500ms`、Asset dicing `3374.89ms <5000ms`；E2 Engineering 关闭。
- N51-E3 已把 typed settings 接入 Canonical Project 文件、Project Service ChangeSet 与 Undo/Redo；缺文件/精确空旧 v1 可升级，非空旧数据、损坏和 future schema 失败关闭；Node Directory 与 Web IndexedDB 保存重开、stale writer 和字节保持已通过。本地完整门普通 `145/841`、N51 `43/43`、Compiler `29/29`、VM `27.14s`、Route P95 `70.68ms`、Asset dicing `2122.83ms`；实现头 `8bae1b8` 的 Draft PR #93 Windows / Node 22 run `33088005806` / job `98572871025` 用时 `11m42s` 绿色，远端普通 `145/841`、N51 `43/43`、Compiler `29/29`、VM `63.76s <90s`、Route P95 `148.65ms <500ms`、Asset dicing `3382.11ms <5000ms`。E3 Engineering 关闭。
- N51-E4 已提供现代 Settings UI：Basic 16 / Advanced 23、NFKC 搜索、五分区、项目/Windows/Web/Android、来源与覆盖、原子 ChangeSet、恢复、Undo/Redo 和完整 Canonical 保存桥。真实 UI→IndexedDB→Lifecycle 重开通过；冷 production browser 在 1440×900 与 390×844 完成保存重开、16:9、触控 ≥44px、overflow 0、focus/reduced-motion 和 console 0。首次 36px 恢复按钮、10px 顶栏溢出与固定返回按钮遮挡均按实际纠正。本地完整门普通 `147/847`、N51 `49/49`、VM `27.09s`、Route P95 `60.06ms`、Asset dicing `1745.71ms` 全绿；实现头 `9828208` 的 Draft PR #94 Windows / Node 22 run `33093375273` / job `98591846616` 用时 `12m39s` 绿色，远端普通 `147/847`、N51 `49/49`、VM `27.68s`、Route P95 `153.19ms`、Asset dicing `3310.15ms`。E4 Engineering 关闭。
- N51-E5 新增唯一 portable settings application v1，Editor Preview 与正式 Player Core/Host 共用平台解析、显示/DPR、文字时长、六类音量、voice ducking 与四类推进输入；纠正了 settings 纳入 canonical hash 后会错误重置 Player Core 的偏移。23 项 v1 设置均可 Host 热应用，剧情内容变化仍重建 Core。保存重开、平台差异、pointer/touch、keyboard/gamepad、allow-hold、实际 voice wait 与音量均有测试；冷 Player production browser 在 1440×900 热切 16:9→9:16 时保持 `presenting` 与对白，pointer 关闭后拒绝推进，390×844 stage `390×693`、overflow 0、console 0。本地完整门普通 `149/856`、N51 `69/69`、Player/Core `31/31`、VM `30.38s`、Route P95 `57.55ms`、Asset dicing `1544.16ms` 全绿；实现头 `c018602` 的 Draft PR #95 Windows / Node 22 run `33097845390` / job `98607353801` 用时 `12m47s` 绿色，远端普通 `149/856`、N51 `69/69`、Player/Core `31/31`、VM `66.13s`、Route P95 `143.09ms`、Asset dicing `3280.23ms`。E5 Engineering 关闭；正式 Windows/Android Host 和完整 P0 仍阻断。
- N51-E6 入口审计已把规格 2.1–2.9 与真实 23 字段、严格 v1 parser、Catalog controls、Canonical Project、Editor Preview 和 Player application 逐项比较。首次实际发现两项不能直接编码的差异：原始范围中播放控制、本地化生产、自动附加页和构建发布分别归 N52/N61/N62/N80–N83；严格 v1 旧读取器会拒绝新增 unknown field，不能在同一 schemaVersion 下静默扩字段。入口提交 `ec35570` 的 Draft PR #96 Windows / Node 22 完整门 run `33133914830` / job `98729511942` 用时 `12m5s` 绿色：autosave `3.744s <5s`、VM `64.00s <90s`、普通 `149/856`、Route P95 `133.34ms`、Asset dicing `3255ms`，关闭本机负载差异。下一代码切片冻结为 v1→v2 默认升级、确定性 round-trip、future schema 拒绝、Node/IndexedDB 保存重开和 settings-only Core 保持；字段实现尚未开始，详见[#229](229-n51-e6-p0-gap-matrix-and-entry-audit.md)。
- N51-E6a 已把 Settings 当前写入版本提升为 v2，合法 v1/v2 经同一严格校验后统一为 v2，v3+ 失败关闭。首次冻结测试为 5 files / 52 tests，实际 45 通过、7 项按预期因旧 parser 失败；修正后 52/52，N51 聚合门 10 files / 74 tests。真实 Node 临时目录与 IndexedDB 均验证非空 v1 打开、保存、重开和二次字节幂等；Player 验证 schema-only 迁移保持活跃 choice Core。类型门首次发现只读测试夹具写入并改为复制注入后通过。完整门和同头远端证据待补，详见[#230](230-n51-e6a-settings-schema-v2-migration-audit.md)。
- E6a 本机完整门首次因旧 Compiler Build ID Golden 停止，修正后 29/29；第二次从头运行在 N41 长链累积负载下出现 3 个 5s/10s 超时，两个受影响文件原门限隔离复跑 16/16。后半门中普通回归的 4 个 source identity Golden 已按“语义不变、身份更新”冻结，2 个 Preview 超时连同身份项隔离复测 3 files / 22 tests 全绿；Build、architecture、Script 13/13、Route 9/9（P95 `194.16ms`）、Asset 4/4（Dicing `3313.33ms`）均通过。单次本机完整门仍不记绿，等待同头 Windows / Node 22 裁决。
- 实现头 `1b21508` 的 Draft PR #96 Windows / Node 22 完整门 run `33136866897` / job `98738665580` 用时 `11m50s` 并绿色：普通 `149/861`、N51 `74/74`、Player/Core `32/32`、Runtime corpus `27.946s`、autosave `3.642s <5s`、VM `63.71s <90s`、Route P95 `130.55ms <500ms`、Asset dicing `3363.87ms <5000ms`。相同规模和预算关闭本机累积负载差异，E6a Engineering 关闭；N51 Product Acceptance 与 E6b+ 仍未完成。
- N51-E6b 新增 `text.revealMode/lineHeight/letterSpacingEm` 与 `accessibility.highContrast/reduceMotion/reduceFlashing`，Settings 当前写入 schema 提升为 v3，Catalog 达到 Basic `20` / Advanced `29`。冻结 6 files / 57 tests 首次实际为 47 通过、10 项按预期暴露旧 v2/parser/catalog/application 缺口；修正后 N51 聚合 10 files / 80 tests。编译器 Golden 首次只改变四个 Build ID，四个 Story IR Hash 不变；正式 Preview 的路线、结局、定位和 History 等价断言保持。冷 Editor production browser 完成 Web Audio+Accessibility 两个分区 ChangeSet `r1→r2`、IndexedDB 保存重开、高对比计算样式，Basic 20；冷 Player production browser 在活跃对白中热应用即时显示、2.0 行高、0.08em 字距、高对比、0.01ms 减动效和 dissolve→fade，Core/对白保持，1440×900 与 390×844 overflow 0、console 0。完整门与同头 CI 尚待本切片后续补证，详见[#231](231-n51-e6b-text-accessibility-entry-contract.md)。
- E6b 首次本机完整门在通过前序治理、Compiler/Runtime/corpus 与 N41 多项门后，既有 `App.test.tsx` 2/45 项于累计负载下超过冻结 5s；未修改 timeout，原命令隔离复跑整个文件 45/45。该次完整门保持红色，等待第二次从头运行与同头 Windows / Node 22 裁决。
- E6b 第二次本机完整门穿过 App 红点并通过普通回归 `149/867`、N51 `80/80`、Player/Core `32/32`、autosave，但固定重型 VM corpus 为 `95.93s > 90s`；原命令隔离复跑 `5/5`、`70.84s <90s`。后续 17 workspace build、architecture 100/4、Script `13/13`、Route `9/9`（P95 `111.15ms`）、Asset `4/4`（dicing `2344.23ms`）通过。预算未放宽，本机仍不记单次完整门绿色，等待同头 Windows / Node 22 裁决。
- E6b 实现头 `7d8bac1` 的 Draft PR #96 Windows / Node 22 完整门 run `33140441747` / job `98749884222` 用时 `12m33s` 绿色：普通 `149/867`、N51 `80/80`、Player/Core `32/32`、autosave `4.041s <5s`、VM `65.67s <90s`、Runtime shard `30.222s`、Route P95 `157.41ms`、Asset dicing `3246.27ms`。同规模同预算关闭本机累积负载差异，E6b Engineering 关闭；N51 Product Acceptance 和 E6c+ 仍未完成。
- N51-E6c 新增 `stage.defaultDurationMilliseconds/defaultEasing` 与 `audio.resumeAfterInterruption`，Settings 当前写入 schema v4，Catalog 达到 Basic `21` / Advanced `32`。冻结 9 files / 82 tests 首次实际 68 通过、14 项准确暴露旧 schema/catalog/Preview/Player 缺口；首轮修正后 81/82，旧 300ms fallback 按统一 360ms 契约纠正；代码复审再补 Canvas easing 真实执行反例，最终 83/83；N51 聚合 10 files / 87 tests。四个 Build ID 更新而 Story IR Hash 完全不变。冷 Editor production browser实际编辑 Web master+resume 两字段、保存 `s1`、释放并重开恢复；冷 Player production browser 热应用 `360/linear/true → 720/ease-out/false` 且活跃对白/Core 保持。双端 1440×900/390×844 overflow 0、console 0。首次全门另暴露 6 个 source identity 并修正，第二次全门仅既有 App 5s 累积负载超时；预算未放宽，等待同头 CI 裁决，详见[#232](232-n51-e6c-stage-audio-default-policy-contract.md)。
- E6c 实现头 `3a1cbed` 的 Draft PR #96 Windows / Node 22 完整门 run `33143471100` / job `98759295354` 用时 `12m33s` 绿色：普通 `149/876`、App `45/45`、N50 `34/34`、N51 `87/87`、autosave `1/1`（`5.095s`）、VM `65.93s <90s`、Route P95 `132.69ms`、Asset dicing `3272ms`。同规模同预算关闭本机累积负载差异，E6c Engineering 关闭；N51 Product Acceptance、N52 与 E6d+ 仍未完成。
- N51-E6d 把 Choice 编号/响应式布局与 UI 默认 Textbox/输入提示贯通 schema v5、Catalog、Canonical、Editor 与 Player；Advanced 36 / Basic 23。首次 79/88，修正扩展后 101/101；双 production browser 验证保存重开、同 Core、桌面/移动布局与 ADV→bubble。实现头 `6d99928` 的 Windows 完整门 run `33147113913` 绿色，E6d Engineering 关闭。
- N51-E6e 冻结 Settings/Runtime/Compiler Profile 所有权，WebPlayerHost 类型与运行时固定为 Web，嵌入观察值公开 `settingsPlatform: web`。首次 22/24，修正后 24/24；Chrome 151 production 9/9 快照为 Web。实现头 `b7d7c5c` 的 Windows 完整门 run `33151182320` 用时 13m01s 绿色，E6e Engineering 关闭。
- N51-E6f 新增机器可读出口合同与根级审计，逐项核验 schema v5、36/23、application v1、Web Host、双 production evidence 和 N52/N61/N62/N70–N72/N80–N83 所有权。首次代码事实全部通过，仅 5 项权威文档状态滞后；实现头 `40c14a4` 的 Windows / Node 22 完整门 run `33155226168` / job `98796294530` 用时 `14m18s` 绿色：普通 `149/886`、N51 `95/95`、Autosave `4.788s < 5s`、VM `69.85s < 90s`、Route P95 `186.04ms < 500ms`、Asset dicing `3323.81ms < 5000ms`。N51 Engineering 关闭；N51 Product Acceptance、AC-19、REQ-GAL、N52+、M1 Stable 与 Public Release 继续阻断。

最新 E8n 远端证据为 `product-baseline` run `32684809412` / job `97307842092`，Windows / Node 22 用时 `4m56s`，实现头 `7857ca9` 全绿；本机冻结 VM 因当前资源负载为 `102.1s >90s`，预算未放宽，远端同门为 `61.81s`。

## 2. 当前真实能力

| 能力 | 当前可用 | 仍缺 |
|---|---|---|
| Project | Canonical 工程、新建/打开/最近、保存恢复、确定性 ZIP、无账户本地工作 | Android SAF、正式双端壳与设备验收 |
| Story | P0 语言、正式 Sequence/Script、Compiler IR/Source Map；Sequence 已有全部 P0 插入、类型化 Inspector、搜索/复制/移动/批量/折叠、跨视图定位与 Formal Runtime statement 高亮；1,000 次全 P0 Sequence/Script 互改和 84 项退出矩阵已通过；N40/N41 Engineering 出口均通过 | N21/N23 真人、N40/N41 Product Acceptance、完整 Stage/Player 仍阻断；Route-first lazy 控制流是后续大型工程增强，不是 N41 出口缺口 |
| Preview / Debugger | N60 Engineering 已关闭：Entry/Scene/Statement Fresh Run、观察器、多断点、六类停止原因、Watch/变量来源、五类 P0 QA Golden/筛选/源码返回，以及有理由、可恢复、随工程保存的诊断抑制 | N60 Product Acceptance、正式 Player Adapter 与 Editor↔Player 画面 Golden；路径回放、Solver、覆盖率、变量图等为 P1 |
| Stage/Media | Editor 既有 16:9/真实 Blob/Canvas/路径/Camera/转场/模板；N50-E3 已增加同源结构差分、slot/bus channel、左右角色+BGM/Voice 实测与缺资源显式恢复 | 像素级视觉矩阵、SFX/Ambient/UI、视频、网络/超时/损坏策略、三端媒体策略 |
| Runtime | VM-01–VM-15 正式 portable Runtime；共享 presentation Host；State/History/Save/Back/Forward/调度/诊断；Effect 默认 channel 已按 slot/bus 隔离 | 完整媒体故障策略、玩家控制 UI 与三端一致性 |
| Player/Build | N50 portable Core/媒体/输入/lifecycle/embed；N51 Settings；N52 已完成 History/Save/Auto/Skip；N62-E1–E5 已完成自动附加内容摘要、Gallery/Ending、Music、隔离 Replay，以及作者标题/排序/封面/剧透/本地化稀疏覆盖 | 玩家 Route、画廊差分/自定义解锁、真实 Windows/Android compositor、真实强杀、正式宿主、真人 Product Acceptance 与发布材料仍缺 |
| Optimization | Production 已接入真实资源检查、血缘、Dicing 候选、Atlas/Loader/内存/剧情预测/资源编译流水线；资源表与手机状态卡可见 | 正式 Optimization Center、平台变体、真机收益报告、构建联合预算和包体闭环 |
| Localization | Production 已按稳定文本 ID/基础 Asset ID 管理语言文本、Voice 和图片/视频变体，支持五种文本状态、三种媒体审阅状态、CSV/XLSX、保存重开；正式 Web Player 可即时切换文本/媒体并回退 | 同一 E6 Canonical 到 Compiler/Player 的纵向交付复验、E4 移动 CJK 排版证据、Windows/Android Host 与三端 Product Acceptance |

N43-E2 增加 Beginner/Pro 可逆披露：Beginner 只展示 3 个任务模式与 Sequence，收起复杂轨道/搜索/批量工具但不卸载；Pro 恢复 7 个模式身份、3 个编辑视图和全部专业工具。真实 Chrome 在 Beginner 修改 `stmt_rooftop_001` 为 r1、切回 Pro、保留已开 Script、保存 s2 并整页重开后零漂移；390px Preview `352×198`、横溢出 0。Production、Debug & QA、Mobile Focus 继续禁用。详见[#205](205-n43-e2-progressive-disclosure-audit.md)。

N43-E3 增加完整/简化/静止三级动效与系统 reduce 优先级；静止全局 computed animation/transition `0.01ms`，选择、焦点和诊断均有 ARIA/文字/符号。真实页面三级 P95 为 `12.30/12.20/6.20ms`，390px 请求下横溢出 0、Preview 精确 16:9、console 0。真实 OS 媒体设置与目标设备矩阵仍待 Product Acceptance。详见[#206](206-n43-e3-motion-state-semantics-audit.md)。

N43-E4 冻结七类键盘/指针触屏等价路径；真实浏览器对白提交 `r0→r1`，Sequence→Script/Preview layout commit `26.20ms <500ms`，stable ID 保持 `stmt_gate_001`。390×844 请求下实际 client 375，路线触控按钮首次仅 `32×29px`，已修正为 `44×44px`，X `648→624`、横溢出 0。N43 聚合门 `12 files / 70 tests`；本机全仓单链退出 0，普通回归 `134 files / 774 tests`，冻结 VM `54.33s <90s`。实现头远端 run `32929525731` / job `98058928262` 用时 `11m30s` 绿色，VM `67.15s`。Editor build CSS `111.08/20.48 kB`、JS 本地 `918.23/256.59 kB`、远端 `918.31/256.59 kB`，分包债保留。出口矩阵仍因三模式 disabled 与真人缺失失败。详见[#207](207-n43-e4-input-sync-and-exit-audit.md)。

N43-E5 开放 Production 的真实资源任务：中央区直接读取 Asset Index/Lifecycle/Dicing，显示四段生产流水线、下一动作和资源映射批量表；真实 N42 媒体工程为 `3` 资源、Index `r3`、`3/3` 检查通过、2 张 Dicing 候选。390px 首测桌面表仍需内部横向滚动，已改为六字段状态卡并隐藏无关视图栏；按钮 `351×48px`、文档 `375/375`。组合过滤、3 项真实流水线、Dicing 可用、console 0；保存 `s3→s4` 重开恢复 `production / media_background / 3/3`。当前 5/7，Debug & QA 与 Mobile Focus 仍 disabled。详见[#208](208-n43-e5-production-workspace-audit.md)。

N43-E6 开放 Debug & QA 的正式诊断任务：当前工程、草稿诊断、Compiler、Runtime 与 Source Map 形成单一检查链，错误草稿 fail closed，问题可返回同一 stable ID 修复。真实浏览器对 `stmt_gate_bg` 得到 0/0、Source Map ready、Runtime presenting；390px 主按钮 `351×48px`、定位按钮 `317×44px`、横溢出 0，保存 `s1` 后从 Recent 重开恢复 `debug-qa / stmt_gate_bg`，console 0。首次截图发现定位按钮浅色实心层级不符，修正后 computed 为紫色 `.09/.36` 描边。当前 6/7，仅 Mobile Focus disabled。详见[#209](209-n43-e6-debug-qa-workspace-audit.md)。

N43-E7 开放 Mobile Focus：项目对白按 stable ID 投影，中文 IME 组合期不提交，输入明确提交/放弃，未提交时锁住模式与前后句导航；fake-indexeddb 完成 `r0→r1→s1→释放租约→重开`。真实 390×844 浏览器首测 overflow 0、入口 48px，但模式滚动条和历史操作过密，收敛后 textarea `240.25px`、提交/放弃/前后句均 48px。七模式 Engineering 达到 7/7；响应式 Web 不等于 Android/N91。详见[#210](210-n43-e7-mobile-focus-and-engineering-exit-audit.md)。

E7 实现头 `3eff0d4` 的远端 Windows / Node 22 完整门 run `32943861705` / job `98100313426` 用时 `11m15s` 并绿色：普通回归 `137/780`、storage `1/1`、冻结 VM `65.596s <90s`；Route P95 `131.84ms <500ms`、Global Lazy Index `264.93ms <500ms`、Dicing `3370.61ms <5000ms`；Editor CSS `126.46/22.88 kB`、JS `937.07/261.38 kB`，大包债保持。

E6 实现头 `7c83ca5` 的远端 Windows / Node 22 完整门 run `32938398390` / job `98084137349` 用时 `9m31s` 并绿色：普通回归 `136/778`，冻结 VM `54.367s <90s`，Route P95 `125.24ms <500ms`，Lazy Index `222.61ms <500ms`；Editor CSS `121.79/22.05 kB`、JS `931.75/259.72 kB`，大包债保持。

E5 本机第二次完整门退出 0：普通回归 `135 files / 776 tests`，N43 `14/73`，storage `1/1`，冻结 VM `70.20s <90s`，14 workspace、架构和 Script/Route/Asset 性能均绿；Editor CSS `116.98/21.44 kB`、JS `925.46/258.19 kB`。首次完整门仅一个既有 Stage 测试在累积负载下 `6.21s >5s`，保持预算后原样复跑 `2.68s`、第二次全门通过；没有隐藏该差异或放宽 timeout。

Draft PR #80 实现头 `afc095d` 的 Windows / Node 22 完整门 run `32933485910` / job `98070145468` 用时 `11m37s` 并绿色：普通回归 `135/776`，冻结 VM `72.77s <90s`，Route P95 `135.91ms <500ms`；Editor CSS `116.98/21.44 kB`、JS `925.54/258.17 kB`，大包债保持。

## 3. N32-E1–E6 证据与差异

| 检查 | 预期 | 实际 | 判定 |
|---|---|---|---|
| 定向 Editor | 正式流程与旧兼容均不回归 | 4 files / 40 tests | 通过 |
| 双路线 State | 路线/Source Map/Hash 固定 | N51-E6c source identity 后：广播室 `b9f122e8…e2fc4`；天台 `5a7da5a5…7a861` | 通过 |
| 编译失败 | fail closed，不回退 | `MISSING_LABEL` | 通过 |
| 生产浏览器 | 两路线正确 Ending、console 0 error | 入口至 Choice 3 次 Continue；两分支各 2 次；两个结局正确；0 error | 通过 |
| 工作区/架构/风险/需求 | 当前节点 N32 且不越权 | 四项审计 PASS；RA-N21-004 唯一 active | 通过 |
| Runtime 10k | 10,000 seeds / 20,000 replays / 40 chunks / 原 digest；单 shard ≤90 秒 | Windows / Node 22 总墙钟 30.868 秒；shard 26.558–27.107 秒；digest `20e9a842…92ef2` | 通过；未减 corpus、未改 digest、未放宽门 |
| GitHub CI | 纠偏实现头 Windows / Node 22 完整门绿色 | Draft PR #52，run `32457615078` / job `96697835514`，4 分 8 秒 | 通过 |
| Editor production build | 成功并报告体积 | 682.24 kB，gzip 196.33 kB，仍有 >500 kB warning | 构建通过，体积未达优化目标 |
| E2 定向 | 观察契约、结构化负例和 UI 回归 | 2 files / 6 tests | 通过 |
| E2 生产浏览器 | r1/r4 位置、真实变量、console 0 error | `direction #0`→`choice #3`；产品 UI 新增 Number 后显示 2；0 error | 通过 |
| E2 本机全仓 | 普通回归全绿；串行 autosave ≤5 秒 | 98 files / 592 tests 通过；autosave 约 23.10 秒仍“保存中…” | 功能通过；已知主机负载差异保留给远端裁决 |
| E2 production build | 成功并报告增量 | 692.05 kB，gzip 198.42 kB；较 E1 约 +9.7/+2.1 kB | 构建通过，拆包债保留 |
| E2 GitHub CI | Windows / Node 22 完整门绿色 | Draft PR #53，run `32459445287` / job `96703241983`，4 分 16 秒；autosave 3.086 秒 | 通过；本机负载差异关闭 |
| E3 定向 | 精确目标、Fresh State、结构化负例和 UI 路径 | 2 files / 9 tests；N51-E6c source identity 后 Scene Hash `869bd36b…b951e`；Statement Hash `719d1729…5fdda` | 通过 |
| E3 全仓与构建 | 普通回归、串行 storage、审计和 production build 通过 | 98 files / 595 tests；storage 1/1；JS 694.55 kB / gzip 199.03 kB | 通过；>500 kB 拆包债保留 |
| E3 生产浏览器 | Scene/Statement 精确位置、同目标重启、console 0 error | `stmt_radio_bg #0`、`stmt_radio_001 #1`；结局后重启仍为 `#1`；`[]` | 通过 |
| E3 GitHub CI | Windows / Node 22 完整门绿色 | Draft PR #54，run `32461345815` / job `96708731870`，4 分 16 秒；98/595；autosave 3.049 秒；Runtime corpus 32.593 秒 | 通过；E3 Engineering 关闭 |
| E4 定向 | History/Scheduler 控制、内部光标、调用栈、阻断和 fork | 2 files / 14 tests；N51-E6c source identity 后 History Hash `184f619b…17266` | 通过 |
| E4 本机全仓 | 普通回归、串行 storage、审计和 production build | 98 files / 600 tests；storage 1/1（5.18 秒）；JS 721.30/205.42 kB | 通过；拆包债扩大并保留 |
| E4 生产浏览器 | Cursor/Back/Forward/Choice/fork/布局/console | h2/2 transient；h1/2↔h2/2；Choice h3/3→h4/4；route fork h5/5；352×46；`[]` | 通过 |
| E4 GitHub CI | Windows / Node 22 完整门绿色 | Draft PR #55，run `32464584207` / job `96718382563`，4 分 15 秒；98/600；autosave 2.961 秒；Runtime corpus 30.334 秒 | 通过；E4 Engineering 关闭 |
| E5 定向 | Host intent、awaited/cancel、Barrier、checkpoint/compensation/replay 与产品按钮 | 3 files / 21 tests | 通过 |
| E5 本机完整门 | 治理、普通/存储/重型 VM、12 workspace、架构与性能 | 99 files / 607 tests；storage 1/1；VM 5/5；Runtime corpus 26.938 秒；85 portable / 4 adapters | 通过 |
| E5 production build | awaited/Barrier 决策与 Back/Forward channel 实际值 | awaited `true→false / last cancel`；Barrier `true→false / last execute`；Back `1→0 active`；Forward `0→1 / last replay` | 通过；首测 pure channel 残留已修正 |
| E5 production 体积 | 成功并报告增量 | CSS 78.38/14.99 kB；JS 727.60/206.71 kB | 构建通过；>500 kB 拆包债保留 |
| E5 GitHub CI | Windows / Node 22 完整门绿色 | Draft PR #56，run `32467211148` / job `96726246321`，4 分 9 秒；99/607；autosave 2.855 秒；Runtime corpus 28.603 秒 | 通过；E5 Engineering 关闭 |
| E6 定向 | 安全迁移、rewound future、结构/编译/transient/Effect 反例与产品路径 | 4 files / 25 tests | 通过 |
| E6 production browser | 文案更新保持状态；语义变化保留旧会话；仅明确操作后重启 | `h4/4`→安全更新仍 `h4/4` 且新 prompt/label 可见；结构更新仍 `h4/4` 并显示 `OLD SESSION PRESERVED`；重启后 `h1/1` | 通过；与预期零差异 |
| E6 本机普通/存储/构建 | 新功能全回归；真实 IndexedDB；12 workspace 可构建 | 100 files / 611 tests；storage 1/1；CSS 79.65/15.18 kB；JS 734.30/208.23 kB；架构与 Script 性能通过 | 功能通过；>500 kB 拆包债保留 |
| E6 本机冻结性能 | 既有 Spike 10k ≤90 秒；Dicing 3s/3s/5s | Node 25 Spike 实际约 180.5 秒；Dicing 两次分别 3.35+3.21=6.56 秒、2.36+4.13=6.49 秒 | 本机完整门红；不改规模/digest/预算，等待 Windows / Node 22 裁决 |
| E6 GitHub CI | Windows / Node 22 完整门裁决本机性能差异 | Draft PR #57，run `32470326283` / job `96735561264`，4 分 20 秒；100/611；autosave 1/1；VM 5/5（68.68 秒）；Runtime corpus 30.635 秒；Dicing 1.47/1.78/3.25 秒 | 通过；本机环境差异关闭，E6 Engineering 关闭 |
| E6 时点 N32 出口审计 | 6 项 Implementation 与跨宿主 Acceptance 全对齐 | 当时为 5 项完整；共享 Host 未实现；现有单文件 Web 候选仍直接解释 StoryStatement | 历史判定保留；由下方 E7 后复审取代当前状态 |
| E7 定向与 Benchmark | 共享 Host 正反例；正式 Compiler/Runtime 两路线到结局 | Host/Editor `3 files / 22 tests`；Benchmark/adapter `2 files / 6 tests`；两结局正确 | 通过；首测发现旧 Direction 与缺失变量后已纠偏 |
| E7 本机完整门 | 治理、Runtime corpus、常规/存储/重型 VM、13 workspace、架构/性能 | `npm run check` 退出码 0；100 files/617 tests；storage 1/1；VM 5/5；88 portable / 4 adapters | 通过 |
| E7 Worker production | Node↔浏览器 Host receipt/hash 零差异 | `data-status/runtime/runtime-host=passed`；console `[]` | 通过；测试宿主不是 Player |
| E7 Editor production | 五分钟工程两路线、History 与错误日志 | 16 Continue 到分支；两路线各 14 Continue 到正确结局；Back/Forward 回到同一结局；console `[]` | 通过 |
| E7 GitHub CI | 干净 Windows / Node 22 完整门验证实现头 | Draft PR #58，提交 `c93514e`，run `32505981631` / job `96846121361`，4 分 16 秒；locked install 与 full check 均成功 | 通过；此前 `dist` 入口红灯的真实根因已关闭 |
| E7 后出口复审 | Implementation 6/6 且 Acceptance 1/1 | `完整 5 / 部分 1 / 未对齐 0`；Acceptance `0/1` | 总出口失败；正式 Player/视觉差分仍缺 |

## 4. 需求方向审计

方向没有偏离已冻结产品目标：正式 Compiler/Runtime 取代产品平行解释器，是后续专业 Debugger、路线状态、Save/Back/Forward、三端一致性和商业级 QA 的必要基础。E6 的安全迁移严格由新 IR 重放和语义快照裁决，没有为了“看起来实时”直接改 State 或静默重启。现代化 UI、图形化编辑、多彩表达、16:9 默认预览及可调尺寸仍保留。

需要防止五类偏移：

1. 不得让旧 `playable-preview-runtime.ts` 重新成为 Editor 完整流程权威；
2. 不得把安全文案热更新扩大成任意 IR/State 原地修改，也不得把 Editor Host receipt 冒充共享 Player Host；
3. 不得用 jsdom 或代理浏览器替代 N21/N23 真人任务；
4. 不得因生产构建成功就宣称包体优化、正式 Player 或三端发布完成。
5. 不得把 `playable-web-export.ts` 的独立解释器或其自测冒充正式 Runtime Web Player 与跨宿主差分证据。

## 5. 后续开发原则

1. **功能优先**：先交付用户可见、可操作的纵向功能，不把新增审计、测试数量或安全论证当成功能进展；只保留能防止本次真实回归、保护核心数据或满足发布合同所必需的最小测试与审计。
2. **用户场景先行**：开发前先写清目标用户、使用时机、入口、连续操作、预期反馈、失败后的恢复方式；UI 与领域结构均围绕这条实际任务设计，而不是围绕现有模块方便实现。
3. **真实差异驱动**：必要测试必须比较预期和当前实际，并据差异修正；不为覆盖率数字重复同一事实，不在功能和整体 UI 完成前提前拉真人计时验收。
4. **完成即收束**：功能完成后只做需求对齐、必要回归、文档更新与推送；没有实际用户风险时，不追加新的审查层级。

## 6. 下一步顺序

本节原顺序已由[新路线 #289](289-user-centered-delivery-route.md)取代；下面只保留历史交接记录，不能据此优先开发玩家路线图或再次请求 N80-E1 许可。

1. 从 `origin/codex/n60-e1-debugger-session` 最新 tip 接续，先阅读[N62-E5 审计 #288](288-n62-e5-authored-catalog-presentation-audit.md)，并核验本地/远端 exact head 相同、工作区干净；
2. N61 Engineering 与 N62-E1 已关闭，不重复增加本地化或摘要证明；N61 Product Acceptance 等 Windows/Android 正式 Host 和实体设备；
3. N62-E5 exact-head CI 已记录并关闭；下一功能切片为只显示玩家实际发现内容的自动 Route；
4. 下一步先审计 `@world-studio/route-graph`、Compiler 可达事实、Runtime Meta 和 Player Additional Content 的现有代码，冻结已发现节点/边的唯一权威来源；N62 总出口按原路线保留，Shell 继续禁止维护第二份路线图；
5. 当前 RA-N21-011 已准入到 N62 Engineering，并于 2026-09-27 16:00（UTC+8）到期；N62 Product Acceptance、N70 Engineering、真人门和全部发布状态不变。
