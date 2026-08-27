# N51-E5 Preview / Player Settings 热应用审计

> 日期：2026-08-28
> 分支：`codex/n51-e5-settings-runtime-application`
> 直接基线：N51-E4 最终头 `968a2f7`
> 实现与浏览器证据头：`b963c91`
> 授权：`RA-N21-010`，最大节点 N51
> 判定：Engineering 通过；Product Acceptance 仍阻断

## 1. 原始需求与实际代码结论

E5 继续服务 PRD 3.14、REQ-GAL 与 AC-19，目标是把 E1–E4 已提交的首批 23 项设置真正应用到现有 Editor Preview 和正式 Player Core/Host：显示、文本、推进、六类音量、语音压低与四类推进输入必须产生可观察效果，并验证恢复、平台差异、保存重开和桌面/390×844 冷 production browser。禁止建立第二 Runtime，也不得把 N52 的 Save/History/Auto/Skip/Back/Forward 提前带入。

实现前读取真实代码得到两个关键事实：

1. Editor 的正式 Preview 已有 Compiler→Runtime→Runtime Host 与兼容回放式 hot update，可以在不复制 Runtime 的前提下接收 settings；
2. Player Shell 原来以完整 `semanticHash(project)` 作为重建条件。由于 E3 已把 settings 纳入 canonical source identity，仅修改设置也会重建 Player Core 并丢失播放位置，这与 E5 热应用要求冲突。

本轮因此把 23 项 v1 settings 明确定义为 Host application policy：它们不改变 Story IR、Runtime State 或剧情 Outcome。Player 的活动 Core 仅在 settings 之外的 canonical 内容变化时重建；settings-only 更新保留当前 Core/游标并立即替换展示、音频和输入策略。活动 session 的 Compiler build identity 保持启动时事实，直到正常重启；没有伪造或改写 Runtime state。

## 2. 共享应用契约

新增 dependency-free `@world-studio/gal-settings` application v1，Editor 与 Player 只能通过同一契约消费 `resolveGalSettings(document, platform)`：

- display：设计宽高、方向、安全区、画质对应的 DPR 上限与舞台比例；
- text：Unicode 字符数 / CPS、标点停顿、最短显示时间、字体缩放和消息窗不透明度；
- advance：长按重复确认与实际 voice 播放结束门；
- audio：`source × master × bus`，voice 活跃时对 BGM/SFX/Ambient 应用 `1 - voiceDucking`，所有输出约束在浏览器 `[0,1]`；
- input：pointer、keyboard、touch、gamepad 四类确认输入分别门控；鼠标与触摸不再被统一误判为 click。

未知音频 bus 在 Host application 层按 SFX 安全降级；正式 Runtime effect、媒体 source volume 和 Core 状态均保持原权威。Player Shell 显式声明 portable settings 依赖，workspace boundary 白名单和 architecture gate 同步更新。

## 3. Editor Preview 与 Player 实际效果

Editor Preview：

- Web profile 的设计宽高热更新真实 design-pixel surface；portrait/landscape 与 ratio 随之变化；
- low/balanced/high 分别限制有效 DPR 为 1/1.5/4，仍受原 8192 surface 上限保护；
- `safeArea=none` 移除安全区，`system` 保留用户可见的安全区检查层；
- 字体缩放、消息窗不透明度和按实际文本计算的 reveal duration 进入真实 CSS；
- Preview `<audio>` 使用共享 gain，数据属性保留 source/applied volume 供审计；
- 正式试玩继续使用既有 hot-update replay，不建立平行解释器。

Player：

- 舞台用设计比例和视口高度共同约束，桌面与移动都保持逻辑宽高比；safe-area 与画质直接改变 CSS 呈现；
- 对白 reveal 使用共享时长；首次提前确认只完成显示，之后才允许推进；
- `allowHold=false` 拒绝键盘 repeat，开启后 repeat 可确认；
- voice 元素真实 `play/pause/ended` 控制等待门和 ducking，不用“存在 voice track”冒充正在播放；
- pointer/touch/keyboard/gamepad 的确认分别受当前 platform profile 门控，选择导航与 cancel/restart 不被错误当作 advance；
- settings-only rerender 保持正式 Core 的 title/choice/dialogue/ending 状态，剧情或工程内容变化仍 fail closed 到 fresh Core。

## 4. 预期—实际—纠偏

