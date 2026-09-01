# N51-E6b Text / Accessibility 入口合同

> 日期：2026-08-28
> 分支：`codex/n51-e6-p0-coverage-exit`
> 直接基线：N51-E6a 最终绿色头 `cc05b4b`
> 授权：`RA-N21-010`，最大节点 N51
> 当前判定：实现头同头 Windows / Node 22 完整门绿色；E6b Engineering 关闭

## 1. 本切片目标

E6b 只补当前 Preview 与正式 Player Host 可以执行和观察的文字呈现/无障碍策略：

| 字段 | 默认值 | 层级 | 必须产生的实际效果 |
|---|---:|---|---|
| `text.revealMode` | `typewriter` | Basic | `instant` 时真实 reveal duration 为 0，首次输入不再只用于补全文本 |
| `text.lineHeight` | `1.75` | Advanced | Preview/Player 对白计算样式使用同一行高变量 |
| `text.letterSpacingEm` | `0` | Advanced | Preview/Player 对白计算样式使用同一字距变量 |
| `accessibility.highContrast` | `false` | Basic | Preview/Player 的消息窗、选择与焦点边界切换到可观察的高对比表面 |
| `accessibility.reduceMotion` | `false` | Basic | 文本 reveal 为 0，Player/Preview 的 CSS transition/animation 降为最短且不改变 Runtime Outcome |
| `accessibility.reduceFlashing` | `false` | Basic | dissolve 等可能高频视觉变化降级为 fade，并去除 dissolve filter |

总字段数由 23 增至 29，Basic 由 16 增至 20。Catalog、严格 parser、Project transaction、Settings UI、Preview application 和 Player application 必须一次贯通。

## 2. Schema 与迁移纪律

增加严格 section/field 会改变文档形状，因此当前写入版本必须从 v2 提升为 v3：

- 合法 v1/v2 加载后补默认值并统一写为 v3；
- v1/v2 文件携带任何 v3 新 section/field 必须 `UNKNOWN_FIELD`，不能伪装旧版本；
- 合法 v3 可覆盖 6 个新字段，v4+ 继续 `FUTURE_SCHEMA`；
- v1/v2 覆盖值、来源和二次保存字节幂等必须继续通过。

## 3. 停止边界

- 字幕时间轴、语音字幕映射、Ruby/CJK fallback 和字体资源引用仍属 N61/N70，不建立字符串占位字段；
- `reduceMotion`/`reduceFlashing` 只改变 Host 呈现，不改写 Story、Compiler IR、Runtime State 或剧情 Outcome；
- 不复制 N43 的 Editor 操作偏好；本切片字段属于作品的 portable Project settings；
- 不实现 Auto/Skip/History/Save/Back/Forward；这些仍唯一属于 N52。

## 4. 冻结测试方法

先写 parser/catalog/application、Settings UI、Editor Preview 和 Player 活跃 Core 测试，记录首次实际。实现后除单元/集成测试外，必须从冷 production build 启动真实 Chromium，在 1440×900 与 390×844 下测量 computed style、animation name/duration、Core 状态保持、横向溢出和 console error。任何预期差异必须修正或在退出审计中失败关闭，不能删断言或放宽预算。

## 5. 真实代码实现

- `@world-studio/gal-settings` 将当前写入版本提升为 v3，并保留版本感知的 v1/v2 历史字段白名单；六字段进入默认值、类型、严格解析、合并、来源、序列化与 Catalog。
- application v1 投影新增文本排版与 accessibility；`instant` 或 `reduceMotion` 都把 reveal duration 归零，未改变 Runtime State/Outcome。
- Settings Workspace 增加 Accessibility 分区；Editor Preview 与 Player Shell 使用同名 CSS variables/data attributes 应用行高、字距、高对比、减动效和降闪烁。
- Player settings demo 在活跃 Core 上热应用六字段；项目内容 identity 未变时不重建 Core。

## 6. 首次预期—实际—修正

| 检查 | 冻结预期 | 首次实际 | 修正与复测 |
|---|---|---|---|
| 6 files / 57 tests | 新字段与 v3 合同先红 | 47 通过、10 失败：旧 v2、23/16 Catalog、缺 Accessibility section/application | 实现真实链后 57/57；跨持久化纳入聚合后 10 files / 80 tests |
| TypeScript | 新联合类型完整收窄 | callback 内 `input.schemaVersion` 未保持收窄 | 先保存局部 `schemaVersion`，`npm run typecheck` 通过 |
| Compiler/Preview Golden | source identity 更新，Story IR/Outcome 不变 | 四个 Build ID 与 State/History identity 改变；四个 Story IR Hash完全不变，语义断言通过 | 只更新实际身份 Golden；3 files / 44 tests 复跑通过 |
| Player computed style | 热应用后立即读到 CSS 效果 | 第一轮在 React 同一提交帧读取，data 已更新但计算样式仍旧；行高/字距还误读了容器 | 等待高对比实际计算样式，改读文本 span；再按 font-size 比例验证 2.0/0.08，复跑 PASS |
| Editor ChangeSet | Audio 与 Accessibility 可一次提交 | 实际 UI 按分区原子提交，没有跨分区“2 项”按钮 | 按真实合同提交 `r1`、`r2`，保存 `s1` 后重开两项均保持 |

没有通过删除断言、降低 corpus、放宽 timeout 或伪造旧 Hash 来消除差异。

## 7. 真实测试证据

