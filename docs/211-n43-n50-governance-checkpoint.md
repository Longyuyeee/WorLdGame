# N43→N50 正式 Player Shell Engineering 治理检查点

> 日期：2026-08-26  
> 分支：`codex/n43-n50-governance`  
> 直接基线：N43-E7 最终绿色头 `dd107bf`  
> 授权：`RA-N21-009`，最大节点 N50，2026-09-25 16:07:12（UTC+8）到期  
> 判定：只准入 N50 Engineering；N50 Product Acceptance、N51+、Android 实体包、M1 Stable 与发布继续阻断

## 1. 触发与前置事实

N43 七工作模式 Engineering 已达到真实任务 `7/7`；实现头远端 run `32943861705` / job `98100313426` 用时 `11m15s` 绿色，最终文档头 run `32945029304` / job `98103832178` 用时 `9m39s` 绿色。正式 Player 仍不存在，当前单文件试玩仍使用独立 `StoryStatement` 解释器；N21 为 `0/1 pending-participant`，N23 为 `0/2 pending-participants`。

产品负责人已被明确告知 `RA-N21-008.maximumDeliveryNode=N43` 且 N50 被阻断，随后于 2026-08-26 再次明确要求进入后续步骤，并继续要求真实预期—实际差异测试、修正、文档、逐步审计、需求对齐和推送。因此关闭 RA-008，建立只覆盖 N50 Engineering 的 `RA-N21-009`。这不把自动化、AI 或开发者操作换算成真人 Product Acceptance。

## 2. 有界授权

RA-009 只允许：

- N50 正式 Player Shell 与输入 Engineering；
- 建立一个共享 Player Core 契约，为未来 Web/Windows/Android 宿主提供同源边界；
- 标题、开始/继续、对白、选择、历史、设置、存读档、错误页的有序切片；
- 鼠标、键盘、触摸、基础手柄、响应式安全区和无障碍的自动化与 production-browser 实测；
- Player 必须消费正式 Compiler IR、portable Runtime 与 Runtime Host，不得复制剧情解释器；
- E1 先关闭“Canonical Project → 正式 Compiler → Runtime/Host → 最小 Player Core snapshot”的可独立验证闭环。

RA-009 不允许：

- 登记任何 Product Acceptance 或真人门通过；
- 进入 N51 Gal 配置中心、N52 播放控制产品化、N60+、三端构建、Android APK/AAB、M1 或发布；
- 把 Editor Preview、VM Harness 或旧单文件试玩改名为正式 Player；
- 在 Web/Windows/Android 三处复制剧情逻辑，或在 E1 先造三个宿主空壳；
- 以响应式截图代替真实输入、状态、保存重开和正式运行链证据。

## 3. 真实预期—首次实际—修正

| 检查 | 冻结预期 | 首次实际 | 差异与修正 | 判定 |
|---|---|---|---|---|
| 唯一 active | RA-009 active，RA-001–008 closed | 策略 `3 files / 20 tests` 通过 | 无差异 | PASS |
| N50 正例 | current/maximum 均为 N50 | 专用正例通过 | 无差异 | PASS |
| N51 越界 | exact maximum violation | `RA-N21-009: current delivery node exceeds the accepted maximum` | 无差异 | PASS |
| N50 产品门 | 删除阻断时 exact fail | `active N21 exception must block N50 Product Acceptance` | 无差异 | PASS |
| 旧例外 | RA-008 重新 active 时失败 | 唯一 active 与 superseded 两项 exact violation | 无差异 | PASS |
| 权威追踪 | active RA 必须在矩阵且证据可读 | 真实注册表首次失败：矩阵缺 RA-009、`docs/211` 不存在 | 新增本文件并同步 89/90/99/README，不修改审计器；复测 current N50 / active RA-009 / maximum N50 | PASS |
| 真人边界 | N21/N23 保持 pending | 实际 `0/1`、`0/2` | 无差异 | PASS |

## 4. N50-E1 冻结起点

治理门关闭后，E1 按以下顺序实施：

1. 盘点并明确禁止旧 `playable-web-export.ts` 的平行解释器成为 Player Core；
2. 建立独立、portable 的 Player Core 输入/输出契约，只接受正式 Compiler/Runtime/Host 事实；
3. 先交付最小标题→开始→当前对白/选择→错误页状态机，不先铺开完整设置和存档 UI；
4. 用真实 Benchmark/Golden 工程比较期望 Runtime observation 与 Player snapshot，加入错误项目 fail-closed 反例；
5. production browser 实测桌面和 390×844：输入等价、安全区、无横溢出、console、可访问名称，并记录首次差异和修正；
6. E1 不宣称正式 Web build、Windows/Android 宿主、N50 Product Acceptance 或 N51 已开始。

## 5. 关闭条件

治理正反例、真实风险注册表、N21/N23 pending、需求追踪、delivery baseline、文档格式与完整仓库门必须通过；远端 Windows / Node 22 在同一治理头复验后才关闭本检查点。治理切片不修改生产 UI，因此本步没有伪造浏览器结果；production browser 从 N50-E1 产品代码恢复。

## 6. 本机完整门实际结果

- 风险策略 `3 files / 20 tests`、需求 `50`、14 workspace、7 个 Golden、N21 `0/1 pending`、N23 `0/2 pending` 均按冻结结果通过。
- N43 门 `10 files / 25 tests` 与七个产品集成任务、完整 App `45/45` 通过；普通回归 `137 files / 780 tests`、storage `1/1` 通过。
- 冻结 VM `5/5`，核心测试实际 `89.83s <90s`，只余约 `0.17s`，未放宽预算；远端必须再次裁决。
- 全部 production build 和 93 portable / 4 adapter 架构通过；Editor CSS `126.46/22.88 kB`、JS `936.99/261.39 kB`，既有分包债保持。
- Script 性能 `13/13` 通过；Route 编辑 P95 `271.85ms <500ms`，Lazy Route `375.56ms <500ms`，Global Lazy Index `385.56ms <500ms`。
- 完整单链首次在最后的既有 Dicing Atlas 子预算得到 `3081.98ms >3000ms`，总计仍为 `4550.22ms <5000ms`、净节省 `85.83%`。不修改代码或门槛，原命令隔离复跑 Atlas `2048.65ms <3000ms`、总计 `3378.74ms <5000ms`，`4/4` 通过。该本机负载差异保留，等待远端完整门裁决。
- 远端 Windows / Node 22 完整门：**待首次推送后回填**。
