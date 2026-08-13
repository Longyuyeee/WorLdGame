# N20 Story Language P0 审计

> 日期：2026-08-14
> 节点：N20
> 对齐需求：`REQ-SCRIPT`、`REQ-SEQ`、`REQ-RUNTIME`；为 N21、N30、N31、N40 提供权威脚本语义
> 状态：通过；本地完整门与 Draft PR #29 Windows CI 终审完成

## 1. 目标与原有缺口

N20 将 S0 的对白、选择和三类媒体指令子集扩展为可以表达 M1 最小可玩故事的 Story Language。原实现缺少 Narration、Jump、Call/Return、Condition、Wait，`set` 只保存未检查字符串，也没有补全、定义、引用、重构或通用 P0 Patch。

本节点在现有 `@world-studio/story-language` 内向后兼容扩展，保留 S0 工程和 SourceSession，不建立另一套脱离编辑器的语言实现。`languageVersion` 暂保持 `0`，因为既有语法仍兼容；正式格式升版只有在出现不兼容迁移时才进行。

## 2. 冻结语法

| P0 语义 | 规范形式 | 稳定 ID |
|---|---|---|
| Scene | `scene "Title" @id(scene_id)` | `@id` |
| Dialogue | `character: text @sid(statement_id) @id(text_id)` | 语句 `@sid`、文本 `@id` |
| Narration | `narrate "text" @sid(statement_id) @id(text_id)` | 同上 |
| Choice/Option | `choice "prompt" @id(...)` / `"label" -> target @id(...)` | `@id` |
| Label/Jump | `label name @id(...)` / `jump name @id(...)` | `@id` |
| Call/Return | `call name @id(...)` / `return @id(...)` | `@id` |
| Set | `set variable = expression @id(...)` | `@id` |
| Condition | `if expression -> label @id(...)` | `@id` |
| Wait | `wait 250ms @id(...)` 或 `wait 1.5s @id(...)` | `@id` |
| End | `end "ending" @id(...)` | `@id` |
| Background | `@background ... @id(...)` | `@id` |
| Character | `@show ... @id(...)` | `@id` |
| Audio | `@audio ... @id(...)` | `@id` |

注释、空行、未知命令以 Opaque CST 节点保留。引号节点的未知有效元数据和 Directive 未知有效参数保持往返；Formatter 不删除稳定 ID。CJK、日文和 Ruby 标记按 UTF-8 原文保存。

## 3. 类型化表达式与安全边界

表达式只允许：

- Boolean、Number、String 字面量；
- 项目变量标识符；
- `!`、一元 `-`；
- `* / + -`、比较、相等、`&& ||`；
- 括号和嵌套条件。

Parser 生成独立表达式 AST、类型和标识符引用。函数调用、属性访问、数组/对象、赋值、模板字符串及任意 JavaScript 均不是语法；例如 `globalThis.process.exit()` 会产生 Token/语法诊断，不会执行。

## 4. Language Service

`buildStoryLanguageIndex` 为脚本和 N13 项目实体建立：

- Label、Variable、Character、Asset 定义；
- read/write/target 引用；
- 未知 Label/Variable/Character/Asset；
- 重复 Label、表达式错误和赋值/条件类型错误；
- Keyword 与项目符号补全；
- definition 和 references 查询；
- Label、Variable、Character、Asset 的结构化重命名。

重命名先要求源文件无 Parser Error，并通过 AST/CST 节点修改后重新格式化、解析；不做全文无上下文替换。

## 5. Patch 与增量模型

统一 P0 Patch 覆盖 Dialogue、Narration、Choice、Option、Label、Jump、Call、Return、Set、Condition、Wait、End 和三类媒体 Directive：

- 按稳定 ID 插入、更新、删除、移动；
- 插入拒绝重复/缺失 ID；
- 更新禁止改变节点 kind 或稳定 ID；
- `expectedDocumentHash` 陈旧时返回 `STALE_DOCUMENT`，不覆盖并发编辑；
- 每次操作重新解析并验证语义快照。

增量状态允许替换单个现有行，只重新解析被改行并调整后续 Range；即时暴露该行诊断，同时标记 `needsFullValidation`。提交前必须完整解析，跨行重复 ID 和全局引用不能只靠局部结果放行。

## 6. 测试与验收

针对性覆盖：

- P0 全语法、未知插件/参数、注释、CJK/Ruby 和 Formatter 往返；
- 安全表达式、嵌套条件、类型错误和 JavaScript 拒绝；
- 补全、定义、引用、诊断和三类符号重构；
- 15 类可编辑节点的通用 Patch；
- 陈旧 Hash 冲突；
- 1,000 次跨视图稳定 ID 改写；
- 100,000 行单行增量更新；
- Branching Golden parse → edit → format → parse，恢复编辑后语义 Hash 不变。

当前针对性结果：3 个测试文件、25 个测试通过；整个 Story Language 为 12 个测试文件、98 个测试通过；全仓类型检查通过。

本地完整 `npm run check` 通过，证据为：

- Workspace 边界 10 个、需求 50 条、Golden 工程 7 个全部通过；
- 常规测试 79 个文件、488 个测试通过；VM 重型一致性测试 1 个文件、5 个测试通过；
- 10 个 Workspace 构建全部通过；
- 架构审计覆盖 65 个可移植文件和 4 个 Node Adapter 文件，通过；
- Script Performance 10 个测试和 Asset Performance 4 个测试通过。

性能门新增 100,000 行、6,666,609 bytes 的 N20 文档测量：完整解析 210.86 ms、单行增量更新 4.41 ms；预算分别为 6,000 ms 和 2,000 ms，报告已经进入 `npm run audit:script-performance`。构建仍报告既有的编辑器主 chunk 超过 500 kB 警告；该警告不影响 N20 语言内核验收，后续由前端分包节点治理。

## 7. 诚实边界与下一节点

- N20 冻结脚本语义和语言服务 API，不代表非程序用户 UI 已覆盖全部语句；Writer/Sequence 卡片、Inspector 和触屏任务属于 N21。
- Language Service 已产出诊断/补全/定义/引用数据，但正式 Monaco/CodeMirror UI、快捷键和虚拟化呈现属于 N41。
- P0 AST 不是 Runtime IR；控制流验证、Compiler、循环/可达性和源码映射属于 N30，确定执行属于 N31。
- Ruby 在本节点保证源文本往返；排版、字体 fallback 和运行时显示属于 N50/N61。
- 100,000 行门证明 Parser/增量数据层预算，不证明完整编辑器 DOM 在该规模下的帧率。

N20 终审已通过，按顺序进入 N21：最小 Writer/Sequence 编辑。

远端验收证据：GitHub Actions run `31720580950`、Windows / Node 22 job `94516256378` 于 2026-08-14 通过，耗时 3 分 10 秒。首次 run `31720264790` 暴露 1,000 次改写测试超过 Vitest 默认 5 秒；未减少测试规模，仅为该重型场景显式设置 20 秒上限，本地完整门复验通过后再次推送并通过远端终审。
