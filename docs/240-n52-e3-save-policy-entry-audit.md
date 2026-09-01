# N52-E3 Save 元数据、截图与槽位策略入口审计

> 日期：2026-08-28  
> 分支：`codex/n52-e3-save-policy-entry-audit`  
> 直接基线：N52-E2 最终绿色头 `a1a21c1` / Draft PR #99  
> 授权：`RA-N21-011`，最大节点 N52  
> 判定：N52-E3 入口 Engineering 关闭；只冻结 v2 迁移、元数据/截图所有权和槽位策略，不登记任何 E3 产品代码或 Product Acceptance 完成。

## 1. 原始需求与真实代码

[Gal 基础 2.4](11-gal-foundation-and-automation.md)要求手动、自动、快速、检查点与云存档开关，槽位数量/分页、截图、时间、章节、路线、自定义元数据、迁移、损坏恢复和同步冲突；[稳定性 7.2](12-size-performance-stability.md)进一步要求校验、原子替换、最后有效副本保护、迁移前快照和正式存档/崩溃恢复隔离。

E2 的真实实现只有严格 `WorldPlayerSaveSlotV1`：三个 `manual-*` 槽位、时间、scene/presentation/Build/State/Session Hash、`previewImage: null` 与单个 IndexedDB `save-slots` Store。它已提供可靠的最小手动 Save/Load，但不能被扩写成原始 2.4 完成。

## 2. 发现的偏移与纠正

| 发现 | 不能采用的捷径 | 入口纠正 |
|---|---|---|
| v1 exact-key parser 固定 `kind: manual` 和 `previewImage: null` | 在 schemaVersion 1 下静默加截图/章节字段 | 新增 v2；继续严格读取 v1，仅在成功写入 v2 后完成 copy-on-write 迁移，提交前保留原 v1 |
| Canonical Project 有 chapter/scene 结构，但 `testRoutes.routes` 是测试路线文档 | 把测试路线或 scene ID 冒充玩家命名路线 | chapter/scene 从 Canonical + saved cursor 投影；route 在正式 Runtime/Project 来源出现前必须为 `null` |
| `preservedFields` 只用于未知字段字节保持 | 从未知字段猜测“自定义存档元数据” | custom metadata 先为空；后续只能由版本化 provider 合同提供 |
| Player Stage 是 DOM + 媒体组合，没有正式 compositor capture API | 用开发者截图、合成占位卡或 `previewImage: null` 冒充存档截图 | 截图归 Player Host compositor；v2 元数据与独立 Blob Store 同事务，列表不读 Blob |
| Runtime History 每个可观察步都有 checkpoint | 把内存 History checkpoint 自动暴露为永久检查点槽 | 永久 checkpoint 只接受 build-authored 显式 marker；当前 marker 不存在，所以 E3a/E3b 禁止实现该类槽位 |
| 移动端后台要求恢复检查点 | 把 crash recovery 写进 auto/manual 槽位 | recovery 使用独立 Store/保留/提示策略，不与四类正式槽位别名 |

这些纠正不删除需求，而是避免用现有相似字段制造错误兼容承诺。

## 3. 冻结的 v2 边界

机器合同位于 `config/n52-save-policy-entry.json`，根级 `audit:n52-save-policy-entry` 校验真实 v1 基线和以下不可漂移项：

- `manual`：12 槽，每页 6 槽，显式选择；覆盖必须显式确认；
- `auto`：5 槽 oldest-first 环形替换；只在场景变化后的第一个稳定可呈现边界写入，同 scene 合并；
- `quick`：单槽显式替换，只由玩家命令触发；
- `checkpoint`：3 槽环形策略已预留，但 build-authored marker 出现前实现阻断；
- 可保存呈现仅为 dialogue/narration/choice/ending；title/error/pending Effect/Barrier 禁止写入；
- v2 截图只接受 Host compositor 产生的 PNG/WebP，最大边 512、最大 512 KiB；Blob 与元数据同一 IndexedDB 事务；
- 截图失败不能毁掉有效剧情存档：提交带明确 `preview-unavailable` 的存档，UI 不得展示伪截图；
- 启动/列表只读元数据，只有显示可见槽位时才读取截图 Blob；
- Load 继续使用 E2 的严格 Session Save 与 `rehydrate`，不得 execute/replay 副作用。

