# N32 Engineering 出口复审（E7 后）

> 日期：2026-08-22
> 审计分支：`codex/n32-e7-shared-runtime-host`
> 基线：N32-E6 最终证据头 `5e55a4aea936261b852abee6374af097df392ae1`
> 证据：[N32-E7 审计](150-n32-e7-shared-runtime-host-audit.md)
> 结论：Implementation `完整 5 / 部分 1 / 未对齐 0`；Acceptance `0/1`；N32 Engineering 总出口未通过

## 1. 六项 Implementation 复审

| # | 冻结项 | E7 后真实证据 | 判定 |
|---:|---|---|---|
| 1 | Preview 只消费 Compiler 输出 | Editor 完整流程调用 N30 Compiler/N31 Runtime；Benchmark 两路线 production browser 到正确结局 | 完整 |
| 2 | Run from Entry/Scene/Statement | E3 Source Map 精确入口、Fresh variables/stack 与非法 return 关闭保持有效 | 完整 |
| 3 | 变量、栈、语句、Effect、舞台可见 | Inspector 与共享 Host active channel/receipt 可见 | 完整 |
| 4 | Back/Forward/Over、Continue、Run to Cursor | E4/E5 自动化保持绿色；E7 Benchmark production 实际 Back/Forward 回到同一结局 | 完整 |
| 5 | 安全热更新，结构变化明确重启 | E6 回归全部通过；Host rebasing 已迁入共享包 | 完整 |
| 6 | Preview 与 Player 共用渲染/音频 Host Adapter | portable Host contract 已由 Editor 与浏览器 Worker 测试宿主共用；但正式 Player 不存在、真实渲染/音频 adapter 仍未消费该包 | 部分 |

E7 关闭了“Editor 私有 Host、没有共享契约”的未对齐状态，但测试宿主不能替代冻结项中的 Player，故不是 `6/6`。

## 2. Acceptance 复审

冻结 Acceptance：Editor Preview 与 Web Player 对固定输入产生相同状态和画面关键快照。

当前只有共享 Host receipt/snapshot 的 Node↔Web Worker Golden；没有 `apps/player-web`，没有正式 Player 状态/Outcome/History/画面输出，也没有 Editor↔Player 视觉快照。`playable-web-export.ts` 仍内嵌独立 `StoryStatement` 解释器，只能保留 N23 legacy candidate 身份。因此 Acceptance 仍为 `0/1`。

## 3. 原阻断项复核

| ID | E6 判定 | E7 后判定 | 说明 |
|---|---|---|---|
| N32-X01 平行导出解释器 | 阻断 | 阻断 | 未迁移，仍不得称正式 Player |
| N32-X02 Editor 私有 Host | 阻断 | 已关闭 | 私有模块删除，Editor 消费 portable runtime-host |
| N32-X03 跨宿主差分为 0 | 阻断 | 部分关闭 | Host receipt/hash 已有 Node↔Worker Golden；State/Outcome/History/visual 的 Editor↔Player Golden 仍为 0 |
| N32-X04 旧 Preview 模块 | 警告 | 警告 | 产品零引用保持；兼容测试仍在 |
| N32-X05 授权边界 | 治理 | 治理 | `RA-N21-004` 仍只允许到 N32 Engineering |
| N32-X06 Benchmark 正式链不可运行 | 新发现 | 已关闭 | 旧 Direction 和缺失变量已修复，两路线 production 实跑通过 |

## 4. 方向对齐结论

本轮没有继续堆平台表面功能，而是把 Editor Host 收敛到 portable Runtime 边界，并用真实产品流程发现、修复了验收工程无法通过正式 Compiler/Runtime 的历史问题。这与“可编辑并产生可落地项目”的主目标一致。

仍需诚实保留的事实：正式 Web/Windows/Android Player、安装包、签名、设备媒体、画面一致性和真人产品验收均未完成。Editor 的“构建试玩 HTML”名称容易被误认为正式产物，但代码仍是旧执行链；在正式 Player 获得授权并迁移前，不得用它关闭任何 Runtime/Player Acceptance。

## 5. 下一步门控

当前授权内的 N32-E7 工程纠偏已完成，继续写更多 Editor 私有功能不会关闭剩余出口。下一有效节点需要治理上明确选择并记录：

1. 获得正式 Player 节点授权后，让 Web Player 消费 N30 IR、N31 Runtime 与 `@world-studio/runtime-host`，再建立 State/Outcome/History/receipt/visual 全差分；或
2. 保持现有授权边界，先完成 N21/N23 真人记录，再按交付图恢复后续节点准入。

在任一条件满足前，N32 Engineering、N32 Product Acceptance、N40+、M1 Stable 与发布全部 fail closed；不得通过重命名 Worker、旧 HTML 或自动化记录绕过。
