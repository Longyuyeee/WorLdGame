# N52-E3c4 Save v3 与三 Checkpoint 槽工程审计

> 日期：2026-08-30
>
> 分支：`codex/n52-e3c4-save-v3-checkpoint-slots`
>
> 直接基线：E3c3 最终绿色头 `5ae1d97`
>
> 判定：**N52-E3c4 Save v3 + 三 checkpoint 槽 Engineering 候选**；远端精确提交 CI 收口前不得登记 complete，N52 Product Acceptance 不变

## 1. 最初需求与实际代码对齐

本步严格承接 Gal/CL-04 与 E3c2 冻结合同：永久检查点只能来自 build-authored `checkpoint @id(statementId)`，不能拿 Runtime History 内部 checkpoint、scene ID、数组下标或墙钟替代。复核实际代码后沿用现有 `save-slots` / `save-previews` IndexedDB 事务与唯一写队列，只把正式 Save record 从 v2 升为 v3；隔离的 `recovery-sessions` 继续保持 v1，没有建立第二套持久化系统，也没有扩大 RA-N21-011 的 N52 边界。

开发中补充纠正了一项读档边界：加载 marker candidate 后，Core 必须继续到下一可呈现状态，但不能把该加载过程重新暴露成 checkpoint 写入候选，否则“读取检查点”会反向覆盖槽位。现在加载结果显式清空 candidate，并由 Core 与 Shell 测试锁定。

## 2. 已实现合同

- Save `3.0.0` 严格校验 manual 12、auto 5、quick 1、checkpoint 3 的 kind/slot 对应关系；只有 checkpoint 可携带稳定 `checkpointStepId`，其余 kind 必须为 `null`，未知字段、future schema、缺 step 与 kind/slot 错配全部 fail closed。
- v1/v2 读取只在内存归一为 v3 并分别记录 `migratedFromSchemaVersion: 1/2`；读取不改原记录，只有下一次完整 metadata + preview 成功事务才 copy-on-write。数据库仍为 DB3，正式槽、预览与 recovery store 均无破坏性升级。
- 三个 checkpoint 槽按 `checkpoint-1..3` 空槽优先；满槽按 `savedAtEpochMilliseconds`、再按 slot ID 确定性替换最旧项；同 Build + step 合并到最新匹配槽并更新内容。
- Player Shell 只消费 Player Core 提供的精确 Session candidate，每个 Build/step/artifact identity 一次；写入失败保留旧槽、不中断剧情且 FIFO 队列可继续；存读档面板列出三个槽并通过正式 load-only rehydrate 读取。
- Migration Museum v2 冻结 v1、v2、当前 v3、future v4、缺 step、kind/slot 错配和未知字段七个原始向量；历史 v1 Museum 继续执行，避免用更新测试抹去旧兼容证据。

## 3. 当前自动化证据

- 定向回归：`6 files / 66 tests` 通过，覆盖 Core marker candidate/加载、Store 严格迁移与 copy-on-write、轮转/合并/失败保留、Shell 自动写入/列出/读取，以及正式 Save 与 Recovery 隔离。
- E3a、E3b、E3c1、E3c2、E3c3 历史审计保持 PASS；新增 `audit:n52-e3c4-save-v3-checkpoint-slots` 将加入根 `check`。
- 生产浏览器 1440×900 证明 Save `3.0.0`、三槽、读取按钮 44px、横向 overflow 0、console warning/error 0；390×844 首轮发现四个存档类型标签仅 40px，纠正后重构建复验为四标签及三个读取按钮均 44px、overflow 0、console warning/error 0。
- 完整全仓 `npm run check`：PASS；普通回归 `153 files / 929 tests`，Compiler `30/30`、Runtime `61/61`、Player `55/55`、Settings `105/105`、N52 History `67/67`、VM `5/5`；Runtime corpus `10,000 seeds / 20,000 replay`，digest `20e9a842cd1e70b012d2307b37209f63192f4e463df7e15cf5beed8c5fc992ef2`。
- 所有 workspace build 与 architecture audit（portable 100 / Node adapter 4）通过；Route 10k 全链 P95 `61.74ms < 500ms`，16 MiB asset 总耗时 `367.38ms < 10,000ms`，Dicing/Atlas `1543.68ms < 5,000ms`。
- 实现提交、Draft PR 与同头 Windows / Node 22 CI 仍待本轮后续收口；这些证据回填前状态保持 candidate。

## 4. 后续边界

E3c4 只关闭 Save v3 与三槽 Engineering，不代表真实浏览器/进程强杀、Windows/Android 正式宿主、真人任务或 N52 Product Acceptance 通过。收口后应回到 N52 总路线继续播放 Auto/Skip 与余下跨宿主工程，不得扩展到 N60+、M1 Stable 或发布。
