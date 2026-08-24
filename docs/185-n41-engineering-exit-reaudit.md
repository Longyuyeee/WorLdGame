# N41 Sequence Engineering 出口复审

> 日期：2026-08-24
> 分支：`codex/n41-e4-sequence-runtime-highlight`
> 直接基线：N41-E3 `35b5052d1590878f9c4dee50f4e8c23c885b5796`
> Draft PR / Windows CI：实现提交推送后补录
> 判定：N41 Sequence Engineering 出口通过；N41 Product Acceptance、N42、M1 与发布继续阻断

## 1. 复审结论与纠偏

冻结的 N41 目标是“场景内部完整的可视化语义编辑”，不是把 Route-first lazy 页面扩展成第二套完整编辑器。完整工程 Sequence 已覆盖全部 P0 块、类型化 Inspector、搜索/插入、复制/移动、批量、折叠和跨视图定位；E2 已证明 Sequence/Script 连续互改 1,000 次不漂移。复审发现唯一真实出口缺口是 Formal Runtime 当前 statement 只投射到 Flow Route，没有投射到 Sequence 卡片。

本轮因此停止继续机械扩张 lazy 控制流结构族，改为关闭运行高亮缺口。Route-first lazy narration/dialogue 仍是大型工程按需编辑增强，不是 N41 完整 Sequence 的替代实现，也不是 N41 Engineering 出口的附加前置。

## 2. 出口矩阵

| 类别 | 冻结条件 | 当前证据 | 判定 |
|---|---|---|---|
| Goal | 场景内部完整可视化语义编辑 | 正式 Sequence 读取并写回 Canonical Script；P0 卡片与类型化 Inspector 均可用 | 1/1 |
| Implementation | 全部 P0、Inspector、运行高亮、搜索插入、批量、折叠、跨视图定位 | `sequence-editor-model`、N21 Sequence、N41-E1/E4 与 Route 定位测试组成退出矩阵 | 8/8 |
| Acceptance | Sequence/Script 互改 1,000 次，语义与 stable ID 不漂移 | E2 覆盖全部 P0、choice child、format、semantic hash 与失败关闭 | 1/1 |
| 产品验收边界 | 真人任务不得由自动化替代 | N21 `0/1`、N23 `0/2`，均为 pending | 阻断 |

## 3. 运行高亮实现

- Preview 从 Formal Runtime observation 投射 `currentSceneId + currentStatementId`，没有新增平行运行状态；
- Sequence 仅在 Runtime 当前场景匹配时标记对应 stable ID 卡片，并在 64 步窗口外自动揭示；
- 编辑选择与运行光标保持分离：推进、Back/Forward 和跨视图切换不会篡改当前编辑选择；
- 当前卡使用 `aria-current="step"`、`data-runtime-current` 和独立光环；状态区明确区分未运行、其他场景、未映射内部指令与已映射 statement；
- 原 Flow Route 运行轨迹继续消费同一 trace，未建立第二套定位协议。

## 4. 真实预期—实际—差异—修正

| 检查 | 预期 | 首次实际 | 差异与修正 | 最终实际 |
|---|---|---|---|---|
| 出口复审 | N41 冻结条目全部有代码与测试证据 | Route 有运行高亮，Sequence 卡片没有 | 新增 statement 级投射、窗口揭示与无障碍状态 | 缺口关闭 |
| 测试先行 | 缺功能时测试应在产品语义处失败 | 首次点击发生在 IndexedDB writer lease 就绪前 | 测试改为等待真实“试玩完整流程”入口，不跳过启动门 | 有效 RED 精确失败于缺少 `Sequence 运行步骤高亮` |
| Runtime 推进 | Continue 后旧卡清除、下一 stable ID 高亮 | 实现后与预期一致 | 无需改变 Runtime 或测试预期 | `stmt_gate_bg` → `stmt_gate_001` |
| History/跨视图 | Script→Sequence、Back、Forward 保持权威光标 | 与预期一致 | 无差异 | 四条路径均为 `aria-current=step` |
| 视觉分离 | 编辑选择和运行位置可同时辨认 | 生产截图中青色选中与紫绿运行光环独立 | 无差异 | 通过 |
| 默认画幅 | 右侧预览默认 16:9 且可调整 | `1920 × 1080`、`16:9 · 标准横屏` selected | 无差异 | 通过 |
| 浏览器错误 | production 真实工程 console error 为 0 | 0 | 无差异 | 通过 |

## 5. 自动化、生产与性能证据

- 新功能定向：`2 files / 16 tests`；
- N41 退出矩阵：`10 files / 84 tests`，已登记为 `audit:n41-sequence-exit` 并纳入根 `check`；
- 完整本地门：普通回归 `116 files / 733 tests`、storage `1/1`、重型 VM `5/5`；
- Runtime corpus：10,000 seeds / 20,000 replays / 40 chunks，digest `20e9a842…92ef2` 未变；
- 规模门：1,000 次 Sequence/Script，全部 P0，`287.06 ms`；
- Route：10k 编辑同步 P95 `145.24 ms < 500 ms`，trusted 首屏 `218.29 ms < 500 ms`；
- Dicing：`2547.08 ms < 5000 ms`，净节省 `85.83%`；
- production browser：真实受管“黄昏广播”工程，正式 Runtime 启动、Continue、Script→Sequence、Back、Forward 全通过；console error `0`；默认 16:9 保持；
- production bundle：JS `844.58 kB / gzip 236.54 kB`，既有 >500 kB 拆包债保留，没有把构建成功写成包体达标。

## 6. 需求与下一步边界

本轮关闭 `REQ-SEQ` 的 N41 Engineering 实现缺口，并继续推进 `REQ-SCRIPT`、`USP-01` 和 `AC-03`。由于 N21/N23 无真人、Stage 仍属于 N42、七模式属于 N43，相关 Product Acceptance 与 M1 状态不得改为通过。

`RA-N21-006` 明确阻断 N42 Engineering。下一步只能先完成远端 Windows CI 与证据补录，然后停在 N41→N42 治理检查点，等待产品负责人提供新的有界授权；不得自行进入 Stage、正式 Player 或发布节点。
