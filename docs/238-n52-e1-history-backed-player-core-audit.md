# N52-E1 History-backed Player Core 审计

> 日期：2026-08-28
> 分支：`codex/n52-e1-history-backed-player-core`，Draft PR #98
> 授权：`RA-N21-011`，只登记 Engineering；N52 Product Acceptance、真人/实体设备、N60+、M1 与发布继续阻断

## 1. 原始需求与实际代码

[PRD §3.7](03-prd.md)要求玩家按每句对白或 Story Step 后退，并在未产生新分支时前进；[Gal 规格 §5](11-gal-foundation-and-automation.md)要求恢复完整 Story State 与舞台/音频状态、改选后截断 Forward、边界可见。实现前读取确认：N31 已有 `RuntimeHistorySessionV1`、Back/Forward、分支 tombstone 和 Session Save，Runtime Host 已有 compensation/replay；缺口只在 Player Core 与 Web Shell，故没有创建第二 Runtime、History 或 Save 格式。

冻结文档曾要求 Host snapshot hash 在 Back→Forward 后回到旧值。实际 `createRuntimePresentationHostSnapshotV1` 的 hash 包含 checkpoint 与 append-only 操作审计账本；正确产品语义是 Runtime State Hash 完全恢复、active presentation channels 等价，同时 Host 账本新增 compensation/replay。#236/#237 已按真实代码纠偏，未弱化剧情或舞台恢复要求。

## 2. 失败冻结与实现

首次运行两组冻结测试为 `27/31`，4 项失败准确证明旧 Player 没有 Back/Forward：结局 Back 回标题、对白 Back 仍向结局推进、媒体 Back 不补偿、Shell 无控件。

修正后：

- `PlayerCoreState` 持有唯一 N31 History Session，普通推进通过 `advanceRuntimeHistoryV1` 记录可观察边界；
- `back/forward` intent 直接调用 N31 API，跨内部 direction 时继续移动到可呈现边界；
- 每个 reconciliation plan 交给正式 Runtime Host，Back compensation、Forward replay 均进入审计操作账本；
- Choice input ID 包含 option ID，Back 后改选可安全形成新输入并把旧分支写入 tombstone；
- snapshot 暴露 cursor、length、canBack、canForward；Shell 提供有真 disabled 状态的可访问控件。

定向结果为 `2 files / 31 tests` PASS；Player Core 与 Player Shell production build 均通过。

## 3. 冷 production-browser 与首次差异

真实 `@world-studio/player-shell` production preview 在桌面和 390×844 执行：标题→Right→结局→Back→Forward→Back 到 Choice→改选 Left。实际结果：结局 `3/3`，Back 为 `2/3` 且 Forward enabled，Forward 回结局 `3/3`，改选后变为 `2/2` 且旧 Forward disabled。

移动端首测发现 History 工具条遮挡品牌与 Choice。纠偏为安全视口顶部 fixed 工具条、移动端 48×48 图标按钮与完整 aria-label、紧凑品牌；复验 document overflow `0`、console warnings/errors `0`。证据见 [`player-history-browser.json`](../evidence/n52/player-history-browser.json)、[`desktop`](../evidence/n52/player-history-desktop.png)、[`390x844`](../evidence/n52/player-history-mobile.png)。

## 4. 边界与接续点

E1 不包含 Save 槽位、自动/快速保存、Load、History 页面、Auto、Skip 或 Choice scheduling，也不登记 N52 Product Acceptance。下一切片必须先冻结 N52-E2 Save 槽位/Host 持久化合同，复用 N31 Save/Session Save；不得以 localStorage demo 或新格式绕过正式内核。

本地完整 `npm run check` 已一次通过：普通回归 `149 files / 890 tests`、N50 `41/41`、N51 `96/96`、N52 `31/31`、VM `28.69s <90s`、Route P95 `72.55ms <500ms`、Asset dicing `1667.44ms <5000ms`；Editor `982.10kB / gzip 275.54kB` 的既有大 chunk warning 保留，Player 主 bundle `332.52kB / gzip 102.05kB`。

实现提交 `5a3a322` 已推送到 Draft PR #98；同一 SHA 的 Windows / Node 22 run `33175293968` / job `98862223958` 于 2026-08-28 success，job 用时约 `13m04s`，其中完整 `Verify workspace and product baseline` 为 success。由此 N52-E1 Engineering 切片关闭；N52 Product Acceptance 与第 4 节边界不变。
