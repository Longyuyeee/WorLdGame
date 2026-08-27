# N50-E3 Editor/Player Media Parity、Multi-channel 与恢复审计

> 日期：2026-08-27
> 分支：`codex/n50-e3-player-media-parity`
> 基线：N50-E2 最终头 `161fb93`
> 授权：`RA-N21-009`，仅 N50 Engineering
> 当前判定：实现、定向自动化、production-browser 与本机完整功能/构建门通过；长链末端首次性能红值已由停止负载后的原样复跑关闭，等待远端 Windows / Node 22 最终裁决。N50 Product Acceptance、N51+、Android 实体包、M1 与发布继续阻断

## 1. 本步冻结目标与非目标

E3 只关闭 E2 明确留下的三个相邻缺口：同一 Media Golden 在 Editor Stage 与正式 Player Stage 的结构差分、多角色/多音频 channel 语义、媒体缺失后的显式恢复。它不进入 N51 Gal Settings，不实现 Save/History/Auto/Skip/Back UI，不建设 Web/Windows/Android 发布宿主，也不把自动化或开发浏览器登记为真人 Product Acceptance。

结构 parity 比较的是两个 adapter 对同一正式 Compiler/Runtime 事实的解释，而不是强迫 Editor DOM 与 Player DOM 共用组件。冻结字段包括 background、character transform/anchor/z、audio bus/loop/volume/status、camera 与 textbox；这能发现语义漂移，同时允许两个宿主保持各自布局与交互职责。

## 2. 实现事实

- Runtime 的默认 presentation channel 从笼统 `show` / `audio` 收敛为 `show.<slot>` / `audio.<bus>`；显式 `parameters.channel` 仍优先，因此同一时刻的左右角色和 BGM/Voice 不再相互覆盖。
- `show.move` 在已有 scene state 时补全 asset/expression，audio pause/resume 在已有 track 时补全 asset/loop/volume；Effect snapshot 在正常顺序播放中可独立被 Player adapter 消费。
- 保留 Editor 从任意 statement 开始正式预览的稀疏状态语义：若之前的 show 不在当前会话，move 仍可作为观察 Effect 存在，而不是制造假 Runtime 错误。
- Player presentation adapter 增加 rotation、anchorX、anchorY，并保留 paused audio，使 Editor/Player 对同一 transform 与音轨状态可精确比较。
- Player Shell 为资源 URL 变化建立稳定 media signature，解码错误不会跨资源版本残留；“重试媒体”会重挂载 image/audio、清空旧错误，并通过宿主回调重新提供资源。
- 新增 `?demo=multi` 与 `?demo=recovery` 两条真实媒体路线：前者同时呈现 left/right 与 bgm/voice，后者先故意缺失角色资源，再由用户明确重试恢复。

## 3. 冻结预期—首次实际—修正

| 检查 | 冻结预期 | 首次实际 | 修正 | 原样复测 |
|---|---|---|---|---|
| 多角色/音频 channel | 两个 slot 与两个 bus 同时保留 | 原 Runtime 默认 `show` / `audio` 会让后一个 Effect 覆盖前一个 | 默认 channel 带 slot/bus；显式 channel 不变 | parity test 冻结 `background/show.left/show.right/audio.bgm/audio.voice` |
| 任意 statement 预览 | Editor 可从 move statement 直接启动 | 初版要求 slot 必须已存在，N42 正式 Stage fixture 失败 | 去掉过严前置条件，只在 state 存在时补 payload | N42 `15 files / 151 tests`，App `45/45` |
| 媒体失败恢复 | 缺资源阻断；重试后解码并继续 | E2 只有错误和 disabled，无恢复入口 | generation remount + media signature + retry callback | `waiting-effect` → actor decoded → `presenting` |
| 手机恢复按钮 | 触控高度至少 44px | 390×844 实测 `74×34px` | min-height `34→44px` | `74×44px`，document `390/390` |
| Voice 采样 | 证明独立 bus 存在并加载 | 1.5 秒采样时短 Voice 已自然结束 | 不修改产品；把 decode/channel 与瞬时 playing 分开判定 | readyState 4、volume 0.8、loop false、channel 保留 |
| 本机长链性能 | 既有 N40 两项均 <500ms | 完整门末端为 `806.83ms` / `871.67ms` | 不改代码、规模、预算或断言；停止长链负载后原样隔离复跑 | `249.55ms` / `294.98ms`，Route `9/9`、Asset `4/4` |

