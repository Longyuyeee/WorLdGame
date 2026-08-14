# S0.35 演出 Cue 安全删除与重排审计

## 阶段目标

S0.35 让 S0.34 的图形化演出轨道从“可查看、可插入”推进到“可安全重排、删除和恢复”。轨道仍不是第二套时间线：桌面拖拽、键盘和触屏按钮全部发送同一组稳定 ID 结构命令，结果落回权威 `.world` 脚本，再重新投影到 Writer、Preview 和资源窗口。

| 对齐要求 | 本阶段交付 | 验收边界 |
| --- | --- | --- |
| 图形化、方便编辑 | 选中 Cue 左移/右移/删除、桌面拖放 | 触控不依赖 HTML Drag，按钮提供等价能力 |
| 专业脚本与可审计性 | `script.move-directive` / `script.delete-directive` | React 不直接改语句数组或拼接脚本文本 |
| 前进、后退与恢复 | 删除后选择安全邻居；Undo/Redo 恢复源码和 tombstone | Preview index 始终与选择一致 |
| 运行稳定与速度 | 重排后从权威顺序重新编译资源窗口 | 不维护会漂移的轨道缓存 |
| 项目长期兼容 | Directive tombstone、project schema v2 | v0/v1 先完整归档，再通过 WAL 原子迁移 |

## 冻结的结构命令

`script.delete-directive` 只接受 `background`、`show`、`audio` Directive 的稳定 statement ID。删除生成不可复用身份记录：

```ts
type DirectiveTombstone = {
  kind: "directive";
  statementId: string;
  command: "background" | "show" | "audio";
  argumentsRaw: string;
  rawLine: string;
  formerLine: number;
};
```

`script.move-directive` 接受目标 statement ID 和 `afterId` 锚点。移动保留原始行字节与换行拓扑；choice 与其 options 是不可拆分组，option ID 不能直接成为锚点；以 end 为锚点时自动定位到 end 之前。目标行或跨越位置存在相邻注释时拒绝执行，直到注释归属规则正式冻结。

两条命令都包含 command ID 和 base revision：同 ID 同载荷重放返回 duplicate，不同载荷复用或陈旧 revision 失败关闭。成功命令进入同一 source history，Undo/Redo 同时恢复源码、语义投影和 tombstone 集合。

## 交互与可访问性

- 轨道顶部提供左移、右移、删除按钮；在窄屏和触屏上仍可完整操作。
- Direction Cue 可在桌面拖放到目标 Cue 后；拖放只是命令入口，不直接改变 DOM 顺序。
- 聚焦 Direction Cue 后可用 `Alt+ArrowLeft`、`Alt+ArrowRight` 和 `Delete`，并通过 `aria-keyshortcuts` 暴露。
- 右移不会越过 end；左移到首位以 scene ID 为稳定锚点。
- 删除后选择下一步骤，末尾删除则选择上一步；Preview index 随重新投影后的真实索引更新。
- 草稿含错误时所有结构操作保持锁定，避免覆盖未提交 Script 输入。

## project schema v2 与迁移审计

schema v1 的 tombstone 只能表达对白。把 Directive 删除记录悄悄写入 v1 会让旧读取器误解数据，因此主项目格式提升到 v2；资源索引、Atlas、备份清单等独立 schema 不受影响。

启动流程先只读探测版本：

1. v2 直接打开；未来版本保持只读且不改文件。
2. v0/v1 收集原 manifest 与全部 scene 原文，写入 `migrations/pre-v2-s{revision}.archive.json` 并记录 SHA-256。
3. 解析时保留未知 JSON 字段，把内存快照升级为 v2。
4. 通过现有两阶段 WAL 写入 v2，storage revision 增加 1；任意故障边界重开后只能得到完整旧项目或完整 v2 项目。

持久化层按 tombstone `kind` 做判别式校验，Directive 仅接受冻结命令，statement ID 在所有 tombstone 类型间保持唯一。稳定 ID 分配器同时扫描现有语句和两类 tombstone，禁止删除身份被重新使用。

## 审计结论

1. 删除与重排只有一条权威数据路径，Writer、Script、Track、Preview 和自动保存不会产生双写漂移。
2. choice/end、相邻注释、错误草稿、陈旧 revision、自移动和错误目标均采用拒绝式失败。
3. Directive tombstone 可持久化、可撤销、可重做，且旧项目升级前保留逐字节归档。
4. 拖拽不是触屏唯一入口；按钮和键盘覆盖相同命令与边界。
5. 本阶段不做跨场景移动、批量 Cue 编辑、账户、云能力或发布打包，不扩大 M1 已冻结范围。

## 验证证据

- `npm run check` 全部通过：TypeScript 全工程检查、45 个测试文件 / 294 项测试、生产构建、34 个可移植文件 / 3 个 Node adapter 架构边界，以及脚本和资源性能门。
- 10,000 行脚本 parse/project/末句 Patch 全链路 163.25 ms；10,000 场景资源预测 20.94 ms、清单编译 82.93 ms、10,000 步累计预览 2.22 ms，均低于冻结预算。
- 约 16 MiB 媒体检查/哈希和 2,000 项索引往返合计 551.15 ms；8 张 512×512 RGBA 的分组与 Atlas 无损重建 2,384.48 ms；2,000 资源压力调度 14.28 ms。
- 真实 Chromium 验证：按钮重排后轨道与 Script 顺序一致，删除生成 Directive tombstone，Undo 恢复 Cue 并清除 tombstone，Preview selection/index 同步，恢复后 storage revision 完整；控制台 error 为 0。
- 默认 Preview 数据为 `landscape-16-9` / 1920×1080，实际画布 334×187.875，比例精确为 1.777777…；390×844 手机 viewport 下轨道横向滚动，左移/右移/删除均为 44×44 px 触控目标。
- HTML Drag 的 DataTransfer 同步放行路径有专门 UI 回归测试；真实浏览器审计曾捕获依赖异步 React state 的 drop 竞态，修复后不再以异步重渲染作为允许 drop 的前提。

## 下一阶段入口

S0.36 建议优先补齐演出 Cue 的复制/多选与批量参数修改设计，但必须先冻结批量事务的部分失败语义、ID 分配、Undo 粒度和移动端选择模型；在审计完成前不直接实现。
