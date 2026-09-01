# N50–N52 Player / Gal 范围消歧审计

> 日期：2026-08-27
> 基线：N50-E6 最终绿色头 `6580b34`
> 判定：纠正路线图的重复归属；N50 Engineering 通过，N50 Product Acceptance 保持 `0/1`

## 1. 发现的问题

原路线图 N50 Implementation 同时列出 History、Settings、Save/Load，而紧随其后的 N51 明确负责 Gal 配置中心，N52 又明确负责 Save、History、Auto、Skip、Back/Forward。代码事实也对应后者：N31 Runtime 已存在 Save/History/Scheduler 内核，N50 Player Core 只接入正常逐边界执行；直接把完整玩家控制塞入 N50 会绕过 N51/N52 的独立需求、测试和验收矩阵。

## 2. 权威归属

| 能力 | 唯一负责节点 | N50 是否实现 | 说明 |
|---|---|---|---|
| 标题、开始、对白/旁白、选择、结局、错误 | N50 | 是 | 正式 Player Shell 基础闭环 |
| 媒体舞台、输入、安全区、无障碍、宿主生命周期/嵌入 | N50 | 是 | 未来三宿主共享边界 |
| Gal 设置 Schema、继承、搜索、恢复默认、实时预览、平台 Profile | N51 | 否 | 不再重复列入 N50 |
| Save/Load、History、Auto、Skip、Back/Forward 玩家产品功能 | N52 | 否 | 复用 N31 内核但必须另做 Player 产品化 |
| Web/Windows/Android 正式产物和设备一致性 | N80–N92 | 否 | N50 只提供可嵌入契约 |

## 3. N50 出口重判

N50 Goal 的“可嵌入 Web/Windows/Android”是平台无关的可嵌入能力，不是三个发布包；E6 的版本化 mount/update/suspend/unmount API 已满足工程前置。N50 Implementation 按唯一归属重写为基础 Player、媒体、输入、响应式/无障碍和宿主嵌入，E1–E6 已全部关闭。因此 N50 Engineering 通过。

Acceptance“同一 Player Core 被三宿主使用”仍需真正的 Web/Windows/Android hosts，当前只有 Web 独立 embed，保持 `0/1`；N50 Product Acceptance、M1 和发布不通过。

## 4. 防回归规则

- N51 不得实现 Save/History/Auto/Skip/Back；只输出 typed settings 事实和应用边界。
- N52 不得建立第二 Runtime/Player Core；必须接入 N31 正式 Save/History/Scheduler。
- N80–N92 不得复制 Player 逻辑；三端只消费同一个版本化嵌入/Core 契约。
- 自动化与开发者浏览器操作不得替代真人、实体触屏/手柄或安装包验收。

这次变更纠正文档归属，不删除任何原始 P0 产品需求，也不降低最终 AC-07、AC-15、AC-16、AC-19 的验收标准。
