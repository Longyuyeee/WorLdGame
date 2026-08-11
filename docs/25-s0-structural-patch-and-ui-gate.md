# S0.6 Structural Patch 与 S0.7 UI 测试准入

> 状态：本地实现、完整门禁、远端推送与 PR 证据回读均通过；S0.7 UI 实现门禁已开放。
> 决策日期：2026-08-11。
> 风险等级：R3（结构编辑、历史、Tombstone 与 ID 兼容）。本切片通过后允许进入可测试 Script UI 原型，不代表 M1 数据格式冻结。

## 1. 用户何时可以测试 UI

现有 S0.1 Writer/Flow/Preview UI 已经可以测试。包含 Script 编辑与跨视图同步的下一版 UI 定为 **S0.7**，在本 S0.6 的远端门禁通过后开始，不再增加其他前置核心切片。

S0.7 首轮测试范围：

- Writer 修改对白 → 稳定 ID 局部 Patch → Script 与 Preview 同步；
- Script 合法修改 → source transaction → 投影 → Writer 与 Preview 同步；
- Script Error 保留草稿但不污染 Preview；
- 对白 Insert/Delete/Move、Undo/Redo 与 Tombstone 状态可见；
- 未知插件命令、注释和空行在跨视图操作后仍保留；
- 桌面与手机响应式、键盘/触控、完整/减少动效路径；
- 明确标注当前不支持的 Label/Set/多行/Ruby/富文本。

S0.7 是可用性和数据安全原型测试，不是正式发布版。至少 5 名目标用户测试与真机矩阵仍是后续准入要求。

## 2. S0.6 范围

本切片只覆盖对白结构操作：

- `script.insert-dialogue`：在场景或已有稳定 ID 节点之后插入全新双 ID 对白；
- `script.delete-dialogue`：删除目标对白并产生确定性 Tombstone；
- `script.move-dialogue`：把原对白行移动到另一个稳定 ID 节点之后；
- 所有命令接入 base revision、Command ID 幂等、ChangeSet、Undo/Redo 和 `DRAFT_PENDING`。

Choice/Option、Direction、End、Label、Set 和条件结构 Patch 不在本切片内。

## 3. 源文本保留规则

- source/CST 修改前重新解析并比较语义快照；外部变化原子拒绝；
- Insert 只新增一行，其他行不格式化；
- Delete 只移除目标物理行及必要分隔符；
- Move 重排目标行内容，原换行序列按位置保留；
- 只有空行分隔的目标已视为语义相邻，Move 返回 noop，不移动空行；
- 直接相邻注释的归属尚未冻结，可能改变归属的操作返回 `STRUCTURAL_COMMENT_OWNERSHIP_UNRESOLVED`。

## 4. Tombstone 与 ID 保护

Dialogue Tombstone 包含：`statementId`、`textId`、`speakerId`、原文本、原始行和原行号，不包含时间戳、绝对路径或设备信息。

- Delete 在当前 session 建立活动 Tombstone；
- Undo Delete 恢复实体并撤销该活动 Tombstone；
- Redo Delete 再建立 Tombstone；
- 活动 Tombstone 的 statement/text ID 不能被 Insert 或整源替换复用，冲突码为 `TOMBSTONED_ID_REUSE`；
- Tombstone 当前保存在会话与历史快照中，尚未写入工程格式/WAL。

## 5. 稳定错误语义

- `STRUCTURAL_SOURCE_ERROR` / `STRUCTURAL_SOURCE_MISMATCH`；
- `STRUCTURAL_ANCHOR_NOT_FOUND`；
- `STRUCTURAL_TARGET_NOT_FOUND` / `STRUCTURAL_TARGET_NOT_DIALOGUE`；
- `STRUCTURAL_DUPLICATE_ID` / `STRUCTURAL_INVALID_IDENTIFIER`；
- `STRUCTURAL_TEXT_UNREPRESENTABLE`；
- `STRUCTURAL_COMMENT_OWNERSHIP_UNRESOLVED`；
- `STRUCTURAL_SELF_MOVE`；
- `TOMBSTONED_ID_REUSE`；
- `DRAFT_PENDING`。

所有失败均返回原 session/source，不产生部分结果。

## 6. 审计中修正

- 测试最初把“中间只有空行”当成需要移动，实际会无意义改变用户分段；改为语义相邻 noop。
- 测试最初认为插入到锚点后、空行前会切断空行之后的注释；实际注释仍直接邻接原节点，收紧为真正直接相邻才拒绝。
- 初版 Delete 只在 ChangeSet 返回 Tombstone，删除后的 ID 可再次 Insert；修复为 session 活动 Tombstone 集与历史快照，并阻止 ID 复用。
- Redo Delete 初版没有重新发出 Tombstone；修复为 History 保存 before/after Tombstone 状态，Redo ChangeSet 恢复删除证据。

## 7. 未证明项

- Tombstone 工程持久化、压缩周期、迁移表和旧存档读取；
- 注释所属节点的正式语法/CST 规则；
- Choice/Option 与引用保护、Label/Set/条件/调用结构编辑；
- 多人“撤销我的意图”、三方合并、WAL、崩溃恢复；
- 100k 行结构操作性能、Android IME 与独立 R3 审阅。

S0.6 门禁通过并完成远端回读后，下一步直接进入 **S0.7 Script UI Prototype**。S0.7 不得通过重生成脚本绕开 Patch，也不得把错误草稿送入 Preview。

## 8. 本地审计结果

- TypeScript 严格检查、生产构建与架构审计通过；共审计 12 个可移植生产源文件。
- Vitest 共 7 个测试文件、55/55 用例通过。
- 结构事务模型连续运行 30 轮 Insert → Delete → Undo×2 → Redo×2，源文本、历史游标与 Tombstone 状态保持确定性。
- Editor 生产包：JavaScript 206.37 kB（gzip 64.79 kB），CSS 18.73 kB（gzip 4.78 kB）。
- `npm audit`：0 个漏洞；`git diff --check`：通过。
- 本地审计不替代远端提交、PR 内容与 Head SHA 回读；上述远端证据已完成，S0.7 实现门禁正式开放。

## 9. 远端证据

- 2026-08-11：实现提交 `e2e849518268155463e7f69c9b09e30bf5f78e6e` 已推送至 `agent/visual-production-bar`。
- Draft PR #1 已回读确认：标题、分支、Head SHA、S0.6 摘要、55/55 测试证据与 S0.7 下一步均一致。
- S0.6 已闭环，下一开发切片直接进入 S0.7 Script UI Prototype。
