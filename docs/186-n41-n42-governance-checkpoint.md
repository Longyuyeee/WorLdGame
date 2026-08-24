# N41→N42 Stage Engineering 治理检查点

> 日期：2026-08-24
> 分支：`codex/n42-governance-checkpoint`
> 直接基线：N41 最终绿色头 `e7341289972cd0ba4e843b7ef218cd1458fb64c5`
> 授权：`RA-N21-007`，最大节点 N42，2026-09-24 14:08:25（UTC+8）到期
> Draft PR：[#65](https://github.com/Longyuyeee/WorLdGame/pull/65)（Draft，base `codex/n41-e4-sequence-runtime-highlight`）
> 首个 Windows CI：run `32696755287` / job `97340206007`，5 分 50 秒，绿色
> 判定：只准入 N42 Stage Engineering；N42 Product Acceptance、N43+、M1 Stable 与发布继续阻断

## 1. 触发与前置事实

N41 Sequence Engineering 已按冻结规格取得 Goal `1/1`、Implementation `8/8`、Acceptance `1/1`；最终证据头的 Windows / Node 22 run `32695643432` / job `97337096208` 用时 5 分 42 秒并绿色。真人参与者仍不可用：N21 为 `0/1 pending-participant`，N23 为 `0/2 pending-participants`。

产品负责人已被明确告知 `RA-N21-006.maximumDeliveryNode=N41`，N42 Engineering 被阻断；随后再次明确要求进入后续步骤，并继续要求真实预期—实际差异、修正、文档、逐步审计、需求对齐和推送。因此关闭 RA-006，建立只覆盖 N42 Engineering 的 `RA-N21-007`。自动化和开发者操作仍不能替代真人 Product Acceptance。

## 2. 有界授权

`RA-N21-007` 只允许：

- N42 Stage 与基础时间线 Engineering；
- 多轨、关键帧、缓动、运动轨迹、镜头、基础转场和 ADV/NVL/气泡模板的工程实现；
- Stage 操控生成 canonical stable-ID 语义命令，不建立第二份时间线模型；
- Formal Runtime 当前状态、presentation Host receipt 与 Stage 时间线投影对齐；
- 自动化、真实媒体、production browser、性能预算与 Windows CI 的开发者实测。

它不允许：

- 登记 N21、N23、N30、N31、N32、N40、N41 或 N42 Product Acceptance 通过；
- 进入 N43 七模式、正式 Player、正式多端构建、M1 Stable 或发布；
- 把现有基础 Stage Track、Canvas Preview 或 Effect Host 重新命名为完整 N42；
- 把 AI、开发者或自动化操作冒充真人证据；
- 合并 Draft PR 或宣布当前分支已进入 `main`。

## 3. 真实预期—实际—差异—修正

| 检查 | 冻结预期 | 首次实际 | 差异与修正 | 当前实际 |
|---|---|---|---|---|
| N42 正例 | RA-007 active、current/max N42 时通过 | `active exception must block N42 Engineering`、`may not extend beyond N41`、`only RA-006` | 策略前移为 RA-007 / N42，阻断改为 N42 Product Acceptance 与 N43 Engineering | 通过 |
| N43 越界 | current N43 必须失败 | RA-007 max N42 命中 exact maximum violation | 无需修正预期 | 通过 |
| 产品门 | 删除 N42 Product Acceptance 阻断必须失败 | 旧 required gates 没有 N42 Product Acceptance | 更新 required active gates | 通过 |
| 旧例外 | RA-006 重新 active 必须失败 | 旧策略反而只接受 RA-006 | RA-007 要求 RA-001–006 全部 closed | 通过 |
| 到期 | 2026-09-24 14:08:25 后 active 必须失败 | 过期反例保持失败 | 更新时间边界与新 ID | 通过 |
| 真人记录 | 治理扩展不得伪造参与者 | N21 `0/1`、N23 `0/2` | 无差异 | pending 保持 |

测试先行 RED 为 `1 file / 6 tests` 中 `4 failed / 2 passed`，失败精确落在旧 N41 上限和旧阻断集合；修正后同一文件 `6/6` 通过，没有删减反例或放宽到 N43。

治理实现头的本机完整仓库门 `npm run check` 退出码为 0：治理策略 `3 files / 20 tests`，常规回归 `116 files / 733 tests`，真实 IndexedDB storage `1/1`，重型 VM `5/5`；13 个 workspace 的 typecheck/build、架构与性能审计均通过。10k seeds / 20k replays 的 Runtime corpus 用时 14.221 秒且 digest 未变化；Route P95 103 ms、route page 209.66 ms、Dicing 2231.77 ms 与净节省 85.83% 均在冻结预算内。Editor 生产 JS 仍为 844.58 kB（gzip 236.54 kB），`>500 kB` 拆包债没有被本治理切片掩盖。

本切片只修改治理注册表、策略、测试和文档，没有改变 UI、产品行为或生产资源，因此不伪造无变化的浏览器产品验收；真实验证对象是实际风险注册表、正反策略、真人记录、全仓代码与构建。N42-E1 首个产品行为切片必须恢复 production browser 的画面、交互和 console 实测。

远端干净 Windows / Node 22 首次完整门同样退出码为 0：治理 `3 files / 20 tests`、常规 `116 files / 733 tests`、storage `1/1`、重型 VM `5/5`；10k portable VM corpus 实际 65.243 秒，N41 1,000 次规模门 317.63 ms，Route P95 140.57 ms，八张 512 px Dicing 3.380 秒。93 个 portable 文件的架构审计、全部 workspace 构建和其余性能门均通过；Editor 仍为 844.58 kB / gzip 236.54 kB。相对本机的耗时差异没有越过任何冻结预算，因此无需修改功能、规模、digest 或门槛。

## 4. N42-E1 冻结起点

治理门闭合后，E1 先做当前 Stage/Track/Runtime Host 与 N42 冻结规格的代码级差距审计，再选择一个可独立验证的导演结果。优先次序为：

1. 冻结 Stage 的 canonical semantic command 与 timeline projection 边界；
2. 选择一个当前缺失的基础时间线结果，要求 UI、保存重开、Formal Runtime/Host 与 Preview 实际效果闭环；
3. 同一用例记录预期、首次实际、差异和修正，并用 production browser 检查画面与控制台；
4. E1 不宣称全部 N42，不触碰 N43 或 Player。

## 5. 关闭条件

本地治理策略正反例、风险注册表、N21/N23 pending 记录、需求矩阵、完整仓库门和首个 Windows / Node 22 CI 已全部通过。证据补录提交自身的最终 Windows CI 绿色后，本检查点关闭；才允许从下一分支开始 N42-E1 产品代码。
