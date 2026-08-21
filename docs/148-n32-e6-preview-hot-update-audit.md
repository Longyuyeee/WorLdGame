# N32-E6 Preview 热更新与显式重启审计

> 日期：2026-08-21
> 分支：`codex/n32-e6-preview-hot-update`
> 直接基线：N32-E5 最终证据头 `29eb089197e900cf93c751a226a5347709e718ba`
> 授权：`RA-N21-004`，最大节点 N32
> 远端交付：Draft PR 待创建；Windows / Node 22 完整门待裁决
> 当前判定：本地 Engineering Candidate 完成；不得提前宣称 E6 通过、N32 Product Acceptance、N40、M1 或发布通过

## 1. 冻结目标与安全边界

E6 关闭 E5 留下的热更新缺口，但不允许直接修改 Runtime State 或只替换 `buildId`。候选 Project 必须重新经过 N30 Compiler；只有 Scene/Instruction 稳定 ID、opcode、控制流目标、非展示 operands 与 Source Map 全部不变，且变化仅限对白/旁白正文、Choice prompt/label 时，才允许迁移。

迁移不是对象拷贝：系统把旧 History 中已记录的 Choice、Effect completion/cancel 和 Barrier approval 输入按原顺序重放到新 IR，再返回原 History cursor；只有变量、栈、场景、PRNG、逻辑时间、终止状态、pending 语义、History/Barrier 记录等语义快照一致时才替换 Session。旧 Host operation receipt 保留，active channel 按新 checkpoint 重建。

以下情况一律保留旧 Session 并要求明确重启：Direction/变量/控制流/等待等语义变化；Scene/Instruction/Source Map 结构变化；编译失败；待决 Effect/Barrier；Run to Cursor 或 Scheduler transient。系统不静默迁移、不自动重启，也不把 E6 冒充共享 Player Host。

## 2. 实现与产品反馈

- `formal-preview-hot-update.ts` 负责候选编译、兼容性比较、记录输入重放和语义快照裁决；返回 `unchanged`、`applied` 或 `restart-required`；
- `formal-preview-effect-host.ts` 提供 Host receipt rebasing：操作审计不丢失，活跃通道与新 checkpoint 对齐；
- Preview 在 Canonical Project 原子提交后自动尝试安全迁移；成功卡片显示 `STATE PRESERVED` 与旧/新 build 前缀；
- 必须重启时显示 `OLD SESSION PRESERVED`、逐条原因和“以当前启动目标重启/退出试玩并保留编辑”两个明确操作；
- 重启沿用 Entry/Scene/Statement 原启动目标，重新建立 Fresh State，不继承旧 History。

## 3. 自动化、构建与真实测试

定向测试为 4 files / 25 tests：安全正文/Choice label 迁移；rewound recorded future 保留且 Forward 可用；Direction 语义、Compiler invalid、transient、pending Effect 均拒绝迁移；产品组件验证安全提交后 History 位置不变、结构提交保留旧会话、明确重启后 Fresh Run。

普通全仓回归为 100 files / 611 tests，真实 IndexedDB storage conformance 1/1；Runtime 正式 corpus 为 10,000 seeds / 20,000 replays / 40 chunks、31.757 秒、0 failed，digest `20e9a842cd1e70b012d2307b37209f63192f4e463df7e15cf5beed8c5fc92ef2`。12 workspace production build、Architecture 85 portable / 4 adapters、Script performance 均通过。Editor build 为 CSS 79.65 kB / gzip 15.18 kB，JS 734.30 kB / gzip 208.23 kB，>500 kB warning 继续作为拆包债，未提高阈值。

真实 production browser 使用 `127.0.0.1:4173`，从项目首页打开真实示例工程，经项目结构进入内容编辑器并启动正式 Runtime：

1. 三次 Continue 到 Choice，基线为 `History 4/4`、`h4/4`；
2. 在产品 Script 编辑器原子提交对白、prompt 和两个 option label，新文案立即可见，卡片显示 `安全热更新已应用 / STATE PRESERVED`，实际仍为 `h4/4`；
3. 再给 `stmt_gate_bg` 增加 `descriptorId=changed.background`，卡片显示 `需要明确重启试玩 / OLD SESSION PRESERVED / 语句语义已变化：stmt_gate_bg`，实际仍为 `h4/4`；
4. 点击“以当前启动目标重启”，卡片清除，实际为 `History 1/1`、`h1/1`，新 Direction 参数进入 Fresh Session；
5. 视觉检查确认热更新卡片位于 Effect Host 与 Runtime Inspector 之间，现代多彩层级清晰，默认 16:9 舞台与可调尺寸未被破坏。

## 4. 预期—首次实际差异与修正

| 检查 | 预期 | 首次实际 | 修正/判定 |
|---|---|---|---|
| 安全文案兼容 | prompt/label 是展示数据，可迁移 | 语义快照包含 Choice prompt，误判 restart | 从语义快照排除展示 prompt；保留 option ID/target，定向与 production 通过 |
| transient 边界 | 可见 Run-to-cursor 中间态必须重启 | 初版只检查 scheduler accumulated，paused/null cursor 中间态被迁移 | 与正式 Preview transient 定义对齐：cursor>0 的 paused/null 也拒绝 |
| 结构更新 | 旧 Session/History 完整保留 | production 实际 `h4/4` 且明确列出 `stmt_gate_bg` | 与预期一致，无修正 |
| 明确重启 | 只有用户操作才 Fresh Run | production 点击后 `h1/1`，无静默重启 | 与预期一致，无修正 |
| 本机 Spike 性能 | 既有 10,000-seed ≤90 秒 | Node 25 约 180.5 秒超时；语义 corpus 与 digest 正确 | 历史已知非支持环境差异；不改 10k/20k、digest 或 90 秒门，远端 Node 22 裁决 |
| 本机 Dicing 性能 | grouping/atlas/total <3s/3s/5s | 两次为 3.35+3.21=6.56 秒、2.36+4.13=6.49 秒；重建正确、净节省 85.83% | 保留红灯，不放宽预算；远端 Node 22 裁决 |

## 5. 需求对齐与出口条件

E6 对齐 N32 Implementation 5、REQ-RUNTIME、REQ-QA 与 AC-05：创作者可继续在试玩位置修改纯展示文案；任何可能改变剧情、变量、Effect 或执行位置的变化都 fail closed。它保持 Naninovel/Utage 级专业执行边界所需的可解释性，也保持现代化、多彩且信息清晰的产品反馈。

E6 不完成共享 Preview/Player Host、断点/Watch、复杂 GPU/音频策略、三端 Player、真人产品验收或发布。当前本机完整 `npm run check` 因两项冻结性能门为红，不能写成全绿；只有 Draft PR 的 Windows / Node 22 完整门绿色后，才可补写远端证据并关闭 E6 Engineering。随后进入 N32 Engineering 出口复审，而不是 N40。
