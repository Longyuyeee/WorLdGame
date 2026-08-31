# N52-E4e Player video renderer 与播放策略审计

> 日期：2026-08-31
> 分支：`codex/n52-e4e-player-video-policy`
> 直接基线：N52-E4d 最终绿色头 `25f040b` / Draft PR #113
> 授权：`RA-N21-011`，最大节点 N52
> 当前判定：**E4e Engineering 完成；Product Acceptance 阻断。**

## 1. 原始需求与范围纠偏

[PRD 3.8](03-prd.md)要求文字、等待、转场、音频和视频分别拥有快进策略；[Gal 4](11-gal-foundation-and-automation.md)进一步要求 Auto 与 Skip 独立，Skip 可跳过视频且退出后不能遗留媒体状态。实际 Canonical 资源与持久化 Asset Index 已支持 `kind: video`，Compiler 已把资源原样写入 `asset-manifest.json`；Story Language 的正式 `@background asset=<stable-id>` 也能引用该资源。缺口位于 Player presentation adapter 与 Shell：当前只投影 image/audio，只有 `<img>`/`<audio>` 生命周期。

因此本切片不新增 `@video`、不改变 Runtime IR，也不复制 Scheduler。作者继续使用现有 background Effect 引用 Canonical video asset；需要等待的视频使用既有 awaited + reversible Effect 边界。Player 以正式媒体 source MIME 和 Compiler asset manifest 事实识别视频：Auto 等待 ended，Skip 取消 awaited video 后继续唯一 Scheduler，Host suspend 暂停、允许时恢复，错误 fail closed 并提供重试，替换/跳过/卸载必须 pause 清理。

## 2. 首次测试冻结

预期首次运行：既有测试保持绿色；新增 Canonical asset→Compiler manifest、Player adapter、renderer、Auto wait、Skip cancel-and-continue、Host suspend/resume、error/retry 与 unmount cleanup 断言只因当前没有 video 模型和生命周期而失败。

首次实际为 `2 files / 60 tests` 中 `49 passed / 11 failed`：六类失败来自缺失的视频投影、renderer、Auto/Skip/Host/error/cleanup；另五项是把 strict Playback Policy 从 1.1 提升到 1.2 后，旧测试 fixture 仍被正确 fail closed 的迁移连带差异。实现正式 video projection 和生命周期并迁移 canonical fixture 后，Skip Read 又暴露一个真实竞态：取消 awaited video 后，下一未读句在 React skip state commit 前被 0ms dispatch 消费并冲到终点。最终以同步 `skipModeCurrent` 守卫后续 dispatch，Shell 自己记录 `unreadBoundary`，不伪造 Runtime stop reason。

## 3. 最终实现与验证

- Canonical `kind: video` 继续由现有 `@background asset=<stable-id>` 引用；Compiler 测试确认 `asset-manifest.json` 保留 video，Runtime IR 仍为 1.1，现有 awaited reversible Effect 降低路径不变；
- Playback Policy 严格提升到 `1.2.0`：Auto `wait-for-end`，Skip `cancel-and-continue`；旧 1.1 文档只保留历史证据，不再约束当前源码版本；
- Player adapter 按正式媒体 MIME 投影 video；Shell 使用 `<video playsInline>`，Auto 等真实 ended，Skip 取消并继续唯一 Scheduler，Host suspend pause、策略允许时 resume，错误 fail closed，ref 替换和 unmount 均 pause；
- 定向最终回归 `4 files / 96 tests` 全绿，`npm run typecheck` 与 Player Shell production build 全绿，未修改 timeout、预算、Runtime IR 或 Scheduler；
- cold production 使用页面内真实 Canvas + MediaRecorder 生成 Blob WebM。Auto 实测进入 `waiting-effect / waiting-video` 且视频真实播放，ended 后到 `history=4 / terminal / Video done`；Host suspend 保留 awaited video 并标记 `suspended`，resume 回到 `playing`；Skip Read 移除视频并停在 `After video / unreadBoundary / skip=false`，Skip All 移除视频并到 `ended / terminal`；横向 overflow `0`，console error/warn `0`。

本地完整 `npm run check` 一次通过：普通全量 `154 files / 967 tests`，N50 `78/78`、N51 `123/123`、N52 History `90/90`，Runtime `61/61 + 10,000 seeds / 20,000 replays`，VM `5/5` test body `26.09s`，17 个 production builds；Route P95 `62.59ms < 500ms`，Asset Dicing / Atlas / 总计 `708.64 / 852.07 / 1560.71ms`，全部预算绿色。

机器合同：[config/n52-e4e-player-video-policy.json](../config/n52-e4e-player-video-policy.json)；专项审计：`npm run audit:n52-e4e-player-video-policy`。

## 4. 出口与接续点

E4 矩阵由 `完整 5 / 阻断 2` 收敛为 `完整 6 / 阻断 1`。唯一剩余 Engineering 阻断是 **N52-E4f：390×844 E4c cold production 复验并再次执行 E4 总出口审计**。本切片不登记 E4 总出口、Windows/Android 正式宿主、实体设备、真人、AC-15、N52 Product Acceptance、N60+、M1 Stable 或 Public Release 完成。
