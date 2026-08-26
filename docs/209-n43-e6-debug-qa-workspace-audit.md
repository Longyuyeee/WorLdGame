# N43-E6 Debug & QA 正式诊断工作区审计

> 日期：2026-08-26  
> 直接基线：N43-E5 最终头 `f383312a3c2ecc2b1ddeb1678724e81e924279dc`  
> 授权：`RA-N21-008`，只覆盖 N43 Engineering  
> 判定：**Debug & QA 的正式 Compiler / Runtime / Source Map 检查与源码定位切片通过，七模式可用度由 5/7 提升为 6/7；Mobile Focus、N43 总出口、Product Acceptance、N50+、M1 与发布继续阻断。**

## 1. 冻结目标与边界

E6 不建立另一份 QA 工程或诊断数据库。中央任务直接消费当前 Canonical Project、当前 Studio 草稿诊断、正式 Project Compiler、正式 Runtime 和 Source Map：

1. 对当前 scene / statement stable ID 运行正式检查；
2. 草稿有 error 时 fail closed，不对旧 Canonical 内容制造假绿；
3. 汇总 authoring / compiler / runtime / source-map / session 诊断，使用文字、符号与严重级别而非只用颜色；
4. 可定位问题返回 Writer / Sequence 的同一 stable ID 修复；
5. 模式、选中语句和工程保存重开后保持一致。

本切片不宣称 N60 完整 Debugger、断点管理、Watch、Solver、覆盖率、正式 Player 调试、Android 真机或 Product Acceptance 已完成。

## 2. 实现事实

- `debug-qa-workspace.ts` 是正式链的纯任务投影：错误草稿先阻断；否则调用 `startFormalPreviewFromStatement`，再从正式 observation 读取 Runtime 与 Source Map 结果。
- `DebugQaWorkspace.tsx` 提供当前检查目标、正式检查动作、四项指标、严重级别筛选、建议下一步和“定位并修复”闭环。
- `App.tsx` 只在 Debug & QA 模式挂载中央任务；定位动作回到 Writer / Sequence，并复用既有 workspace context 与 Canonical selection。
- Debug & QA 只在真实任务接入后由 disabled 改为 available；Mobile Focus 继续 fail closed。
- 桌面与 `≤820px` 使用同一结果语义；手机将指标收敛为 2×2，主要/定位/筛选操作达到触控高度。

## 3. 预期—首次实际—修正

| 检查项 | 冻结预期 | 首次实际 | 修正与复测 | 判定 |
|---|---|---|---|---|
| 正式链正例 | 当前 stable ID 经 Compiler→Runtime→Source Map，无诊断 | `stmt_gate_001` 为 ready，Source Map true，0 error / 0 warning | 无语义差异 | PASS |
| 错误草稿负例 | 不运行旧 Canonical | `PARSE_EXPECTED_TEXT` 使 runtime=`blocked-by-authoring`、Source Map false | 无差异 | PASS |
| 聚合上下文负例 | 只拒绝仍未开放的未来模式 | 旧测试仍把 Debug & QA 当作 disabled，聚合门首次失败 | 将负例目标改为仍禁用的 Mobile Focus；不删除安全门 | PASS |
| App 模式边界 | Debug & QA 可用、Mobile Focus 禁用 | 旧 App 回归仍断言 Debug & QA disabled | 更新为可用并新增同 stable-ID / r0 断言 | PASS |
| 次操作视觉 | 深色现代层级，不能继承浅色实心按钮 | 浏览器截图中“在 Sequence 检查当前语句”为不一致的浅色实心外观 | 增加紫色语义描边；computed 为 `rgba(139,124,255,.09)` / border `.36` / radius `10px` | PASS |
| 桌面布局 | 无文档横向溢出，四指标等宽 | 1280px 文档 `1280/1280`；四项各约 `289.55×84px` | 无差异 | PASS |
| 390×844 | 操作≥44px、无横溢出 | 请求 390，首次 client `375/375`；主按钮 `351×48`、定位 `317×44`、筛选均 `44px` | 无差异；重开时 client `390/390` 仍无溢出 | PASS |
| 定位/保存重开 | 返回同 stable ID，保存后恢复 Debug & QA | 定位为 `writer / stmt_gate_bg`；保存 `s1`；直接 reload 返回 Launcher | 按产品生命周期从 Recent 重开，恢复 `debug-qa / stmt_gate_bg / restored` | PASS；未绕过 Launcher |
| Console | 0 warning / 0 error | 实际 `[]` | 无差异 | PASS |

## 4. 自动化与性能实际值

- N43 聚合门为 `16 files / 76 tests`，通过；其中纯投影 `9/23`，六个产品集成任务及 App 回归全部通过。
- 普通回归 `136 files / 778 tests`，通过；storage `1/1` 通过。
- 首次完整门在连续重型集合后，既有 N41 UI 用例 `5.274s > 5s`；未放宽 timeout，原样隔离复跑测试体 `2.01s`，第二次完整门已越过同一位置。
- 第二次完整门在更后的冻结 VM 测试体得到 `99.837s >90s`；未减少 10,000 seeds、未改 digest、未放宽预算。原样隔离复跑测试体 `60.43s <90s`，5/5 通过。
- 因第二次完整门在 VM 处退出，后续门按原命令逐项补跑：全部 build、93 portable / 4 adapters 架构、Script、Route、Asset 均通过。Route 编辑 P95 `189.62ms <500ms`；Lazy Global Index `499.52ms <500ms`；Dicing 总计 `4024.29ms <5000ms`。
- Editor production build：CSS `121.79/22.05 kB`，JS `931.67/259.73 kB`；`>500 kB` 分包债保持，未提高 warning 门。
- 远端 Windows / Node 22 完整门在实现推送后作为本机冻结 VM 累积负载差异的最终裁决；绿色前不登记远端通过。

## 5. 需求对齐与出口

- `USP-01 / AC-03`：诊断、定位和修复消费同一 Canonical stable ID，没有第二份 QA 剧情。
- `USP-06 / REQ-UX / AC-11`：七模式身份仍为 7 个，真实任务可用度为 6/7；Debug & QA 有正式链任务而非空面板。
- `REQ-QA / AC-05 / AC-06`：正式 Compiler、Runtime 与 Source Map 已形成面向用户的检查入口；N60 的断点、Watch、Solver 和完整 QA Golden 仍缺。
- 真实浏览器、真实 IndexedDB 保存与产品 Launcher 重开已通过；没有把自动化冒充真人或实体设备验收。

因此 N43 总出口仍为 FAIL：真实任务为 `6/7`，Mobile Focus disabled，真人为 0，main 尚未集成。下一步仍在 `RA-N21-008` 内实现 Mobile Focus 的完整手机创作任务；完成真实编辑、触屏/IME 替代、保存重开、生产浏览器和差异记录前保持禁用。