- `npm run audit:n51-gal-settings`：10 files / 80 tests，PASS；包含 v1/v2→v3、伪装旧版本新字段拒绝、v4 future、Node 临时目录、IndexedDB、ChangeSet/Undo/Redo、Preview 与 Player Core。
- Compiler/正式 Preview 定向：3 files / 44 tests，PASS；当前 Build ID 为 tiny `3d135cf3…cf2e1`、branching `7bc8a290…0a7ab`、media `68e26049…8a922`、cjk `eb682c96…02a94`，Story IR Hash 不变。
- Editor 冷 production build + Chrome 151：1440×900 显示 Basic 20；Web `audio.master=0.4` 与 `highContrast=true` 分区提交、保存、整页重开后来源均为 Web 覆盖；Preview 背景计算值 `rgb(0,0,0)`。390×844 overflow `0`、可见控件均 ≥44px、16:9、console error `0`。证据为 `evidence/n51/settings-ui-browser.json`。
- Player 冷 production build + Chrome 151：活跃 `presenting` 对白热应用后仍为同一对白；reveal duration `0`，行高/字体比 `2`，字距/字体比 `0.08`，高对比黑底/2px 白边，dissolve 变 `player-media-fade`，动画时长 `0.01ms`。390×844 stage `390×693`、overflow `0`、console error `0`。证据为 `evidence/n51/settings-runtime-browser.json`。

## 8. 需求对齐与停止边界

- REQ-GAL / AC-19 从 23 字段推进到 29，Basic 16→20；本切片六字段从 UI、Canonical 持久化到 Preview/Player 都有真实效果。
- N51 Product Acceptance 仍不通过：E6c Stage/Audio、E6d Choice/Route/UI、E6e Profile/Host 和 E6f 总出口尚未完成，Windows/Android 正式 Host 也不存在。
- N52 的 Auto/Skip/History/Save/Back/Forward、N61 本地化生产、N62 附加页、N80+ 构建发布没有被本切片越权实现。
- 完整 `npm run check`、提交、推送和同头 Windows / Node 22 证据将在本审计尾部补录；任一红灯都使 E6b 保持未关闭。

## 9. 完整门首次实际

首次从头运行 `npm run check` 时，治理、需求、Golden、Compiler `29/29`、Runtime `60/60`、10,000-seed/20,000-replay corpus（`25.667s`，digest 不变）、N41 scale/lazy 与退出矩阵第一段 `49/49` 均通过；随后既有 `apps/editor/src/App.test.tsx` 在累计负载下有 2/45 项分别于约 `5.037s`、`7.283s` 超过冻结 5 秒，其余 43 项通过，完整门在此停止。本切片没有修改失败的 Stage 复制/区间选择逻辑，也没有放宽 timeout。原命令隔离复跑整个文件为 45/45、用时 `63.55s`。该差异暂记为本机累积负载候选，仍须第二次完整门及同头 Windows / Node 22 CI 裁决，不能据隔离绿灯直接宣称完整门通过。

第二次从头运行穿过该位置：N41 `49/49 + App 45/45`、N42 `152/152 + App 45/45`、N43、Player/Core `32/32`、N51 `80/80`、普通回归 `149 files / 867 tests`、Editor integration、autosave 均通过；随后固定重型 VM corpus 语义 `4/5` 通过但用时约 `95.93s > 90s`，完整门再次保持红色并停止。未修改规模、digest 或 timeout；原命令隔离复跑 `5/5`，corpus 测试 `70.84s < 90s`。停止点之后的 17 workspace build、architecture（100 portable / 4 Node adapter files）、Script `13/13`、Route `9/9`（edit P95 `111.15ms`）、Asset `4/4`（dicing `2344.23ms`）另行按原命令通过。最终本机判定仍不是“单次完整门全绿”，而是两个既有长链在累计负载下各出现一次超时、原门限隔离绿；必须由同头干净 CI 关闭或确认回归。

实现提交 `7d8bac1` 推送到 Draft PR [#96](https://github.com/Longyuyeee/WorLdGame/pull/96) 后，同头 Windows / Node 22 `product-baseline` run `33140441747` / job `98749884222` 用时 `12m33s` 并绿色。远端普通回归 `149/867`、N51 `80/80`、Player/Core `32/32`；autosave `4.041s < 5s`，固定 VM 测试 `65.67s < 90s`，Runtime shard runner `30.222s`；Route edit P95 `157.41ms < 500ms`，Asset dicing `3246.27ms < 5000ms`。同一代码、同一规模和未放宽预算关闭了本机两个累积负载差异，E6b Engineering 可以关闭。

## 10. 出口审计与下一步

- 开发目标：六字段全部具备 schema、Catalog、Project transaction、UI、Preview/Player application 和真实浏览器效果，满足。
- 需求对齐：REQ-GAL/AC-19 更新为 29/20；没有把 N52/N61/N62/N80+ 需求错误计入 N51，满足。
- 测试纪律：保留 10 项首红、浏览器两类观测错误、分区 ChangeSet 差异及本机两次完整门红灯；同头 CI 以原门限关闭，满足。
- 推送与远端：实现头 `7d8bac1` 已推送，PR #96 同头完整门绿色；本审计最终证据提交后仍需再次确认文档头远端绿色。
- 下一代码切片只进入 E6c Stage/Audio default policy；E6d–E6f、N51 Product Acceptance、N52 与正式 Windows/Android Host 继续阻断。
