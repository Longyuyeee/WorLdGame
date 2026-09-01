# N52 main-target 集成候选与真人门就绪审计

> 日期：2026-09-01
>
> 直接基线：N52-E5e 最终文档头 `5ac53f905842b07571f785d7932a00fc11f63a90`
>
> 当前分支：`codex/m1-integration-n52-candidate`
>
> 判定：**可以建立 main-target Draft 集成候选；尚未合入 main。N21/N23 真人记录仍为 0/1、0/2，N52 Product Acceptance 与 N60 继续阻断。**

## 1. 本步用户目标

[产品目标纠偏 #262](262-product-goal-alignment-and-delivery-correction.md)与 [N52-E5e #265](265-n52-e5e-history-engineering-exit-reaudit.md)都要求 E5e 后停止继续增加 N60 工程切片，先收束堆叠 PR，形成可审阅的 main-target 集成候选，并回到长期欠缺的 N21/N23 真人任务。

本步不修改产品功能、不合并 `main`、不关闭历史 PR，也不使用 AI、开发者或自动化代替真人。目标只有两个：

1. 证明当前 N52 tip 对 `main` 与 N41 集中 Authority 的真实祖先关系、差异规模和可合并性，并建立一个总入口 Draft PR；
2. 重新确认 N21-HV-01 与 N23-PA-01 的实际记录、执行顺序和当前阻断，使下一步不再回到新 Engineering 功能。

## 2. 预期—实际差异

预期集成候选必须满足：`origin/main` 是当前 tip 的祖先、N41 集中 Authority 是当前 tip 的祖先、当前 tip 不落后 `main`、开放分片 PR 没有遗漏，且 GitHub 能把候选判定为可合并。

首次只读审计的实际结果：

- `origin/main` 精确头为 `60121d35dfdf509b190f1576475acaf5d40003df`，是 N52-E5e tip 的祖先；behind `0`。
- N41 集中 Authority 当前远端头 `644a38026265ca67bea254c154530d00c32a6680` 是 N52-E5e tip 的祖先；原节点提交 `11bf313` 仍由冻结交付基线登记。
- 当前开放 PR #1–#121 的 121 个 head 全部是 N52-E5e tip 的祖先，没有发现平行遗漏。
- 相对 `main` 的实际审阅面是 `463 commits / 972 files / 114135 insertions / 173 deletions`。技术祖先关系没有差异，但“只继续依赖 121 个串联 PR 即可完成集成”的方式已经不可持续。

修正方式不是 squash、强推或关闭分片记录，而是从同一通过 CI 的 tip 建立 `codex/m1-integration-n52-candidate`，新增一个直接面向 `main` 的 Draft 聚合 PR。聚合 PR 负责给出最终差异和完整门；原 PR 保留为逐段审阅索引。未经维护者审阅，本文件不得把 Draft 写成“已集成”。

## 3. 审阅顺序

聚合 PR 的建议审阅锚点：

1. PR #32 / #51 / #61：N21、N31、N41 三次集中 Authority；
2. PR #65–#74：N42 Stage 与出口；
3. PR #75–#83：N43 七工作模式与 N50 准入；
4. PR #84–#90：正式 Player Core/Shell 与 N51 准入；
5. PR #91–#97：Gal Settings 与 N52 准入；
6. PR #98–#121：N52 History/Save/Auto/Skip/Back/Forward 完整 Engineering 链。

这一顺序只帮助维护者分段审阅；最终是否合并、采用 merge/rebase/squash 中哪一种策略，仍由维护者决定。本步不改写 463 个既有提交的身份。

## 4. 真人门真实状态

- `evidence/n21/human-validation.json`：`pending-participant`，8 个任务全部 `not-run`，参与者、同意、计时、求助、最终工程和观察日志均为空；真实完成度 `0/1`。
- `evidence/n23/product-acceptance.json`：`pending-participants`，两个参与者槽的 6 个任务、Editor 两路线与独立 HTML 两路线全部 `not-run`；真实完成度 `0/2`。
- N23 协议明确要求 `requiredN21Status=pass`，因此执行顺序必须是先 N21-HV-01，再由两名不同且未参与实现的参与者执行 N23-PA-01。
- 仓库已有 N21/N23 执行包、固定 Benchmark 工程与 `start-n23-acceptance.cmd`。机器审计 PASS 只证明 pending 记录和启动条件没有被伪造，不等于任何真人通过。

当前没有合格参与者资料，Codex 也不能自行补写匿名 ID、同意或任务结果。因此本步只能把真人门推进到“集成候选就绪、等待招募”，不能把记录改成 pass。

## 5. 测试策略与接续

该候选不改产品代码。真实功能基线采用 N52-E5e 精确头已通过的完整本地门和 Windows CI；本步在文档候选提交前又串行执行了一次完整 `npm run check`，退出码为 `0`。预期—实际差异如下：

| 验证面 | 预期 | 本机实际 | 结论 |
| --- | --- | --- | --- |
| 治理与需求 | 所有机器门保持绿色；N21/N23 诚实维持 pending | 交付基线、策略、需求 `50/10/13/27`、PR 追踪、N21/N23 与内容审计全部 PASS；真人仍为 `0/1`、`0/2` | 无状态漂移，机器门未替代真人 |
| 普通回归 | 现有功能无回归 | `154 files / 980 tests` 全部通过 | 无差异 |
| Runtime / N50 / N51 / N52 | 冻结 digest 和各节点套件不变 | 10,000 seeds / 20,000 replay 零失败，digest `01556a8c…63a9`；N50 `89/89`、N51 `131/131`、N52 `101/101` | 无差异 |
| 编辑器、存储与 VM | 真实集成场景和一致性门通过 | 8 个编辑器集成文件全部通过，其中完整 App `45/45`；存储 `1/1`；VM `5/5` | 无差异 |
| 构建与架构 | 17 个工作区构建、便携边界审计通过 | 17 个 build 全部成功；架构审计 PASS（portable `100`、Node adapter `4`） | 无功能差异；仅保留 Vite 对编辑器 `990.39 kB` 主 chunk 的既有 `>500 kB` 非阻断警告 |
| 性能 | 所有既有规模与预算通过，不调宽预算 | Script `13/13`、Route `9/9`、Asset `4/4` 全部 PASS；Route rename P95 `127.11ms < 500ms`，Asset 总计 `2781.90ms < 5000ms` | 无预算差异 |

以上是代码候选的工程实测，不是 N21/N23 的产品效果结论。推送后还必须由 GitHub main-target PR 在干净 Windows 环境复现同一完整门；若远端出现差异，不修改预算或记录绕过，而是保留精确提交、预期、实际与修正。

本步关闭条件：Draft main-target PR 已创建且 mergeable、候选头完整门绿色、文档与需求状态同步、分支推送完成。之后唯一接续动作是安排一名合格非程序参与者执行 [N21-HV-01](114-n21-human-validation-execution-kit.md)；N21 pass 后再安排两名不同非实现者执行 [N23-PA-01](121-n23-product-acceptance-execution-kit.md)。真人不可用期间保持 blocked，不进入 N60。
