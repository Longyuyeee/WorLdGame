# N42-E4 派生时间标尺与 Runtime 播放头审计

> 日期：2026-08-25
> 直接基线：`0bf8460`（N42-E3b Preview 生产闭环）
> 分支：`codex/n42-e4-derived-timeline-playhead`
> 授权边界：`RA-N21-007` 只覆盖 N42 Engineering；未进入 N43、正式 Player、Android 或三端发布
> 判定：基础四轨首次具有由 Canonical Script 派生的时间标尺、可编辑播放头和 Formal Runtime statement 同步；没有建立第二份时间线模型，N42 完整时间线与 Product Acceptance 仍未关闭

## 1. 冻结目标与语义边界

本切片只关闭“多轨 playhead / 时间标尺”的最小纵向结果：

- 时间投影只能从当前场景权威 `StoryStatement[]` 重建，不保存独立 start time；
- Direction 使用合法 `duration` 或 `fade`，Wait 使用正式 duration，对白/旁白复用既有 1× Preview pacing，其余控制流为 instant cue；
- 编辑状态下，播放头移动只选择 stable ID；Formal Runtime 有可映射 statement 时接管并锁定播放头；
- 同一播放头贯穿 TIME/BG/CHAR/AUDIO/STORY，可视窗口继续最多挂载 64 步；
- 保存重开只恢复 Canonical Script，时间标尺必须得到相同结果。

本轮不添加任意绝对时间写入、曲线编辑、路径、镜头轨、转场轨、波形或模板，也不把 Editor Preview 冒充 Player。

## 2. 预期—首次实际—修正—当前实际

| 检查 | 冻结预期 | 首次实际 | 修正 | 当前实际 |
|---|---|---|---|---|
| 派生时间模型 | 同一语句序列确定性得到 lane/start/duration/end | 单元测试手工预期把 5 字对白算成 1230ms | 保持既有 Preview 下限 1200ms，不修改算法；修正错误测试预期 | 冻结样例总时长 3450ms，重复投影一致；非法/缺失时长 fail-safe 为 0ms instant |
| 真实 N42 标尺 | 7 步关键帧工程显示精确起点和总长 | 首次即得到 0、400、700、1500、2150、2650、5200ms | 无产品差异 | 总长 `00:05.200`；TIME 与四条 lane 使用同一窗口列 |
| 编辑播放头 | 点击刻度选择 canonical stable ID，不写第二份时间线 | 符合预期 | 无需修正 | 点击 `00:01.500 / 步骤 4` 后 slider=3、选中 `stmt_ui_1`，CHAR cue 同时显示 active/playhead |
| Runtime 同步 | 从当前关键帧启动后 Runtime 接管并禁用编辑 scrub | 符合预期 | 无需修正 | source=`runtime`、slider disabled、`stmt_ui_1`=1500ms；Continue 后 `media_bgm`=2150ms |
| 保存重开 | Canonical 重开后 7 步与总时长不漂移 | 符合预期，未发生 Writer Lease conflict | 无需修正 | 刷新重开仍为 7 步和 `00:05.200`，初始播放头回到 canonical 首步骤 |
| 桌面布局 | 1280×720 无整页横向溢出，标尺和四轨可见 | 符合预期 | 无需修正 | Document 1280/1280，Track 623/623，时间控制 599×43.5，Ruler 584×29 |
| 手机布局 | 390px 文档不被时间线撑宽；轨道内部可横向滚动 | 首次 Document/Body scrollWidth=462px，新增三列控制条和 lane intrinsic width 外溢 | 820px 以下控制条改单列；Stage Track/Scroll 冻结 min/max width，lane 只在内部滚动 | Document/Body 375/375；Track 349/349；内部 Scroll 310/516 auto，功能保留且整页不横向漂移 |
| 默认画幅与错误 | 16:9 不回归，真实流程 console error 0 | 符合预期 | 无需修正 | 1920×1080 / 16:9，console errors `[]` |

## 3. 自动化与性能证据

- 新增 `stage-timeline.test.ts`：合法多 lane 投影、非法时长 fail-safe 与时间格式；
- `App.test.tsx`：编辑 scrub 只改变 canonical statement 选择；
- `n41-sequence-mode.test.tsx`：Formal Runtime 接管、禁用 slider，并随 Continue 从 index 0 移到 1；
- 定向复核：3 files / 42 tests 全绿；TypeScript build graph 通过；
- 10,000 步时间标尺投影：首次定向 10.89ms、提交前复测 8.87ms，均 < 500ms；10,000 cues，总时长 10,625,000ms；Script 性能门 11/11 全绿；
- 真实 production browser：N42 IndexedDB 媒体工程、刷新重开、1280×720 与 390×844 两种 viewport、Formal Runtime 和 console 实际取证；
- `npm run check` 中治理、Workspace、需求/风险/真人门、Golden、Runtime corpus、N41 scale/lazy、TypeScript、普通全仓与真实 IndexedDB 均通过：普通全仓 120 files / 751 tests，storage 1/1；
- 同一次完整门的冻结 VM 首次受主机负载影响为 113.24s > 90s，未删样本、未改 digest、未放宽预算；停止本工程 Vite、释放动画页面后两次隔离复测为 94.34s 与 87.23s，第三次 5/5 通过并恢复到原预算内。该“红→红→绿”差异如实保留，不把完整门首次退出码写成绿色；
- production build 通过：Editor CSS 97.27 kB / gzip 17.98 kB，JS 869.29 kB / gzip 245.10 kB；>500 kB 拆包债仍保留；
- Architecture PASS（93 portable / 4 Node adapter）；Route 性能 9/9、Asset 性能 4/4 全绿。Dicing 复测为 analysis/reconstruction 1157.19ms、atlas/reconstruction 1398.51ms、总计 2555.70ms，仍在 3000/3000/5000ms 冻结预算内。

## 4. 需求与偏移判定

本切片推进 `REQ-STAGE`、`AC-03` 和 `AC-13`，直接对应用户要求的图形化、现代化、方便编辑与专业时间线能力。播放头不是本地 UI 幻觉：编辑时锚定 canonical stable ID，运行时锚定 Formal Runtime Source Map statement；页面刷新后由同一 Script 重建。

产品方向未被替换，但商业完成度仍不能上调：路径/镜头/独立轨道时间编辑/模板未完成；Editor Runtime 不是正式 Player；N21/N23 真人仍为 0/1 和 0/2；N42 Product Acceptance、N43、M1 Stable 与 Public Release 继续 fail closed。

## 5. 下一步

下一切片应在 N42 冻结范围内选择“运动路径”或“基础镜头轨”的最小 canonical→保存重开→Formal Runtime/Host→Preview 闭环。不得用本轮派生时间尺宣称任意时间采样或完整专业时间线已完成。
