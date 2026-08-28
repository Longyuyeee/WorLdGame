# N51→N52 Player Control Engineering 治理检查点

> 日期：2026-08-28
> 分支：`codex/n51-n52-governance`
> 直接基线：N51-E6f 最终绿色头 `7bc7b78`
> 授权：`RA-N21-011`，最大节点 N52，2026-09-27 16:00:00（UTC+8）到期
> 判定：只准入 N52 Engineering；N52 Product Acceptance、N60+、实体设备、M1 Stable 与发布继续阻断

## 1. 触发与前置事实

N51 Engineering 已关闭：schema v5、Advanced 36 / Basic 23、Canonical 保存、Editor 与正式 Web Player application、双 production-browser、机器出口合同和实现/最终文档两个 Windows / Node 22 完整门均通过。`RA-N21-010` 明确截止 N51，并持续阻断 N52。

产品负责人已被明确告知下一步必须先取得 N52 授权，随后于 2026-08-28 再次要求进入后续步骤，并继续要求真实测试、预期—实际差异修正、文档同步、逐步目标审计、需求对齐和推送。因此关闭 RA-010，建立只覆盖 N52 Engineering 的 RA-011；这不解除任何 Product Acceptance、真人、实体设备或发布门。

## 2. 真实代码与需求边界

| 能力 | 当前真实代码 | N52 判定 |
|---|---|---|
| Save | N31 `createRuntimeSaveV1/loadRuntimeSaveV1` 已有严格 canonical、Build ID、Hash、future/corrupt 拒绝 | 复用内核；Player 槽位、截图、元数据与 Host 持久化未实现 |
| Session Save | N31 `createRuntimeSessionSaveV1/loadRuntimeSessionSaveV1` 已保存完整 History/cursor 并支持 rehydration | 作为 Back/Forward 可恢复存档基础，不复制格式 |
| History | N31 已有 checkpoint、Back、Forward、分支截断、Barrier、Meta merge | Player Core 当前不持有 History Session，未形成玩家产品闭环 |
| Presentation reconciliation | Runtime Host 已有 Back compensation / Forward replay | Player Core 尚未调用，媒体舞台后退/前进未闭环 |
| Auto/Skip | N31 Scheduler 已有 Normal/Auto/Skip Read/Skip All、5/10/20/40/Instant、hold/toggle、Stop Point 与 stop reason | Player Core/Shell 尚未接入；后续 N52 切片实现 |
| 正式 Player | 当前 intent 只有 primary、select-choice、cancel、restart | N52 必须扩展同一 Core，不建立第二 Runtime 或独立解释器 |

## 3. 有界授权

RA-011 允许：

- N52 Player Save/Load、History、Back/Forward、Auto、Skip 与 Choice scheduling Engineering；
- 复用正式 Compiler IR、N31 Runtime Save/Session Save/History/Scheduler 和 Runtime Host reconciliation；
- 以有序切片把能力接入同一个 Player Core、Web Player Shell 和版本化 mount API；
- 每个 UI 切片执行桌面与 390×844 冷 production-browser 的真实操作、状态/Hash、overflow、触控、焦点和 console 证据。

RA-011 不允许：

- 登记 N52 或任何既有 Product Acceptance 通过；
- 进入 N60 Debugger、N61 Localization、N62 自动页、N70+、三端安装包、M1 或发布；
- 创建第二套 Runtime、History、Save 格式或 Player Core；
- 以 localStorage demo、静态按钮、mock Runtime、开发服务器截图或开发者操作冒充正式 Host 持久化/真人/实体设备验收。

## 4. 冻结正反例与首次实际

先修改治理测试冻结 RA-011，再运行旧策略，预期新正例失败。首次实际为 `3 files / 20 tests` 中 16 通过、4 失败：

1. N52 正例实际仍被要求阻断 `N52 Engineering`；
2. active maximum 实际仍禁止超过 N51；
3. active 身份实际仍只接受 `RA-N21-010`；
4. 因旧合同存在，缺失 `N52 Product Acceptance` 与 RA-010 复活反例无法得到新合同的精确错误。

