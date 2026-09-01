# N32-E2 Preview Session 状态观察审计

> 日期：2026-08-21
> 分支：`codex/n32-e2-preview-observability`
> 直接基线：N32-E1 最终证据头 `8169fbd`
> 授权：`RA-N21-004`，最大节点 N32
> 远端交付：Draft PR #53；实现头 `1eeaa6d`；Windows / Node 22 run `32459445287` / job `96703241983`，4 分 16 秒绿色
> 当前判定：N32-E2 Engineering 通过；N32 Product Acceptance、N40、M1 与发布继续阻断

## 1. 冻结目标与边界

E2 只把正式 Preview Session 的变量、调用栈、当前 Runtime IR/Statement、State revision、逻辑时间和结构化诊断呈现在 Editor。所有位置来自 Runtime State/Event、Compiler IR 与 Source Map，不从 Writer 文本反向猜测。

Run from Scene/Statement 属于 E3；Step Back/Forward/Over 属于 E4；Effect/Stage Host、热更新和共享 Player Host 属于 E5+。本步不以观察 UI 冒充调试控制或 N32 完成。

## 2. 实现与安全约束

- `observeFormalPreview()` 生成只读观察快照，变量按稳定字典序排列，不依赖系统 locale；
- 当前位置同时给出 scene、instruction index/id、opcode、statement id/index；调用栈逐帧映射回 Source Map；
- Compiler error/warning、Runtime diagnostic、Source Map/session failure 使用统一结构，保留 origin、severity、code、message 和可用位置；
- UI 在空闲态明确说明尚未建立 Session，在运行态显示 revision/逻辑时间；error 与 warning 使用不同颜色，动效遵守 `prefers-reduced-motion`；
- E1 正式 Compiler→Runtime 路径和双路线固定 State Hash 不变。

## 3. 预期—实际与修正

| 检查 | 预期 | 首次实际 | 修正/判定 |
|---|---|---|---|
| 定向类型与测试 | 观察契约、UI、E1 路线均通过 | 2 files / 5 tests 通过 | 补 Runtime 损坏 State 负例后 2 files / 6 tests 通过 |
| Runtime 失败 | 不是单一字符串，保留结构与来源 | 篡改游标得到 `RUNTIME_INVALID_STATE` | `origin=runtime`、位置字段和 severity 均保留 |
| 跨宿主顺序 | 变量顺序确定 | 初版使用 `localeCompare` | 改为 ASCII stable ID 字典序，避免系统 locale 差异 |
| 生产浏览器空闲 | 明确未启动 | r—、0 ms、四个观察区均可见 | 通过 |
| 生产浏览器运行 | 当前位置随 Runtime 推进 | r1：`direction / stmt_gate_bg #0`；r4：`choice / stmt_gate_choice #3` | 通过 |
| 真实变量 | 经产品 UI 创建后显示 Runtime 初值 | 新增 Number 变量，检查器实际显示 `NUMBER / 2` | 通过 |
| 视觉与无障碍 | 现代、多彩、动效清晰且可降级 | 352×253、14px 圆角、双色渐变、进入/运行脉冲；region 可访问 | 通过 |
| 浏览器稳定 | console error 为 0 | 两轮均为 `[]` | 通过 |
| 生产构建 | 成功并报告体积 | JS 692.05 kB / gzip 198.42 kB，仍有 >500 kB warning | 构建通过；较 E1 增加约 9.7/2.1 kB，拆包债不在本步扩大 |

普通回归为 98 files / 592 tests 全通过。串行 autosave 在当前高负载主机仍复现 E1 已登记差异：预期 5 秒内出现“已恢复 · s3”，实际约 23.10 秒仍处于“保存中…”。本次文件不涉及 persistence/autosave，不放宽 5 秒等待或 30 秒测试时限；由干净 Windows / Node 22 完整门裁决。Architecture、requirements、risk 与 `git diff --check` 通过。

## 4. 出口条件

Draft PR #53 的实现头已通过 Windows / Node 22 `npm run check`：Runtime corpus 30.541 秒，普通回归 98 files / 592 tests，autosave 1/1（3.086 秒），VM 5/5，Asset 4/4，构建、typecheck、architecture、requirements 与 risk 全部绿色。远端实测关闭了本机 autosave 负载差异，E2 Engineering 出口满足。

下一步只能进入 N32-E3 的 Run from Scene/Statement 与合法状态构造；本结论不提升 N32 Product Acceptance，也不解除 N40、M1 Stable 与发布阻断。
