# N60-E6 诊断抑制与 Engineering 总出口审计

> 日期：2026-09-02
> 分支：`codex/n60-e1-debugger-session`
> 直接基线：`46847c6b519f68198a3841d5242aa937726311ac`
> 状态：诊断抑制用户路径完成；N60 Engineering 出口通过；N60 Product Acceptance、N61 与真人门不随之通过

## 1. 用户场景

- **用户**：发布前运行 Story QA、确认某条诊断属于刻意设计的创作者或审阅者。
- **入口**：`Debug & QA → 运行正式 QA 检查 → 诊断卡片`。
- **操作**：选择“抑制此诊断”，填写必填理由并确认。
- **反馈**：该项从活动诊断和阻断/警告计数中移出，同时进入“已抑制诊断”，展示 stable source 与理由。
- **失败恢复**：空理由不能提交；“恢复诊断”立即让该项重新进入活动结果。记录随 Canonical Project 保存，重开工程仍可追溯。

持久化只使用 Manifest 的兼容 `preservedFields`，内容为诊断稳定 ID 与理由；没有增加审批、账号、权限、远端服务或第二套诊断器。

## 2. 预期—首次实际—修正后实际

| 真实路径 | 预期 | 首次实际 | 修正后实际 |
|---|---|---|---|
| 诊断卡操作 | 可发起有理由的抑制 | `0/1`；卡片只有“定位并修复”，找不到“抑制此诊断” | `1/1`；可打开理由表单 |
| 理由合同 | 空理由禁止提交 | 无抑制能力 | 空理由时“确认抑制” disabled；填写后才可提交 |
| 工程持久化 | 重开工程仍能看到理由 | 无记录 | App 用更新后的 Canonical Project 重开，理由和诊断 stable ID 均保留 |
| 恢复 | 用户可撤销抑制 | 无入口 | “恢复诊断”后 `MISSING_ASSET` 重新进入活动结果 |
| Canonical JSON 边界 | 扩展数据保持严格 JsonValue | 首次实现后 TypeScript 指出内部只读类型不能直接赋给 JsonValue | 写入前显式序列化普通 JSON 对象，TypeScript 通过 |

## 3. 必要测试与真实产品检查

- 聚焦真实 App：`n60-story-qa-app.test.tsx` 首次 `0/1`，修正后 `1/1`；同一路径覆盖抑制、理由必填、Canonical 重开和恢复；
- N60 聚合：`8 files / 88 tests` 全部通过；
- TypeScript project graph：通过；
- Editor production build：成功；CSS `149.85 kB / gzip 26.40 kB`，JS `1010.01 kB / gzip 282.21 kB`，既有大包债保留；
- production browser：真实 Script 将 `stmt_gate_bg` 改为缺失资源，Compiler 检出 `MISSING_ASSET`；空理由禁用确认，填写后进入已抑制区，恢复后重新出现；
- 1280×720 document `1280/1280`；390×844 请求下实际 client/document `375/375`，已抑制区宽 `351px`、恢复按钮 `44px`；console error/warning `0`；测试后原脚本已恢复并保存。

没有新增测试文件、覆盖率任务、全仓本地重复门或真人计时。

## 4. N60 Engineering 总出口

| PRD 3.10 / Delivery Plan 项 | 当前产品证据 | 结论 |
|---|---|---|
| 从入口、场景、任意语句运行 | Entry/Scene/Statement 三个 Debug & QA Fresh Run | 完整 |
| 断点、单步、继续 | 多断点启停/移除/定位，Step/Step Over/Continue、Back/Forward | 完整 |
| 当前节点、变量、调用栈、可见对象 | 正式 Runtime observation、Watch、变量来源和 Host 通道 | 完整 |
| 不可达、缺少出口、悬空、缺失资源、无交互循环 | 五类 Compiler 产品总览、筛选、故障/正常 Golden | 完整 |
| 错误跳源码 | stable Scene/Statement 回到 Writer/Sequence | 完整 |
| 诊断抑制需有理由 | 工程内必填理由、活动计数重算、重开追溯和恢复 | 完整 |
| Golden Acceptance 工程门 | 故障工程五类均检出；正常校园工程五类均为 0 | Engineering 证据完整 |

结论：**N60 Engineering 出口通过。** “完整报告”不在 PRD 3.10、Delivery Plan N60 或其它权威 P0 合同中，只是 #271/#272 中待判断的候选，不构成出口缺口。P1 路径回放、Solver、覆盖率、变量图、截图、Save 兼容和性能/内存报告均不抢跑。

## 5. 需求边界与接续点

N60 Engineering 通过不等于 N60 Product Acceptance、M1 Stable 或发布通过；真人仍按产品负责人要求等待功能与整体 UI 收束。当前 RA-N21-011 只授权到 N60 Engineering，因此下一步应先做一次最小治理/接续检查，明确是否授权 N61 本地化与配音；在此之前不提交 N61 产品代码。
