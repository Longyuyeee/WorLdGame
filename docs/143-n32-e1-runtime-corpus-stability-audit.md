# N32-E1 Runtime corpus 稳定性纠偏审计

> 日期：2026-08-21
> 触发：Draft PR #52 最终文档头 `40a45bc` 的 Windows / Node 22 run `32455771721` / job `96692640907`
> 失败：10,000-seed corpus 实际 90.612 秒，超过冻结的 90 秒测试时限
> 原则：不减少 seeds、replays、scenario、chunk 或负例，不改变 digest，不放宽 90 秒门
> 纠偏头：`b89a48e23be62dfced8d6b53275d2f6ef72ed0f0`
> 最终裁决：Windows / Node 22 run `32457615078` / job `96697835514`，4 分 8 秒绿色；纠偏关闭

## 1. 预期与实际

冻结预期为 10,000 seeds、每 seed 两次确定性重放、40 chunks、七类场景、零失败以及全局 digest `20e9a842…92ef2`。同一实现先后出现本机 Node 25 的 77.14 秒通过、91.276/173.842/180.332 秒超时，以及 Windows / Node 22 的一次绿色和一次 90.612 秒超时。说明功能输出稳定但单线程墙钟没有工程余量，不能靠重跑碰运气关闭门禁。

## 2. 热点与修正

100-seed 场景切片显示主要墙钟来自 Choice History 与 Scheduler Equivalence。修正包含：

- SHA-256 压缩循环移除每个 block 的临时数组与可空分支，摘要算法和固定向量不变；
- State/History/Scheduler 在“随后必定 canonical hash”的内部路径上只做一次 canonical 序列化，仍保留结构校验、State Hash、Entry Hash、完整 malformed/tamper 反例；
- corpus 拆为四个独立进程，各执行连续 2,500 seeds 与两次 replay；
- 父审计读取四个临时结果，验证连续覆盖、10,000/20,000/40、七类计数、零失败，并对全部 10,000 outcome 重新计算原全局 digest；
- 临时目录只在系统 temp 下创建，清理前验证固定前缀；普通测试明确排除 shard 专用入口。

## 3. 修正后真实结果

| 运行 | 总墙钟 | Shard 实际 | Seeds/Replays | Digest | 结果 |
|---|---:|---|---:|---|---|
| 定向首轮 | 37.331 秒 | 31.216–31.446 秒 | 10,000 / 20,000 | 原值 | 通过 |
| 定向复轮 | 42.403 秒 | 34.582–34.995 秒 | 10,000 / 20,000 | 原值 | 通过 |
| 根级 check 内 | 47.651 秒 | 37.757–39.671 秒 | 10,000 / 20,000 | 原值 | 通过 |
| Windows / Node 22 | 30.868 秒 | 26.558–27.107 秒 | 10,000 / 20,000 | 原值 | 通过 |

所有 shard 还重复执行 oversized、noncontiguous、incomplete、scenario count 篡改和 `FAILED` outcome 五类反例。Portable architecture 与 typecheck 通过。

根级 check 随后在串行 autosave 恢复用例红色：该用例早前同代码 6.25 秒通过，本次链尾和隔离复跑分别约 24.326/25.815 秒仍处于“保存中”；同期普通套件从约 52–66 秒放大到 123.39 秒，且无遗留 shard Node 进程。该差异登记为本机整体负载异常，不修改 autosave 的 5 秒等待或 30 秒总时限，交由干净 Windows / Node 22 完整门裁决。

修正后的全仓构建、需求审计、风险审计和脚本性能门均通过。资产性能门在同一高负载主机上连续两次红色：首轮图集 3095.66 毫秒、总计 5563.52 毫秒，隔离复测图集 3021.90 毫秒、总计 5515.49 毫秒；冻结预算分别为 3000/5000 毫秒。本次变更不涉及资产管线，因此不越界修改算法，也不放宽预算；该预期—实际差异同样保留给干净 Windows / Node 22 完整门裁决。

## 4. 出口条件

Draft PR #52 的纠偏实现头已通过 Windows / Node 22 `npm run check`。远端实际同时证明：Runtime 主测试 `55/55`、普通并行 `98 files / 590 tests`、autosave `1/1`（3.107 秒）、VM 重型 `5/5`、资产性能 `4/4`；资产 Dicing 实际为 grouping 1456.81 毫秒、atlas 1760 毫秒、总计 3216.81 毫秒，均低于 3000/3000/5000 毫秒预算。由此确认本机 autosave 与资产红灯属于主机负载差异，而非本次 Runtime 回归。

纠偏出口已满足，E1 Engineering 可以关闭并进入 N32-E2；该结论不提升 N32 Product Acceptance，也不解除 N40、M1 与发布阻断。
