# N52-E4d 换机暂停与开发接续说明

> 暂停时间：2026-08-31 17:42（UTC+8）
> 远端收束更新：最终交接头 `25f040ba20ac9271e91ef6886a8195dd2573e8ac` 的 Windows / Node 22 `product-baseline` run `33379185779` / job `99447416930` 已成功；下文“运行中”只保留暂停时的历史快照，不再是当前阻断项。
> 当前分支：`codex/n52-e4d-build-stop-point-source`
> 已推送实现头：`663f317264a12584a38bea96fefcc5e30871fadc`
> Draft PR：[PR #113](https://github.com/Longyuyeee/WorLdGame/pull/113)
> 堆叠基线：`codex/n52-e4-engineering-exit-reaudit` / PR #112
> 暂停判定：E4d Engineering 已完成；E4 总出口、AC-15、N52 Product Acceptance 均未完成。

## 1. 当前实际开发位置

本轮没有停在调研或合同阶段，已经完成并推送 **N52-E4d build-authored Player Stop Point source bridge**：

1. Story 作者可在正式语句尾部写 `@stop()`；Formatter 保留该标记，Projection 在同一稳定 statement ID 上生成 `playerStopPoint: true`，正文不混入元数据；
2. Compiler 生成独立版本化 Player playback policy v1，精确保存 `stopInstructionIds`；存在 Stop Point 时写入 `player-playback-policy.json`；
3. Runtime IR 保持 `1.1.0`，没有新增 opcode，也没有建立第二套调度器；
4. Player Shell 的 Auto 和 Skip Read/All × Hold/Toggle 都从同一次正式 Compiler artifact 读取列表，两处 `stopInstructionIds: []` 已归零；
5. 修复了真实发现的 Skip 竞态：Scheduler 已返回 `stopPoint` 后，Shell 不能再排入一次 0ms follow-up dispatch 越到 ending；
6. Core 使用 build artifact ID 到达 Stop Point 后，与 Normal 单步执行的 `runtimeStateHash` 和完整 History 相等；
7. `RA-N21-011` 只增加 E4d 所需的 N20/N30 窄修订，最大节点仍是 N52。Save checkpoint、Runtime History checkpoint、scene ID、数组下标均未被冒充 Player Stop Point。

权威细节见 [E4d 审计 #254](254-n52-e4d-build-stop-point-source-audit.md)，机器合同见 `config/n52-e4d-build-stop-point-source.json`。E4 出口矩阵已从 `完整 4 / 阻断 3` 更新为 **完整 5 / 阻断 2**。

## 2. 真实测试与差异记录

### E4d 行为链

- 冻结失败基线：`3 files / 84 tests` 中 `77 pass / 7 fail`；失败准确对应 Source 字段、Compiler artifact、Auto 和四种 Skip 的缺链；
- 第一次修正：`81/84`，实际发现三种 Skip 虽先报告 `stopPoint`，仍因 0ms 后续 dispatch 到 ending；
- 竞态修正后：`3 files / 84 tests PASS`；
- 加入 Core build artifact→Normal 等价证明后：`4 files / 104 tests PASS`，总时长 52.61 秒。

### cold production

Vite 8.2.1 正式 production build 为 90 modules。1280×720 in-app production 浏览器实际得到：Auto、Toggle Skip Read、Toggle Skip All 均停在 `presenting / history=2 / stopPoint / ending=false`，overflow 为 0，console warn/error 为 0。首次 Skip Read 驱动点击落在 title→presenting 切换瞬间，实际保持 `normal/none`；等待按钮可交互后重试才得到冻结结果。Hold 两种由真实 pointerdown 测试覆盖，未伪造浏览器长按证据。production preview 已正常停止，换机后没有需要接管的本地服务。

### 完整仓库门

本地完整门前两次分别记录了两个互不相同的既有环境长尾：Editor same-command 用例一次超过 5 秒，以及 N43 lease 探针一次读到 `held`。两项隔离复跑均绿，没有改 Editor/Persistence 代码、timeout 或预算。第三次 `npm run check` 从头执行并完整绿色：

- 普通回归：`154 files / 961 tests`；
- N50 `73/73`、N51 `118/118`、N52 History `85/85`；
- Runtime `61/61`、10,000 seeds / 20,000 replay，digest `20e9a842…92ef2`；
- VM `5/5`，测试体 66.09 秒；
- 17 workspace production build、architecture、Script/Route/Asset 性能全绿；
- Route 10k 正式编辑链 P95 `121.55ms < 500ms`；
- Asset Dicing/Atlas/总计 `1107.09 / 1335.69 / 2442.78ms`，均在原预算内。

## 3. GitHub 与暂停时远端状态

实现头 `663f317` 已推送，远端分支和本地一致，工作树在写本交接文档前为干净。PR #113 的精确实现头 CI：

- run：[`33378384542`](https://github.com/Longyuyeee/WorLdGame/actions/runs/33378384542)
- job：`99444914077`（Windows / Node 22 / full check）
- head：`663f317264a12584a38bea96fefcc5e30871fadc`
- 暂停时状态：locked install 已成功，`Verify workspace and product baseline` 仍为 `in_progress`；没有取消 CI，只停止了本地 `gh run watch`。

本交接文档推送后会产生新的文档头/可能的新精确头 CI。换机时不得把上述仍在运行的旧状态写成绿色，也不得用 `663f317` 的结果冒充后续文档头。应以远端分支最新 HEAD 和其对应 run 为准。

## 4. 换机后的第一组命令

在新电脑已有仓库且确认没有需保留的未提交修改后执行：

```powershell
git fetch --all --prune
git switch codex/n52-e4d-build-stop-point-source
git pull --ff-only
git status --short --branch
git rev-parse HEAD
gh pr view 113 --json url,state,isDraft,headRefName,baseRefName,headRefOid,statusCheckRollup
gh run list --branch codex/n52-e4d-build-stop-point-source --limit 5
```

如果新电脑目录有修改，不得 reset/checkout 覆盖，应先审计这些修改的来源。拉取后先阅读本文、#254、`config/n52-e4d-build-stop-point-source.json`、#253 的 E4d 后更新以及 #99 的下一步，再核对远端最新 head 是否与 `origin/codex/n52-e4d-build-stop-point-source` 一致。

## 5. 换机后的严格接续顺序

### 步骤 A：关闭 E4d 远端证据

1. 查找远端分支最新 HEAD 对应的 Windows / Node 22 run；
2. 若精确头绿色，把 run/job/head/时长和真实计数回填 #254、本交接文档及机器合同；
3. 若失败，先记录预期—实际差异，读取失败日志并按真实根因修正；不得复用旧绿色、不得先扩大 timeout；
4. 文档回填本身形成新提交时，要再次推送并核对新精确头 CI，直到最终文档头有可核验结论；
5. 完成后做一次 E4d 目标审计：Source→Compiler→Core→Shell、同边界、Runtime IR 不变、Product Acceptance blocked 全部必须成立。

### 步骤 B：开始下一唯一切片 N52-E4e

只有 E4d 最终证据闭合后，才进入 **N52-E4e formal Player video renderer and skip policy evidence**。第一步不是直接写 `<video>`，而是重新查看真实代码并冻结入口合同：

1. 核对 Canonical asset kind、Compiler asset manifest、Player media adapter、Shell media lifecycle 和现有 Auto/Skip cleanup；
2. 明确视频是等待完成、允许 Skip、如何处理中断/恢复/错误，以及 Auto/Skip 在视频边界的正式 stop reason；
3. 先写真实失败测试，记录预期与第一次实际；必须覆盖作者视频资产→Compiler→Player renderer、Auto、Skip Read/All、Hold/Toggle、host suspend、错误与退出清理；
4. 只复用既有 Runtime/Core/Shell，不建立第二套播放器或调度器；
5. 做 cold production 视频实测并记录实际媒体状态；更新机器合同、#89/#90/#99 和 E4 出口矩阵；
6. 跑完整 `npm run check`，做开发目标/最初需求审计，提交、推送并等待精确头 Windows CI。

### 步骤 C：补齐 E4 剩余证据并重审总出口

E4e 完成后仍不能直接关闭 E4。还要完成 E4c 的 **390×844 cold production** 复验；如果当前浏览器提供 viewport capability，应按正式文档设置并在结束后复原。随后再次运行 E4 总出口审计。只有 video policy 与手机证据两项都真实关闭，才可以讨论 E4 Engineering 总出口；AC-15、N52 Product Acceptance 仍须按其独立证据裁决。

## 6. 明确禁止的偏移

- 不把 Save `checkpoint`、Runtime History checkpoint、scene ID、instruction index 或墙钟当 Player Stop Point；
- 不修改 Runtime IR 1.1 来承载当前 build policy；
- 不因为 E4d complete 就声明 E4、AC-15、N52 Product Acceptance 完成；
- 不用 jsdom、CSS 推断或自动化操作冒充 390×844、实体设备或真人证据；
- 不跳过首次失败记录，不通过扩大 timeout/预算消除未知差异；
- 不进入 N60、M1 Stable、Windows/Android 产品验收或发布工作。

当前真正的接续点只有一个：先闭合最新 E4d 文档头的精确远端证据，然后进入 N52-E4e 的视频入口审计。
