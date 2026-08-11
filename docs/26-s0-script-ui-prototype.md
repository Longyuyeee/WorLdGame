# S0.7 Script UI Prototype 与审计记录

> 状态：本地实现、自动化门禁与真实浏览器审计通过，等待远端提交、PR 更新和证据回读。
> 决策日期：2026-08-11。
> 风险等级：R3（跨视图数据一致性、错误草稿隔离、结构编辑与移动端交互）。

## 1. 本切片回答的问题

S0.7 不再让 Writer 直接修改一份独立的 `StoryProject`。界面的数据链已经改为：

```text
ScriptSourceSession（权威脚本事务）
  → CST / Parser / Stable-ID Patch
  → projectStoryScene（拒绝式投影）
  → Writer / Flow / Preview（只读取有效投影）
```

这证明了 Script、Writer 与 Preview 可以共用同一数据真相；当前证明范围仍是内存原型，不代表磁盘工程、Compiler、Runtime IR 或 M1 数据格式已经冻结。

## 2. 已实现范围

### 2.1 Writer → Script → Preview

- Writer 对白输入通过 `script.patch-dialogue` 和稳定 `statementId` 修改权威 CST；
- 目标行之外的注释、空行、稳定 ID、格式和未知尾随元数据继续由底层 Patch 保留；
- Patch 提交后重新投影活动场景，Writer、Flow 和 Preview 读取新的有效投影；
- Writer 在错误脚本草稿存在时只读，避免覆盖用户尚未解决的 Script 输入。

### 2.2 Script → Transaction → Projection

- 每个场景拥有独立 `ScriptSourceSession`，活动场景显示其权威源文本和 revision；
- Script 修改先经过 Parser、投影和全项目引用检查；
- 全部通过后才执行版本化 `script.replace-source` 原子提交；
- Parser Error、投影不支持或项目引用损坏只进入 UI 草稿层，最后有效的 Writer/Preview 保持不变；
- 用户可以修复草稿继续提交，或明确“丢弃草稿”恢复最后有效源文本；
- Formatter 只能显式触发，错误草稿存在时禁用。

### 2.3 结构编辑与历史

- Writer 提供对白 Insert、Delete、Move Up、Move Down；
- Delete 后 Tombstone 数量和最近稳定 ID 在 Preview 侧可见；
- 活动场景的 Undo/Redo 恢复源文本、投影和 Tombstone 状态；
- 错误草稿存在时 Undo/Redo 禁用，防止历史操作覆盖未提交输入；
- 场景切换保留各自内存事务、草稿与诊断状态。

### 2.4 现代响应式界面

- 桌面保持 Scene Rail + Writer/Script/Flow + Live Preview 三栏导演台布局；
- 模式导航扩展为 Writer / Script / Flow，使用清晰的紫、青、绿语义色；
- Script 提供等宽编辑区、事务状态、诊断台、Preview Lock 和草稿恢复操作；
- 393 × 852 手机端使用三模式固定底部导航、横向场景条和单列内容；
- 页面级没有横向溢出；脚本区保留局部横向滚动，避免自动换行改变源码视觉结构；
- 继续继承 `prefers-reduced-motion` 的全局动画与过渡降级规则。

## 3. 自动化验收

- Studio adapter 单元测试：初始投影、Writer Patch、错误草稿、Script 合法提交、项目引用拒绝、Insert/Delete/Tombstone、Undo/Redo 和 Move；
- React UI 测试：Writer→Script→Preview、Script→Writer→Preview、草稿隔离、结构编辑、Tombstone、历史与 Flow；
- 全仓库 Vitest：8 个测试文件、64/64 通过；
- TypeScript strict、三个 workspace 生产构建和 12 个可移植源文件架构审计通过；
- 官方 npm Registry Audit：0 vulnerabilities；`git diff --check` 通过；
- Editor 生产包：JavaScript 239.27 kB（gzip 73.75 kB），CSS 22.44 kB（gzip 5.41 kB）。

相对 S0.6，gzip 增量约为 JavaScript 8.96 kB、CSS 0.63 kB；增量来自脚本事务适配层、Script UI、诊断和结构工具，未引入新的第三方运行时依赖。

## 4. 真实浏览器审计

桌面默认视口：

- Writer 三栏布局、场景切换、Preview 和事务状态均可见；
- 实际修改 Writer 后，Script 中对应稳定 ID 行同步更新，revision 从 0 变为 1；
- 制造未闭合场景标题后，Script 显示诊断、Preview 显示 `LOCKED`、Undo 禁用、丢弃草稿可用；
- 草稿期间 Preview 继续显示最后有效对白，没有读取错误源文本。

手机 393 × 852：

- Writer / Script / Flow 三个底部模式入口均在视口内；
- `documentElement.scrollWidth` 未超过视口宽度；
- Writer 卡片、对白编辑器和结构按钮为单列触控布局；
- 实际执行 Insert → Delete 后，Tombstone 记录和数量可见；
- 浏览器 Console：0 warning、0 error。

## 5. 审计中发现与处理

- 初版开发服务器参数被 Windows `Start-Process` 拆分，Vite 把 host 值误当根目录并返回 404；重新启动为正确 workspace Vite 进程后再开始浏览器证据采集，错误页面不计入验收。
- Studio 测试最初期望替换后的对白丢失原句前缀，实际投影正确保留“听见了。”；修正错误测试，不改变实现。
- Script 语法通过但破坏跨场景引用时，单场景投影仍可能成功；适配层增加全项目 `validateStoryProject` 准入，损坏引用只保留为草稿。
- 架构保持 `story-core` 与 `story-language` 纯 TypeScript；UI 适配层位于 Editor，不把 React/DOM 依赖反向带入可移植包。

## 6. 明确未完成与不可伪装项

- 当前 Script 编辑器是可测试 textarea，不是最终 CodeMirror/LSP；尚无语法高亮、行号、补全、跳转、IME 专项和 100k 行增量解析证据；
- Label、Set、条件、调用、多行、Ruby、富文本和 Choice/Option 结构编辑尚未进入 Canonical Model；
- 注释和空行已保留；未知可执行插件命令仍按保守投影规则阻断 UI 投影，不能宣称插件 Preview 正确；
- Tombstone、各场景事务和草稿只在内存中，尚无工程持久化、WAL、原子文件替换或崩溃恢复；
- Writer 当前按输入事件建立事务历史，正式版需要输入合并/批次边界，避免逐字符占用 Undo 层级；
- UI 自动生成 ID 只保证当前原型会话内唯一，正式工程必须使用冻结的全局 ID 生成与迁移策略；
- 尚未完成键盘全路径、屏幕阅读器、低端 Android 真机、至少 5 名目标用户和独立 R3 评审。

## 7. 下一门禁

S0.7 完成远端证据回读后，原型可以交给用户直接测试。下一切片不得立刻扩张大量剧情语法；应先完成 S0.8 编辑输入批次、键盘/IME 与大文本性能基线设计，确定 textarea → 正式 Script Editor 的替换边界，同时保持当前权威事务与错误隔离不变量。
