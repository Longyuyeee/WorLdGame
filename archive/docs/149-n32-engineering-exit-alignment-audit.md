# N32 Engineering 出口与开发方向对齐审计

> 后续更新：本文件保留 E6 时点的 `5/6` 原始审计。E7 已关闭 Editor 私有 Host 偏移并建立浏览器 Worker Host Golden；最新判定见 [N32-E7 审计](../../docs/150-n32-e7-shared-runtime-host-audit.md)与 [N32 出口复审](../../docs/151-n32-engineering-exit-reaudit.md)。正式 Player 与画面差分仍未完成。

> 日期：2026-08-21
> 审计分支：`codex/n32-e6-preview-hot-update`
> 审计头：`344ab7d340baf0762153cce8047eecb7a1906a5e`
> 当前 PR：Draft PR #57；基线 `codex/n32-e5-preview-effect-host`
> 最近完整远端门：run `32470849292` / job `96737101479`，Windows / Node 22，4 分 12 秒绿色
> 授权：`RA-N21-004`，只允许 N32 Editor Preview Engineering
> 结论：E1–E6 切片成立；N32 Implementation `完整 5 / 未对齐 1`，Acceptance `0/1`；N32 Engineering 总出口未通过

## 1. 审计问题与判定规则

本审计不以提交数、测试总数或界面完成度代替产品目标，而是把 [交付计划 N32](../../docs/89-engine-product-delivery-plan.md) 的六项 Implementation 和一项 Acceptance 逐条映射到实际产品入口、代码依赖、自动化、production browser 与远端 CI。状态只使用：`完整`、`部分`、`未对齐`。

额外核对四条方向约束：产品 Preview 必须消费 N30 Compiler/N31 Runtime；不允许平行解释器成为正式运行权威；自动化不得冒充真人；N32 Engineering 不得越权进入 N40、正式 Player 或发布。

## 2. N32 逐项对齐结果

| # | 冻结 Implementation | 实际证据 | 状态 |
|---:|---|---|---|
| 1 | Preview 只消费 Compiler 输出 | `formal-preview-runtime.ts` 调用 N30 Compiler 并执行 N31 Runtime；E1 两路线、编译失败和 Source Map 证据完整 | 完整 |
| 2 | Run from Entry/Scene/Statement | E3 对 Scene/Statement Source Map 精确入口、Fresh variables/stack 与非法 return 诊断有自动化和 production browser 证据 | 完整 |
| 3 | 变量、栈、语句、Effect、舞台可见 | E2 Inspector + E5 Effect/Stage Host 显示 revision、逻辑时间、位置、变量、栈、诊断、active channel 与操作 receipt | 完整 |
| 4 | Back/Forward/Over、Continue、Run to Cursor | E4 覆盖 transient、Choice、调用栈、recorded future、fork；E5 补齐 Effect compensation/replay | 完整 |
| 5 | 安全热更新，结构变化明确重启 | E6 通过新 IR 记录输入重放与语义快照裁决；production 实际 `h4/4 → h4/4 → h1/1` | 完整 |
| 6 | Preview 与 Player 共用渲染/音频 Host Adapter | Effect Host 仍位于 `apps/editor/src/formal-preview-effect-host.ts`；无共享 Host workspace；现有 Web 试玩不导入正式 Runtime | 未对齐 |

实现完成度是 `5/6`，不是 `6/6`。E1–E6 各切片 Engineering 通过仍然有效，但不能据此关闭 N32 总出口。

## 3. Acceptance 审计

冻结 Acceptance 是“Editor Preview 与 Web Player 对固定输入产生相同状态和画面关键快照”。当前实际为：

- `apps/player-web` 按 workspace boundary 计划到 N80，当前不存在；
- `apps/editor/src/playable-web-export.ts` 自行校验 `StoryProject`、编译表达式 AST，并在内嵌 `playerScript` 中直接遍历 `scene.statements`；
- 该脚本不消费 N30 Runtime IR，不执行 N31 State/History/Scheduler/Effect/Barrier/Meta 契约，也无法输出正式 State/Outcome/History Hash；
- `playable-web-export.test.ts` 只证明这个独立候选自身可运行和可复现，没有与 Editor Preview 做差分；
- 当前没有 Editor Preview ↔ Web Player 的固定输入 State、Outcome、Effect receipt 或画面关键快照 Golden。

因此 Acceptance 为 `0/1`，N23 单文件离线试玩候选不能被重新命名为正式 Web Player 证据。

## 4. 偏移与风险登记

