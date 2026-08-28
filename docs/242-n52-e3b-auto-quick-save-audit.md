# N52-E3b Auto / Quick 存档审计

> 日期：2026-08-29  
> 分支：`codex/n52-e3b-auto-quick-save`  
> 直接基线：N52-E3a 最终绿色头 `fb452e3` / Draft PR #101  
> 授权：`RA-N21-011`，最大节点 N52  
> 当前判定：N52-E3b Engineering 候选；本地实现与定向测试已通过，等待本地完整门及同头远端 CI 后关闭。Product Acceptance 持续阻断。

## 1. 开发前对齐与纠偏

本切片重新读取 [Gal 基础 2.4](11-gal-foundation-and-automation.md)、[稳定性 7.2](12-size-performance-stability.md)、[E3 入口契约](240-n52-e3-save-policy-entry-audit.md)及 E3a 实际 Store/Player 代码。确认 E3a 为迁移建立的 v2 记录已经包含 `kind`，但解析器暂时只接受 `manual`；E3b 应在同一 v2 中严格启用 `auto/quick`，不应再升 schema，也不能放宽任意槽位 ID。v1 仍只表示旧手动槽。

实际 Player 状态机只有 `presenting/dialogue|narration`、`waiting-choice/choice` 与 `ended/ending` 是稳定可呈现边界；title、error、waiting-effect、waiting-barrier 和 wait 均不能保存。加载继续调用正式 Session Save rehydrate，不执行或重放 Effect。

## 2. 本切片实现

机器合同位于 `config/n52-e3b-auto-quick-save.json`：

1. v2 严格绑定 `manual-1..12`、`auto-1..5` 与 `quick-1`，kind/ID 错配及越界均拒绝；
2. 每个 Store 实例由单 FIFO coordinator 串行化写入；前一写失败后队列继续，IndexedDB 原子事务保留原有效槽；
3. 自动存档在场景变化后的第一个稳定可呈现边界触发，场景身份为 Build ID + scene ID；同一身份在当前 Player 会话只写一次，且最新持久自动槽相同也会合并；
4. 五个自动槽先填空槽，满后按保存时间最旧优先轮转，时间相同时以 slot ID 确定性裁决；
5. 快速存档固定写 `quick-1`，由玩家明确命令直接替换，不套用手动槽的二次覆盖确认；
6. Player 常驻提供快速保存/读取，面板提供手动、自动、快速三类视图；自动槽只允许读取，手动槽原覆盖确认不变；
7. 从任一槽加载前继续校验 Session artifact、Build、Runtime State、scene、presentation 与 title，加载场景登记为已见，避免读取本身制造自动写入。

## 3. 测试与审计状态

新增策略测试冻结稳定边界、五槽轮转、同场景合并、FIFO 串行、失败后继续与旧槽保留；Store 测试冻结三类槽位的严格 ID；Player 测试覆盖标题禁用、choice/scene 自动写、同场景 ending 不重复、五槽产品视图、固定快速槽保存和 load-only rehydrate。定向结果为 3 files / 37 tests。

本地完整 `npm run check` 已从头单次通过：普通回归 `151 files / 911 tests`，N50 `51/51`、N51 `102/102`、N52 `61/61`；Runtime corpus digest 保持 `20e9a842…92ef2`，墙钟 `8.842s`；冻结 VM `29.21s <90s`；17 workspace build 与 portable architecture `100 / 4` 通过；Route rename P95 `88.32ms <500ms`，lazy structure `159.00ms <500ms`，Asset dicing `1616.73ms <5000ms`。Player production JS 为 `356.64 kB / gzip 108.19 kB`；Editor 既有 `982.10 kB` chunk warning 未隐藏或放宽。

实现提交、Draft PR 与同头 Windows / Node 22 证据将在本文件同一切片内补齐；远端证据完成前不得把候选写成 Engineering 关闭。

## 4. 剩余边界与下一接续点

E3b 不实现永久 checkpoint、隔离 crash recovery Store、Migration Museum、云同步/冲突、Windows/Android 正式 Host 验证或 N52 Product Acceptance。远端同头绿色后，下一唯一切片为 **N52-E3c**：显式 build-authored checkpoint、crash recovery 隔离与旧版本 Migration Museum。
