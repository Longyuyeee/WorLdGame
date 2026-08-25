# N43-E1a 七工作模式骨架与真实布局审计

> 日期：2026-08-25
> 分支：`codex/n43-e1-workspace-modes`
> 直接基线：`codex/n43-governance-checkpoint`
> 授权：`RA-N21-008`，仅覆盖 N43 Engineering
> Draft PR：#75，base `codex/n43-governance-checkpoint`
> Windows CI：run `32831410443` / job `97750710122`，8 分 11 秒，绿色
> 状态：本地实现与真实浏览器验收通过；远端 Windows 完整门通过
> 判定：E1a 工作模式基础 Engineering 完成；治理 #201 所定义的广义 E1 仍缺保存重开上下文闭环，留给 E1b；N43 总体、Product Acceptance、N50+、M1 Stable 与发布仍阻断

## 1. 冻结目标与范围

本切片只建立七个稳定工作模式 ID 和首批真实布局，不为模式复制 Project、Story、Selection、Revision、Runtime 或保存数据：

| 模式 | E1 状态 | 默认编辑视图 | E1 布局含义 |
|---|---|---|---|
| Writer | 可用 | Sequence | 写作与结构化语句优先 |
| Director | 可用 | Sequence | 舞台与即时预览加宽 |
| Flow 模式 | 可用 | Flow | 路线图优先 |
| Production | 明确禁用 | Sequence | 后续资源和批量生产切片 |
| Debug & QA | 明确禁用 | Flow | 后续调试与质量检查切片 |
| Mobile Focus | 明确禁用 | Sequence | 后续手机专注创作切片 |
| Quick Start | 可用 | Sequence | 收起场景栏，聚焦当前场景 |

Sequence、Script、Flow 继续作为“编辑视图”，不再被误称为七种“工作模式”。工作模式只选择布局和默认视图，用户仍可在可用模式内切换编辑视图；所有修改继续写回同一 stable-ID Canonical Script。

## 2. 实现与测试证据

- 注册表：`apps/editor/src/workspace-modes.ts`；七个 ID 顺序、可用边界和默认视图有独立单元测试。
- 产品入口：`apps/editor/src/App.tsx`；`radiogroup/radio` 提供单选语义，未来模式以 disabled 明示，模式切换不提交事务。
- 布局：`apps/editor/src/styles/app.css`；Director 调整三栏权重，Quick Start 收起 Scene Rail，390px 工作模式条内部滚动且不推动整页横向溢出。
- Canonical 回归：`apps/editor/src/App.test.tsx`；选中同一对白后依次切换 Director、Flow、Quick Start，文本保持不变，Revision 始终为 `r0`。
- 专用命令：`npm run audit:n43-workspace-modes`；本地 `2 files / 47 tests` 通过。

首次完整 App 回归暴露工作模式使用普通 `button` 后，旧按钮可访问性查询被放大，4 个复杂用例超过原 5 秒阈值。没有放宽超时：工作模式改为更准确的 `radiogroup/radio` 语义后，同一完整回归恢复 `47/47`，约 48 秒。

完整仓库门随后暴露第二层调度差异：`test:parallel` 以 4 个 worker 同时运行 129 个文件时，`App.test.tsx` 两个重型图形交互用例分别约 5.7 秒和 7.0 秒，超过固定 5 秒；其余 800 项通过，同一 App 文件单 worker 为 `45/45`。没有提高超时、删除断言或缩减测试；将重型 App 集成文件与既有 autosave/VM 一样从通用并行池隔离为 `test:editor-integration --maxWorkers=1`，通用文件仍保持 4 worker。

同一资源竞争随后也在 N42 双 worker 汇总门复现（单个路径用例约 5.76 秒）。因此 N41/N42 的领域与组件文件继续并行，而 `App.test.tsx` 在各自同一审计命令内串行执行；这保持每个节点门可独立复现，也没有把一次 N43 绿灯借给旧节点。

串行复验仍发现旧路径用例为准备角色起点而执行一整轮无关的 Script 切换、全文解析和提交。最终把该前置状态改为类型化测试 fixture，路径创建、两条 Canonical Move、单批事务、Script 写回和 Undo 断言全部保留；同类 Keyframe/Bezier 用例也复用该 fixture。测试目标更单一，固定 5 秒门槛继续保留。

持续完整门在当前高负载主机上又使 N41 两个非 App 用例于双 worker 下超时，因此最终采用保守调度：N41/N42 重型审计单 worker，全仓通用池从 4 降为 2 worker，App/autosave/VM 继续各自串行。该调整只牺牲墙钟时间，不改变测试数量、5 秒单测阈值、10k corpus、digest 或任何产品/性能断言。

## 3. 真实预期—实际—差异—修正