修正只把 active 身份、maximum、blocked gates 和 superseded 链推进到 RA-011/N52；没有修改 Player 产品代码、真人记录、测试预算或后续节点。修正后的实际结果在本切片验证章节回填。

## 5. N52-E1 冻结起点

E1 只建立 History-backed Player Core 基础闭环：

1. 正式 Player Core 以 N31 `RuntimeHistorySessionV1` 记录每个可观察剧情边界，同时保持现有标题→对白/Choice→结局行为与 snapshot 兼容；
2. 新增 Back/Forward intent，直接调用 N31 `backRuntimeHistoryV1/forwardRuntimeHistoryV1`；
3. 按 Runtime History reconciliation plan 调用正式 Runtime Host compensation/replay，使 state hash 与 presentation host hash 同步回退/前进；
4. 真实 Golden 路线证明“结局→Back→Forward 回到完全相同 state/host hash”，以及“Back 后改选另一分支会截断旧 Forward”；
5. 接入 Web Player Shell 的可访问控制并执行桌面/390×844 冷 production-browser；无历史时必须明确 disabled，不得静默 no-op；
6. E1 不实现槽位持久化、自动/快速保存、Auto/Skip 或 N52 Product Acceptance。

## 6. 关闭条件

治理策略正反例、真实风险注册表、N21 `0/1` 与 N23 `0/2` pending、需求追踪、delivery baseline、文档、完整仓库门和同一提交 Windows / Node 22 CI 必须通过。本治理切片不改产品 UI，因此不制造浏览器截图；production-browser 从 N52-E1 恢复。

## 7. 本切片验证与远端裁决

### 7.1 本地真实结果

| 验证 | 冻结预期 | 实际 | 差异与处置 |
|---|---|---|---|
| RA-011 策略 | N52 正例、N60 越界、N52 Product 阻断、RA-010 superseded | 首次 `16/20`，旧策略产生 4 项精确失败；修正后 `3 files / 20 tests` PASS | 按第 4 节更新策略和注册表，未改测试预算 |
| 真实注册表 | current/max=N52，仅 RA-011 active | PASS；RA-001–010 全部 closed；N52 Product、N60、M1、Release blocked | 无差异 |
| 需求/真人 | 50 requirements、27 AC；N21 `0/1`、N23 `0/2` pending | 全部 PASS，真人状态保持 pending | 无差异，自动化不换算真人 |
| N31 底座 | Save/History/Scheduler 与 10k corpus 绿色 | Runtime `60/60`；10,000 seeds / 20,000 replay、7 类场景 PASS，digest `20e9a842...92ef2` | 无差异 |
| N50/N51 回归 | Player 与 Settings 出口不退化 | N50 `37/37`、N51 `95/95`、N51 exit `0 violations` | 无差异 |
| 根完整门 | 不拆分、不放宽预算、全部通过 | `npm run check` 一次完整 PASS；普通 `149 files / 886 tests`，主 App `45/45` | environment `165.38s` 形成长尾但无断言失败 |
| Autosave / VM | `<5s` / `<90s` | Autosave `4.66s`；VM `5/5`、`76.25s` | 均通过；Autosave 仅余约 `0.34s`，保留余量风险 |
| 构建/架构 | 全 workspace 与 portable 边界通过 | PASS；100 portable / 4 Node adapter files | Editor `982.20 kB` 大 chunk warning 保留，不越界修改产品代码 |
| 性能 | Script/Route/Asset 原预算内 | Script `13/13`；Route `9/9`、P95 `161.05ms <500ms`；Asset `4/4`、dicing `2644.81ms <5000ms` | 无差异 |

本地完整门真实绿色，但治理检查点仍须以推送后的同一提交 Windows / Node 22 CI 复核，不能引用 N51 的旧运行。治理切片没有产品 UI 变化，因此本步不生成 production-browser 截图；N52-E1 必须恢复真实冷 production-browser。

### 7.2 同头 CI

待治理实现提交和最终文档提交推送后回填 run、job、SHA、耗时与实际结果。任何失败必须保留首次实际并修正或继续阻断，不得减少测试、删除断言、提高预算或提前写 N52 产品代码。
