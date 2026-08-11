# S0.8 输入批次、IME 与大文本性能审计

> 状态：本地实现、自动化门禁与真实浏览器审计通过，等待远端提交、PR 更新和证据回读。
> 决策日期：2026-08-11。
> 风险等级：R3（输入丢失、历史膨胀、IME 半成品提交、长脚本阻塞）。

## 1. 需求对齐与范围

S0.8 只处理 S0.7 已批准的输入可靠性边界：

- 快速连续输入不能为每个字符建立一次 Undo 历史；
- 中文、日文、韩文等 IME composition 未结束前不能污染 ScriptSourceSession 或 Preview；
- 键盘用户必须能明确提交或回退本地输入批次；
- 大文本 Parser、Projection 和稳定 ID Patch 必须具有可重复的性能基线；
- textarea 只是当前 UI 载体，事务契约必须能被未来 CodeMirror/LSP 适配器复用。

本切片没有新增 Label、Set、条件、调用、多行、Ruby、富文本或 Choice/Option 结构语法。

## 2. 两层输入状态机

```text
用户输入
  → Local Input Buffer（可见，但未进入剧情历史）
  → 350ms idle / blur / Ctrl|Cmd+S
  → Script command transaction
  → committed CST → projection → Writer / Flow / Preview
```

状态规则：

- `committed`：输入框与权威投影一致，Preview 标记 `LIVE`；
- `buffered`：输入框显示本地批次，Preview 标记 `BUFFER` 并继续显示最后有效投影；
- `composing`：IME composition 进行中，取消 idle timer，不提交任何中间文本；
- `draft error`：脚本事务已接收为错误草稿，Preview 标记 `LOCKED`；
- `rejected writer buffer`：底层 Patch 拒绝多行/保留语法等输入，本地文本继续保留，具体错误优先于通用 BUFFER 提示。

## 3. 提交与回退边界

- 350ms 无新输入：把当前完整缓冲提交为一个事务；
- Blur：立即 flush 当前缓冲，防止通过点击模式或场景切换丢失输入；
- `Ctrl+S` / `Cmd+S`：编辑器聚焦时立即提交一个批次，并取消等待中的 idle timer；
- 第一次 `Esc`：仅回退尚未提交的本地缓冲；
- 缓冲已清洁且当前存在错误脚本草稿时再次 `Esc`：显式丢弃错误草稿，恢复最后有效源文本；
- 缓冲存在时禁用 Source Undo/Redo，避免本地输入与权威历史互相覆盖；
- 父状态确认提交值之前，组件不会把本地缓冲错误标记为已提交。

## 4. 正式 Script Editor 替换边界

`TransactionalTextarea` 暴露的最小适配契约：

- 输入：`value`、`commitDelayMs`；
- 输出：`onCommit(value, reason)`，其中 reason 为 `idle | blur | shortcut`；
- 状态：`onDirtyChange(dirty)`；
- 回退：`onEscapeWhenClean()`；
- 必须支持 composition start/end、定时器取消、外部值确认和卸载清理。

未来 CodeMirror/LSP 可以替换 DOM 编辑控件，但不得绕开这组事务边界，也不得直接写入 `StoryProject` 或 Preview。

## 5. 自动化验收

- `TransactionalTextarea`：快速输入合并、IME 隔离、Blur、Ctrl/Cmd+S、Esc、父状态确认；
- App 集成：BUFFER 阶段 Preview 不变、三次快速输入只产生 `r1`、IME 最终文本一次提交、Ctrl+S、两级 Esc、Writer Patch 拒绝错误可见；
- 全仓库常规测试：9 个测试文件、73/73 通过；
- 独立性能门：1 个测试文件、1/1 通过；
- TypeScript strict、三个 workspace 构建、12 个可移植源文件架构审计通过；
- 官方 npm Registry Audit：0 vulnerabilities；`git diff --check` 通过。

## 6. 10k 句大文本基线

固定生成样本：

