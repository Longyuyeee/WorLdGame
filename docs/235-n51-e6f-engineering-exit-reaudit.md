# N51-E6f Gal Settings Engineering 出口复审

> 日期：2026-08-28
> 分支：`codex/n51-e6-p0-coverage-exit`
> 直接基线：N51-E6e 最终绿色头 `b057973`
> 授权：`RA-N21-010`，最大节点 N51
> 当前判定：N51 Engineering 关闭；N51 Product Acceptance 继续阻断

## 1. 出口目标

E6f 不再扩充 Settings 字段，而是把 E6 入口矩阵逐项回填为可重复审计的工程出口：

1. N51 自有且现有 Host 可执行的配置必须贯通 typed schema、Catalog、Canonical Project、Settings UI、Editor Preview / Player application 与真实 production Web 证据；
2. 属于 N52/N61/N62/N70–N72/N80–N83 的执行系统必须保持唯一所有者，不得以占位字段或 Web 模拟器冒充完成；
3. Engineering 关闭与 Product Acceptance 必须分开。正式 Windows/Android Player Host、实机与真人记录缺失时，AC-19 和 REQ-GAL 仍只能保持“实现中”。

## 2. 代码事实与所有权回填

| 出口事实 | 当前代码 / 证据 | 判定 |
|---|---|---|
| typed 配置 | schema v5，36 个唯一 Advanced 字段、23 个 Basic 字段，9 个 section | PASS |
| 继承与编辑 | default → project → platform；来源、reset、原子 ChangeSet、stale revision、Undo/Redo | PASS |
| Canonical 持久化 | `settings/project.json`；v1–v4 严格迁移至 v5；future/unknown fail closed；Node/IndexedDB 保存重开 | PASS |
| application | application v1 由 Editor Preview 与正式 Player 共用；settings-only 更新不重建 Core | PASS |
| Web Host | `WebPlayerHost` 类型和运行时固定 `web`；嵌入观察值公开 `settingsPlatform: web` | PASS |
| production UI | Chrome 151 冷 build，Editor 修改、保存、释放、重开；桌面/390px、触控、overflow、console | PASS |
| production Player | Chrome 151 冷 build，标题、Choice、路线、对白、热应用；9/9 快照为 Web | PASS |
| Windows/Android | Windows conformance 只有存储桥；Android Player Host 不存在 | BLOCKED，不计为 N51 Web Engineering 失败，也不得计 Product PASS |

## 3. 冻结后续所有者

`config/n51-engineering-exit.json` 是机器可读出口合同，冻结以下唯一归属：

- N52：Player Save/Load/History/Back/Forward/Auto/Skip 与 Choice 调度；
- N61：Localization 生产、语言切换、Ruby 与语言专用媒体；
- N62：玩家 Route、Gallery、Replay、Music、Ending 与其他自动页；
- N70–N72：资源和 Optimization Profile、联合预算与可解释回退；
- N80–N83：正式 Windows/Android Player Host、安装包、Build Profile 与发布元数据。

这些范围不进入 N51 schema，不代表需求被删除。它们继续在 REQ-GAL 的跨节点 Product Acceptance 中保持未完成。

## 4. 首次预期—实际—修正

新增 `audit:n51-engineering-exit` 并接入根 `npm run check`。审计直接读取真实 Catalog、schema/application 常量、Web Host 源码、双 production JSON 和权威文档，不接受人工填写的“全绿”代替代码事实。

首次运行的代码结果全部满足：schema 5、application 1、36/23、Web-only production Host、Windows/Android blocked、五个后续 owner、双 evidence PASS。实际只失败 5 项：#229、#89、#90、#99 未登记出口，#235 尚不存在。修正仅更新这些权威状态与缺失的 Canonical v5 演进说明；没有添加业务字段、放宽测试或改变后续节点。

## 5. 出口证据与诚实边界

