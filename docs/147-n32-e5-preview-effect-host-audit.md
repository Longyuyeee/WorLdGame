# N32-E5 Preview Effect / Stage Host 审计

> 日期：2026-08-21
> 分支：`codex/n32-e5-preview-effect-host`
> 直接基线：N32-E4 最终证据头 `d43452f40ad1a12491bb83b19c7eee9674df08ad`
> 授权：`RA-N21-004`，最大节点 N32
> 远端交付：Draft PR #56；实现头 `dcfe084`；Windows / Node 22 run `32467211148` / job `96726246321`，4 分 9 秒绿色
> 当前判定：N32-E5 Engineering 通过；N32 Product Acceptance、N40、M1 与发布继续阻断

## 1. 冻结目标与边界

E5 关闭 E4 的明确缺口：Editor 当时能显示 Runtime reconciliation 计数，却没有正式 Host 消费 Effect Intent，也没有执行 awaited completion/cancel、Barrier 决策或 checkpoint 通道恢复。E5 新增一个可移植、无 DOM 的 Effect Host receipt/reducer；正式 Preview Session 每次调度、外部输入和 History 导航都通过它记录 execute、complete、cancel、compensate、replay，并以 Runtime State/History 为唯一语义源。

本切片只完成 Editor Host。它不声称共享 Web Player Host、Pixi/WebGL、高级镜头、真实三端音视频设备策略、热更新、断点/Watch、N32 Product Acceptance 或 N40 准入已经完成。Stage 仍复用既有 Canvas/Media Host；E5 只把其提交时机与正式 Runtime pending/History 边界对齐。

## 2. 正式 Host 语义

- detached Effect 在正式 Scheduler 发出时记录 execute，并按 channel 形成当前活跃 receipt；重复 effectId/kind 幂等；
- awaited Effect 使 Preview 进入 `waiting-effect`，Stage 以 `data-host-commit-pending=true` 保持前一已提交投影；只有 token 完整匹配的 completion 才提交逻辑 State，cancel 使用正式 cancellationScope 且清理活跃 channel；
- Barrier 进入 `waiting-barrier`，产品 UI 显示 descriptor 与完整 reason；没有自动批准，用户只能“理解并批准”或“拒绝并退出试玩”；
- Back/Forward 先按目标 History 前缀重建 channel，再执行 plan 的逆序 compensation 或 replay；因此 pure Effect 也随 checkpoint 恢复，不会因无 compensation 而残留；
- Host 只保存最多 1,000 条有序操作 receipt，checkpointId、活跃 channel、操作数与最后操作进入观察 UI，但不写回 Runtime State，不污染 State/Outcome Hash；
- Runtime/History 诊断继续 fail closed；Barrier Back 阻断仍由正式 Runtime 决定，Host 不绕过。

## 3. 自动化与完整门

定向为 3 files / 21 tests：Host reducer 的幂等、cancel、checkpoint、compensation/replay；正式 Runtime awaited complete/cancel、Barrier reason/approval/Back block、reversible History；产品组件的按钮、pending Stage 属性与批准后提交。第一次定向暴露 operation `kind` 被 Effect payload 同名字段覆盖，已改成显式字段映射。

本机完整 `npm run check` 全绿：普通回归 99 files / 607 tests；storage conformance 1/1；重型 VM conformance 5/5；Runtime corpus 10,000 seeds / 20,000 replays / 40 chunks、26.938 秒、0 failed，digest `20e9a842cd1e70b012d2307b37209f63192f4e463df7e15cf5beed8c5fc92ef2`；Architecture 85 portable / 4 adapters；12 workspace 构建、治理、需求、风险、Golden、Script/Asset 性能门均通过。

Production Editor build 为 CSS 78.38 kB / gzip 14.99 kB，JS 727.60 kB / gzip 206.71 kB；较 E4 远端 JS 增加约 6.30/1.29 kB，仍有 >500 kB warning。该债未关闭，也未用提高 warning 阈值掩盖。

