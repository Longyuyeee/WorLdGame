# 产品目标对齐与交付节奏纠偏审计

> 日期：2026-09-01
>
> 适用范围：N52-E5 后续开发及其后的 M1 产品主线
>
> 审计基线：`1a39394f02fe5090d2d2cab205c8e66cd5c1abca`
>
> 判定：**产品功能语义没有脱离最初 PRD，但执行方式已经明显偏向工程证明；从 E5c 起恢复用户任务驱动的纵向交付。**

## 1. 对齐依据

本次重新对照 [PRD 3.8 与 M1 纵向验收](03-prd.md)、[Gal 基础系统 5.2](11-gal-foundation-and-automation.md)、[产品落地计划](89-engine-product-delivery-plan.md)、[追踪矩阵](90-m1-requirement-traceability.md)及真实 Runtime、Player Core、Player Shell、Gal Settings 代码。

最初目标是让创作者在 Windows 与 Android 完整制作工程，并发布 Web、Windows、Android 玩家；History 的原始玩家任务是打开历史、查看活动主线与旧分支、选择某句回退、理解 Barrier 原因和距离，并由项目策略决定回退后是否允许 Forward。E5b 的 Runtime 只读分支归档属于该目标的必要底层修复，不是额外安全功能。

## 2. 实际偏移

- 当前 M1 纵向验收仍为 `0/27`；N21 真人 `0/1`、N23 真人 `0/2`，Windows/Android 正式宿主、三端产物与 Benchmark Episode 尚未完成。
- 当前开发链仍在堆叠 Draft PR，未合入 `main`；局部提交反复通过完整门，不能代替产品集成。
- 最近 60 个提交中，文档/治理/审计 41 个，产品代码/修复/测试 17 个；仓库已有 263 份文档、52 个工具脚本、28 个 config，根 `check` 串联 48 个阶段。
- 375 个 TypeScript 文件中测试或 conformance 188 个、生产文件 187 个。对确定性 Runtime 而言高测试密度合理，但在产品验收仍为零的情况下，继续增加相同类型的证明不再是最高优先级。

因此偏移不是“产品需求被改掉”，而是“Engineering 子门和可证明性替代了用户任务与可交付产物成为主要进度指标”。必要的确定性、Save 兼容、Barrier、持久化失败保护与目标环境 CI 必须保留；普通 UI/投影切片不再默认新增独立入口合同、机器合同或证据提交。

## 3. 立即生效的开发方式

1. **一个用户目标，一个纵向切片。** E5c Settings/Core 与 E5d Shell 保留内部实现顺序，但共同构成一个 “Player History 用户闭环”；在 Shell 可实际操作以前，不登记 History 产品完成。
2. **先写预期，再跑真实路径。** 每个切片记录真实工程、操作步骤、预期结果、首次实际结果、差异、修正和复测；测试通过数只能作为辅助证据。
3. **测试分层。** 开发中运行受影响包和真实 production-browser/目标宿主测试；完整 `npm run check` 只在可推送候选头运行一次。纯证据文字更新不因文档头变化重做已通过的业务测试，除非机器合同或 CI 策略实际要求。
4. **文档随功能同提交。** 更新 #89、#90、#99 和当前实现审计即可；只有出现新的跨层数据所有权、磁盘 schema、不可逆副作用或发布风险时，才新增独立合同。
5. **集成优先。** E5e 通过后先收束堆叠 PR、形成可审阅的 main-target 集成候选，并补执行长期欠缺的 N21/N23 真人任务；不得以继续 N60 的新工程切片回避集成和真人反馈。
6. **进度指标改为产品结果。** 主要报告用户任务完成数、真实目标环境、预期/实际差异、未解决阻断和可交付产物；不再以审计文档数、CI 轮次或 Engineering 子门数表示产品完成度。

## 4. E5 Player History 用户闭环

E5b Runtime History v2 Engineering 已完成。接下来只接受以下完整用户目标作为 E5 的产品实现方向：

1. Gal Settings v6 增加且只增加 `history.allowForwardAfterBack`，v1–v5 严格读取后默认归一为 `true`。
2. Player Core 从 Runtime 单一权威投影活动条目、只读 archive、稳定 ID、Barrier 原因与距离，并提供定点回退；Core 执行项目 Forward 策略，不建立第二套账本。
3. Player Shell 在桌面和 390×844 提供明确 History 入口、活动/旧分支展示、选行回退、Barrier 解释与 Forward 策略反馈。
4. 真实 Branching 工程必须走完“左分支 → 回退 → 改走右分支 → 旧左分支仍可查看 → 定点回退 → 策略 true/false 差异 → 保存/刷新/读取保持一致”。
5. 同一真实路径记录桌面与 390×844 的预期/首次实际/修正后结果；History 页面未出现、无法选行、原因不可见或读档后归档丢失均为失败。

E5c/E5d 可以分别提交代码，但只有上述用户闭环完成后才进入 E5e 总出口复审。E5e 不重复建立功能，只对照 Gal 5.2、PRD 3.8、USP-09、REQ-RUNTIME 与 AC-16 判定；仍有缺口则保持 fail closed。

## 5. 不变边界

- 不降低 Runtime 确定性、Save/History 兼容、Hash、Barrier、文件持久化和目标环境 CI 门。
- 不把 archive 变成可导航第二时间线，不在 Core/Shell 复制 Runtime History。
- 不把 E5b Engineering、Web 响应式验证或自动化绿色换算为 N52 Product Acceptance、AC-16、M1 Stable 或发布完成。
- N60 及以后仍未准入；纠偏只改变交付节奏和完成判据，不虚构产品状态。

本文件标题 token：**产品目标对齐与交付节奏纠偏审计**。
