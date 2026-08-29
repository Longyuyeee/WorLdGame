# N52-E3c1 Recovery / Migration Museum 审计

> 日期：2026-08-29  
> 分支：`codex/n52-e3c1-recovery-museum`  
> 直接基线：N52-E3b 最终绿色头 `86f053c` / Draft PR #102  
> 授权：`RA-N21-011`，最大节点 N52  
> 当前判定：**N52-E3c1 Engineering 候选**；本地定向证据已通过，等待完整门、实现提交与同头 Windows / Node 22 CI。Product Acceptance 持续阻断。

## 1. 开发前实际代码审计与路线纠偏

本切片先重新读取 Story Language、Compiler IR、Runtime、Player Core、E3 入口合同与 E3b Store/Player 实现。实际代码没有 build-authored、可持久化的 checkpoint marker：Story statement 不含 checkpoint 语句，Compiler IR 不产生 checkpoint opcode/metadata，Runtime `history.checkpoint` 只服务 Back/Forward 内部历史恢复。把它直接当作永久玩家检查点会把内部历史状态误写成内容作者合同，并越过 N20/N30 的语言与编译器所有权。

因此 E3c 按事实拆分：本切片 E3c1 只实现不依赖新故事语义的隔离 crash recovery 与 Migration/Corruption Museum；永久 checkpoint 没有被删除，转入下一 **N52-E3c2 checkpoint 入口合同**，先联合冻结 Story Language→Compiler→Runtime→Player 的 marker 所有权、版本和兼容策略，再允许编码。

## 2. 本切片实现

机器合同位于 `config/n52-e3c1-recovery-museum.json`：

1. Save DB 只做 DB2→DB3 加法升级，新增 `recovery-sessions`，正式 `save-slots`/`save-previews` 和 Save schema v2 均不变；
2. Recovery schema v1 严格 exact-key、每工程最多一个最新记录，与 manual/auto/quick 正式槽位完全隔离；
3. Player 在每个新的稳定可呈现 Runtime State Hash 写入恢复记录；启动只扫描并提示，不静默加载；玩家必须明确选择“恢复上次进度”或“放弃并清除”；
4. 恢复前重新校验 Session artifact、Build ID、Runtime State Hash、scene、presentation 与 title，成功后只走 Session Save rehydrate，不重放 Effect；
5. 恢复写入和清除经独立 FIFO 串行；非法或失败的新记录不覆盖上一有效恢复，损坏/future 记录 fail closed，清除恢复不触碰正式存档；
6. `fixtures/save-migration-museum/museum.json` 保存五个真实原始向量：合法 legacy v1、合法 current v2、future v3、kind/ID 错配、unknown field，并直接注入 IndexedDB 验证接受、归一化或拒绝策略。

## 3. 当前测试与审计状态

测试先于实现冻结缺失模块，随后定向回归已覆盖隔离读写、严格损坏拒绝、DB2→DB3 正式存档保留、FIFO 失败后继续、Player 跨卸载显式恢复、损坏恢复清除不影响正式存档，以及 Museum 五向量。当前 6 files / 47 tests 与补充 2 files / 8 tests 均绿色；Player typecheck 绿色；E3a 历史审计已改为验证当前数据库版本不低于其 DB2 引入边界并重新 PASS，历史 E3a 合同仍保持 DB2。

本地完整 `npm run check` 已从头单次通过：普通回归 `153 files / 919 tests`，N50 `53/53`、N51 `104/104`、N52 历史聚合 `63/63`；Runtime 10k corpus 用时 `14.621s` 且 digest 保持 `20e9a842…92ef2`，冻结 VM `28.75s <90s`；17 workspace build、portable architecture `100 / 4` 通过；Route rename P95 `108.31ms <500ms`、lazy structure `285.98ms <500ms`、Asset dicing `1820.52ms <5000ms`。Player production JS 为 `364.55 kB / gzip 109.55 kB`；Editor 既有 `982.10 kB` chunk warning 未隐藏或放宽。

实现提交、远端 PR 与同头 CI 尚未完成，因此本文件现在只登记 Engineering 候选，不提前声称关闭。

## 4. 明确保留的阻断项与接续点

- build-authored 永久 checkpoint marker 与 checkpoint slots；
- 真实浏览器/进程强杀及 AC-09 恢复矩阵；
- Windows/Android 正式 Host、云同步与冲突；
- N52 Product Acceptance、N60+、M1 Stable 与发布。

下一唯一切片是 **N52-E3c2 checkpoint 入口合同**。若跨节点 marker 权限无法在当前 `RA-N21-011` 内成立，应停在合同/治理审计，不得用 Runtime History checkpoint 或场景 ID 猜测替代。