## 4. 预期—实际差异与修正

| 检查 | 预期 | 首次实际 | 修正/判定 |
|---|---|---|---|
| Host operation kind | receipt 记录 `execute/cancel/...` | 对象展开使 Effect 的 `background.set` 覆盖 operation kind | 改为显式字段映射；定向 21/21 通过 |
| awaited Stage | completion 前不提交，cancel 安全清理 | 初版只有 Runtime pending，无产品 Host 决策 | 新增 waiting-effect 卡片、完成/安全取消与 pending Stage 属性 |
| Barrier | 原因完整可见且绝不自动批准 | E4 在 barrier stopReason 无 Event 时会报 `PREVIEW_EVENT_MISSING` | 将 barrier 作为正式可呈现边界，提供批准/拒绝产品路径 |
| Back checkpoint | 返回目标 checkpoint 后 active channel 与目标一致 | production 首测 pure background Back 后仍为 `1 active` | 按目标 History 前缀先重建 channel；复测为 `0 active` |
| Forward replay | 恢复 crossed pure/reversible Effect | 修正前 channel 残留使 replay 结果不可区分 | 复测 `0 active` → `1 active / last replay` |
| History 起点 Forward | cursor 0 可 Forward | 旧 transient 判定把自然 paused 起点也视为临时光标 | 限定 paused/null 仅在 cursor>0 时为 transient；E4 回归继续通过 |
| 生产体积 | 构建成功并如实报告 | JS 727.60/206.71 kB | 构建通过；拆包债继续保留到性能/架构切片 |

## 5. 真实 production browser 证据

在 `127.0.0.1:4173` 运行本次 production build，并通过项目首页 → 示例工程 → 项目结构 → 内容编辑器操作；测试工程不是测试桩，而是在产品 Script 模式用稳定 ID 脚本原子提交 Effect 元数据后 Fresh Run：

- 默认 detached `background.clear`：首次为 `1 active / 1 operations / last execute`；Back 首测错误残留 1 active，修正后实际为 `0 active`；Forward 为 `1 active / 2 operations / last replay`；
- awaited reversible `preview.awaited.bg`：未响应时显示完整 descriptor、channel 和 `scope.scn_school_gate`，Stage 属性为 `true`；点击“安全取消”后实际 `0 active / 2 operations / last cancel`，属性为 `false`；
- Barrier `preview.gallery.commit`：批准前实际 `0 active / 0 operations`、属性 `true`，完整原因“将永久提交画廊解锁”可见；点击“理解并批准”后实际 `1 active / 1 operations / last execute`、属性 `false`；
- 视觉截图确认 Effect / Stage Host 卡片保持现代化多彩渐变、信息层级清晰，并位于 History 控制与 Runtime Inspector 之间；默认 16:9 舞台未被改写或挤压。

这些自动 production browser 与自动测试是工程证据，不替代 N21/N23 权威真人参与者记录。

## 6. 出口与下一步

Draft PR #56 的实现头 `dcfe084` 已通过 Windows / Node 22 完整 `npm run check`：普通回归 99 files / 607 tests，用时 73.16 秒；autosave 1/1，实际 2.855 秒；重型 VM 5/5，实际 60.884 秒；Runtime corpus 10,000 seeds / 20,000 replays / 40 chunks、28.603 秒、0 failed、digest 未变；Production build CSS 78.38/14.99 kB、JS 727.60/206.71 kB；85 portable / 4 adapters 及其余治理、构建、性能门均绿色。E5 Engineering 出口满足。

本次远端实现门不包含随后补写的证据文本；文档提交仍需通过同一 `product-baseline`，该第二次检查只确认证据更新未破坏仓库门，不重复冒充实现验证。

下一步冻结为 N32-E6：Preview 热更新与结构变更重启策略；随后执行 N32 Engineering 出口复审。E5 不提升任何产品验收状态，`RA-N21-004` 仍阻断 N32 Product Acceptance、N40、M1 Stable 与发布。
