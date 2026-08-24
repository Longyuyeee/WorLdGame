# N41-E1 正式 Sequence 模式边界与标签结构往返审计

> 日期：2026-08-24
> 分支：`codex/n41-e1-sequence-core`
> 直接治理基线：`61bd1db6eb77bf8067fca9cf35df1e87e65fbbcf`
> Draft PR：#60，base `codex/n40-e1-route-graph-core`
> 判定：N41-E1 工程切片通过本地与 production browser 验证；不等于完整 N41 或 Product Acceptance

## 1. 冻结目标与代码差距

N41 冻结目标是“场景内部完整的可视化语义编辑”，并要求 Sequence 与 Script 始终编辑同一份 Canonical Script。代码审计发现：

- 完整工程的原 `WriterView` 已具备全部 P0 语句插入、类型化 Inspector、稳定 ID Patch、搜索、复制、移动、多选、折叠与 Route 精确定位；
- Route 的按钮和导航文案已称“进入 Sequence”，但实际进入的正式模式仍叫 `writer`，界面标签仍为 `Writer`；
- Route-first 局部页只有 narration 结构编辑经过 index、Compiler/Route preflight 与原子保存，不能把它扩称为完整 N41；
- 因此 E1 不建立第二份内容模型，也不复制已经存在的 P0 编辑器。先把正式模式边界从内部 `StudioMode`、主视图、Route 导航到产品文案统一为 `Sequence`，再以标签结构族证明同源往返。

## 2. 实现结果

- `StudioMode` 的正式内容模式从 `writer` 改为 `sequence`，默认入口、全局搜索、Route 节点双击、诊断定位和“进入 Sequence”全部落到同一模式；
- `WriterView`/`WriterViewProps` 改为 `SequenceView`/`SequenceViewProps`，标题和说明明确“Sequence 不持有第二份剧情”；
- `mode-dot--sequence` 继续复用现有多彩模式视觉，不增加独立语义状态；
- Source Session 的成功、草稿、Undo/Redo 和恢复提示统一为 Script/Sequence/Preview 同源；writer lease 仍保留为存储并发术语，没有误改持久化协议；
- 新增 `n41-sequence-mode.test.tsx`，使用真实 `fake-indexeddb` 写入和读回标签结构，复核 stable ID、正式 Compiler、Route fact 与重开后的 Sequence 卡片。

## 3. 真实预期—实际—差异—修正

| 检查 | 冻结预期 | 首次实际 | 差异与修正 | 最终判定 |
|---|---|---|---|---|
| 正式模式边界 | 默认入口及 Route 导航显示 Sequence；不再暴露 Writer tab | 受影响 UI 回归在改名后通过 | 无产品差异；测试选择器同步到正式名称 | PASS |
| 标签结构往返 | Sequence 插入/改名 → Script 同 stable ID → IndexedDB 保存复读 → Compiler/Route → 重开 Sequence | 首次新增测试 `54/55`，在 writer lease 启动闸门未结束时同步查找 Sequence | 等待真实租约闸门完成，不绕过、不缩短租约 | PASS |
| 重开实例 | 第二个 App 实例完成租约后显示同一标签 | 第二次 `54/55`，重开段仍同步读取启动闸门 | 重开断言同样改为等待启动完成 | PASS |
| 受影响 UI 回归 | App、N21 Sequence、Route、schema startup 全绿 | 最终 `5 files / 55 tests` | 无剩余差异 | PASS |
| 类型与 production build | TypeScript 与正式 Vite 构建成功 | typecheck 通过；CSS `87.61 kB / gzip 16.50 kB`，JS `838.80 kB / gzip 235.74 kB` | 构建通过；`>500 kB` 拆包债保留，未伪装成已优化 | PASS（带已知体积债） |
| production 服务器 | 从正式 `dist` 启动，而非 dev server | `npm run preview --workspace ...` 首次返回 `Missing script: preview` | 改用仓库已安装的 `npx vite preview --host 127.0.0.1` 服务同一 dist；不改门禁脚本 | PASS |
| production browser | 默认 Sequence；16:9/1920×1080；标签可视化修改与 Script 往返；console 0 error | 打开示例工程需依次经过 Launcher → Project Structure → 内容编辑器，直接等待 tab 两次超时 | 按真实产品入口继续，不绕过 Launcher/结构管理；最终 `hasLabel=true`、返回 Sequence 可见、Undo 恢复、console `0` | PASS |
| 本地完整门 | 治理、全仓、真实存储、重型 VM、构建、架构与性能全部通过 | `npm run check` 退出码 0；普通回归 `115 files / 724 tests`，storage `1/1`，VM `5/5`（54.67 秒），Route 编辑 P95 `140.82 ms <500 ms` | 无差异；未降低 corpus、预算或阻断门 | PASS |

## 4. 需求对齐

本切片直接推进 `REQ-SEQ`、`REQ-SCRIPT`、`USP-01` 与 `AC-03`：Sequence 成为正式可见模式，仍使用 Canonical Script、stable-ID Patch、正式 Compiler 与 Route。它没有改变默认 16:9 Preview，也没有进入 N42 Stage。

不得从 E1 推导：

- 全部 N41 已完成；
- Route-first lazy Sequence 已开放除 narration 外的结构写入；
- 1,000 次 Sequence/Script 连续互改验收已通过；
- N21/N23/N40/N41 Product Acceptance、M1 Stable 或发布已通过。

## 5. 下一步

N41-E2 应在同一 Canonical Source/Project Service 边界上补齐并自动验证 1,000 次 Sequence/Script 连续互改，覆盖全部 P0 statement、choice child、稳定 ID、格式化与语义 Hash。之后再按风险选择 Route-first 局部页的新结构族；任何会改变 Route 语义的局部命令必须先有专用 Compiler/Route preflight，不能复用 narration 的 Route-neutral 证明。

## 6. 远端闭环

待本提交精确推送并由 Draft PR #60 的 Windows / Node 22 完整门裁决后填写；远端绿色前不得把 E1 登记为最终关闭。
