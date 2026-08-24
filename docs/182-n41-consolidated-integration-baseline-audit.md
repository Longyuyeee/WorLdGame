# N41 集中整合基线审计

> 日期：2026-08-24  
> 分支：`codex/m1-integration-n41-governance`  
> 状态：Authoritative；面向 `main` 的 Draft PR #61，仍等待维护者审阅与合并
> 范围：只整合已完成的 N00–N41 Engineering 证据，不声明 Product Acceptance、M1 或发布通过

## 1. 纠偏目标

当前实现方向仍对齐“同一 Canonical Project、多视图创作、正式 Compiler/Runtime、现代图形化编辑器”的产品目标，但交付链形成了从 PR #31 到 #60 的连续 Draft PR 栈，`main` 没有获得 N31 以后已经通过 Engineering 门的实现。继续在 PR #60 上直接堆叠 N41-E2 会让审阅、回归定位和换机接续成本继续增长。

本步骤建立新的集中整合候选：保留旧 Draft PR 作为逐切片证据，不自动合并、关闭或改写它们；新增一个直接以 `main` 为 base 的 Draft PR，冻结 N00–N41 的真实祖先链，后续 N41-E2 只允许从该集中基线继续。

## 2. 冻结范围

集中基线按真实祖先顺序包含：

`N00 → N01 → N10 → N11 → N12 → N13 → N20 → N21 → RA-N21-001 → N22 → N23 → N30 → N31 → RA-N21-004 → N32 → RA-N21-005 → N40 → RA-N21-006 → N41`

新增的后半段证据为：

| 节点 | 冻结提交 | 证据 | 诚实边界 |
|---|---|---|---|
| N32 | `3b0b426e9804f9ed3842d05abd01171e9393655b` | [N32 出口复审](151-n32-engineering-exit-reaudit.md) | Engineering 切片完成；Product Acceptance 未通过 |
| RA-N21-005 | `64252bf432a0efc4a580a6d5b7225e6cd91ce3cd` | [N32→N40 检查点](152-n32-n40-governance-checkpoint.md) | 只授权 N40 Engineering |
| N40 | `60b5aae5b55caaff61e2361e7a0b7a528e031e71` | [N40 出口复审](179-n40-engineering-exit-reaudit.md) | Route Engineering 通过；Product Acceptance 未通过 |
| RA-N21-006 | `ca064660c1b688a093bce3809a4b4b71b6d81268` | [N40→N41 检查点](180-n40-n41-governance-checkpoint.md) | 只授权 N41 Engineering，不授权 N42 |
| N41 | `11bf31313edcc380ff9db03e3286b710e0a65679` | [N41-E1 审计](181-n41-e1-formal-sequence-mode-audit.md) | 只代表 E1；N41 完整出口与产品验收均未通过 |

## 3. 真实测试：预期、实际与修正

| 检查 | 预期 | 首次实际 | 修正 | 当前实际 |
|---|---|---|---|---|
| 策略正例 | N41 Candidate 合法 | 6 项中 4 项失败；策略仍冻结 N31 | 将 branch、`integratedThrough`、节点顺序升级至 N41，并加入旧 N31 分支/状态反例 | 6/6 通过 |
| 节点缺失/重排反例 | 必须拒绝 | 正确拒绝，但错误文案仍指 N31 | 冻结文案和序列到 N00–N41 | 正确拒绝 N00–N41 缺失或重排 |
| 旧权威反例 | N31 authority 与 `integratedThrough=N31` 必须拒绝 | 策略错误接受旧值 | 新增两项显式负例 | 两项均正确拒绝 |
| Git 祖先审计 | 19 个节点均为 HEAD 祖先且顺序连续 | 首次 3 项失败；RA-N21-005 完整 SHA 录入错误 | 使用 `git rev-parse 64252bf` 的真实完整 SHA 修正登记表 | PASS，19/19 节点与顺序通过 |
| `main` 差异 | 新基线不落后 `origin/main`，并诚实报告未整合规模 | `behind 0 / ahead 297` | 不把 ahead 误写成已合入；建立 main-target Draft PR #61 | Authority 不落后；仍等待人工审阅与合并 |
| 本地完整门 | 治理、Compiler/Runtime、普通/存储/重型 VM、构建、架构与性能全部通过 | `npm run check` 退出码 0；115 files / 724 tests；storage 1/1；VM 5/5；Runtime 10k seeds / 20k replays | 无需放宽门槛 | Route 10k P95 115.09 ms；Dicing 2333.19 ms、净节省率 85.83% |
| Windows CI | 干净 Windows / Node 22 对 Candidate 完整裁决 | run `32689911786` / job `97321630294`，4 分 55 秒，成功 | 无差异修正 | Runtime corpus 28.993 秒；Route P95 131.61 ms；Dicing 净节省率 85.83% |
| 构建体积 | 构建成功且如实保留优化债 | Editor 主 JS 838.80 kB / gzip 235.74 kB，出现 >500 kB warning | 不提高 warning 门、不宣称优化完成 | 构建通过；拆包和 `App.tsx`/CSS 单体债保留 |

这些测试使用真实 Git 对象、真实证据文件和当前远端 PR 列表，不使用伪造仓库或只验证文案的替代测试。

## 4. 需求对齐审计

| 原始要求 | 当前对齐情况 | 本步骤影响 |
|---|---|---|
| Windows/Android 编辑，Web/Windows/Android 发布 | Android 编辑器和三端正式构建仍未开始 | 不宣称完成；保持 N80–N91 后续节点 |
| 现代、极简、多彩、强动效、表达清晰 | 现有 Editor 原型保持；N41-E1 已正式命名 Sequence | 不改 UI；后续仍需 N41–N43 与 N101 完整产品化 |
| Naninovel/Utage 级专业创作 | Compiler、Runtime、Route 和 Sequence Engineering 已形成基础 | 只整合证据，不把基础能力冒充商业成品 |
| 自动切图压缩、容量/速度/稳定性优化 | 已有 Dicing、缓存与性能证据，正式三端优化管线未闭合 | 保持 N70–N72，禁止提前宣称 Optimization 完成 |
| 快进速度、逐句前进/后退 | 正式 Runtime/Editor Preview 已具备内核与控制证据 | 正式 Player 和三端状态一致仍归 N50/N80 |
| 自动路线图、画廊等 | N40 Route Engineering 已通过；画廊 Catalog 仅有编译基础、无正式产品 UI | Route 保持未 Product Accepted；画廊仍归 N62 |
| 商业级正式第一版 | 当前 AC 仍为 0/27，真人门不可用 | M1 Stable 与发布持续 fail closed |

## 5. 放行与停止条件

Candidate 只有在以下事实全部出现后才可登记为 Authoritative；本次均已满足：

1. 分支已推送且创建直接面向 `main` 的 Draft PR；
2. PR 编号写回 `config/delivery-baseline.json`；
3. 本地 `npm run check` 通过；
4. 该 PR 的 Windows / Node 22 完整 CI 通过；
5. 文档记录实际 run/job、测试数量、性能与任何差异修正。

Authority 只代表“后续开发的权威分支”，不代表已合入 `main`；真正合入仍需仓库维护者审阅。N41-E2 可在最终权威提交头 CI 绿色后从本分支派生。N21/N23 真人门、N32/N40/N41 Product Acceptance、N42+、M1 和发布继续阻断。
