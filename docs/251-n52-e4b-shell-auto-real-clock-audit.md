# N52-E4b Shell Auto real clock 审计

> 日期：2026-08-31  
> 分支：`codex/n52-e4b-shell-auto-real-clock`  
> 直接基线：E4a 最终绿色头 `7c430d35c54f064ab816967ed9d6d5ecd03f2190` / Draft PR #109  
> 当前判定：**N52-E4b Shell Auto real clock Engineering 为 candidate**，等待精确实现头远端 Windows 门；本步不实现 Skip，也不登记 AC-15 或 Product Acceptance 通过。

## 1. 目标、需求与真实实现

E4b 只负责把 E4a 的唯一 Runtime→Player Core Scheduler 接到 Shell 的真实时间与媒体生命周期，不在 React 内解释剧情。Shell 新增独立 Auto 控件；计时到期只调用 `schedulePlayerCorePlaybackV1()`。版本化 `WorldPlayerPlaybackPolicyV1` `1.0.0` 保存基础延迟、每可读单元延迟、真实语音 tail 和瞬时指令预算；无效版本、负数、非整数或越界预算 fail closed 到 canonical 默认值，不修改 Gal Settings v5。

Auto 必须先等待现有真实文字揭示完成，再按 `max(base + readable units, actual audio.duration - currentTime + tail)` 启动 Shell 自有 `window.setTimeout`。语音元数据尚不可用时停在 `waiting-voice-metadata`，`loadedmetadata` 到达后重新求值；`ended` 后不重复等待旧语音。Host suspend 通过 effect cleanup 清除计时器和暂停媒体，resume 从当时真实剩余语音和完整 fresh delay 重新开始。任何非 system 手动输入先关闭 Auto；终局及 Core 的结构化非连续停止原因关闭 Auto。Shell 公开 policy/mode/stop/Auto 状态供测试和后续 E4c embed 接线，但本步不改变公开 embed API。

## 2. 预期、首次实际与差异修正

实现前先增加四条使用真实 `window.setTimeout` 的 Shell 路径：正式 Scheduler 边界、文字揭示、实际 `<audio>` duration/tail、Host suspend/resume。预期旧 30 项继续通过，新 4 项只因 Auto 控件不存在失败；首次实际完全一致：`30 pass / 4 fail`，四项均为找不到可访问按钮“自动播放”。这确认缺口是 Shell bridge，而不是 Runtime、Core 或 fixture 偏差。

首次实现回归为 `29 pass / 5 fail`：四项旧失败来自新增无障碍 `role=status` 与已有 Ending/Host status 冲突；新计时用例则诚实先处于 `waiting-text`，而测试过早要求 `waiting`。修正为保留 `aria-live`、移除重复 status role，并等待文字揭示 effect 进入真实 waiting。下一轮 `33/34`，唯一差异是 Ending 先提交、Auto stop effect 后提交；改为等待最终 `stopped`，没有放宽终局语义。最终 Shell `34/34`，Playback Policy 正反例加入后定向为 `2 files / 42 tests`，typecheck 与 production build 通过。

cold production build 实测不是 mock timer：1440×900 页面 Auto 开启 1 秒仍为原句/`waiting`，约 7.4 秒后到下一句并公开 `mode=auto`、`stopReason=storyBoundary`；Auto 按钮 `72×44px`，横向 overflow 0、History 重叠 false、console warning/error 0。390×844 为 `64×48px`、overflow 0、重叠 false。Host 多通道真实 voice duration 为 `0.1s`；暂停 4 秒文本完全不变且 `suspended`，恢复 0.5 秒仍为原句，随后到 `Curtain` 并最终 `terminal/stopped`，console 0。

首次完整 `npm run check` 在旧 E4 入口审计处停止：实际实现已出现合法 Auto 控件，但历史审计仍强制入口时的“控件 absent”永久成立；同时 90 顶部改写丢失精确 token `N52-E4 Auto/Skip 入口合同`。修正不是放宽 E4b，而是让旧入口审计保留 baseline snapshot，并在发现后续 Shell Auto 时要求正式 E4b candidate/complete 合同；同时恢复 required token。E4 入口与 E4b 审计随后同时 PASS。第二次完整门未修改预算、timeout 或测试范围并全绿：普通 `154 files / 946 tests`、N50 `64/64`、N51 `109/109`、N52 `76/76`、Runtime `61/61` 与 `10,000 seeds / 20,000 replay` 固定 digest、VM `5/5`（测试体 `76.12s <90s`）、17 workspace production build、architecture 与全部性能门通过；Route P95 `177.64ms <500ms`，Dicing/Atlas/总计 `1062.18/1577.95/2640.13ms`。

## 3. 开发目标审计

| 目标 | 实际证据 | 判定 |
|---|---|---|
| 不建立第二套剧情循环 | timer 到期只调用 Player Core Scheduler bridge | 满足 |
| 真实 clock / reveal | 非 fake timer，先揭示后创建 Auto delay | 满足 |
| 真实语音时长 | 读取实际 media `duration-currentTime` 与 versioned tail | 满足 |
| Host suspend | cleanup 清 timer；4 秒无推进；resume fresh delay | 满足 |
| 版本化策略 | Policy 1.0.0、严格范围校验、非法值回 canonical 默认 | 满足 |
| 输入/停止清理 | 手动输入关闭 Auto；terminal/结构化 stop 关闭 Auto | 满足 |
| 桌面/手机基本生产门 | 1440×900、390×844、44/48px、overflow/console 0 | 满足 |
| 不越界 | 无 Skip、速度、媒体分类清理或 embed API 变更 | 满足 |

## 4. 诚实边界与下一接续点

E4b 只关闭 Web Shell Auto Engineering 子切片，不证明 Windows/Android 正式 Host、实体设备、真人或完整 AC-15。build-authored Stop Point 的正式来源仍未接到 Shell policy；E4a 只证明精确 ID 被传入时 Core 能停止。

精确远端门成功后，下一唯一代码切片是 **N52-E4c Skip controls / speed / media cleanup / embed observation**：实现 Skip Read/All、Hold/Toggle、5/10/20/40/Instant，按策略处理文本/等待/舞台/音频/视频，并把播放状态纳入公开 embed observation。不得把 E4b Auto、普通 `allowHold` 或自动存档换算成 Skip 证据。
