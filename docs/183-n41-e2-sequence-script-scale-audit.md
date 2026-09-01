# N41-E2 Sequence / Script 连续互改规模门审计

> 日期：2026-08-24  
> 分支：`codex/n41-e2-sequence-script-scale`  
> 直接基线：N41 集中 Authority `644a38026265ca67bea254c154530d00c32a6680`  
> Draft PR：#62，base `codex/m1-integration-n41-governance`
> 判定：N41-E2 Engineering 已闭合；不等于完整 N41 或 Product Acceptance
> 边界：只关闭 N41-E2 Engineering，不代表 N41 Product Acceptance，也不授权 N42

## 1. 冻结目标与旧证据差距

N41-E2 要证明 Sequence 和 Script 在同一 Canonical Source Session 上可以连续互改 1,000 次，并覆盖全部 P0 语义族、choice child、stable ID、格式化、语义 Hash 与失败关闭。

审计发现旧仓库已有两项“1,000 次”绿灯，但覆盖不足：

- `n20-patch-scale.test.ts` 只连续插入 1,000 个 `wait`，没有交替经过 Sequence/Script 会话事务；
- `lazy-scene-session.test.ts` 只反复修改一个 `end`，没有覆盖其他 P0、choice child、格式化 Hash 和完整失败矩阵。

因此不能复用旧数字宣称 N41-E2 已完成。本切片新增正式 `audit:n41-sequence-scale`，并把它接入 `npm run check`。

## 2. 正式测试模型

规模工程包含 dialogue、narration、label、set、condition、choice、两个 choice-option、background/show/audio directive、call、jump、wait、return 与 end。1,000 轮按固定顺序交替执行：

- 偶数轮通过 `script.p0-update` 或 `script.p0-move` 模拟 Sequence 的稳定 ID 命令；
- 奇数轮先生成真实 `.world` 文本，再通过 `script.replace-source` 进入 Script 提交路径；
- 每 25 轮重新 parse，比较 committed document、稳定 ID 集合和 semantic snapshot；
- 最终 format→parse，比较 stable ID、semantic snapshot、document hash，并投影为正式 `StoryScene`；
- `return` 没有虚构内容字段，使用稳定 ID 结构移动；choice child 固定保留 `option_enter`/`option_leave`。

失败关闭覆盖：stale revision、duplicate ID、stable ID mutation 和 invalid Script draft。错误脚本只进入 draft，不能替换 Sequence 当前有效投影。

## 3. 真实预期—实际—差异—修正

| 检查 | 预期 | 首次实际 | 差异与修正 | 当前实际 |
|---|---|---|---|---|
| 全 P0 交替互改 | 1,000 轮都形成有效提交 | 第 4 轮 condition 返回 `noop` | 初始表达式与按奇偶生成值碰撞；改为单调唯一表达式，不把 noop 冒充编辑 | 继续运行 |
| `return` 覆盖 | 无虚构字段，仍有真实可逆编辑 | 尝试扩展 metadata 被解析链以 `INVALID_PATCH` 拒绝 | 按产品语义改为 stable-ID 结构移动，同时覆盖结构事务 | 通过 |
| 1,000 次规模 | ≤15,000 ms；revision/history 均 1,000 | 修正后 252.69 ms | 未缩小轮次、未放宽预算 | 2/2 tests 通过；revision/history 1,000 |
| P0 与 choice child | 所有可投影 P0 家族被触达；两个 option ID 保留 | 13 类投影 kind，directive 实际含 background/show/audio | 将语法层的 15 种可插入类型按投影语义归并记录，避免把三类 directive 误报成三种 AST kind | 稳定 ID 集合零变化；choice options 2/2 |
| 格式与语义 | format→parse 后 Hash、snapshot、正式投影一致 | semantic Hash `50746ded` | 无差异 | 通过 |
| 失败关闭 | 四类错误不污染 committed/Sequence | stale、duplicate、ID mutation 均 rejected；invalid Script 为 draft | 无差异 | 通过 |
| TypeScript | 全仓类型通过 | `npm run typecheck` 退出码 0 | 无差异 | 通过 |
| 受影响回归 | E1、lazy、Sequence model、Studio session、P0/source session 均不回归 | `6 files / 66 tests` | 无差异 | 通过 |
| 本地完整门 | 治理、全仓、存储、重型 VM、构建、架构和性能均绿色 | `npm run check` 退出码 0；普通回归 `116 files / 726 tests`，storage `1/1`，VM `5/5` | 无差异；未降低 corpus 或预算 | E2 250.18 ms；Route P95 122.19 ms；Dicing 2322.85 ms |
| Windows CI | 干净 Windows / Node 22 对实现头完整裁决 | Draft PR #62，run `32691082222` / job `97324747401`，5 分 30 秒 | 无差异 | E2 独立门 323.02 ms、普通回归 116/726、VM 5/5、Route P95 145.85 ms，全部通过 |
| 构建体积 | 不因测试切片改变产品 bundle，并保留既有债 | Editor JS 838.80 kB / gzip 235.74 kB | 不提高 warning 门 | 构建通过；>500 kB 拆包债保留 |

## 4. 需求对齐与诚实边界

本步骤直接推进 `REQ-SEQ`、`REQ-SCRIPT`、`USP-01` 和 `AC-03`：证明完整工程的 Sequence 命令与 Script 文本替换共享 revision、history、stable ID、format 和 semantic hash，不产生第二份剧情模型。

它没有完成：

- Route-first lazy 页的全部结构族；当前只有已审计族可写；
- 1,000 次真实 UI 点击。此门验证的是正式会话/语言事务，不把 jsdom 事件吞吐冒充人类任务；
- N21/N23 真人 Product Acceptance；
- N41 完整 Engineering 出口或 Product Acceptance；
- Stage、正式 Player、Android 编辑器、三端正式构建、M1 或发布。

## 5. 下一步与停止条件

1. E2 已完成受影响回归、本地完整门、推送、Draft PR #62 和 Windows CI；
2. 下一切片先审计 N41 剩余退出条件，选择一个有专用 Compiler/Route preflight 的 Route-first 结构族；
3. 涉及 UI 的下一切片必须增加 production browser 实际值。本切片没有改变 UI，浏览器点击不能替代 Source Session 1,000 次事务门；
4. N41 完整出口复审通过前仍不得进入 N42。

任何 stable ID 变化、choice child 丢失、Hash 漂移、错误 draft 污染 committed，或 15 秒预算失败，均必须停止扩展并修正。

实现头 `6e0021091f5abe6b0a4f59fbe158e44b4300904d` 已精确推送并由上述 Windows CI 验证。因此 N41-E2 Engineering 关闭；N21/N23 真人门、N41 Product Acceptance、N42+、M1 Stable 与发布继续 fail closed。
