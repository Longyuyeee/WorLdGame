# N52-E5d Player History Shell 与 production 用户路径审计

> 日期：2026-09-01
>
> 直接基线：N52-E5c 文档闭环头 `49abe33414a6f6a8a8889f8108e738a55404bbeb` / Draft PR #119
>
> 当前判定：**E5d Shell/production Engineering 已关闭。History 纵向用户路径已实现，但 N52 总出口须由 E5e 复审，Product Acceptance 与 N60 继续阻断。**
>
> 实现证据：`08bfb5c95bb9a87a49de854b1673c6c3a5a06cde` / Draft PR #120 / Windows run `33468762702` / job `99734003643`，`9m26s` 成功。

## 1. 用户目标与首次实际差异

本步直接完成 [PRD 3.8](03-prd.md)、[Gal 5.2](11-gal-foundation-and-automation.md)及[产品目标纠偏 #262](262-product-goal-alignment-and-delivery-correction.md)冻结的同一个玩家任务：打开 History，查看活动主线和被改写的旧分支，选择某句回退，理解 Barrier 原因与距离，看到项目 Forward 策略反馈，并在保存、刷新、读取后保持结果。

实现前对真实 Branching Shell 写入三个结果测试。旧 Shell 回归 `48/48` 通过，新增路径首次 `0/3`：没有 History 入口/页面和旧分支视图；Gal Settings v6 虽已存在，但 Shell 创建 Core 时没有传入 `history.allowForwardAfterBack`，所以 false 项目仍允许 Forward。首次测试还错误假定文字第一次点击会推进；实际第一次只完成 typewriter 揭示，修正为两次真实点击后，三项均只因 E5d 功能缺口失败。

## 2. 已实现边界

- Shell 从同一个 `settingsApplication.history` 初始化和热应用 Core History policy；不在 UI 创建第二套策略或 History。
- 原 Back/位置/Forward 控件增加明确 History 入口；非模态 History 页面展示 Runtime/Core 投影的活动主线、past/current/future 状态和只读旧分支。
- 活动行使用稳定 Runtime `entryId` 派发 `history-back-to`，成功后关闭页面并返回剧情；archive 只展示，不生成导航按钮。
- Forward 被项目 false 策略阻断时，按钮保持 disabled 且页面显示明确原因；true 继续保留既有 Forward 行为。
- 最近已提交 Barrier 显示 descriptor、不可逆原因和距当前位置步数。
- 桌面与移动 production 演示使用独立项目身份，避免真实 Recovery 记录让两个 cold 路径互相污染；没有删除或绕过恢复数据。

## 3. 预期—实际—修正结果

- 定向 Shell：预期新增 `3/3`；首次 `0/3`，修正后 `3/3`。再加入策略热应用、Media Barrier 与真实 Store 保存—卸载—重挂—读取，最终 E5d `6/6`。
- 扩大受影响范围：N52 Player/History `5 files / 101 tests`，N51 Settings/Shell `10 files / 131 tests`，TypeScript 与 Player production build 全部通过。
- 桌面 1440×900 cold production：活动主线、旧分支 1、选行回退均成功；document overflow `0`，History 最小控件 `44px`。
- 390×844 首次实际：复用了桌面项目 ID，真实 Recovery 提示覆盖开始按钮，点击实际恢复到亮路线而非进入选择。修正为 desktop/mobile 独立 production 项目身份后，旧分支和选行路径成功；document/body overflow 均 `0`，最小控件 `48px`，面板边界 `x=10, y=76, right=380, bottom=834`。
- 390×844 false 策略：`data-history-forward-policy=false`，Forward disabled，明确显示“项目设置禁止在回退后沿原分支前进。”，overflow `0`。
- 390×844 Barrier：原因 `Published_content_cannot_be_reversed.`，距离 `2` 步，descriptor `published-background`，overflow `0`。
- 真实 IndexedDB：分支改写后保存 `manual-1`，新 URL cold load 再读取，结果 `saveOperation=loaded`、`archiveCount=1`、旧分支仍为 `The quiet route.`。
- 全部 production 路径 console error/warning `0`。没有放宽断言、timeout、触控或布局阈值。

候选头完整 `npm run check` 通过到最后 Route 性能门时，首次实际仅 `lazyRouteStructurePage=502.69ms` 超出 `<500ms` 预算 `2.69ms`；该 Route 路径与 History 改动无代码交集，且同轮其余门均通过。未提高预算或改断言，原样复跑完整 Route `9/9` 后该项为 `309.01ms`，随后补跑因首次停止而未执行的 Asset `4/4`，总计 `3440.26ms < 5000ms`。其余候选门包括普通回归 `154 files / 979 tests`、N50 `88/88`、N51 `130/130`、N52 `100/100`、VM `5/5`（`57.87s < 90s`）、17 workspace production builds 与全部治理/架构/Script 门，均保持原预算通过；新增策略热应用用例加入后，最新受影响门为 N50 `89/89`、N51 `131/131`、N52 `101/101`。

## 4. 接续与阻断

精确实现头 `08bfb5c` 的远端 Windows 完整产品基线已成功，因此 E5d Engineering 关闭；本步仍不直接宣告 N52 总出口。下一接续是 **N52-E5e History 总出口复审**：逐项重跑 History 矩阵并更新 N52 治理状态。E5e 通过以前，USP-09、REQ-RUNTIME、AC-16、N52 Product Acceptance、N60、M1 Stable 与发布继续 blocked。
