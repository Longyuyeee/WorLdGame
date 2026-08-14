# N21 最小 Writer/Sequence 编辑审计

> 日期：2026-08-14
> 节点：N21
> 对齐需求：`REQ-SEQ`、`REQ-SCRIPT`、`REQ-UX`；依赖 N11 Project Service 与 N20 Story Language P0
> 状态：工程实现门通过；本地完整门与 Draft PR #30 Windows CI 完成，等待 20 分钟非程序用户实测

## 1. 审计结论与原有断点

N20 已冻结完整 P0 语言，但原 Writer 仍只允许修改 Dialogue 和三类媒体 Directive。更关键的是 `projectStoryScene` 会拒绝 Narration、Label、Jump、Call/Return、Set、Condition 和 Wait，因此这些语句即使能在 Script 中解析，也不能进入 Writer、Canonical Project、搜索、预览或保存恢复链。

N21 不新增第二份可视化数据。所有卡片继续读取最后有效 `StoryScene` 投影，全部写操作通过稳定 ID SourceSession 事务写回 `.world`，再经过 Parser、表达式安全检查、投影、Project Validation 和 Project Service 保存链。

## 2. 完整 P0 投影

`StoryStatement` 与 `projectStoryScene` 现覆盖：Dialogue、Narration、Choice/Option、Label、Jump、Call、Return、Set、Condition、Wait、End、Background、Character 和 Audio。Canonical Adapter、项目/场景搜索、Preview 步长与 Writer 标签均显式处理这些类型。

未知插件命令仍不会伪装成可执行卡片；它们在源文件中保持 Opaque，但进入当前 StoryScene 投影时产生 `UNSUPPORTED_EXECUTABLE_NODE`。Set/Condition 在投影前经过安全表达式语法和已知类型检查，任意 JavaScript 不会进入最后有效语义。

## 3. 可视化编辑能力

- 插入菜单覆盖 14 类用户可插入 P0 卡片；Choice 默认原子创建两个 Option；
- Dialogue、Narration、Choice、Label、Jump、Call/Return、Set、Condition、Wait、End 和三类媒体均可复制、删除和排序；
- Choice 主节点与 Option 作为不可拆散结构组处理，插入锚点使用最后一个 Option ID；
- 多选支持逐项、Shift 范围、折叠和展开；批量删除使用单 revision 原子事务；
- 类型化 Inspector 直接编辑 AST 字段，Choice Option 和 Condition 分支可视化呈现；
- Character、Variable、Label、Scene 和 Asset 引用使用当前工程稳定 ID 选项；
- Dialogue 与 Direction 保留已有专用事务输入和类型化媒体 Inspector。

## 4. 原子性、错误隔离与输入等价

SourceSession 新增统一 P0 insert/update/delete/move 与 P0 Batch 命令。Batch 在单一 revision 内完成所有 Patch，任一操作失败则返回原 Session；完成后还必须通过 StoryScene Projection 和 Project Validation，才允许替换 Writer/Preview 的最后有效投影。

键盘路径包括 `Ctrl+Enter` 插入、`Alt+ArrowUp/Down` 排序、`Delete` 删除、`Shift+Space` 范围选择；相同操作均有常驻按钮或选择控件，触屏不依赖拖放或悬停。双击卡片可折叠，工具栏提供显式折叠/展开替代。

## 5. 自动化证据

- N21 用户流程：从 Writer 创建对白、两选项、变量、标签、条件、背景、BGM 和结局，并在 Script 中验证权威语义；
- 原子领域流程：同一批次写入完整分支与媒体，revision 只增加 1；
- 保存恢复：生成 Project Snapshot 后重开，N21 语句、稳定 ID 和媒体指令不丢失；
- 错误隔离：`globalThis.process.exit()` 更新被拒绝，SourceSession 和投影保持最后有效版本；
- 编辑模型：全部插入类型、Choice 两 Option、新 ID 复制、范围上限和排序锚点；
- 当前结果：Editor 34 个测试文件、169 个测试；Story Language 12 个文件、99 个测试；Story Core 2 个文件、9 个测试全部通过，全仓类型检查通过。

本地完整 `npm run check` 通过：Workspace 边界 10 个、需求 50 条、Golden 工程 7 个；常规测试 82 个文件、497 个测试；VM 重型一致性 5 个测试；10 个 Workspace 构建；架构审计 65 个可移植文件和 4 个 Node Adapter；Script Performance 10 个测试和 Asset Performance 4 个测试均通过。100k 行语言基线为完整解析 226.52 ms、单行增量 4.47 ms。

编辑器生产主 chunk 当前为 574.32 kB、gzip 163.23 kB，Vite 继续报告超过 500 kB 警告。该警告不阻断 N21 语义编辑验收，但必须进入后续前端分包治理，不能当作已解决。

## 6. 验收边界

自动化测试证明需求路径可执行、可保存重开和不污染语义，但不能替代 N21 Acceptance 中“不了解脚本语法的测试者在 20 分钟内完成任务”。Draft PR CI 通过后仍需一名未参与实现的测试者按以下任务执行并记录开始/结束时间、阻塞点、求助次数和最终工程快照：创建对白 → 两选项 → 设置变量 → 条件进入两个结局 → 加入背景/BGM → 保存关闭重开。

在真人任务通过前，N21 只能标记为“实现完成、产品验收待完成”，不得顺序进入 N22。N21 也不宣称完整 N41 Sequence、正式 Runtime Preview 或真实媒体渲染已完成；这些分别属于 N41、N30–N32 与 N22。

远端工程验收证据：GitHub Actions run `31722738575`、Windows / Node 22 job `94523467459` 于 2026-08-14 通过，耗时 3 分 2 秒。该证据证明提交在远端 Windows 环境通过完整门，不等价于真人 20 分钟任务。

## 7. 后续临时例外

2026-08-14，Product Owner 因当前无法获得合格真人参与者，批准 [RA-N21-001](100-n21-human-validation-risk-acceptance.md)。该例外只允许 N22 工程实现，不改变本文件的验收事实：N21 仍未通过，自动化或代理操作仍不能冒充真人证据，N23 验收、M1 Stable 与公开发布继续阻断。例外在 2026-09-14 或进入 N23 验收前到期，以先到者为准。
