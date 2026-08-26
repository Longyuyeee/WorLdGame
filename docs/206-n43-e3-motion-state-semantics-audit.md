# N43-E3 Motion/State 语义审计

> 日期：2026-08-26
> 分支：`codex/n43-e3-motion-state`
> 直接基线：N43-E2 `650a2d3`，Draft PR #77 Windows / Node 22 run `32924595480` / job `98044825491` 绿色
> 授权：`RA-N21-008`，仅覆盖 N43 Engineering
> 判定：E3 Engineering 完成；N43 总体、Product Acceptance、N50+、M1 Stable 与发布仍阻断

## 1. 冻结目标和预算

本切片不新增工作模式或面板，只关闭 UI Motion/State 的共同语义：

- 完整、简化、静止三级本地偏好；简化保留任务反馈但停止装饰循环，静止把全部 animation/transition 压到 `0.01ms`；
- 系统 `prefers-reduced-motion: reduce` 永远把有效级别覆盖为静止，但不擦除用户原偏好；
- 选择、键盘焦点和诊断同时具有 ARIA/文字/符号，不以颜色作为唯一表达；
- CSS 切换天然可中断，不等待旧动效结束；
- 显式本地 `?motionAudit=1` 才启用 1.2 秒真实页面 rAF 采样，正常产品路径无持续采样开销；最低 60 样本、P95 `≤16.7ms`、`>33.34ms` 帧占比 `≤2%`。

## 2. 实现

- `motion-preference.ts`：三级描述、fail-soft 本地保存和系统减少动效优先级。
- `MotionPreferenceControl.tsx`：紧凑分段控制，选中项同时输出 `aria-checked`、可见 `✓` 和文字摘要。
- `styles/motion.css`：独立于继续膨胀的 `app.css`；完整/简化/静止 token、装饰循环策略、全局静止覆盖和 390px 布局。
- `motion-frame-audit.ts`：仅显式审计查询启用的真实 rAF 采样和冻结预算判定。
- `App.tsx`：只接线偏好、系统媒体查询和审计数据属性，没有增加产品面板或 Story transaction。

## 3. 预期—实际—差异—修正

| 检查 | 预期 | 首次实际 | 修正后实际 | 判定 |
|---|---|---|---|---|
| 本地偏好测试 | Web Storage 可读写 | 当前 Vitest/Node 提供非标准 `localStorage` 占位对象，缺少 `getItem/setItem` | 组件测试注入标准内存 Storage；真实页面继续使用浏览器原生 Storage | PASS |
| 完整动效 | 保留空间/状态动效 | mode token `340ms`，`live-pulse` 存在 | 无差异 | PASS |
| 简化动效 | 保留任务反馈、停止装饰循环 | mode token `200ms`，live animation `none` | 无差异 | PASS |
| 静止动效 | 切换不等待旧动画 | Script 切换后所有实际动画/过渡 `0.01ms`，live animation `none` | 无差异 | PASS |
| 非颜色单一 | 选择/焦点/诊断不用只看颜色 | `aria-checked=true` + `✓静止`；键盘焦点 `2px solid`；诊断 `✓三视图已连接` | 无差异 | PASS |
| 帧采样 | 真实页面 P95 `≤16.7ms`、严重帧 `≤2%` | 检查沙箱不暴露 Performance/rAF/WAAPI | 将 rAF 采样放入显式产品审计路径，浏览器只读 DOM 结果 | PASS |
| 完整帧时间 | Flow 切换通过预算 | 160 样本，P95 `12.30ms`，`>33.34ms` 1 帧，max `48.40ms` | 无差异 | PASS |
| 简化帧时间 | Sequence 切换通过预算 | 161 样本，P95 `12.20ms`，严重帧 2，max `60.80ms` | 无差异 | PASS |
| 静止帧时间 | Script 切换通过预算 | 179 样本，P95 `6.20ms`，严重帧 2，max `54.50ms` | 无差异 | PASS |
| 390px | 新控制不制造横溢出，Preview 16:9 | 请求 390×844，浏览器 client `375/375`、overflow 0；按钮 34px；Preview `337×189.5625`、精确 16:9 | 无差异 | PASS |
| 浏览器错误 | warn/error 0 | `[]` | 无差异 | PASS |

版本化数值证据：`evidence/n43/motion-state-browser.json`。内嵌浏览器不能模拟 OS 媒体特性；系统覆盖由自动化契约验证，真实页面验证等价的有效静止级别。因此 AC-12 仍保留 Product/设备验收边界，不伪报完整关闭。

## 4. 完整门和负载差异

- N43 定向：策略/偏好/帧预算/上下文 `5 files / 15 tests`，上下文 `1/1`，披露 `1/1`，Motion App `2/2`，完整 App `45/45`；合计 `9 files / 64 tests`。
- 全仓普通测试：`132 files / 770 tests`；Editor integration 为 `1 + 1 + 2 + 45`，storage `1/1`，均通过。
- 连续 `npm run check` 在最后冻结 VM 核心用例实际约 150.29 秒，超过未变的 90 秒门；未缩减 10k seeds、未改 digest、未放宽 timeout。关闭真实浏览器释放资源后，同一 `test:vm-conformance` 隔离 `5/5`，总测试体约 50.56 秒。故本机不伪报单链 exit 0，最终由远端干净 Windows / Node 22 裁决。
- 14 workspace build 通过；Editor CSS `110.79 kB / gzip 20.43 kB`，JS `916.36 kB / gzip 256.11 kB`，`>500 kB` 分包债继续保留。
- 架构 `93 portable / 4 adapters`；Script `13/13`、Route `9/9`、Asset `4/4` 性能门通过。Route 局部编辑 P95 `114.03ms <500ms`；Dicing 总计 `2373.96ms <5000ms`、净节省 `85.83%`。

## 5. 需求对齐和边界

- `REQ-UX/AC-12`：三级动效、系统覆盖、可中断 CSS、非颜色状态和真实帧预算进入 Engineering；目标设备和真实 OS 设置矩阵仍未完成。
- `USP-06`：完整级保留表达力，简化/静止不删除功能或专业工具。
- 没有改 Canonical Project、stable-ID、Compiler/Runtime，也没有扩大 Production、Debug & QA、Mobile Focus。
- N21/N23 真人仍为 `0/1`、`0/2`，M1 仍为 `0/27` 完整通过。

## 6. 下一步

进入 N43-E4：冻结键盘/触屏任务等价、跨视图真实同步预算和 N43 Engineering 出口矩阵。E4 只补共同交互契约并按当前模块边界拆分，不向 `App.tsx` 继续堆新面板；出口后必须重新进行治理准入，不能直接越权进入 N50。
