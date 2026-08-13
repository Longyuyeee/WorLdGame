# N12 项目首页与文件生命周期审计

> 日期：2026-08-13
> 节点：N12
> 对齐需求：`REQ-PRJ`、`USP-04`、`AC-08`；为 N13、N20、N90、N91 提供真实工程入口
> 状态：代码完成，等待 Draft PR Windows CI 终审

## 1. 目标与纠偏

N12 取消生产入口自动打开 `prj_twilight_broadcast` 的行为。编辑器启动后先进入项目首页，只有在用户新建、打开、导入或选择示例并验证工程后才进入编辑器。模板只提供最小 Chapter、Scene 与 `end` 语句，不限制后续结构。

本节点证明的是“真实工程能创建、保存、关闭、重开和离线搬运”，不是完整游戏引擎已经完成。章节/实体管理属于 N13，完整编辑视图接入 Project Service 属于 N20–N43，正式 Windows/Android 壳与发布构建属于 N90–N92/N80–N83。

## 2. 需求逐项对齐

| N12 要求 | 实现 | 自动证据 | 状态 |
|---|---|---|---|
| 新建/打开/最近/示例/导入/导出 | `ProjectHome` + `StudioLauncher` 六类入口 | `project-home.test.tsx` | 通过 |
| 不锁定模板结构和 ID | `createProjectTemplate(title, entropy)` 生成稳定但非固定 ID | `project-lifecycle.test.ts` | 通过 |
| Web 目录/OPFS | File System Access 与 OPFS `ProjectWorkspace` | `browser-project-workspace.test.ts` | 通过 |
| Windows 目录基础链 | `NodeDirectoryProjectWorkspace` 接收系统目录选择器返回的绝对路径 | `node-directory-project-workspace.test.ts` | 通过；正式壳仍属 N90 |
| 状态可见 | 首页显示位置、Schema、脏状态、恢复状态、访问模式和只读原因 | `project-home.test.tsx` | 通过 |
| ZIP 完整搬运 | 确定性 ZIP32；CRC、条目/体积预算、路径与压缩方法校验 | `project-archive.test.ts` | 通过 |
| 外部修改 | 保存基线文件，返回逐文件 `changedPaths`；干净工程重载，脏工程进入冲突选择 | 生命周期与冲突面板测试 | 通过 |
| 最近工程不复制内容 | localStorage 仅存 `RecentProject`；目录授权句柄单独存 IndexedDB | 生命周期测试 | 通过 |
| 未来 Schema | 探测后只读打开，显示升级原因，禁止当前 codec 写回 | 生命周期测试 | 通过 |

## 3. 工程生命周期与安全不变量

1. `ProjectWorkspace.readFiles()` 同时返回权威 JSON 文件集和宿主版本；写入必须带 `expectedVersion`，版本陈旧时拒绝覆盖。
2. Web 与 Node 目录只读取规范 JSON 路径，忽略缓存/宿主目录；保存时清除已经从 Canonical Project 删除的旧 JSON。
3. Node 目录不得是卷根，工程扫描拒绝符号链接；每个文件经现有原子文件存储器写入。
4. ZIP 导入拒绝绝对路径、盘符、反斜线、`.`/`..` 段、重复条目、损坏 CRC、截断、未知压缩和预算超限。
5. Future Schema 永远不经当前 `loadProject/saveProject` 写回。
6. 最近列表只保存显示元数据、引用和权限键；目录内容仍以用户目录/OPFS 为唯一权威。

N12 对 Workspace 边界做了一项受审计的显式变更：Node adapter 允许依赖无平台能力的 `project-domain` 接口和 `project-persistence` 原子文件接口；portable 包仍不反向依赖 Node，Web editor 的生产源码也仍禁止导入 Node adapter。

## 4. 可重复验收

针对性门：

```text
npm exec -- vitest run packages/project-domain/src/project-archive.test.ts packages/project-domain/src/project-lifecycle.test.ts packages/project-persistence-node/src/node-directory-project-workspace.test.ts apps/editor/src/browser-project-workspace.test.ts apps/editor/src/browser-project-registry.test.ts apps/editor/src/project-home.test.tsx apps/editor/src/project-conflict-panel.test.tsx --maxWorkers=2
npm exec -- tsc -b packages/project-domain packages/project-persistence-node apps/editor
```

针对性结果：7 个测试文件、16 个测试全部通过，类型检查通过。完整 `npm run check` 同样通过：常规 74 个测试文件/456 个测试、重型 VM 5 个测试、10 个 Workspace 构建以及 Workspace、需求、PR 追踪、Golden、架构和两类性能门全部成功。

用户任务 A：新建 → 写入多文件工程 → 关闭会话 → 从相同 Workspace 重开；项目 ID 不等于固定样例，语义 Hash 保持一致。

用户任务 B：导出完整 ZIP → 清空原 Workspace → 在另一 Workspace 离线导入 → 重开；语义 Hash 保持一致。

用户任务 C：外部更改 `world.project.json`；干净会话自动重载并报告路径，脏会话显示三个明确选择且不静默覆盖。

## 5. 当前诚实边界与后续节点

- 编辑器内部仍有 S0 `SourceSession`/IndexedDB 会话持久化；N12 已让生产入口接收所选 Canonical Project，但所有视图的保存命令完全收敛到 N11 Project Service 是 N20–N43 的集成任务。
- `ProjectConflictPanel` 已提供冲突决策界面和逐文件清单；内容级自动合并未承诺，当前策略是明确选择本地、外部或取消。
- Windows 原生目录适配器已可供壳调用，但系统选择器、安装包与设备证据属于 N90；Android SAF 属于 N92。
- 恢复状态字段与既有 WAL 能力可显示，但真实强杀恢复矩阵仍是 AC-09/N90/N91，N12 不把它标为通过。
- ZIP 当前仅写入无压缩条目以保持无依赖和确定性；它是可下载、可离线导入的交换格式，不是发布包。

N12 终审通过后按顺序进入 N13：章节、场景、角色和变量管理。
