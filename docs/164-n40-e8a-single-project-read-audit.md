# N40-E8a 工程打开重复正文扫描纠偏审计

> 日期：2026-08-23
> 实现提交：`b739b3e3f0e5730094942862aa4c2f31f09ab256`
> 范围：Studio Launcher → Project Lifecycle → Workspace Compiler 的打开读取编排
> 结论：当前 schema 工程由两次全量正文扫描降为一次；future schema 只读 manifest。真正 cache hit 的零/局部正文读取仍未完成。

## 1. 需求与偏移审计

E7 后下一目标是冷启动存储级正文局部读取。真实调用链审计发现，当前 `openCompiledLifecycleProject()` 先调用 `openProject()` 全量读取并构造 Canonical Project，随后 `compileLifecycleProject()` 又调用 `compileProjectWorkspace()`，再次执行 inventory、全量读取、逐源 SHA-256 和 Compiler cache 校验。缓存命中只减少编译，没有减少这两次正文扫描。

现有 Web/Node inventory 只有 path、size 和 modified stamp。它能快速发现常规变化，但不能抵抗同尺寸、同时间标记的正文替换；因此不能为了表面上的 lazy loading，直接以 inventory 相等跳过逐源 Hash。E8a 先关闭确定且安全的重复读取，不把它冒充完整局部读取。

## 2. 冻结边界

1. 支持 `readSelectedFiles` 的正式 Web/Node workspace 先只读取 `world.project.json`，用于 schema 探测；
2. 当前 schema 交给既有 `compileProjectWorkspace()`，只执行一次 inventory → 全量正文 → inventory 稳定检查 → 逐源 SHA-256 → cache 校验/编译 → 再次 inventory 检查；
3. Lifecycle Session 必须直接由该次正式 Compiler workspace 结果建立，project、base files、host version 与 semantic Hash 保持同一快照；
4. future schema 只从 manifest 建立只读 Session，不读取 scene/script/layout，不枚举 inventory，不调用当前 Compiler，也不写派生缓存；
5. 不支持选择性读取的兼容 workspace 保持旧 fail-safe 路径；
6. E8a 不允许用 size/modified stamp 独立证明 cache 正确，也不关闭冷启动局部正文读取。

## 3. 红灯与实现

红灯命令：

```text
npm exec vitest run apps/editor/src/editor-project-compilation.test.ts
```

真实结果为 `1 file / 3 tests`，其中 `1 passed / 2 failed`：当前工程没有选择性 manifest 探测，future schema 也没有走 manifest-only 路径。读取计数证明缺口位于 Launcher 编排，而非 Compiler cache 命中状态显示。

实现后：

- current schema：选择性 manifest 探测后调用一次 `compileProjectWorkspace()`，再从该结果建立 editable Lifecycle Session 和 Editor Compiler state；
- future schema：直接建立 read-only Lifecycle Session，`project=null`、Compiler state 为 `null`；
- 既有保存、重开、cache miss/hit/source-mismatch、语义 Hash 对齐及不支持选择读取的兼容路径保持不变。

## 4. 实际测试

定向测试：

- `apps/editor/src/editor-project-compilation.test.ts` 与 `apps/editor/src/browser-project-workspace.test.ts`：`2 files / 9 tests` 全部通过；
- Memory workspace：current open 为 `selected manifest 1 次 + full read 1 次`；future open 为 `selected manifest 1 次 + full read 0 次 + inventory 0 次`；
- Browser File System Handle conformance：current 首开 miss 和重开 hit 的 `[manifest, script, layout]` 正文读取次数均为 `[2, 1, 1]`，即 manifest 探测一次、完整扫描一次；future schema 为 `[manifest, script] = [1, 0]`；
- `npx tsc -b apps/editor` 退出码 0。

完整 `npm run check` 退出码为 0：

- 普通并行测试：`104 files / 661 tests`；
- 存储一致性 `1/1`；VM 重载一致性 `5/5`；
- Runtime：`10,000 seeds / 20,000 replay executions`，0 failed seeds；
- 14 workspace build 完成；Editor CSS `84.48 kB`（gzip `15.97 kB`），JS `772.95 kB`（gzip `218.79 kB`），既有 `>500 kB` warning 保留；
- 架构：`91` portable files、`4` Node adapter files；
- Route 10k full projection `1737.25 ms`，index `8.68 ms`，three queries `3.51 ms`；
- Route 局部编辑 20 样本 P95 `59.05 ms < 500 ms`；
- Script、Route、Asset 性能门全部通过。

Vite 以 `npm run dev --workspace @world-studio/editor -- --host 127.0.0.1 --port 5178` 实际启动，ready `119 ms`。按 Browser 技能使用应用内浏览器访问时，管理员安全策略校验不可用，页面在加载前被拒绝；故没有 DOM、控制台或产品交互证据，production browser 保持未验证。

GitHub Windows / Node 22 完整门 run `32589909573` / job `97071987355` 用时 `3m51s`，locked install、完整产品基线与 post steps 全部通过。

## 5. 结论与下一协议

E8a 关闭“Launcher 重复全量正文扫描”工程偏移，并让 future schema 真正做到 manifest-only fail closed。它不关闭 N40 的存储级局部正文读取，因为 current schema 即使 cache hit 仍完整读取全部 Canonical JSON 以校验逐源 Hash。

下一协议只有在以下至少一种可落地保证成立后才能跳过未选正文：

1. 宿主提供原子、一致且对任意正文变化必然改变的可信 source snapshot identity；或
2. 工程迁移为内容寻址、不可变对象加原子根指针的目录协议，并由宿主强制对象不可原位替换。

单独的 path/size/modified stamp、派生 cache envelope Hash 或进程内“上次保存成功”均不满足该要求。协议不成立时必须继续完整读取并记录 N40 Product Acceptance 阻塞，不能牺牲 Compiler 单一事实来源。