- E6a：严格 schema v1→v2 迁移、真实 Node/IndexedDB、Core 保持；
- E6b：Text/Accessibility 六字段、双 production browser；
- E6c：Stage/Audio 三字段、显式 Story 优先、真实 Canvas/Audio lifecycle；
- E6d：Choice/UI 四字段、同 Core 热应用、响应式布局、默认 Textbox；
- E6e：Settings/Runtime/Compiler Profile 分层，Web Host 固定身份；
- E6f：机器可读出口合同、首次差异审计、文档/需求对齐与完整门。

N51 Engineering 关闭只表示当前授权范围内的 portable Settings、Canonical、Editor 与 Web Player 工程链已完成。N51 Product Acceptance、AC-19、REQ-GAL、N52 Engineering、M1 Stable 和 Public Release 仍被 `RA-N21-010` 与缺失的跨节点/实体 Host/真人证据阻断。

## 6. 本切片退出门

### 6.1 真实 production 与定向门

| 门 | 实际结果 |
|---|---|
| `audit:n51-settings-browser` | PASS；Chrome 151；23 个 Basic、7 个 workspace mode；真实编辑、保存、释放、重开后 Web 音量 `0.4`、中断后恢复 `false`、高对比度 `true`、选项编号/输入提示 `false`；390×844 overflow `0`、无过小触控目标、焦点可见、无浏览器失败；证据时间 `2026-08-28T07:54:59.600Z` |
| `audit:n51-settings-runtime-browser` | PASS；Chrome 151；9/9 快照均为 `web`；标题、Choice、路线、对白、设置热应用与 Core 身份保持均符合预期；桌面与 390×844 overflow `0`、无浏览器失败；证据时间 `2026-08-28T07:55:12.425Z` |
| `audit:n51-gal-settings` | 10 files / 95 tests PASS |
| `audit:n51-engineering-exit` | 首次按冻结预期运行：代码与 production 事实全部 PASS，5 个文档登记项 FAIL；修正文档后 PASS，0 violations |
| governance | `audit:requirements` PASS（50/10/13/27/6）；`audit:pr-traceability` PASS |

双 production 截图哈希与上一切片一致，证明 E6f 没有通过改变 UI 结果获得通过；本次更新的是新的冷构建执行时间和运行观察证据。

### 6.2 完整门首次实际与差异处理

本地 `npm run check` 连续执行两次，均没有得到完整绿色，但失败点不同：

1. 第一次在既有 `n43-workspace-context-app.test.tsx` 租约卸载测试中，冻结 5 秒内 contender 实际仍为 `held`，预期为 `acquired`；原代码同命令定点复跑 PASS，测试 `2.534s`；
2. 第二次在既有 `App.test.tsx` “inserts stage directions from the graphical track and supports keyboard access” 中超出 5 秒，实际 `5.317s`；原代码同命令定点复跑 PASS，测试 `2.271s`。

两次失败都发生在不同的既有 N43 测试，且精确复跑通过，因此没有证据支持修改业务代码或放宽 5 秒测试预算。为区分功能失败与本机累计负载，随后在同一工作树执行与根门等价的分段链路，实际结果为：

- N43 聚合与各集成分组全部 PASS；普通测试 149 files / 886 tests PASS（`441.64s`，其中 environment `240.49s`）；主 App 45/45 PASS（`46.83s`）；Autosave 1/1 PASS（`6.22s`）；
- VM conformance 5/5 PASS（测试 `75.62s`）；所有 workspace production build PASS；架构审计 PASS（portable 100 files、Node adapter 4 files）；
- script performance 13/13 PASS；route performance 9/9 PASS，真实编辑链 p95 `174.67ms < 500ms`；asset performance 4/4 PASS，dicing 总计 `2492.69ms < 5000ms`。

因此本地结论是“所有分段真实门绿色，但一体化命令受累计环境长尾影响未得到完整绿色”，不能写作本地 `npm run check` PASS。最终 Engineering 关闭仍须由推送后的同提交 Windows / Node 22 CI 完整门仲裁；若 CI 不绿，本切片继续阻断。

### 6.3 同头 CI

待实现提交与最终文档提交推送后回填运行、job、提交与实际结果。任何门失败时必须保留首次实际并修正或继续阻断，不得删除断言、减少 corpus、提高预算或提前进入 N52。
