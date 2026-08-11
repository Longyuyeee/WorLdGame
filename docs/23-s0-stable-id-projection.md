# S0.4 Stable ID Projection 与审计记录

> 状态：已实现、通过本地门禁并完成远端分支与 PR 证据回读。
> 决策日期：2026-08-11。
> 风险等级：R3（稳定 ID、AST 投影与未来跨视图一致性）。本结论是 S0 v0 候选，不是最终工程格式批准。

## 1. 问题与需求对齐

S0.3 已证明文本草稿能安全提交为 CST，但当前 `StoryProject` 的对白同时需要 `statementId` 和 `textId`，旧脚本草案只有一个 `@id`；演出指令也缺少语句 ID。如果直接用行号、内容哈希或临时索引补 ID，格式化、移动或改台词会破坏回滚、本地化、配音和存档引用。

本切片只解决：

1. 为当前可表达的脚本子集建立显式、稳定的 ID 映射；
2. 将零 Error CST 安全投影为 `StoryScene`；
3. 当前模型无法表达的执行节点必须阻断投影，不能静默丢失；
4. 多场景投影结果必须继续通过 `StoryProject` 的全局 ID、角色和路线引用校验。

不包含反向投影、Script UI、Compiler、运行时或文件保存。

## 2. ID Mapping v0

| 语法节点 | Stable ID | `StoryProject` 字段 |
|---|---|---|
| `scene` | `@id(scn_...)` | `StoryScene.id` |
| 演出指令 | `@id(stmt_...)` | `DirectionStatement.id` |
| 对白语句 | `@sid(stmt_...)` | `DialogueStatement.id` |
| 对白文本 | `@id(txt_...)` | `DialogueStatement.textId` |
| `choice` | `@id(stmt_...)` | `ChoiceStatement.id` |
| 选项 | `@id(opt_...)` | `ChoiceOption.id` |
| `end` | `@id(stmt_...)` | `EndStatement.id` |

选择对白的双 ID 是有意设计：修改原文不改变 `textId` 或 `statementId`；复制对白时两者都生成新 ID。沿用旧草案的对白 `@id` 作为 `textId`，通过新增 `@sid` 保持 S0.2 文件可读和可往返，不使用前缀猜测身份。

## 3. 拒绝式投影

`projectStoryScene` 只在整个文档可由当前 `StoryScene` 无歧义表达时返回场景。以下情况返回 `scene: null` 与稳定诊断：

- Parser Error；
- 场景、语句、文本或选项缺少必要 ID；
- 一个文件包含多个场景头；
- 孤立选项、空选择或无 ID 选项；
- `label`、`set`、未知插件命令或普通 Opaque 语法。

注释和空行是非执行 CST 信息，可以不进入派生 `StoryScene`，但仍保留在权威 `StoryDocument` 中。Warning-only Opaque 在 S0.3 可以提交为 CST；由于当前 `StoryScene` 无法表示它，S0.4 投影仍会拒绝。这两个结论不冲突。

## 4. 字符串与选择结构

- 投影时解码引号内的 `\\n`、`\\r`、`\\t`、`\\"` 与 `\\\\`，未知转义保持反斜杠；
- 选择项必须紧随一个有效 Choice；空行和注释不切断选项归属；
- 目标名称暂映射为 `targetSceneId`，跨场景存在性由 `validateStoryProject` 统一检查；
- 选择至少需要一个有效选项。

## 5. Claim / Evidence

| Claim | 自动证据 |
|---|---|
| 双 ID 不合并 | Parser/Formatter 往返分别断言 `statementId` 与 `textId` |
| 演出语句 ID 稳定 | 指令 ID 往返与重复 ID 注册 |
| 支持子集可投影 | 演出、对白、选择、选项和结局精确结构断言 |
| 跨场景有效 | 三份脚本投影后通过 `validateStoryProject` |
| 不支持内容不丢失 | `label`、`set`、未知命令均返回 `scene: null` |
| 结构错误可定位 | 缺 ID、多场景、孤立/空选择与 Source Error 诊断 |

## 6. 未证明与下一步门槛

- `StoryScene` → CST 反向投影仍无法恢复注释、空行、未知插件命令和用户分段；
- Label/Set/条件/调用尚未进入 `story-core`，不能制作完整分支脚本；
- ID 迁移、Tombstone、复制/移动命令和旧存档兼容未证明；
- 10 万字、外部编辑冲突、增量索引和 Android 内存未测试；
- 未完成独立 R3 审阅。

下一步为 **S0.5 Stable-ID Local Patch**：先证明 Writer 对白命令能够通过稳定 ID 局部修改权威 CST，并完整保留注释、换行、未知插件命令、未知对白元数据和用户分段；仍不从 `StoryScene` 重生成整份脚本。

## 7. 本地审计结果

2026-08-11 本地证据：

- 5 个测试文件、36/36 测试通过；
- 三份跨场景脚本投影后通过 `validateStoryProject`，路线目标、角色引用和全局 ID 无诊断；
- `parse → format → parse → project` 与直接投影的 `StoryScene` 完全一致；
- 缺 ID、多场景、孤立/空选择、无 ID 选项、Parser Error、Label、Set 和未知插件命令均验证为 `scene: null`；
- TypeScript 严格检查、三个 workspace 构建和 10 个可移植生产源文件架构审计通过；
- Editor 运行时代码与体积不变：JS 206.37 kB（gzip 64.79 kB），CSS 18.73 kB（gzip 4.78 kB）；
- 官方 npm Registry 漏洞审计为 0 vulnerabilities，`git diff --check` 通过。

这些证据不替代锁文件干净安装、远端 SHA/PR 回读、迁移测试或独立 R3 审阅。

远端记录：`agent/visual-production-bar` 已推送，Draft PR #1 已更新 S0.4 范围、验证与未证明项；最终远端 SHA 以 PR Head 回读为准。