| 验证 | 冻结预期 | 首次实际 | 修正与复测 |
|---|---|---|---|
| Player 热应用 | 只改 settings 不重置剧情 | 完整 canonical hash 使 settings 改动回到标题 | 引入排除 settings 的 executable identity；choice/dialogue 中热切仍保持原 Core 状态与文本 |
| 单一映射 | Editor/Player 不各写一套规则 | 两端已有独立尺寸、CSS、音量和 input 处理 | 新增 portable application v1，双方只消费同一 resolved contract |
| 音量 | source、master、bus、ducking 都生效 | Player/Preview 原来只写 effect source volume | 两端写入实际 HTMLMediaElement volume；测试冻结 BGM `0.6 × default 0.8 = 0.48` 及 voice ducking |
| voice 等待 | 只等待真实播放中的 voice | 仅按 active effect 会在 ended 后继续阻断 | 以 audio `play/pause/ended` 驱动，ended 后恢复推进与背景增益 |
| 输入区分 | touch 与 pointer 可独立关闭 | React click 原来无法区分触摸 | pointerdown 记录实际 pointerType，确认时应用对应门；键盘/gamepad 独立验证 |
| 移动显示 | 9:16 设置在 390×844 实际呈现且 overflow 0 | 原移动 CSS 强制 `aspect-ratio:auto; min-height:100dvh`，会覆盖项目比例 | 舞台宽度同时受视口高度与设计比例约束；最终 `390×693`，比率 `0.5625` |
| 浏览器发现 | 冷生产脚本可复跑 | 首跑未包含本机 `AppData/Local/Google/Chrome/Bin`，在启动浏览器前失败 | 增加有界真实安装路径；随后连续两次完整交互 PASS |
| 完整门 | workspace 依赖治理同步 | 首跑 `audit:workspaces` 发现 Player 依赖白名单仍停留 N50 | 将 portable gal-settings 加入允许边界；从头重跑 `npm run check` 到最终性能项 PASS |

## 5. 自动化、保存重开与失败路径

- application contract：平台继承、Unicode/标点/最短时长、gain/ducking、输入门控；
- Player：settings-only 保持 Core、平台 profile、pointer/keyboard/touch/gamepad、allow-hold、voice wait、音量、canonical save→load→Player；
- Editor：Web profile 的 portrait、DPR、safe area、文本/音频/输入/推进实际投影；
- 既有 E3/E4 覆盖恢复继承、非法关联组合 fail closed、Undo/Redo、stale writer、IndexedDB/Node Directory 保存重开；E5 没有绕开这些正式链路；
- N51 专门门为 `10 files / 69 tests`，Player/Core 门为 `5/31`；普通全仓为 `149/856`，Editor integration `8/54`，storage `1/1`。

## 6. 冷 production browser 证据

`npm run audit:n51-settings-runtime-browser` 对 Player production build 使用真实 Chrome `120.0.6099.225`：

- 1440×900 默认阶段：title 为 16:9，进入 Left route 后处于 `presenting`；
- 热应用 Web profile 后：仍为 `presenting`，对白仍是 `Guide / The quiet route.`；quality `high→low`、orientation `landscape→portrait`、aspect `1920/1080→1080/1920`、font scale `1→1.4`、opacity `0.88→0.45`；
- pointer `true→false` 后点击对白，status 和文本不变，`data-input-accepted=false`；
- 390×844：portrait stage `390×693`、ratio `0.5625`、document overflow `0`；console/runtime failures `[]`；
- 机器证据：`evidence/n51/settings-runtime-browser.json`；桌面截图 SHA-256 `76bddebf…e0ec9f`，移动 `bbb16e55…ed747c`。

## 7. 完整门与诚实边界

最终本地 `npm run check` 从头至尾 PASS：17 workspaces、50 requirements、全部治理与 goldens、Compiler `29/29`、Runtime `60/60` + 10k corpus `8.009s`、VM `5/5` / `30.38s`、100 portable / 4 Node adapters；Script `13/13`，Route `9/9` 且 edit P95 `57.55ms < 500ms`，Asset `4/4` 且 dicing `1544.16ms < 5000ms`。Editor build `972.07/272.56 kB`，Player `308.65/95.88 kB`；既有 Editor >500 kB warning 保留。

实现与审计头 `c018602` 的 Draft PR [#95](https://github.com/Longyuyeee/WorLdGame/pull/95) Windows / Node 22 完整门 run `33097845390` / job `98607353801` 用时 `12m47s`，PASS。远端普通回归 `149/856`、N51 `69/69`、Player/Core `31/31`、VM `66.13s < 90s`、Runtime corpus `31.491s`、Route edit P95 `143.09ms < 500ms`、Asset dicing `3280.23ms < 5000ms`；Editor `972.25/272.55 kB`、Player `308.65/95.88 kB`，均保持原门限。

E5 只关闭首批 23 项 settings 的 Engineering application，不等于 N51 或产品完成：

1. REQ-GAL/AC-19 剩余 P0 配置和附加页模板仍缺，唯一进入 N51-E6；
2. Windows/Android 正式 Host 尚未传入并实机验证对应 platform profile；浏览器只证明 Web，不能替代 Windows/Android 包或设备；
3. 真人、触屏/手柄实体设备、N51 Product Acceptance、M1 Stable 与发布仍失败关闭；
4. N52 Save/History/Auto/Skip/Back/Forward 未实现，也不得回流 N51；
5. 当前仍是 `0.0.0-s0.41` 工程阶段。

下一切片冻结为 N51-E6 完整 P0 覆盖与出口审计：先按原始 REQ-GAL/AC-19 对首批 23 项之外的字段逐项做 gap matrix，再按 catalog → parser → Canonical Project → UI → Preview/Player 建立追踪；继续沿用同一 application/Core/Host，不复制 Runtime，并保持 N52 边界。
