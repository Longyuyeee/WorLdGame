# N40-E6d Launcher / Route 缓存接入审计

> 日期：2026-08-23
> 分支：`codex/n40-e1-route-graph-core`
> 范围：Studio Launcher 工程打开/创建/导入/保存生命周期、Route 正式 Compiler 结果复用、缓存状态可观察与失效重建
> 结论：实现与本地完整门通过；production browser 三次被管理员安全校验阻断，远端 CI 待推送，因此 E6d 仍为实施候选，不能关闭 Engineering

## 1. 审计发现与顺序纠偏

E6c 之后的真实代码仍存在两条分离路径：Launcher 用 `openProject()` 读取工程，而 `buildRouteGraph()` 在 Route 内再次调用同步 `compileProject()`。若只在 Launcher 调用缓存入口而不改变 Route 消费关系，会形成“缓存编译成功、Route 又独立编译”的假接入。

E6d 因此冻结以下边界：

1. Launcher 的创建、目录打开、Recent 重开、示例、N23 工程和归档导入统一建立 Compiler lifecycle；
2. Route 只能消费同一次正式 `CompileProjectResult`，不得解析 `.world-cache` artifact；
3. 只有 Compiler 结果的项目语义 Hash 与当前 Canonical Project 一致时才允许复用；
4. 未保存内存改动必须临时全量编译并明确显示，不能继续标为 cache hit；
5. Canonical 保存先由 Workspace 清空派生缓存，再重新编译并写回；首次打开/保存后为 miss，再次打开为 hit；
6. future-schema 只读工程不得交给当前 Compiler，也不得写派生缓存；
7. 当前校验仍读取全部 Canonical JSON，且 Launcher 打开阶段存在 lifecycle probe 与 workspace compile 两次源读取，不得写成冷启动 lazy loading 或性能出口完成。

## 2. 实现

- 新增 Editor `editor-project-compilation` 生命周期层，统一 `open / compile / save+compile`，并校验 host version 与语义 Hash；
- Studio Launcher 的全部可编辑工程入口保存 workspace 与 Compiler state；Project Structure 保存和内容编辑器保存后均实际重建缓存；
- `@world-studio/route-graph` 新增 `buildRouteGraphFromCompilation()`，保留 `buildRouteGraph()` 作为无宿主缓存时的内存编译兼容入口；
- App 仅在项目 Hash 对齐时把 Launcher Compiler 结果交给 Route；内存改动自动降级到当前 Canonical Project 的临时全量编译；
- Route 显示命中、未命中、损坏/版本/inventory/正文变化后的重建原因，以及实际 compiled/reused scene 数；
- future-schema 只读工程保持 Compiler `null`，不枚举 inventory、不读写派生缓存。

## 3. 测试驱动与实际结果

### 3.1 红灯

首次运行 3 个测试文件失败：

- Editor lifecycle 模块无法解析；
- `buildRouteGraphFromCompilation` 不存在；
- Route 页面找不到“Route Compiler 缓存状态”；
- 其余 `44` 项通过。

### 3.2 差异修正

首轮实现后行为测试只剩 1 项失败：测试把一次全量编译结果人工标成 `hit`，界面正确显示 `3 编译 / 0 复用`，与夹具错误的 `0 编译` 预期冲突。夹具改为使用 previous cache 产生真实增量命中后通过。严格 TypeScript 门又发现 future-schema 测试直接修改只读 `ProjectFiles`；改为不可变拷贝后关闭。

### 3.3 定向与产品链自动化

- lifecycle + Route + App + Project Entity Manager：`4 files / 51 tests`；
- 实际 lifecycle 序列：首次 `miss` 且编译 1 scene → 重开 `hit` 且编译 0 scene → Canonical 保存后 `miss` 且重新编译 → 再重开 `hit`；
- Route 复用外部正式 Compiler 结果，并显示 `缓存命中 · 0 编译 / 3 复用`；Project Service 内存修改后立即变为 `存在未保存改动 · 内存临时全量编译`；
- future-schema 工程保持只读，inventory read 为 `0`、derived cache 为 `null`；
- TypeScript project references 全绿；Editor production build 成功。

## 4. 本机完整门

`npm run check` 退出码 `0`：

- 常规 `104 files / 654 tests`；storage `1/1`；重型 VM `5/5`；
- Runtime `10,000 seeds / 20,000 replays / 40 shards`，digest `20e9a842…92ef2`；
- 14 workspace build；架构审计 `91 portable / 4 adapter`；
- Editor production build：CSS `83.50 kB`（gzip `15.81 kB`），JS `766.40 kB`（gzip `217.11 kB`），既有 `>500 kB` warning 保留；
- Route 10k：10,000 节点 / 9,999 边 / 0 诊断；Compiler `1706.56 ms`、索引 `7.30 ms`、三次查询 `3.74 ms`、最大 64 节点 / 128 局部边；
- Script、Asset、治理、需求、风险、Golden 与架构门全部通过。

## 5. Production browser

本地 Vite `http://127.0.0.1:5175/` 已真实启动，但浏览器在页面加载前连续三次返回管理员安全策略无法验证，未获得 DOM、截图或交互权限。未绕过安全控制，也未用 jsdom/构建成功替代 production browser。

因此以下验收保持 pending：

1. 打开示例进入 Flow，观察首次 miss；
2. 返回首页后从 Recent 再次进入，观察 hit 与 `0 compiled`；
3. 修改并保存后观察 miss/rebuild，再次重开观察 hit；
4. 控制台 `0 error` 与可见布局复核。

## 6. 未完成与下一顺序

1. 推送实现并取得 Windows / Node 22 full check；
2. 安全校验恢复后同时补做 E5 与 E6d production browser，不得提前关闭两个节点；
3. E6d 关闭后，先审计真正冷启动局部正文读取协议与 10k 局部编辑/500 ms P95，不能把当前 Compiler scene reuse 等同于存储 lazy loading；
4. 运行路线高亮和 N40 Product Acceptance 仍未完成；N41+、M1 Stable 与发布继续阻断。

## 7. 远端证据

实现提交、Draft PR #59 与 Windows / Node 22 full check 将在推送后回填；远端绿色前只登记本地候选通过。
