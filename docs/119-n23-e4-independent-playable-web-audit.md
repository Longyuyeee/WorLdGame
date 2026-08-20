# N23-E4 独立单文件试玩 Web 审计

> 审计日期：2026-08-15  
> 实现前基线：`c1cc285b0e17bbcaea3066dd2d37710b551deb69`  
> 分支：`agent/n22-stage-media`  
> 结论：N23-E4 工程门通过；N21/N23 产品验收、正式 Compiler/Runtime/Player 与发布门仍未通过

## 1. 目标与边界

本切片关闭“只能在编辑器内部试玩，无法产生独立可执行项目”的缺口。创作者可在即时预览区构建并下载一个自包含 HTML；该文件包含当前 `StoryProject` 的编译快照、SHA-256、离线 UI 和受限运行器，不需要编辑器、账户、服务器或网络即可运行。

这不是 N30/N31/N50/N80 的替代实现：当前编译器仍位于 Editor 边界，运行器只覆盖 N23 已冻结的 P0 可玩语义，不含正式 IR 文件集、资源打包、Save/Load/Back、共享 Host Adapter、PWA、签名和发布清单。因此节点仍保持 N23，`RA-N21-002` 的全部阻断门保持生效。

## 2. 代码审计

| 链路 | 实现 | 失败边界 |
| --- | --- | --- |
| 当前工程 → 编译快照 | 校验稳定 ID、入口、角色/场景引用、局部标签、表达式语法和至少一个结局 | 任一阻断诊断都会拒绝产物 |
| 表达式 | 使用 Story Language 安全语法预编译为 AST；导出运行器不使用 `eval`/`Function` | 非法 token、类型错误、除零和未知变量安全中止 |
| 控制流 | `set/condition/label/jump/call/return`、选择、跨场景、可见节点和结局 | 1000 控制步预算阻断循环 |
| 独立 UI | 单文件 UTF-8 HTML，响应式舞台、对白、选择、继续、重开和状态提示 | 项目 JSON 转义 `<`、`>`、`&` 与行分隔符，阻断脚本逃逸 |
| 确定性 | 相同语义顺序输入产生逐字相同 HTML 和项目 SHA-256 | 一键演示会在输出不同时时失败 |
| Editor 入口 | “构建试玩 HTML”生成 Blob 下载，显示文件名与 KiB，组件卸载时回收 URL | 未提交草稿或输入缓冲存在时禁用 |

## 3. 可复跑闭环

```powershell
npm.cmd exec vitest run apps/editor/src/playable-web-export.test.ts apps/editor/src/playable-preview-app.test.tsx -- --maxWorkers=1
npm.cmd run demo:empty-to-web
```

`demo:empty-to-web` 不再复制编辑器静态壳。它从空临时目录开始，读取 Branching Golden，临时打包真实 Builder，生成 `index.html`，重复构建核对确定性，并在锁定的 jsdom 浏览器环境中分别选择左右路线到结局，最后核对字节数和 SHA-256 后清理临时目录。

本轮输出：

- 项目编译摘要：`470ed977c72fd550668c4b1e1a6ac52b8d84937cc77a630e97f94fb746dd507b`；
- 单文件产物：9,588 bytes，SHA-256 `4e8c4bb19412b9bc87ff6cb07ca54b60f68ffeeace5af7f543476b19f9fc1e0c`；
- `branch_left_option` → `Left`；
- `branch_right_option` → `Right`；
- 单元/组件/可执行 HTML 指定集：2 files / 7 tests，全部通过。

结构化证据见 [`evidence/n23/independent-playable-web.json`](../evidence/n23/independent-playable-web.json)。浏览器插件尝试刷新 `http://127.0.0.1:5174/` 时被本地 URL 安全策略拒绝，本轮没有伪造可视化浏览器记录；生成 HTML 的内联脚本已由 jsdom 真实执行，且一键演示对两条路线作了独立复验。

## 4. 需求对齐

- `REQ-RUNTIME`：从“仅编辑器验证运行时”前进到“编辑器内 + 独立离线 HTML 共用同一工程语义的工程候选”；正式 VM、Runtime State 和共享 Preview/Player 仍待 N30–N32/N50；
- `REQ-BUILD`：获得一个可下载、可离线运行的 N23 单文件试玩候选，但没有 Web/PWA 正式构建、Asset Manifest、版本/签名/日志或三端产物，状态由“未开始”调整为“隔离原型”；
- `AC-08`：工程 ZIP 的离线重开证据之外，新增独立试玩文件离线执行证据，但 Windows/Android 和正式发布链仍缺；
- `AC-14` 及 `AC-24`–`AC-27`：不登记通过，本切片不满足安装、签名、可复现三端构建或商店材料要求。

## 5. 下一顺序

1. 保持 N21 真人记录为 `pending-participant`，不得用自动化代替非程序用户证据；
2. 有参与者时执行 T01–T08，并让参与者实际下载/打开本产物；
3. 补足 N23 五分钟内容量和两名独立验收者，关闭 `RA-N21-002`；
4. 通过 N23 后才创建 `project-compiler`、正式 `runtime` 和共享 Preview 边界，按 N30 → N31 → N32 顺序推进；
5. 正式 Web Player 与发布构建仍按 N50/N80+ 执行，不把本单文件候选冒充正式发行包。
