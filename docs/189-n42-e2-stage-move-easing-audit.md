# N42-E2 Stage Move 缓动闭环审计

> 日期：2026-08-24
> 分支：`codex/n42-e2-stage-move-easing`
> 直接基线：N42-E1b 最终绿色头 `f79dd8b0618bd1233e90e016a4dc1eaf1ed08e6f`
> 授权：`RA-N21-007`，只覆盖 N42 Stage Engineering
> 实现头：`237ea6b23909fa4bbdea84b840af50340f89b127`
> Draft PR：[#68](https://github.com/Longyuyeee/WorLdGame/pull/68)（Draft，保持 open）
> 判定：N42-E2 Move easing Engineering 闭环完成；完整多轨/关键帧/镜头/模板、N42 Product Acceptance、N43+、M1 Stable 与发布继续阻断

## 1. 冻结目标与非目标

本切片只关闭角色 `@show action=move` 的缓动纵向链：冻结 canonical vocabulary，图形化编辑并写回稳定 ID Script，保存重开后由真实 Preview Canvas、DOM 交互代理和正式 Runtime/Effect Host 消费同一参数。

冻结值为 `linear | ease-in | ease-out | ease-in-out`；旧工程未写 `easing` 时保持线性兼容。Canvas 按 CSS 标准 cubic-bezier 控制点求解，DOM 代理使用同名 CSS timing function。未知值必须在结构写入、资源编译和 Preview 独立执行三处失败关闭。

本轮不宣称完整时间线，不实现多轨、关键帧编辑器、运动路径、镜头、模板、正式 Player 或 N43 七模式，也不把自动化冒充真人 Product Acceptance。

## 2. 产品实现

- Story Language 增加 `STAGE_EASINGS`/`StageEasing`，只允许 Move 使用 `easing`；Show/Hide 携带该参数会按动作参数不兼容拒绝；
- 结构化插入与 Resource Manifest Compiler 同时校验枚举值，未知 easing 不落盘、不编译；
- Sequence Inspector 提供“移动缓动”选择器，批量面板支持类型化 easing，新建 Move 默认 `ease-in-out`；切回 Show/Hide 会清除不兼容参数；
- Preview Stage plan 保留 easing；Canvas 用确定性 cubic-bezier 反解把时间进度映射为几何进度；Canvas hit proxy 与 DOM fallback 暴露同一 timing function 和 `data-stage-easing`；
- 真实 N42 PNG/WAV 夹具新增稳定 ID `media_move`，从 50/100/scale 1 移动到 25/80/scale 0.9，800ms、`ease-in-out`；正式 Runtime payload 保留 easing。

## 3. 预期—实际—修正

| 检查 | 预期 | 首次实际 | 修正 | 最终实际 |
|---|---|---|---|---|
| 测试先行 | 新能力先红后绿 | 42 个相关测试中 6 个目标失败 | 完成语言、Preview、Canvas/DOM 实现 | 42/42；扩展产品集成后 79/79 |
| 类型检查 | `easing` 保持冻结联合类型 | Preview 对象展开被推断为普通 `string` | 在已完成 fail-closed 检查的 Move 分支收窄为 `StageEasing` | `tsc -b` 通过 |
| 生产预览启动 | workspace 可直接 `npm run preview` | Editor package 没有 `preview` script | 对已构建 `dist` 使用 `npx vite preview` | `127.0.0.1:4173` 生产产物可测；不改产品代码掩盖测试命令差异 |
| 图形化写回 | `ease-in-out` 可改为 `ease-out` 并写回 Script | 初始真实工程正确显示 `ease-in-out` | UI 选择 `ease-out` 后应用 stable-ID patch | r1 Script 精确为 `easing=ease-out`，诊断 0 |
| 保存重开 | s1 后参数、几何与真实媒体不漂移 | 刷新返回项目首页，需按真实产品流程重进 | 从最近工程重开受管工程 | `已恢复 · s1`；easing `ease-out`，X=25、Y=80、800ms 均保持 |
| 正式 Runtime/Host | 当前 Move 由正式链执行 | 无产品错误 | 从当前语句运行 | `media_move #2`、History 1/1、Host 1 active / 1 operation、diagnostics 0 |
| 首次远端 CI | 产品代码与追踪文档同 PR | run `32705758409` 在 `audit:pr-traceability` 失败 | 本审计与 89/90/99 同步写入后重跑完整门 | 首次红灯保留为过程证据；最终绿色 run 在本文件后续证据提交补记 |

## 4. 自动化、构建与生产证据

- RED：4 files / 42 tests 中 6 个预期失败；实现后 42/42；App/真实媒体/Runtime 扩展矩阵 6 files / 79 tests 全绿；
- 全仓：普通 118 files / 743 tests、IndexedDB storage 1/1、VM conformance 5/5，总计 749/749；
- Runtime：55/55，10,000 seeds / 20,000 replays / 40 chunks，digest `20e9a842cd1e70b012d2307b37209f63192f4e463df7e15cf5beed8c5fc92ef2`；Sequence 回归 10 files / 85 tests；
- `npm run typecheck`、13 workspace production build 与架构审计（93 portable / 4 adapters）通过；Editor CSS 89.24 kB / gzip 16.74 kB，JS 858.50 kB / gzip 242.44 kB；既存 `>500 kB` 拆包债保留；
- production browser：真实 PNG/WAV、Index r3、默认 1920×1080 / 16:9；初始 `ease-in-out`，编辑为 `ease-out` 后 Script r1 / autosave s1；重开 DOM 为 X=25、Y=80、800ms、timing/easing `ease-out`；Formal Runtime `media_move #2`、Host 1 active、0 diagnostics；console warning/error `[]`。

## 5. 对齐与出口

本切片推进 `REQ-STAGE`、`AC-03` 与 `AC-13`，并保持现代图形化交互与专业工具所需的 canonical schema、稳定 ID、确定性、失败关闭、保存恢复和正式 Runtime 边界。它关闭的是一个缓动语义纵向切片，不是“时间线完成”。

剩余 N42 工程主缺口仍为多轨、关键帧、路径、镜头、模板和 Editor↔正式 Player 视觉一致性。下一切片必须继续从冻结 N42 范围选择一个可独立实测的最小用户结果；N42 Product Acceptance、N43+、M1 Stable 与发布保持阻断。
