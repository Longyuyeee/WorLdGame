# N52-E2 Player Save 槽位与 Host 持久化审计

> 日期：2026-08-28  
> 分支：`codex/n52-e2-player-save-slots`  
> 直接基线：N52-E1 最终绿色头 `4e3e8ba` / Draft PR #98  
> 授权：`RA-N21-011`，最大节点 N52  
> 判定：N52-E2 本地 Engineering 实现与完整门通过；同头 Windows CI 待推送后回填。N52 Product Acceptance、三端一致性、N60+ 与发布继续阻断。

## 1. 需求对齐与范围纠偏

最初 Gal 需求要求手动/自动/快速/检查点存档、槽位分页、截图、时间、章节/路线/自定义元数据、迁移、损坏恢复和云冲突策略。N52 总范围也包含 History、Auto、四种 Skip、速度、Stop Point 与已读集合。E2 不能把这些全部压成一个不可审计切片。

本步只关闭最小正式手动存读档闭环：三个有界手动槽位、时间/场景/呈现类型/Build/State/Session Hash 元数据、严格 Session Save、Web IndexedDB Host、跨刷新 Load 与可访问 UI。截图字段在 v1 envelope 中明确为 `null`，自动/快速保存、分页、截图采集、迁移、云同步、History 页面、Auto/Skip 仍未实现，不能登记为原始 2.4/2.8 或 N52 Product Acceptance 完成。

## 2. 实际代码审计与关键决定

| 边界 | 实际发现 | 纠偏实现 |
|---|---|---|
| Runtime Save | N31 已有 `create/loadRuntimeSessionSaveV1`，保存完整 History/cursor 并严格校验 canonical、版本、Project、Build、Hash 和链；Load 可将设备上较新的永久 Meta 单调合并 | Player Core 只建立桥，不创建第二格式或解释器；槽位校验使用原始 saved checkpoint Hash，不能拿 Meta 合并后的完整 State Hash 误拒绝有效存档 |
| Load Effect | `consumeRuntimePresentationEffectsV1` 会把恢复动作记为 execute；这会把读档误报为外部副作用重放 | Runtime Host 新增明确的 `rehydrate` 操作；恢复 active channels 但不产生 execute/replay |
| cancelled Effect | 简单展平 checkpoint Effects 会复活已经 cancel 的 channel | 从 History 输入重建 active channels，遇到 `effectCancelled` 删除对应 Effect；负例锁定 |
| Host 持久化 | 仓库没有 Player Save Store；Editor 工程 IndexedDB 不能与玩家存档混用 | 新建独立 `world-player-saves/save-slots` 数据库与 v1 adapter，不使用 localStorage |
| embed API | v1.0 没有存储注入或观察值 | additive 升为 `1.1.0`，mount 可注入 Store，observation 暴露 backend/version |

`@world-studio/player-core` 升至 `0.4.0-n52`，`@world-studio/player-shell` 升至 `0.6.0-n52`。Runtime Session Save wire schema、`RUNTIME_VERSION=0.6.0` 与 Runtime Host State schema 均未改变；`rehydrate` 是 Host 操作审计语义扩展，不伪造存档格式迁移。

## 3. 冻结测试与首次实际

先增加正反例再实现。首次运行 `packages/runtime-host` 与 `packages/player-core` 为 `4 failed / 18 passed`：缺少 Core Save/Load 桥和 Host rehydrate，符合预期。Web Store 首次为导入不存在而失败，确认测试没有误吃旧实现。

最终 N52 专门门为 `5 files / 51 tests`：

- 干净 Core 下同一 Runtime State Hash、History cursor、presentation 与 Forward 分支恢复；已有较新 Meta 时保持 N31 单调合并，并另行校验原始 saved checkpoint Hash；
- title-only、canonical 篡改、Build mismatch 全部 fail closed；
- Load 只产生 rehydrate，不产生 execute/replay；
- cancelled Effect 不复活；
- IndexedDB 跨 adapter 实例保存、覆盖、工程隔离与损坏拒绝；
- Shell 手动槽位 save→推进分支→load 返回原 choice；
- N50 `46/46`、N51 `97/97` 无回归。

## 4. 冷 production-browser

先在开发服务器完成交互预检，但不登记为产品证据；完整构建后改用 production preview，从空标题执行 `Start → manual-1 Save → Right → Load → reload → Load`。

| 证据 | 实际 |
|---|---|
| 跨刷新 | IndexedDB 槽位保留；读取恢复 `waiting-choice`、History cursor `1`、scene `branch_start` |
| 1280×720 | document `1280×720`，横向 overflow `0`，console warning/error `0` |
| 390×844 | document `390×844`，横向 overflow `0`；面板左右边界 `10/380px`，底部 `772px < 844px` |
| 触控 | toggle `48px`；保存/读取最小高度 `44px` |
| 失败关闭 | 标题态保存 disabled；空槽读取 disabled；存储/校验失败显示错误且不返回部分 Core |

机器证据见 [player-save-load-browser.json](../evidence/n52/player-save-load-browser.json)。浏览器截图只证明 Web 响应式产品界面，不替代实体触屏、Windows/Android Host 或真人验收。

## 5. 根级完整门

`npm run check` 在未拆分、未放宽预算的情况下单次通过：

- 普通回归：`150 files / 898 tests`；
- N52：`51/51`；N50：`46/46`；N51：`97/97`；
- Runtime corpus：10,000 seeds / 20,000 replay，digest `20e9a842...92ef2`；
- Autosave：最终长链 Vitest 总时长 `6.40s`，其中测试体 `4.35s < 5s`；原命令隔离复跑总时长 `2.81s`、测试体 `1.41s`，预算未修改；冻结 VM：`28.30s < 90s`；
- 17 workspace build、portable architecture `100 / 4`：PASS；
- Script：`13/13`；Route：`9/9`、P95 `56.82ms < 500ms`；Asset：`4/4`、dicing `1482.87ms < 5000ms`。

既有 Editor `982.10 kB` 大 chunk warning 保留为既有债务；Player production JS 为 `344.74 kB / gzip 105.28 kB`。本步没有以调整预算或忽略 warning 换取绿色。

## 6. 状态与下一接续点

E2 只在实现提交推送且同头 Windows / Node 22 完整门绿色后关闭 Engineering。下一切片冻结为 **N52-E3 Save metadata/screenshot 与自动/快速槽位策略入口审计**；开始前必须重新核对 Gal 2.4 的截图、分页、自动/快速/检查点与损坏恢复要求，不得直接进入 Auto/Skip，也不得把三个固定手动槽位冒充完整存档系统。
