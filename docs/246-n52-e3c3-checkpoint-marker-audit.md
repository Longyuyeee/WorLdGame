# N52-E3c3 Checkpoint Marker 工程审计

> 日期：2026-08-30
>
> 分支：`codex/n52-e3c3-checkpoint-marker`
>
> 直接基线：E3c3 权限最终绿色头 `902d7b6`
>
> 判定：**N52-E3c3 checkpoint marker Engineering 关闭**；N52 Product Acceptance 不变

## 1. 需求对齐与纠偏

本步恢复最初 Gal/CL-04 与 VM Spike 已要求、正式链路遗漏的 build-authored checkpoint。它不是任意场景快照：唯一来源是 `checkpoint @id(statementId)`，稳定 statement ID 同时作为 step ID。Runtime History 仍只承担回退历史，不充当永久 checkpoint 槽。

实际代码复核后将原 E3c3 大切片拆成 marker 与 persistence 两步：本步只关闭 Story→Compiler→Runtime→Player 的标记链；Save v3 与三个槽留给 E3c4。这样 IR 兼容升级与严格存档迁移可以分别审计，没有缩减最初需求。

## 2. 已实现合同

- Story Language v0 识别、格式化并投影显式 checkpoint；缺 ID、多 ID 或额外内容失败关闭；Editor 把它显示为结构节点，正式 Preview、legacy preview 与 Web Export 均不把它作为剧情表现，正式 History 前进/后退也会跨过该事件。
- Compiler 只发 Runtime IR `1.1.0`，生成 `{ opcode: "checkpoint", operands: { stepId } }` 和同 ID Source Map；Golden IR/build identity 已按版本变化重新冻结。
- Runtime 同时读取 `1.0.0`/`1.1.0`；`1.0.0` 中 checkpoint 被拒绝，`1.1.0` 发出无 Effect 的 `checkpoint-reached` 并前移精确 State。
- Player Core 在事件已提交到 History 后立即序列化精确 Runtime Session candidate，然后继续到下一可见边界；候选加载会从 marker 后继续，Back/Forward 跳过 marker，不生成 presentation 或第二套 Runtime。

## 3. 本地工程证据

- `npm run audit:n52-e3c3-checkpoint-marker`：PASS，Save v2 / checkpoint slot 0 边界未越界。
- `npm run check`：PASS；普通回归 153 files / 923 tests，Compiler 30、Runtime 61、Player 54、Settings 104、N52 History 64 全通过。
- Runtime corpus：10,000 seeds / 20,000 replay executions，digest `20e9a842cd1e70b012d2307b37209f63192f4e463df7e15cf5beed8c5fc992ef2` 未漂移。
- VM conformance：5/5；全部 workspace build 与 architecture audit（portable 100 / Node adapter 4）通过。
- 性能门：10k route 与 script 门全部 PASS；16 MiB asset 检查总耗时 358.05 ms，图集分析总耗时 1,526.01 ms，均在预算内。

实现提交 `196a028f26ed73a7552293c796b94f594168fd35` 已推送至 Draft PR #106。该精确提交的 Windows / Node 22 `product-baseline` run `33263549231` / job `99129464102` 用时 `13m22s` 并成功，E3c3 marker 因此由 candidate 转为 complete；本最终证据提交仍须由后续同头 CI 复验。

## 4. 下一边界

当前 Player Save 仍为严格 v2，kind 仍只有 manual/auto/quick，持久 checkpoint 槽为 0。下一唯一切片是 `N52-E3c4 Save v3 + 三 checkpoint 槽`，负责 v1/v2→v3 严格迁移、确定性轮转/合并、失败保留和 Shell 列表/加载。N52 Product Acceptance、真人/实体设备、N60+、M1 与发布继续阻断。