| ID | 级别 | 发现 | 影响 | 纠偏 |
|---|---|---|---|---|
| N32-X01 | 阻断 | 产品仍暴露“构建试玩 HTML”，其运行逻辑是平行 `StoryStatement` 解释器 | 同一工程可能在 Editor Preview 与导出 HTML 产生不同变量、控制流、Effect、History 和结局语义 | 保留为 N23 候选并明确降级；后续正式产物必须消费同一 Compiler IR/Runtime |
| N32-X02 | 阻断 | Editor Effect Host 是 `apps/editor` 私有模块，无共享渲染/音频 Host 契约 | 无法证明 Preview 与未来 Player 对 cancellation、Barrier、Back/Forward 和 channel reconciliation 一致 | N32-E7 提取可移植 Host contract/reducer，并建立独立测试宿主 |
| N32-X03 | 阻断 | 跨宿主差分 Golden 数量为 0 | N32 Acceptance 无证据，不能进入 N40 | 冻结 State/Outcome/History/receipt/visual snapshot 向量，Node 与真实浏览器测试宿主零差异 |
| N32-X04 | 警告 | 旧 `playable-preview-runtime.ts` 仍保留并被兼容测试引用 | 若重新接入产品 App，会恢复 Editor 平行解释器 | 保持产品零引用；后续删除或显式迁移测试，不得成为正式 fallback |
| N32-X05 | 治理 | `RA-N21-004` 不授权正式 Player、N40 或 Product Acceptance | 直接实现 N50/N80 会越界 | E7 仅做 N32 共享契约和测试宿主；正式 Player 等待新授权 |

这不是产品方向整体失控：Editor 正式 Preview、专业调试边界、现代多彩 UI、默认 16:9、可调画幅、Dicing 原型与性能治理均对齐既定目标。偏移集中在“导出试玩仍是旧执行链”和“共享 Host/跨宿主证据缺失”，应在继续扩展功能前纠正。

## 5. 更大范围需求对齐

| 维度 | 当前判定 | 说明 |
|---|---|---|
| 专业 Runtime/Preview | 对齐但未闭环 | N31 正式 Runtime 与 N32-E1–E6 Editor 接入成立；跨宿主闭环缺失 |
| 现代化图形 UI | 阶段对齐 | 现代多彩层级、平滑交互、16:9 默认与多画幅仍在；七模式和商业演出归 N40–N43 |
| Gal 基础与自动化 | 仍在计划中 | REQ-GAL 未开始；Route/Gallery Catalog 只有基础投影/编译数据，不能称产品完成 |
| Lossless Dicing/优化 | 原型对齐 | 无损重建、Atlas、预算门存在；Optimization Center、三端包体和设备收益未完成 |
| 多端编辑与发布 | 未进入 | Windows/Android 编辑、Web/Windows/Android 正式 Player 和签名发布均未获授权 |
| 产品验收 | 阻断 | N21 `0/1`、N23 `0/2`，M1 纵向验收仍为 `0/27` 完整通过 |

## 6. 预期—实际差异

| 检查 | 预期 | 实际 | 判定 |
|---|---|---|---|
| N32 Implementation | 6 项全部对齐 | 5 项完整，1 项未对齐 | 总出口失败 |
| N32 Acceptance | Editor/Web Player 同输入 State 与画面快照一致 | 正式 Web Player 不存在，差分 Golden 为 0 | 失败 |
| 正式执行单一来源 | Preview 与产物均执行 N30 IR/N31 Runtime | Editor Preview 正式；单文件 HTML 仍遍历 StoryStatement | 存在阻断偏移 |
| 治理边界 | 只做 N32 Engineering | 当前分支与 PR 未进入 N40/Player 产品节点，RA 审计保持 N32 | 对齐 |
| 工程稳定性 | 切片回归与支持环境完整门绿色 | PR #57 两次 Windows / Node 22 完整门绿色；最近 4 分 12 秒 | 对齐，但不能替代缺失验收 |

## 7. 纠偏后的下一步

1. 冻结 N32-E7：共享 Preview/测试宿主的 portable Host contract、Effect/Stage receipt/reconciliation reducer 和确定性快照格式；
2. Editor 改为消费共享 Host，删除产品对 Editor 私有 Host 语义的依赖；
3. 建立独立真实浏览器测试宿主，对同一 IR/输入比较 State Hash、Outcome Hash、History Hash、Effect receipt 和画面关键快照；
4. `playable-web-export.ts` 明确保留为 N23 legacy candidate，不得充当正式 Player；是否迁移/替换必须在 N50/N80 获得授权后执行；
5. E7 完成后重新执行 N32 Engineering 出口审计。只有 Implementation 工程边界完整，才可讨论 Engineering 出口；Product Acceptance、N40、M1 和发布仍由真人证据与新授权 fail closed。
