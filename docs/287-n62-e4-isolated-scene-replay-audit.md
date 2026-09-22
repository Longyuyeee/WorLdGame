# N62-E4 隔离场景回想审计

> 审计日期：2026-09-23  
> 分支：`codex/n60-e1-debugger-session`  
> 起点：`c533bf5dee85c7afba44113f85d5706a881fdf8d`  
> 实现头：`f5229b504f8b7a54d879f3139fe30271ae6f2765`  
> 状态：N62-E4 Engineering 已关闭；下一切片为作者覆盖配置与诊断

## 1. 原始需求与本步边界

PRD 要求 Scene Replay 从隔离检查点运行，退出后恢复玩家原状态。上一接续点进一步冻结了五条约束：继续消费 Compiler Replay Catalog；使用正式 Runtime、History 与 Host；正常结束、中途退出和资源失败都能返回；Runtime、History、Save、Meta、媒体与播放策略不得污染；禁止用 Shell 私有剧情快照或第二套 Runtime 冒充隔离会话。

E4 只关闭场景回想。作者标题/排序/封面/剧透/本地化覆盖、缩略图诊断、玩家自动 Route、Windows/Android 正式 Host 与三端 Product Acceptance 均未提前通过。

## 2. 实际代码审计与纠偏

实现前审计确认：

- Compiler 已为含 Ending 的场景生成 `catalogs.replay`，并带有 `replayId / sceneId / endingIds`；
- Runtime Meta 已单调记录达成的 Ending，因此 Replay 解锁不需要第二份状态；
- Runtime History 的场景入口 checkpoint 保存了当时的变量、调用上下文与 Meta，Host 可由该历史前缀的 Effect 重建；
- Player Core 已统一持有 Runtime State、History、Host 和播放调度，是唯一适合持有恢复检查点的位置；Shell 只应发出进入/退出意图并管理 UI 播放控件。

由此采用以下实现：

1. Player Core 从当前 History Cursor 向后选择最近的、已实际走过的安全场景入口，而不是用默认变量重新开场，也不读取尚未到达的 forward checkpoint；
2. 回想建立新的正式 Runtime History Session，并从原历史前缀重建正式 Host；原 `PlayerCoreState` 作为不可变恢复检查点保留在 Core 内；
3. 回想内部仍走既有 Compiler / Runtime / History / Host / Presentation 链，退出直接恢复原 Core 检查点；
4. Core 在回想中拒绝 Session Save 与 Load；Shell 同时阻断 auto/checkpoint/recovery 写入并隐藏存读档 UI；
5. 附加内容面板打开时暂停 Auto/Skip，关闭面板恢复；进入回想时把进入面板前的播放策略一并纳入返回状态，避免剧情在遮罩后推进；
6. 找不到历史入口时只显示用户可理解的错误，原会话不变。

这修正了一个用户视角的额外痛点：附加内容原本是模态界面，但 Auto/Skip 可能在其背后继续推进。现在浏览收藏、选择回想和返回剧情的过程都不会悄悄改变进度。

## 3. 玩家可见行为

- 未解锁条目只显示“未解锁的场景”，标题在 Player Core 投影阶段即为 `null`；
- 解锁后显示场景标题与“开始回想”，并说明回想从玩家实际走过的入口开始；
- 进入后常驻“正在回想”状态条，明确说明不会覆盖原剧情进度，并把焦点放到“退出回想，返回原剧情”；
- 等待 Effect、媒体错误、普通演出和 Ending 页面均有退出路径；Ending 主按钮改为“结束回想，返回原剧情”；Escape 也可退出；
- 回想中禁用再次打开附加内容，隐藏正式存读档与恢复入口；
- 中途退出和播放到结局退出都会恢复进入前的 Runtime State、History Cursor、Host Snapshot 与 Shell 播放策略。

## 4. 验证结果

| 检查 | 结果 |
|---|---|
| N62 定向链 | `2 files / 8 tests`，PASS |
| N50 Player 回归 | `5 files / 89 tests`，PASS |
| 普通测试 | `168 files / 1003 tests`，PASS |
| Editor / Storage / VM | 8 个 Editor 集成文件、Storage `1/1`、VM `5/5`，PASS |
| TypeScript / 构建 | TypeScript 与 17 workspace build，PASS；仅保留既有 Editor 主 chunk 警告 |
| cold production | Chrome 120，1440×900 与 390×844，PASS |
| 防剧透 | 锁定条目 DOM 不含 `Stage`；解锁后才出现入口 |
| 隔离运行 | 回想使用正式等待 Effect 与 Runtime Host；存档 UI 隐藏，Core Save/Load 拒绝 |
| 中途退出 | Runtime Hash、Host Snapshot Hash、History Cursor 与进入前一致 |
| 正常结束 | 到达 Replay Ending 后退出，三项身份仍与进入前一致 |
| 焦点/布局 | 进入后退出按钮获焦；移动 overflow `0`；桌面/移动退出入口均可见 |
| 浏览器诊断 | console error/warning 与未捕获异常均为 `0` |

机器证据为 `evidence/n62/additional-content-e4-replay-browser.json`。截图 SHA-256：

- Replay desktop：`fc5eb177248e0630ef214ad0c2d0db62a4a27b0a6c786e78a85ede8c292ea968`
- Replay mobile：`3dafe4d65a9c35de282abc59894da282c4e71a3c56d8e76cd33a9538d4c5e16a`

视觉复核确认桌面状态条与右上控制区不重叠，移动状态条位于播放控制下方，退出按钮和正式 Runtime Host 操作均完整可见。

## 5. 远端门与接续点

实现头 `f5229b504f8b7a54d879f3139fe30271ae6f2765` 已推送到 Draft PR #123；exact-head GitHub Actions run `35757139172` / Windows job `106845655360` 成功后，本步才正式关闭。远端门结果已与本地完整测试、构建和 cold-production 证据一致。

下一步严格回到 N62 原路线：

1. 审计现有 Catalog schema、Canonical 配置与本地化结构，冻结作者标题、排序、封面、剧透和本地化覆盖的唯一来源；
2. 实现覆盖配置与缺失缩略图/非法引用诊断，继续禁止 Shell 手工维护第二份 Catalog；
3. 随后实现只显示已发现内容的玩家自动 Route；
4. 最后统一复审 N62 Engineering，AC-17/18/20 与三端 Product Acceptance 在正式证据前继续阻断。

N70 Engineering、N21/N23 真人、M1 Stable 与发布仍未开始或仍被阻断。