槽位数量是 N52 Player policy，不回写已经关闭的 N51 Settings schema v5。后续若产品要求可配置，必须建立新的版本化 Player Save Policy 来源和迁移，而不是在旧 Settings v5 中追加 unknown field。

## 4. 实施切片与失败路径

为了保持每步可审计，E3 拆为：

1. **N52-E3a**：v2 元数据、v1 严格兼容、手动分页、Preview Host 合同、元数据/Blob 原子存储；
2. **N52-E3b**：auto/quick 的串行写入、轮转、最后有效副本保护和产品控件；
3. **N52-E3c**：显式持久 checkpoint marker、crash recovery 隔离、迁移/损坏 Museum。

E3a 必须冻结并验证：v1 正常升级、future/unknown v2 拒绝、Blob Hash/尺寸/MIME/记录身份篡改拒绝、截图失败仍保住可加载 Session、元数据失败不返回部分槽位、分页不加载不可见截图、覆盖中断保留原槽。E3b 必须验证并发触发串行化、环形顺序、同场景 coalescing、磁盘/事务失败保留旧槽以及 quick load 错误关闭。

## 5. 入口门首次实际

先写机器合同与审计，再写状态文档。首次 `npm run audit:n52-save-policy-entry` 为 FAIL，且只出现四个预期文档缺口：本文件不存在，交付计划、追踪矩阵与当前状态缺少 E3 入口 token。真实 v1 Store、三个手动槽位、Canonical route/preserved-field 边界以及所有冻结策略均已被同一门读取并通过。

文档回填后必须运行入口审计、N52 专项、需求/风险/交付/架构门和完整 `npm run check`；推送后以同头 Windows / Node 22 CI 裁决。本入口没有改产品 UI，因此不生成截图或用旧 E2 截图冒充 E3 产品证据。

本地完整 `npm run check` 在未拆分或放宽预算的情况下单次通过：普通回归 `150 files / 898 tests`，N50 `46/46`、N51 `97/97`、N52 `51/51`；Runtime 10,000 seeds / 20,000 replay digest 保持 `20e9a842…92ef2`，本机分片总墙钟 `7.348s`；冻结 VM `29.62s <90s`；17 workspace build、portable architecture `100 / 4` 均通过；Route P95 `59.55ms <500ms`，Asset dicing `1503.59ms <5000ms`。Player production JS 保持 `345.54 kB / gzip 105.46 kB`；Editor 既有 `982.10 kB` chunk warning 未被隐藏或调高阈值。

入口提交 `3c319da` 已进入 Draft PR #100；同头 Windows / Node 22 `product-baseline` run `33183970309` / job `98892048310` 用时 `12m40s` 并绿色。远端普通回归 `150/898`、N50 `46/46`、N51 `97/97`、N52 `51/51`，新增入口审计 PASS；冻结 VM corpus `63.321s <90s`，Autosave 测试体 `3.66s <5s`，Route P95 `164.11ms <500ms`，Asset dicing `3398.61ms <5000ms`，build/architecture 均通过。首次常规 Git push 与 REST create-ref 均遇到 GitHub 服务端 `commit_refs` / HTTP 500；提交对象已存在后使用官方 GraphQL `createRef` 创建同一 SHA 引用，fetch 后本地正常跟踪远端，未重写或覆盖 E2 分支。

## 6. 仍被阻断

E3 入口不实现 v2 存档、真实截图、分页、auto/quick/checkpoint、恢复区、迁移 Museum 或云冲突；Windows/Android Host、History 页面、Auto/Skip、N52 Product Acceptance、N60+、M1 Stable 与 Public Release 均保持阻断。下一代码接续点唯一为 **N52-E3a**，开始前必须以本合同和 E2 实际代码为基线。
