# N60-E2 换机暂停与 N60-E3 接续交接

> 暂停日期：2026-09-01  
> 仓库：`Longyuyeee/WorLdGame`  
> 分支：`codex/n60-e1-debugger-session`  
> Draft PR：[#123](https://github.com/Longyuyeee/WorLdGame/pull/123)，暂停审计时为 OPEN / MERGEABLE  
> E2 实现提交：`4e2955911cc9059892a88da041db76558b1cf94f`  
> E2 证据提交：`32b28a42ef88e04630241bc2000ca96e6c91f710`  
> 状态：暂停开发；N60-E1/E2 已完成，N60-E3 尚未开始

## 1. 当前真实开发结论

N60-E1 已把正式 Compiler、Runtime、Runtime History、Runtime Host 与 Source Map 接入 Debug & QA，提供 Entry/当前语句启动、Back/Forward/Step/Step Over/Continue、当前位置、变量、调用栈和可见 Host 通道。

N60-E2 已完成：

- 按稳定 Scene/Statement ID 新增多个断点；
- 每个断点可独立启用、停用、定位和移除；
- Continue 通过正式 Source Map 和 Runtime Scheduler 命中下一个启用断点；
- 明确呈现 Breakpoint、Choice、awaited Effect、Barrier、Ending、Error 六类停止原因；
- 停止原因面板可返回当前稳定源码位置；
- desktop 与 390×844 mobile 的新增 UI 已完成 production 路径检查。

没有开始 N60-E3，没有 Watch 数据结构、Watch UI、变量来源/变化实现，也没有 Solver、覆盖率或完整 QA 报告代码。下一台电脑不得把这些写成“进行中”或“部分完成”。

## 2. 暂停时 GitHub 与 CI 精确状态

- `4e29559` 是 E2 产品代码与 #268 审计的实现头；Windows run `33491890189` / job `99805042362` 已成功，用时 `14m36s`；
- `32b28a4` 只追加上述 Windows 证据；暂停审计时 run `33493303766` / job `99809609963` 正在运行；
- 本交接文档将作为 `32b28a4` 的直接后继提交推送。换机时不要硬编码本文件撰写前的 SHA，应以 `origin/codex/n60-e1-debugger-session` 最新 tip 为唯一恢复头，并核对该 tip 的 Windows CI；
- PR #123 保持 Draft，不合并、不改为 Ready，也不触碰 main-target PR #122 的合并决定。

如果文档头 CI 仍在运行或被后续交接提交替代，换机后的第一项工作是等待最新 tip 的 `product-baseline / Windows / Node 22 / full check` 终态；旧 head 的绿色不得跨提交复用。

## 3. 已取得的真实测试证据

| 测试层 | 预期 | 首次/当前实际 | 结论 |
|---|---|---|---|
| E2 产品红测 | 真实 App 中可新增选择语句断点 | 首次 `0/1`，找不到“添加选择语句断点” | 精确证明 E1 产品缺口，不是人为造假失败 |
| Continue 语义 | 第一次命中 `stmt_gate_001`，再次继续到 Choice | 初版第二次继续仍命中 `stmt_gate_001` | 已修正 transient History Forward 与恢复点重测；最终到 `waiting-choice / stmt_gate_choice` |
| E2 定向 | 正式 Runtime + 两条 App 路径全部通过 | `3 files / 19 tests` | PASS |
| N60 聚合 | E1/E2、formal Runtime、QA model、既有工作区回归 | `5 files / 22 tests` | PASS |
| production desktop | 两断点、停用、Continue、Choice；无横溢出 | 1440×900 document `1440/1440`，停止原因面板 `1301/1301` | PASS |
| production mobile | E2 控件可触达且无横溢出 | 390×844 请求下根宽 `375/375`；新增控件、Continue、源码返回、启停/定位/移除均 `44px` | PASS |
| 本机完整门 | 保持 VM 10k 的 90 秒预算 | 普通 `156/984`、N60 `5/22`、构建/架构/Script/Route/Asset 通过；VM 长链 `94.671s`，隔离 `96.507s` | 本机完整门诚实记红，未提高 timeout |
| Windows 实现头 | 同预算裁决本机 VM 差异 | `4e29559` 全门绿色；VM `69.36s < 90s`、Route P95 `170.44ms < 500ms`、Asset Dicing `3259.15ms < 5000ms` | 实现头 PASS；最终文档 tip 仍需独立 CI |
| 治理/需求 | 当前 N60 授权与 50 项矩阵不漂移 | requirements PASS；risk acceptance PASS；governance `3 files / 23 tests` | PASS |

详细预期—首次实际—修正后实际见 [#268](../../docs/268-n60-e2-breakpoint-boundary-audit.md)。浏览器证据运行 production build 和真实校园示例工程，不是静态截图，也不是只检查元素是否存在。

## 4. 后续开发必须保持的重要规则

1. **先产品、后证据。** 每个切片先写清用户任务与可观察预期，再运行真实路径取得首次实际；测试和文档用于纠正产品差异，不能让验证、安全或治理成为主要交付物。
2. **只复用正式权威链。** Debugger 必须消费 Canonical Project、Compiler、Runtime、Runtime History、Runtime Host 与 Source Map；不得建立第二解释器、第二状态机、第二表达式求值器或以 `playable-web-export` 冒充正式 Runtime。
3. **真实测试必须记录差异。** 至少保留“预期 / 首次实际 / 修正后实际”；App 路径用真实工程和真实交互，production browser 同时测 desktop 与 390×844，并测实际 overflow、稳定 ID、状态和新增移动交互尺寸。
4. **不放宽既有预算来消除失败。** 性能或超时失败先隔离复现，再由相同预算的干净 Windows CI 裁决；本地红必须如实写入审计。
5. **每步结束必须审计并推送。** 复核开发目标、PRD、`USP-03`、`REQ-QA`、`AC-05` 和未完成边界；必要时同步 README、#90、#99、节点审计、风险证据路径与聚合脚本；提交后推送并等待精确 head CI。
6. **不提前登记产品通过。** N21/N23 真人仍为 `0/1`、`0/2`；N60 Product Acceptance、N61、M1 Stable 和发布继续阻断。Engineering 结果不能换算为真人、Android 实体设备或正式宿主证据。
7. **当前不要接入真人或记录操作时间。** 产品负责人已要求功能与整体 UI 完成后再测试；未来真人验收记录任务结果、阻塞、误操作、求助、保存重开和产物，不以耗时作为通过代理。
8. **保护仓库历史和他人改动。** 换机后先确认 clean worktree、远端分叉和 PR head；不得 reset/checkout 丢弃未知改动，不改 main-target 合并策略，不跨 head 复用 CI。

## 5. 下一台电脑的恢复步骤

在仓库目录执行并逐项核对：

```powershell
git fetch origin --prune
git switch codex/n60-e1-debugger-session
git pull --ff-only origin codex/n60-e1-debugger-session
git status -sb
git log -5 --oneline
gh pr view 123 --json state,isDraft,mergeable,headRefOid,statusCheckRollup,url
gh run list --branch codex/n60-e1-debugger-session --limit 5
```

恢复条件：worktree clean；本地 HEAD、origin branch 与 PR head 相同；最新 head 的 Windows CI 已成功。若不相同，先审计差异，不进入功能编码。

随后完整阅读：

- `docs/03-prd.md` 的 3.10；
- `docs/11-gal-foundation-and-automation.md` 的 Debugger/Story QA 要求；
- `docs/90-m1-requirement-traceability.md`；
- `docs/99-current-development-status-audit.md`；
- `docs/267-n60-e1-debugger-session-audit.md`；
- `docs/268-n60-e2-breakpoint-boundary-audit.md`；
- 本交接文档；
- `apps/editor/src/DebugQaWorkspace.tsx`、`formal-preview-runtime.ts` 及对应 E1/E2 tests。

## 6. 唯一接续开发点：N60-E3

下一切片冻结为 **Watch 与变量来源/变化**，不是 Solver，也不是继续扩大治理脚本。

建议的首个真实用户路径：进入真实 App → Debug & QA → 从入口启动 → 添加 Watch → 单步或 Continue → Watch 显示值、类型、来源 stable statement 与前后变化；无效表达式显示明确错误但不破坏调试会话；删除 Watch 后不再求值。实现前先审计 Runtime 是否已有可复用表达式求值与变量 provenance；如果正式层缺失，必须先明确所有权和最小合同，不能在 React 组件中私建求值器。

E3 的执行顺序固定为：

1. 冻结 Watch 语法/来源/变化的用户预期和未授权边界；
2. 写真实 App 红测并记录首次实际；
3. 复用正式 Runtime observation 与 Source Map 实现最小纵向路径；
4. 覆盖正常值、类型、无效表达式、来源和变化；
5. production desktop/mobile 执行真实示例工程，按实际差异修正 UI；
6. 运行 N60 聚合、typecheck、requirements/governance、全仓门；
7. 更新节点审计、#90、#99 与 README，提交、推送、等待精确 head Windows CI。

E3 完成后才进入 Story Solver、路线覆盖率和完整 QA 报告；不得把 E2 的停止原因完成误写成 N60 总出口完成。