- 10,000 行对白；
- 10,001 个语义 Statement（含 End）；
- UTF-8 源文本 826,763 bytes；
- 修改目标为最后一句对白，避免只测文件头部的乐观路径。

本轮完整门禁代表性结果：

| 阶段 | 实测 | S0.8 宽松失败预算 |
|---|---:|---:|
| Parse | 257.29 ms | 4,000 ms |
| Projection | 8.83 ms | 4,000 ms |
| 最后一句 Stable-ID Patch | 444.92 ms | 8,000 ms |
| 总计 | 711.04 ms | 12,000 ms |

失败预算用于发现数量级退化，不是产品性能目标。每次 `npm run check` 都会独立执行该门；实测会随机器负载变化，不能只比较单次小数值。

S0.8 Editor 生产包：JavaScript 241.02 kB（gzip 74.51 kB），CSS 22.89 kB（gzip 5.49 kB）。相对 S0.7，gzip 增量约为 JavaScript 0.76 kB、CSS 0.08 kB，未新增第三方运行时依赖。

## 7. 真实浏览器证据

桌面：

- 输入 Writer 后立即显示 `BUFFER` 和“输入批次 · 未提交”；
- BUFFER 阶段 Preview 保持原对白、Undo 禁用；
- 350ms 后 Preview 更新、状态回到 `LIVE`、revision 变为 `r1`；
- 连续输入“批”→“批次”→“批次合并”只生成 `r1`，一次 Undo 恢复整批；
- Script 中 Ctrl+S 立即提交；Esc 先回退本地缓冲，再丢弃已建立的错误草稿。

手机 393 × 852：

- Writer 缓冲高亮、BUFFER 状态、Preview 和三模式底部导航均可见；
- `documentElement.scrollWidth` 未超过视口宽度；
- idle 后 Preview 正确显示最终手机端输入；
- Browser Console：0 warning、0 error。

## 8. 审计中发现与修正

- 初版性能脚本直接导入 `dist/index.js`，暴露当前 TypeScript ESM 产物保留无扩展名 import、无法由 Node 直接执行；没有增加实验性 Node 参数，而是建立独立 Node 环境的 Vitest/Vite 性能配置。
- 输入组件确认测试最初在假计时器推进后立即检查 effect；补齐 React `act` 边界，避免测试误报。
- S0.7 UI 测试默认假设 `onChange` 立即提交；S0.8 改为先验证 BUFFER 和旧 Preview，再通过 Blur 明确 flush。
- Writer Patch 被拒绝时，通用 BUFFER 卡片最初遮住具体错误；改为 `error` notice 优先显示，同时保留输入缓冲和旧 Preview。

## 9. 明确未证明项

- 自动化 composition event 证明状态机逻辑，但不等于 Android Gboard、三星键盘、Windows 微软拼音和日文 IME 真机矩阵；
- 10k 句门只覆盖语言管线，不覆盖在 DOM 中同时渲染 10k 个 Writer 卡片，也不代表 100k 行目标已经通过；
- 350ms 是原型默认值，尚未经过至少 5 名目标用户的打字节奏验证；
- textarea 仍无语法高亮、行号、补全、增量 Worker、虚拟滚动和 LSP；
- 浏览器/进程在 Blur 或 idle 之前异常终止时，本地缓冲仍可能丢失；尚无 WAL 或磁盘持久化；
- `Ctrl+S` 当前只提交聚焦编辑器的内存事务，不代表工程文件已经安全写盘；
- 原生 textarea 自身 Undo 与 Source Undo 仍是两层历史，正式编辑器必须定义清晰的焦点和历史所有权。

## 10. 下一门禁

S0.8 远端闭环后，建议下一切片进入 **S0.9 Local Save / WAL Prototype**：先证明工程清单、场景脚本、原子替换、恢复日志和错误草稿的磁盘边界，再考虑语法高亮或扩张更多剧情语法。商业级工具首先不能丢稿。
