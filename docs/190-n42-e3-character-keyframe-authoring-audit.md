# N42-E3 角色关键帧编排闭环审计

> 日期：2026-08-24
> 分支：`codex/n42-e3-character-keyframe-authoring`
> 直接基线：N42-E2 最终绿色头 `a130779d03977e2eeff93cecca2260bd01ac868b`
> 授权：`RA-N21-007`，只覆盖 N42 Stage Engineering
> 实现头：`ec3809b23f1aa7b79a0d02da903d21e2f18f6833`
> Draft PR：[#69](https://github.com/Longyuyeee/WorLdGame/pull/69)（Draft，保持 open）
> Windows CI：run `32708909967` / job `97375916279`，5 分 48 秒，绿色
> 判定：N42-E3 角色关键帧 Engineering 切片完成；完整多轨/时间标尺/路径/镜头/模板、N42 Product Acceptance、N43+、M1 Stable 与发布继续阻断

## 1. 冻结目标与非目标

本切片只关闭“从当前角色 Show/Move 创建下一关键帧”的纵向链。关键帧不建立第二份状态或独立时间轴数据库，而是投影为带稳定 Statement ID 的 canonical `@show action=move`：图形面板读取当前正式 Preview 舞台状态，编辑后通过既有事务插入权威 Script，现有 Preview、Formal Runtime 与 Runtime Host 顺序消费同一语义。

当前切片不是完整时间线：没有多轨 playhead、时间标尺、任意时间采样、贝塞尔路径、镜头轨、转场轨或模板系统；也不宣称 N42 Product Acceptance 或真人验收完成。

## 2. 产品实现

- 新增纯语义规划器 `stage-keyframe.ts`：只接受无歧义且槽位当前有效的 Show/Move Cue，从正式 Stage plan 继承 `slot/z/x/y/scale/rotation/anchor/duration/easing`；
- 规划器对位置、缩放、旋转、锚点、层级、时长与 easing 做边界校验；没有任何几何变化时拒绝写入，避免空关键帧污染 Script；
- Sequence Stage 增加“＋ 关键帧”入口；非角色 Cue、隐藏/无效槽位、草稿态或多选态保持禁用；面板明确展示源稳定 ID 到新关键帧的关系；
- 提交后仍走 `insert-direction` 事务，生成新稳定 ID、插入当前 Cue 之后、自动选中新步骤，并继续支持撤销、Script 同源和正式执行链；
- Character lane 对 Move Cue 显示 `KF` 标记，使已存在及新建关键帧在图形轨道可识别。

## 3. 预期—实际—修正

| 检查 | 预期 | 首次实际 | 修正 | 最终实际 |
|---|---|---|---|---|
| 测试先行 | 语义与 UI 均先红后绿 | 规划器模块不存在；UI 找不到“＋ 关键帧” | 增加 fail-closed 规划器、图形面板、事务接入与 KF 标记 | 目标 41/41；全仓 753/753 |
| 当前状态继承 | 选中 Move 后继承实际最终几何 | 真实 fixture 的 `media_move` 为 X=25/Y=80/scale=0.9/800ms/ease-in-out | 直接读取 `derivePreviewStagePlan`，不复写一套状态计算 | seed 与 Preview 实际完全一致 |
| 空关键帧 | 未改变几何不得产生 revision | 初始面板所有值与当前状态相同 | `NO_GEOMETRY_CHANGE` 失败关闭并禁用提交 | Script 与 revision 均不变化 |
| 规范写回 | 合法修改生成单一 canonical Move | 测试目标为 X=72/Y=84/scale=1.05/650ms/ease-out | 规范化数值并保留完整几何、slide 与 easing | App 集成与真实 fixture 参数断言通过 |
| 浏览器实测 | 打开本地页完成可见交互 | 开发服务器正常监听，但隔离浏览器对 `localhost` 报 `ERR_BLOCKED_BY_CLIENT`，对宿主回环报连接拒绝 | 改为真实产品 fixture、IndexedDB 重开、Preview/Runtime 自动化证据；不伪造 UI 通过 | 浏览器验收记为环境阻断，不计通过；自动化与构建通过 |
| 架构边界 | 不建立第二套时间轴模型 | 无冲突实现 | 关键帧保持 canonical Move 投影，Editor 只依赖现有 portable 语义 | 架构审计 93 portable / 4 adapters 通过 |

## 4. 测试与构建证据

- RED：规划器 import 缺失；UI 入口缺失，均按预期失败；
- 目标矩阵：规划器、App、真实 PNG/WAV Stage fixture 共 3 files / 41 tests 全绿；
- 全仓：普通 119 files / 747 tests、IndexedDB storage 1/1、VM conformance 5/5，总计 753/753；
- Sequence 退出门：10 files / 86 tests；需求审计 50 requirements / 10 USP / 13 P0 modules / 27 acceptance criteria；架构审计 93 portable / 4 adapters，全部通过；
- 13 workspace production build 通过；Editor CSS 90.21 kB / gzip 16.91 kB，JS 865.01 kB / gzip 243.94 kB；既有 `>500 kB` 拆包债保留；
- 浏览器环境未形成可接受的产品 UI 证据，因此本审计明确不把浏览器验收登记为通过；Draft PR #69 的实现头在干净 Windows / Node 22 完整门绿色：run `32708909967` / job `97375916279`，5 分 48 秒。

## 5. 对齐与出口

本切片推进 `REQ-STAGE`、`AC-03` 与 `AC-13`：用户不写 Script 即可从当前舞台状态编排下一角色关键帧，同时保持 canonical schema、稳定 ID、单一权威来源、确定性校验、撤销与正式 Runtime 边界。它是“基本角色关键帧编排”的最小生产语义，不等于完整多轨时间线。

下一切片仍须从 N42 冻结范围选择独立可实测结果，优先补齐关键帧在生产浏览器中的保存重开/正式运行可见证据，或继续有界推进时间线投影；N42 Product Acceptance、N43+、M1 Stable 与发布保持阻断。
