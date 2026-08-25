# N42→N43 七工作模式 Engineering 治理检查点

> 日期：2026-08-25
> 分支：`codex/n43-governance-checkpoint`
> 直接基线：N42 Engineering 最终绿色头 `853b70b`
> 授权：`RA-N21-008`，最大节点 N43，2026-09-24 15:12:18（UTC+8）到期
> Draft PR：#74，base `codex/n42-engineering-exit`
> Windows CI：run `32821867501` / job `97721518865`，6 分 10 秒，绿色
> 判定：只准入 N43 Engineering；N43 Product Acceptance、N50+、M1 Stable 与发布继续阻断

## 1. 触发与前置事实

N42 Stage Engineering 已按冻结范围取得 Goal `1/1`、Implementation `8/8`，N42 汇总门为 `16 files / 192 tests`；最终文档头 `853b70b` 的 Windows / Node 22 run `32819783241` / job `97715309885` 用时 6 分 56 秒并绿色。正式 Player 不存在，Editor↔Player Acceptance 仍为 `0/1`。真人参与者仍不可用：N21 为 `0/1 pending-participant`，N23 为 `0/2 pending-participants`。

产品负责人已被明确告知 `RA-N21-007.maximumDeliveryNode=N42`，N43 Engineering 与以后节点均被阻断；随后于 2026-08-25 再次明确要求进入后续步骤，并继续要求真实预期—实际差异测试、修正、文档、逐步审计、需求对齐和推送。因此关闭 RA-007，建立只覆盖 N43 Engineering 的 `RA-N21-008`。这不是把自动化、AI 或开发者操作换算成真人 Product Acceptance。

## 2. 有界授权

`RA-N21-008` 只允许：

- N43 七工作模式与跨视图协议 Engineering；
- Writer、Director、Flow、Production、Debug & QA、Mobile Focus、Quick Start 作为同一 Canonical Project 的布局和工具优先级；
- Beginner/Pro 可逆切换、统一选择/上下文协议、键盘/触摸替代路径、减少动效与受约束桌面/移动布局；
- 自动化、真实 IndexedDB、production browser 桌面/移动视口、性能和 Windows CI 开发者实测；
- E1 先关闭一个可独立验证的模式切换→同一 stable-ID 语句→保存重开→跨视图定位闭环。

它不允许：

- 登记 N21、N23、N30、N31、N32、N40、N41、N42 或 N43 Product Acceptance 通过；
- 进入 N50 正式 Player、N51/N52 Gal Settings、N62 自动附加页、Android/三端构建、M1 Stable 或发布；
- 为每种模式建立私有剧情、选择、时间线或设置语义文档；
- 把三模式原型重新命名为完整七模式，或用响应式 CSS 截图替代真实任务闭环；
- 把 AI、开发者或自动化操作冒充真人证据，或擅自合并 Draft PR。

## 3. 真实预期—实际—差异—修正

| 检查 | 冻结预期 | 首次实际 | 差异与修正 | 最终判定 |
|---|---|---|---|---|
| 唯一 active | RA-008 active，RA-001–007 closed | 策略代码更新后专用正反例通过 | 无需放宽唯一 active 规则 | PASS |
| N43 正例 | `currentDeliveryNode=N43`、maximum N43 时通过 | 治理配置 `3 files / 20 tests` 通过 | 无差异 | PASS |
| N50 越界 | 返回 `current delivery node exceeds the accepted maximum` | exact violation 命中 RA-008 | 无差异；上限未放宽 | PASS |
| 产品门 | 删除 N43 Product Acceptance 阻断时失败 | exact missing-gate violation 命中 RA-008 | 无差异 | PASS |
| 旧例外 | RA-007 重新 active 时失败 | 同时命中唯一 active 和 superseded closed | 无差异 | PASS |
| 权威追踪 | active exception 必须出现在 M1 矩阵且证据可读 | 首次 `audit:risk-acceptances` 失败：RA-008 未进入矩阵，`docs/201` 尚不存在 | 不改审计器；新增本文件并同步 89/90/99；复测返回 current N43、active RA-008、maximum N43 | PASS |
| 真人边界 | N21/N23 继续 pending | 实际为 `0/1`、`0/2`，阻断项已前移到 N43 Product/N50 | 无差异 | PASS |

## 4. N43-E1 冻结起点

治理门闭合后，E1 先做当前三模式壳层、Canonical selection/context 与 N43 冻结规格的代码差距审计，再选择一个最小产品结果。冻结顺序为：

1. 建立七模式的版本化布局描述和统一 Mode ID，不保存任何模式私有语义；
2. 首个切片只开放 Writer、Director、Flow、Quick Start 的真实切换，其余模式必须明确显示为受控未完成，禁止空壳冒充完成；
3. 同一 stable-ID 语句在模式切换前后保持 Project semantic hash、编辑选择、Runtime 位置和保存重开不漂移；
4. production browser 至少实测桌面与 390px 移动视口，记录预期、首次实际、差异、修正、console 和布局边界；
5. E1 不宣称完整 N43，不触碰正式 Player 或 Gal Settings。

## 5. 关闭条件

本地治理正反例、真实风险注册表、N21/N23 pending、需求追踪、delivery baseline、文档格式和完整仓库门必须全部通过；远端 Windows / Node 22 在同一治理头复验后才关闭本检查点。治理切片不修改生产 UI，因此不伪造浏览器视觉结果；production browser 从 N43-E1 产品代码恢复。

本机完整门进行了两次真实尝试，但未伪装为单链绿色：第一次在重型 VM 10,000-seed 用例实际 `96.50s > 90s` 超时；保持 10,000 seeds、digest 和 90 秒门槛不变后，隔离复测 `5/5`、核心测试 `80.59s <90s`。第二次完整门在 `App.test.tsx` 的键盘范围选择/触摸等价控件用例发生 `5.229s >5s` 超时；不提高 5 秒门槛，原用例隔离复测测试体 `2.05s` 并通过。两次失败位置不同，且断言均未失败，判定为本机并行负载抖动，等待干净 Windows 同一完整门裁决。

未到达的后段门随后按原命令独立补齐：14 个 workspace 构建、93 个 portable 文件架构审计、Script/Stage/Route/Asset 性能全部通过；Route 编辑同步 P95 `168.63ms <500ms`，Dicing `2666ms <5000ms`、净节省 `85.83%`，Editor JS `905.92 kB / gzip 252.88 kB` 的既有拆包债保持。

远端干净 Windows / Node 22 在治理实现头 `136cc37` 上完整 `npm run check` 退出码为 0：治理 `3 files / 20 tests`，N42 汇总 `16 files / 192 tests`，常规 `128 files / 799 tests`，storage `1/1`，重型 VM `5/5` 且核心测试 `62.38s <90s`；Route P95 `150.02ms <500ms`，10,000 条贝塞尔规划 `13.82ms <500ms`，Editor JS `906.00 kB / gzip 252.87 kB`。两处本机超时均未复现，且所有冻结断言、规模、digest 与预算保持不变，因此以环境负载差异关闭，不修改功能或门槛。run `32821867501` / job `97721518865` 用时 6 分 10 秒。

本治理检查点由此关闭，允许下一分支开始 N43-E1 产品代码；它只解除 N43 Engineering 前置，不解除 N43 Product Acceptance、N50+、M1 Stable 或发布门。