测试环境为真实 Vite 开发服务器和 Codex in-app Chromium；桌面视口请求 1280×800（页面实际 `innerHeight=720`），移动视口请求 390×844（文档内容宽 375）。使用项目首页“打开示例工程”→“进入编辑器”→“进入内容编辑器”的真实产品路径，不以 jsdom 代替生产页面。

| 检查 | 预期 | 首次实际 | 修正后实际 | 判定 |
|---|---|---|---|---|
| 七模式边界 | 7 个稳定身份；E1 只开放 4 个 | Writer/Director/Flow/Quick Start 可用；其余 3 个 disabled | 无差异 | PASS |
| 同源切换 | 模式切换不改对白或 Revision | Director 后对白原文保持；`r0→r0`；Flow 出现 Route Map；Quick Start 仍 `r0` | 无差异 | PASS |
| Director 布局 | Preview 获得更大宽度 | 三列实际 `180 / 428.219 / 669.781 px` | 无差异 | PASS |
| 默认预览 | 16:9，真实画布不能只显示选项文字 | 下拉为 1920×1080，但 `.stage-viewport` 被 flex 压到 18px，截图只剩横带 | 为舞台容器禁止 flex 收缩；Canvas `606.781×340.438`，比值 `1.7824`，完整可见 | PASS（已纠偏） |
| 390px 横向边界 | 文档无横向溢出，长模式条内部滚动 | 文档 `375/375`；模式条 `349/664`、`overflow-x:auto` | 无差异 | PASS |
| 390px 固定操作 | 返回按钮不遮挡底部编辑视图 | 首次截图中两者重叠 | 返回按钮上移；矩形不相交，间隔 14px，整页横向溢出 0 | PASS（已纠偏） |
| 390px 预览 | 仍保持横屏比例 | Canvas `335×187.563`，比值 `1.7861` | 无差异 | PASS |
| 浏览器错误 | console error/warn 为 0 | 桌面与移动均 `[]` | 无差异 | PASS |

Canvas 比例与数学 16:9 的小幅差异来自设备像素取整和边框盒测量；源逻辑尺寸仍为 1920×1080，误差低于 1%。

## 4. 本地完整门与环境差异

最终本地 `npm run check` 已实际走完治理、Compiler/Runtime corpus、N41/N42/N43、typecheck、普通/存储/VM 测试、14 workspace 构建、架构和 Script 性能：通用池 `128 files / 757 tests`、App `45/45`、storage `1/1`、VM `5/5`，Editor production build 为 CSS `106.64 kB / gzip 19.79 kB`、JS `908.10 kB / gzip 253.62 kB`。既有 >500kB JS 拆包债未因本切片关闭。

完整门末端 Route 性能首次出现 `lazyRouteStructurePage 516.16ms`、`globalLazyEditIndex 568.80ms` 高于 500ms；保持预算不变后隔离复测分别为 `416.41ms`、`401.01ms`，Route 编辑同步 P95 `479.28ms <500ms`，判定为本机热负载差异。Asset Dicing 在同一高负载环境两次仍超过冻结的 3s/3s/5s（`5.12+3.52=8.64s`、`4.24+5.22=9.46s`），但 441 个重复块、85.83% 净节省及其余三项资源门均正确；不修改算法样本、断言或预算，必须由远端 Windows / Node 22 同门裁决。因此本地不能伪报单次完整门 exit 0。

远端干净 Windows / Node 22 在实现头 `1cee094` 上执行相同 `npm run check` 全绿，run `32831410443` / job `97750710122` 用时 8 分 11 秒；本机 Route/Asset 热负载差异由此关闭。串行化后的门虽比旧约 6 分钟基线更慢，但没有减少覆盖或放宽预算。

## 5. 需求对齐与未完成边界

- `USP-01` / `AC-03`：E1 证明新增工作模式没有创建第二份剧情事实，但尚未关闭完整四视图、Debugger 与保存重开总验收。
- `REQ-UX`：七模式身份和首批四模式布局进入集成；Beginner/Pro、统一上下文协议、减少动效和帧时间门仍缺。
- `AC-11`：由“未开始”进入“实现中”；当前只有 4/7 模式可用，而且本切片只证明切换保持同一语句，不宣称七模式均可修改。
- `AC-12`：本切片只复用现有 motion token；未完成 `prefers-reduced-motion`、可中断动效和 60 FPS 证据，状态不提升。
- N21/N23 真人仍分别为 `0/1`、`0/2`；开发者真实浏览器验收不能替代真人 Product Acceptance。

## 6. 下一步

N43-E1b 应冻结跨视图 Selection/Context 协议，把“当前场景、当前 stable-ID 语句、当前 Runtime 位置、当前 Inspector 对象”定义为可测试的单一上下文，并贯通 Writer/Director/Flow/Quick Start 的定位和保存重开。E1b 关闭后才进入 E2；Production、Debug & QA、Mobile Focus 在拥有真实任务前继续禁用，不新增空壳页面。
