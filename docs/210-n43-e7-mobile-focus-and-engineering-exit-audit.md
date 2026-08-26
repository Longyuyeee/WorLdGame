# N43-E7 Mobile Focus 与 Engineering 出口审计

> 日期：2026-08-26  
> 直接基线：N43-E6 最终头 `be7c536bee13324983d0cd123693bc5158a5ac6f`  
> 授权：`RA-N21-008`，只覆盖 N43 Engineering  
> 判定：**Mobile Focus 已形成同一 Canonical 工程上的真实手机专注编辑任务，七模式 Engineering 达到 7/7；N43 Product Acceptance、Android 编辑器、N50+、M1 与发布仍被授权和真人门阻断。**

## 1. 冻结目标与非目标

E7 关闭的是 Web 编辑器在手机窄屏上的专注写作任务：从当前工程选择对白并按工程顺序前进/后退；以 statement stable ID 读写同一 Canonical Project；中文 IME 组合期间不提交，输入先缓冲再明确提交或放弃；未提交时锁住跨模式切换和对白导航；保存重开保持模式、stable ID 与文本；390×844 下无页面横向溢出且关键触控目标不小于 44px。

这不是 Android 原生编辑器、APK、SAF、后台恢复或低内存设备验收，也没有真人或实体设备参与。响应式 Web 任务不能登记为 N91 或 Android M1 完成。

## 2. 实现事实

- `mobile-focus-workspace.ts` 把项目内对白按场景/语句稳定顺序投影为专注导航模型；非对白选择只提供显式入口，不暗改 Canonical selection。
- `MobileFocusWorkspace.tsx` 提供缓冲文本、Composition 保护、明确提交/放弃、前后句导航、场景/语句 ID 和进度。
- 提交继续使用既有 `patch-dialogue` structural command；导航继续使用 `select-project-result`，没有第二份手机剧情或旁路存储。
- `WorkspaceNavigation` 在任一输入缓冲期间禁用其他工作模式；Mobile Focus 手机头部收起编辑视图、动效、复杂度、撤销/重做和备份，只保留模式退出路径与本机保存。
- Mobile Focus 在真实任务、模型测试、App 集成与保存重开接入后才由 disabled 改为 available。

## 3. 预期—首次实际—修正

| 检查项 | 冻结预期 | 首次实际 | 修正与复测 | 判定 |
|---|---|---|---|---|
| Canonical 导航 | 同一 stable ID 前后句往返 | 测试夹具错误写成 `scn_gate` / “广播站”，真实工程为 `scn_school_gate` / “林夏” | 修正测试预期，不修改实现迁就错误夹具；`stmt_gate_001→002→001` 通过 | PASS |
| IME 与缓冲 | 组合期不提交，缓冲期阻止跳转 | 组合期提交禁用；缓冲状态可见；Writer 与前后句禁用 | 无语义差异 | PASS |
| 明确提交 | 提交产生 Canonical revision，往返仍读取新文本 | App 集成得到 `r0→r1`；浏览器往返后仍为新文本 | 无差异 | PASS |
| 保存重开 | Mobile Focus / stable ID / 文本恢复 | fake-indexeddb 产品闭环保存 `s1`，释放租约并重开恢复 | 无差异 | PASS |
| 390×844 布局 | 无横溢出、触控目标≥44px、专注而非摊大饼 | 首测文档 `390/390`、入口 `48px`，但模式滚动条可见且历史操作过密 | 隐藏滚动条但保留横滑；收起无关历史操作；复测四操作均 `48px`、textarea `240.25px`、overflow `0` | PASS |
| 旧安全负例 | 未知 workspace context 继续 fail closed | Mobile Focus 开放后旧“未来模式”负例失效 | 改用 `future-mode`，仍恢复 Writer/Sequence；未删除安全门 | PASS |
| App 累计负载 | 原 5 秒预算内稳定 | N43 首次聚合中 2 个既有 App 用例超时；workspace-context 保存长链首跑也超时 | 不放宽预算；隔离分别在 `3.96s` / `3.73s` 内通过，完整 App 45/45 和 Editor Integration 重跑通过 | PASS（差异保留） |
| Storage / VM | 原冻结预算通过 | storage 恢复上下文正确，但 `s3` UI 两次未在 5 秒完成；冻结 VM 为 `90.051s`、隔离 `133.426s`，均超 90 秒 | 未放宽 timeout、未减少 10,000 seeds；等待远端干净 Windows runner 裁决 | **LOCAL FAIL / REMOTE PENDING** |

## 4. 自动化与性能证据

- Mobile Focus 聚焦回归：`3 files / 48 tests`，通过；纯模型与 workspace 安全负例合计 `4 files / 9 tests`，通过。
- N43 聚合门：纯模型 `10 files / 25 tests`；七个产品集成任务与完整 App 均通过，Engineering 真实任务为 `7/7`。
- 普通回归：`137 files / 780 tests`，通过；Editor Integration 重跑全部通过；类型检查通过。
- 本机完整单链没有伪报绿色：workspace-context、storage 和冻结 VM 的累计负载失败均保留，未提高 5 秒/90 秒门。
- 非 VM 后续门全部通过：14 workspace、93 portable / 4 adapter 架构、全部 production build 和 Script/Route/Asset 性能绿色。
- Route 编辑 P95 `174.82ms <500ms`；Lazy Route `324.53ms <500ms`；Global Lazy Index `325.63ms <500ms`；Dicing 总计 `2951.93ms <5000ms`。
- Editor build：CSS `126.46/22.88 kB`，JS `936.99/261.39 kB`；`>500 kB` 分包 warning 继续作为已知债，不提高阈值。
- 实现头 `3eff0d4` 的远端 Windows / Node 22 完整门已绿色：run `32943861705` / job `98100313426`，用时 `11m15s`。普通回归 `137/780`、storage `1/1` 均通过；冻结 VM 测试体 `65.596s <90s`，关闭本机 `90.051s/133.426s` 性能差异；Route 编辑 P95 `131.84ms <500ms`、Global Lazy Index `264.93ms <500ms`、Dicing `3370.61ms <5000ms`。远端 Editor CSS `126.46/22.88 kB`、JS `937.07/261.38 kB`，分包债保持。

## 5. N43 Engineering 出口与需求对齐

- `USP-01 / AC-03`：Mobile Focus 读写与 Writer/Director/Flow 共用同一 scene/statement stable ID 和 structural command。
- `USP-06 / REQ-UX / AC-11`：七个工作模式均已有真实中央任务，N43 Engineering 的模式实现目标为 `7/7`。
- `AC-10`：Web 手机任务具备 IME 保护、明确提交/放弃和 48px 触控替代；Android 实体触摸、系统 IME 和真人纯触屏任务仍缺。
- UI 保持现代、极简、色彩语义和清晰动效，同时用任务专页收敛信息密度，没有增加横向面板。

因此本轮登记 **N43 Engineering 出口通过，真实任务 7/7**。这不等于 N43 Product Acceptance：真人为 0，Authority 尚未合入 `main`，`RA-N21-008` 明确阻断 N50。下一步必须先建立新的治理准入或完成受阻产品门，不能自行进入正式 Player/N50。
