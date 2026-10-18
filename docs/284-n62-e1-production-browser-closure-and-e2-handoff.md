# N62-E1 Production Browser 闭合与 E2 接续审计

> 审计日期：2026-09-22
> 分支：`codex/n60-e1-debugger-session`
> 审计起点：`092ee42a8fcb9137b9491099eaa486ead0306f99`
> 状态：N62-E1 Engineering 已关闭；下一切片为 N62-E2

## 1. 接续前真实状态

远端、本地和 Draft PR #123 的实现头一致，工作区干净；N62-E1 已有 Compiler Catalog → Player Core → Player Shell 的四类摘要，但 2026-09-03 因交互式浏览器策略限制缺少 production-browser 证据，所以不能关闭。授权 RA-N21-011 允许推进到 N62 Engineering，截止 2026-09-27 16:00（UTC+8）；N62 Product Acceptance、N70 Engineering、M1 和发布仍被阻断。

## 2. 从玩家视角发现并修正的问题

自动化 Chrome 真页首次复核发现两类产品问题：

1. 附加页标记为模态弹层，但打开后焦点仍在底层入口，Tab 可以继续进入被遮挡的剧情控件。现已在打开时聚焦“返回剧情”、把 Tab/Shift+Tab 约束在弹层、Escape 或按钮关闭后把焦点返回原入口。
2. 桌面入口只写“附加”，页面向玩家暴露 `Compiler Catalog`、`Runtime` 和“后续切片”等内部开发语言。现已把入口明确为“附加内容”，并把说明改为收藏、回想、音乐准备状态和结局记录的玩家语言。

这些修正不改变 Runtime、History、Save 或 Meta，只改善可发现性、键盘可达性和信息表达。

## 3. 验证结果

| 检查 | 结果 |
|---|---|
| N62 定向产品测试 | `2 files / 3 tests`，PASS |
| 根完整门 | 普通 `168 files / 998 tests`；整应用、存储、VM、17 workspace build、架构与性能全部 PASS |
| 根 TypeScript | PASS |
| Player Shell production build | JS `421.44 kB / gzip 123.52 kB`；CSS `27.77 kB / gzip 5.93 kB` |
| 真实浏览器 | Chrome 120、cold production preview，PASS |
| 桌面 | 1440×900；四类摘要正确；入口/返回控件 44px；弹层在视口内 |
| 移动 | 390×844；单列可滚动；无横向溢出；入口/返回控件 48px |
| 状态完整性 | 打开/关闭前后 Runtime State Hash 和 History Cursor 完全一致 |
| 键盘 | 初始焦点、Tab 约束、Escape 关闭、焦点返回均通过 |
| 浏览器诊断 | console error/warning 与未捕获异常均为 0 |

完整门保留原预算：VM 10k 测试约 `31.69s < 90s`，Route 编辑 P95 `158.11ms < 500ms`，Asset dicing/atlas 总计 `2700.95ms < 5000ms`。Editor build 仍报告既有主 chunk 大于 500 kB 的提示；它没有由 E1 引入，也不冒充失败，拆包归后续 Optimization 范围。

实现头 `06c155e29a6f002ea81ac70752378aa34311e05b` 已推送至 Draft PR #123；exact-head GitHub Actions run `35740862064` / Windows job `106789941844` 于 2026-09-22 成功，用时约 15 分 25 秒。远端结论与本地完整门一致，N62-E1 Engineering 正式关闭。

机器证据：`evidence/n62/additional-content-browser.json`。桌面截图 `evidence/n62/additional-content-desktop.png`，SHA-256 `ec214cd742b3b406256cd241c8c3e8abece541b67ae993306b90a503d724f690`；移动截图 `evidence/n62/additional-content-mobile.png`，SHA-256 `6b86aa1ceb074584975820c8b974828de56d44bff998de1bf308361db1dfc0df`。

## 4. 路线对齐与下一步

E1 仍只提供正式自动摘要，没有把摘要冒充 AC-18 的完整内容体验，也没有提前实现 Music Meta 或 Replay Session。下一唯一功能切片为 N62-E2：

1. 从现有 Gallery/Ending Catalog 与 Meta 投影真实内容列表，不建立 Shell 私有清单；
2. 明确区分已发现、未发现、空 Catalog 和资源缺失，并提供玩家可理解的恢复反馈；
3. Gallery 查看与 Ending 详情退出后保持 Runtime State Hash、History Cursor、Save/Meta 不变；
4. 覆盖桌面与 390×844 的键盘、触控、overflow、资源失败和 console；
5. 独立审计、提交推送并等待 exact-head CI 后，才进入 Music 正式解锁 Meta。

`xlsx` 高风险依赖仍是 N61 遗留的独立安全债，npm registry 无自动修复；不能在 N62 UI 切片中静默删除 XLSX 功能。Vitest 4.1.10 的 moderate 告警有 4.1.11 修复版本，应作为独立维护提交处理，不与 E1 产品结论混写。
