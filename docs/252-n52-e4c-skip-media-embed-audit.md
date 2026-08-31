# N52-E4c Skip / media / embed 审计

> 日期：2026-08-31  
> 分支：`codex/n52-e4c-skip-media-embed`  
> 直接基线：E4b 最终绿色头 `f994604bfa08c49bf7650c3410efc46d8c89d371` / Draft PR #110  
> 当前判定：**N52-E4c Skip / media / embed Engineering complete**；AC-15 与 Product Acceptance 仍阻断。

## 1. 目标与真实实现

Shell 增加独立的 Skip Read/All、Hold/Toggle 与 5/10/20/40/Instant 控件。每次调度仍只调用 `schedulePlayerCorePlaybackV1()`；Runtime 是唯一剧情 Scheduler。`budget` 不是停止，而是由 Shell 新建 0ms 任务继续调用 Core，避免同步无界循环；Choice/Input、Effect、Barrier、资源、诊断、终局、未读边界等结构化原因停止并清除自有任务。

Hold 在 pointer/key down 启动，在 pointer-up、pointer-cancel、key-up、blur 或 Host suspend 停止；键盘事件阻止冒泡到普通推进。Skip 激活时文字揭示、舞台转场与角色运动进入瞬时表现，实际音频暂停；停止后恢复 normal CSS，并只恢复剧情仍声明 playing 的音轨。Playback Policy 升至 `1.1.0`，新增严格校验的默认激活、速度和 instant budget；非法策略仍 fail closed。Embed API 升至 `1.2.0`，`getObservation()` 新增 mode/activation/speed/active/stopReason。

## 2. 预期、首次实际与修正

预期旧测试保持通过，新八项只因 Skip policy/控件/媒体/observation 缺失失败。首次实际是 `40 pass / 14 fail`：八项为预期功能缺口，额外六项来自测试先传 Policy 1.1 而旧实现只认 1.0，导致四条 Auto 真实计时回退到默认延迟，旧 validator 又没有 Skip 校验。完成版本迁移后 Auto 语义恢复，定向最终 `3 files / 54 tests` 与 typecheck 通过。

cold production 首轮又发现单测短故事未覆盖的真实差异：预期从 Skip Read 接续 5× Skip All 应到 Choice；实际停在 history 9、`budget/active=false`。原因是新操作消费了上一次 `unreadBoundary`，且 budget 后没有新任务。修正为等待本次 dispatch 后才消费 stop snapshot，并把每次 budget 续到新的 Shell task。复测同一真实故事到 history 17、`waiting-choice/input/active=false`、overflow 0，控制台 0。

1280×720 production 主入口与独立 embed 均已冷构建实测。当前工具不能在不自动化 ChatGPT/Codex 窗口的情况下调整内置浏览器视口；因此本步不伪造 390×844 证据。E4b 的历史手机证据仍有效，但 E4c 新控制条的手机 cold rerun 保留为明确缺口。

完整门前两轮分别诚实停在 90 文档丢失历史 required token `N52-E3 入口契约` 与 `N52-E3a v2 元数据与截图`，产品代码和对应测试均已绿。修正为按全部 N52 机器合同一次性恢复精确 token，不删除历史状态。第三轮未改预算、timeout 或范围并完整通过：普通 `154 files / 954 tests`、N50 `68/68`、N51 `113/113`、N52 History `80/80`、Runtime `61/61` 与 `10,000 seeds / 20,000 replay`、VM `5/5`（测试体 `84.03s <90s`）、17 workspace build、architecture 与全部性能门；Route P95 `185.69ms <500ms`，Asset Dicing/Atlas/总计 `1875.45/1654.86/3530.31ms`。

实现头 `be7335838156de9de51d2cda6e27d4a1a274285b` 已推送至 Draft PR #111。该精确 SHA 的 Windows / Node 22 `product-baseline` run `33364046411` / job `99400937472` 用时约 `14m14s` 并成功：普通 `154/954`、N50 `68/68`、N51 `113/113`、N52 `80/80`；VM 测试体 `69.00s <90s`；Route P95 `154.41ms <500ms`；Asset Dicing/Atlas/总计 `1485.30/1801.15/3286.45ms`，17 workspace build、architecture 与全部性能门通过。因此 E4c 从 candidate 转为 complete。

## 3. 目标审计

| 目标 | 结果 |
|---|---|
| 唯一 Scheduler | 满足：Shell 只调用 Core bridge |
| Skip Read/All | 满足：真实未读边界、Choice/terminal 停止 |
| Hold/Toggle | 满足：pointer/key 生命周期与取消/blur/suspend 测试 |
| 五档速度 | 满足：UI 映射 canonical Runtime speed，5× 跨 budget 实测 |
| 媒体清理 | 满足现有真实 text/stage/audio；停止恢复 normal/playing |
| embed observation | 满足：API 1.2.0 发布结构化 playback |
| 不越界 | 满足：未建立第二调度器，未改 Gal Settings v5 |

## 4. 诚实边界与接续点

正式 Player 目前没有 `<video>` renderer，且 PRD 将视频/复杂动效列为 P1；本步不能把通用清理意图冒充视频实测。build-authored Stop Point source 也仍未接到 Shell policy。下一唯一切片是 **N52-E4 出口复审与接续审计**：统一核对 E4a–E4c、补 390×844 cold production，并决定 Stop Point source/video 是否属于 N52 后续窄切片。不得直接登记 AC-15、三端或产品完成。
