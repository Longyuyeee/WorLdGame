# S0.5 Stable-ID Local Patch 与审计记录

> 状态：已实现、通过本地门禁并完成远端分支与 PR 证据回读。
> 决策日期：2026-08-11。
> 风险等级：R3（跨视图修改权威 CST、并发冲突和数据保留）。本实现仍是 S0 v0 证据，不代表完整 Script UI 已获准接入。

## 1. Problem Brief

S0.4 能从 CST 派生 `StoryScene`，但 Writer 若修改对白后再从 `StoryScene` 重生成整份 `.world`，会丢失注释、空行、未知插件命令、未知参数、原始换行和用户分段。正确方向是把 CST 保持为权威数据，并将 Writer 意图翻译为稳定 ID 局部 Patch。

本切片只实现对白文本 Patch：输入 `statementId + text`，更新对应 `DialogueNode.textRaw`，再通过同一个 source transaction 生成 revision、ChangeSet、Undo/Redo 和幂等结果。

## 2. 数据安全不变量

1. 不使用行号、显示文本或内容哈希作为实体身份，只使用 `statementId`；
2. 修改前重新解析当前 source，并与调用方提供的 CST 做语义一致性比较；不一致返回冲突，不覆盖外部编辑；
3. 只替换目标行的文本区间，目标外字节必须保持不变；
4. CRLF/LF、缩进、冒号空格、稳定 ID 顺序和未知尾随元数据原样保留；
5. 修改后重新解析，并验证同一 `statementId` 的 `textRaw` 等于请求值；
6. 任一步不能证明安全时返回失败，不输出部分 Patch。

## 3. 对白尾随元数据

Parser 将对白末尾的 `@name(...)` 视为元数据区：

- `@sid(...)` → `statementId`；
- `@id(...)` → `textId`；
- 其他标记保存在 `trailingMetadata`，不会混入玩家正文，也不会被 Formatter/Patch 删除。

当前行语法不能无歧义表达正文末尾的 `@name(...)`、首尾结构空格或原始多行文本，因此 Patch 明确拒绝这些输入。后续若引入带引号/块文本语法，必须提供迁移与 Round-trip 证明。

## 4. Patch 失败语义

| Code | 含义 |
|---|---|
| `PATCH_SOURCE_ERROR` | 当前 CST/source 有 Parser Error |
| `PATCH_SOURCE_MISMATCH` | source 与 CST 不再对应，或修改后验证失败 |
| `PATCH_TARGET_NOT_FOUND` | 找不到指定对白语句 |
| `PATCH_TARGET_NOT_DIALOGUE` | ID 存在但不是对白 |
| `PATCH_TARGET_AMBIGUOUS` | 同一 statementId 对应多个对白 |
| `PATCH_MULTILINE_TEXT_UNSUPPORTED` | 当前行语法不支持原始换行 |
| `PATCH_RESERVED_METADATA_SYNTAX` | 正文包含保留的 `@name(...)` 元数据形式 |
| `PATCH_SURROUNDING_WHITESPACE_UNSUPPORTED` | 正文包含不可无歧义保留的首尾空格 |
| `DRAFT_PENDING` | Script 尚有未解决草稿，Writer Patch 不得并发提交 |

## 5. 事务集成

`script.patch-dialogue` 使用现有命令信封：`schemaVersion`、`commandId`、`baseRevision`、`statementId` 和 `text`。成功后：

- source revision 与 semantic revision 按真实变化推进；
- ChangeSet 标记对应 `textId`、保存和编译失效；
- 同一 Command ID/载荷重试不重复执行；
- Undo/Redo 恢复精确源文本，包括原始换行和元数据；
- 未解决 Script 草稿存在时拒绝执行。

## 6. 审计中发现的问题

- 初版 Patch 只验证目标行结构；若 source 被外部工具改成另一条仍合法的对白，旧 CST 仍可能覆盖它。修复为修改前重新解析 source 并比较完整语义快照。
- 旧 Parser 把未知对白元数据计入 `textRaw`，局部改字会删除它。修复为独立 `trailingMetadata` 并增加字节级保留断言。

## 7. 未证明项

- 插入、删除、移动语句及选择项 Patch；
- Label/Set/条件/调用的 Canonical Model 与局部修改；
- 带引号、Ruby、富文本和多行对白；
- 增量 Parser；当前 source/CST 一致性检查是 O(N) 全文解析；
- 外部编辑三方合并、WAL、磁盘原子写和崩溃恢复；
- CodeMirror/IME/Android 真机与独立 R3 审阅。

下一步应实现稳定 ID 的 Insert/Delete/Move Patch 与 Tombstone/引用保护，再决定 Script UI 的最小接入范围。任何结构 Patch 都必须继续满足“目标外字节不变”和失败不产生部分结果。

## 8. 本地审计结果

2026-08-11 本地证据：

- 6 个测试文件、45/45 测试通过；
- CRLF、缩进、冒号空格、`@sid/@id` 原始顺序、未知对白元数据、注释和未知插件命令通过精确字符串保留断言；
- 100 次连续局部 Patch 后稳定 ID、注释、未知元数据和 `StoryScene` 投影保持一致；
- source/CST 外部编辑冲突、缺失/错误目标、多行、保留元数据语法和首尾空格均有拒绝测试；
- `script.patch-dialogue` 的 revision、semantic revision、ChangeSet、幂等、Undo/Redo 和 `DRAFT_PENDING` 通过；
- TypeScript strict、三个 workspace 构建和 11 个可移植生产源文件架构审计通过；
- Editor 运行时代码与体积不变：JS 206.37 kB（gzip 64.79 kB），CSS 18.73 kB（gzip 4.78 kB）；
- 官方 npm Registry 漏洞审计为 0 vulnerabilities，`git diff --check` 通过。

这些证据不替代锁文件干净安装、100k 行性能、外部编辑三方合并、真机输入或独立 R3 审阅。

远端记录：`agent/visual-production-bar` 已推送，Draft PR #1 已更新 S0.5 范围、验证与未证明项；最终远端 SHA 以 PR Head 回读为准。
