# S0.1 代码原型与审计记录

> 状态：已实现并进入提交前审计。
> 决策日期：2026-08-11。
> 决策：产品负责人明确要求继续开发且不再使用 Figma。后续交互、视觉与动效证据使用可运行代码原型、自动化测试和真实浏览器检查；既有 Figma 内容只作为历史设计输入，不再是阶段阻塞项或交付工具。

## 1. Problem Brief

WorLd Studio 最重要的产品承诺不是“有很多编辑器页面”，而是 Writer、Flow、Sequence、Stage 与 Preview 修改同一份语义数据。首个代码切片必须先证明共享模型、语义命令、历史和跨视图投影可以同时成立，再接入 Parser、持久化、平台壳或大规模渲染。

本切片选择校园短篇《黄昏广播》的三个场景作为可执行样本，验证：

1. Writer 修改对白后，即时预览读取同一 revision；
2. Flow 由 Canonical Model 中的选择语句自动派生，不保存第二份剧情边；
3. Undo/Redo 使用语义命令的正向与逆向操作恢复精确文本；
4. Preview 可以按每个语义步骤前进和后退，并在场景边界停止；
5. 桌面与 393 × 852 手机视口使用同一 UI，手机采用触控友好的场景横滑和底部模式栏；
6. 完整动效与 `prefers-reduced-motion` 减少动效路径同时存在。

## 2. 临时技术决策

| 项目 | S0.1 决定 | 决定强度 |
|---|---|---|
| 语言 | TypeScript 7，`strict` 与额外不安全选项全部启用 | 采用，后续核心包继续沿用 |
| UI 候选 | React 19 + Vite 8 | 仅用于 React 候选证据；S0 性能对比前不宣布淘汰 Svelte |
| 测试 | Vitest + Testing Library + jsdom | 采用为 Web UI/核心快速门禁，不能替代真机 |
| 工作区 | npm workspaces；`apps/editor` 单向依赖 `packages/story-core` | 采用为初始包边界 |
| 设计系统 | CSS Custom Properties 直接实现 D1 Token | 采用代码为活动真相，不再回写 Figma |
| Windows/Android 壳 | 本切片不接入 Electron、Tauri 或 Capacitor | 推迟到各自 S0 Spike，避免无证据锁定 |

依赖版本全部固定在 `package-lock.json`。当前 npm 镜像缺少 Audit API，因此漏洞检查显式改用官方 npm Registry，结果为 `0 vulnerabilities`；不修改用户的全局 Registry 配置。

## 3. 代码边界

### `packages/story-core`

- Story Project、Character、Scene、Dialogue、Direction、Choice 与 Ending 值类型；
- 稳定 `sceneId`、`statementId`、`textId` 和 `commandId`；
- 纯函数场景/语句查找与 Route Graph 派生；
- `edit-dialogue` 语义命令、ChangeSet、幂等命令 ID；
- Undo、Redo、场景/语句选择与逐步前进/后退状态机；
- 禁止 React、DOM、Node 文件系统、Electron、Capacitor 与 Tauri 依赖。

### `apps/editor`

- Writer、Flow 与持续可见的 Live Preview；
- 场景列表、语义步骤列表、内联对白 Inspector；
- 顶部历史操作、revision 状态、自动路线图和诊断状态；
- 桌面三栏与手机单列/底部模式栏；
- 多彩语义色、连续过渡、Preview/Route 入场动效和减少动效媒体查询。

## 4. 本切片明确不包含

- `.world` Parser、Formatter、Compiler、Runtime VM 与正式 Save；
- 磁盘持久化、WAL、自动保存和崩溃恢复；
- Electron/Tauri/Capacitor 壳及 Windows/Android 安装包；
- Web/Windows/Android 玩家构建链；
- 10k Route、100k 行解析、真机键盘/内存和 2 小时 Soak；
- Dicing/Delta、图片转码和资源预算；
- Director、Production、Debug & QA、Mobile Focus 与 Quick Start 完整模式；
- D1 目标用户任务测试与 S0 技术选型最终批准。

以上缺项不能因为页面已经可运行而标记完成。

## 5. 自动验收

`npm run check` 必须一次性通过：

1. `tsc -b` 严格类型检查；
2. 核心与 UI 的 10 个单元/交互测试；
3. `story-core` 与 `editor` 生产构建；
4. 架构脚本证明核心包没有 UI、DOM、平台壳、文件系统或进程依赖；
5. Vite 输出体积记录到审计结果，不把开发服务器当发布产物。

浏览器验收必须验证：

- Writer 编辑后 Preview 文本和 revision 同步；
- Undo 恢复原文，Redo 恢复修改；
- 上一步/下一步移动到正确 Statement；
- Flow 显示 3 个节点、2 条连接，目标节点表达为结局；
- 393 × 852 视口 `document.body.scrollWidth <= window.innerWidth`；
- 手机模式栏固定在视口底部；
- 页面 Console 的 warning/error 数为 0。

## 6. 本轮缺陷与修复证据

| 发现 | 根因 | 修复 |
|---|---|---|
| jsdom 安装产生 Node Engine 警告 | jsdom 30 不支持当前 Node 25 | 固定为声明支持 Node 24+ 的 jsdom 27.4.0 |
| UI 测试互相污染 | 测试环境未显式注册 DOM cleanup | 在受 TypeScript 检查的 setup 中注册 `afterEach(cleanup)` |
| 手机宽度从 393 溢出到 562 | Grid/Flex 的 intrinsic width 撑开根容器 | 根、Header、Workspace 设置明确宽度与 `min-width: 0`，场景横滑限制到视口 |
| 手机模式栏错误停在顶部 | Header 的 `backdrop-filter` 建立 fixed containing block | 手机断点移除该滤镜，使模式栏相对视口固定 |
| 结局场景显示为普通场景 | Route 派生错误地排除了被选择指向的 Ending | 只要非入口场景含 `end` 就派生为 Ending，并加入测试断言 |

## 7. 当前风险与下一步

- React 的候选实现已证明小型切片可行，但没有 10k 节点、低端 Android 内存和 Svelte 对照数据；
- 当前历史按每次输入事件记录，正式 Writer 需要事务合并、IME Composition 和命令压缩；
- 当前数据只在内存中，刷新即恢复样本；下一切片必须先冻结 Schema/Command v0，再接 WAL/持久化；
- CSS 使用 `color-mix()` 和 `backdrop-filter`，平台壳选择前需要 WebView2/Android WebView 兼容与降级检查；
- 代码原型不能替代至少 5 名目标用户的任务验证，也不能替代目标设备测试。

建议下一切片为 **S0.2 Canonical Script Round-trip**：实现最小 `.world` Parser/Formatter、未知命令保留、稳定 ID 与 `parse(format(parse(x)))` 语义等价测试，为真实保存和多视图编辑建立数据入口。

## 8. 本地运行

```powershell
npm.cmd install
npm.cmd run dev
npm.cmd run check
```