完整原始数值见 [player-media-parity-recovery-browser.json](../evidence/n50/player-media-parity-recovery-browser.json)。

## 4. 同源差分与真实测试结果

- 新增 integration contract 由同一个 raw Media Golden 分别生成 Editor `PreviewStagePlan` 与 Player presentation snapshot，再对 background、character、audio、camera、textbox 做规范化后 exact equality；另以合成正式项目冻结两角色、两总线和五个 active channel。
- `audit:n50-player-core`：`3 files / 14 tests`，覆盖正式 Core、Shell、缺资源重试、多通道和 Editor↔Player parity。
- Runtime：`60/60`；冻结生成语料 `10000 seeds / 20000 replay / 40 chunks`，digest `20e9a842cd1e70b012d2307b37209f63192f4e463df7e15cf5beed8c5fc92ef2`，最终定向复测 `21.847s`。
- N42 Stage 回归：`15 files / 151 tests`，Editor App `45/45`；证明 channel 纠偏没有牺牲任意语句预览，并覆盖既有轨道 pause payload 的自包含补全。
- 全仓 typecheck 通过；Player production build：CSS `9.13/2.80 kB`、JS `299.65/95.23 kB`（raw/gzip）。相对 E2 的增量来自 parity/recovery/multi demo，不是 N80 发布包预算结论。
- 本机完整链的功能、治理、测试和构建阶段均通过：普通回归 `140 files / 796 tests`，Editor integration 全绿，真实 IndexedDB autosave 用例 `4.55s`，重型 VM `5/5`、测试 `59.81s`；16 个 workspace 均构建成功。Editor 仍有既存 >500kB 拆包债（JS `938.18/261.73 kB`），未把它解释为本轮新增或发布达标。
- 完整链末端 Route 核心 P95 `416.75ms <500ms`，但另外两个既有 N40 用例在累计负载下首次为 `806.83ms` / `871.67ms`。停止长链后不改任何实现和门槛原样复跑为 `249.55ms` / `294.98ms`，Route `9/9`、Asset `4/4`；首次差异保留，仍由远端干净环境裁决。
- 真实桌面 1280×720：Stage `1178×662`，ratio `1.77946`；左右角色均 decoded，z=10/20；BGM/Voice 均 readyState 4，实际音量 0.6/0.8；document `1280/1280`。
- 真实手机 390×844：恢复错误可见、document `390/390`；首测触控高度 34px，修正后 44px。Player 竖屏舞台按目标设备全屏呈现；Editor 默认 16:9 预览约束没有被改写。

## 5. 开发目标与需求对齐

E3 直接推进 REQ-STAGE、REQ-RUNTIME 与 AC-13：Editor 与 Player 已对同一 Media Golden 形成可执行的结构差分；角色 slot、BGM/Voice bus 不再因共享 channel 丢失；缺失媒体不再只能卡死，而是保持 fail closed 后由用户显式恢复。剧情执行仍只有 Compiler→Runtime→Host 一条权威链，没有复制 Player 解释器，方向与“专业内核 + 现代多彩 UI + 三端同源”一致。

本轮没有宣称像素级视觉完全一致：Editor 与 Player 布局职责不同，当前冻结的是结构/数值 parity。SFX/Ambient/UI 六类完整音频矩阵、视频、损坏/超时/网络策略、Android 生命周期与低内存恢复仍缺。Save/History/Settings、Auto/Skip/Back/Forward、Gallery、正式 Web/Windows/Android 宿主也均未进入本切片。

## 6. 下一步与阻断

远端 Windows / Node 22 完整门绿色后，E3 才能关闭。随后仍在 N50 内按顺序冻结 Player 输入/状态恢复的下一最小切片；进入 N51 必须另有治理授权。N21 `0/1`、N23 `0/2`、全部 Product Acceptance、Android 实体包、M1 Stable 与 Public Release 持续 fail closed。
