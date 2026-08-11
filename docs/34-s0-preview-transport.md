# S0.15 Preview 逐步运行、测试倍率与停止点审计

> 状态：实现、纯状态机、可控时钟、干净安装、真实浏览器、手机布局、推送与 Draft PR 远端回读均通过
> 日期：2026-08-11
> 范围：当前场景的 Editor Preview 运输控制；不冒充正式 Narrative VM、玩家快进或完整回滚已完成

## 1. 需求对齐

已确认的 M1 P0 要求包括按每句/Story Step 后退与前进、可调快进速度、制作预览倍率，以及选择、错误和边界停止。本切片把已经存在的左右单步按钮提升为可审计的 Preview Transport：

- 手动上一步/下一步按一个 Story Step 移动；
- 运行/暂停控制当前场景自动推进；
- 制作测试倍率为 0.5×、1×、2×、4×、无限速；
- 倍率压缩等待时间，但每个 Story Step 仍被依次执行；
- 选择、结局、场景末尾、错误草稿和未提交输入是停止点；
- 手动定位、切换场景或显式暂停会取消旧定时器；
- 当前倍率是 Preview 会话工具状态，不写入玩家设置、剧情、项目快照或 WAL。

本切片不跨场景自动运行，不处理选择结果，不模拟变量、资源、音视频或插件副作用。

## 2. 纯运输状态机

`preview-transport` 模块定义：

- `idle / playing` 两种运行模式；
- 五个稳定 speed ID 和倍率；
- `manual / manual-step / choice / ending / scene-end / blocked` 停止原因；
- play、pause、set-speed、reset 四类纯 action；
- Story Step 延时策略和 barrier 判定；
- 面向 UI 的明确中文状态标签。

状态 reducer 不依赖 DOM、计时器或存储。React 只负责在 `playing` 且没有 barrier 时安排一个可取消定时器；定时器到期后仍通过既有 `step-preview` Studio Action 前进。

## 3. 时间策略

| Step | 1× 基础等待 |
|---|---:|
| Dialogue | `900ms + Unicode 字符数 × 55ms`，限制在 1200–5000ms |
| Direction | 1800ms |
| Choice / End | 0ms，不调度，作为 barrier |

0.5×、2×、4×按倍率缩放，最低普通调度间隔为 120ms。无限速固定使用 60ms，而不是同步循环或 0ms 连续任务，避免饿死浏览器事件循环、输入和停止操作。

自动推进与玩家正式快进仍是两个概念。这里的倍率只服务制作测试；玩家 Skip Read、Skip All、Hold Skip、Toggle Skip 及其语音/视频策略尚未实现。

## 4. 停止与取消不变量

1. 当前 Step 是 Choice 或 End 时，不创建下一次定时器；
2. 当前 Step 已是场景最后一步时停止；
3. Script 存在错误 draft 或输入批次未提交时停止并禁用启动；
4. 手动上一步/下一步先写入 `manual-step`，再执行单步；
5. 暂停、倍率变化、Step 变化、场景变化和组件销毁都会清理旧定时器；
6. 切换倍率不会修改 StoryProject、source revision 或 storage revision；
7. 无限速也不能跨过选择停止点。

## 5. UI 与可访问性

右侧 Preview 在现有步骤计数下方增加运行控制条：

- “运行/暂停”按钮使用明确可访问名称；
- “预览测试倍率”原生选择器提供五档倍率；
- live output 显示“准备运行”“运行中 · 4×”“选择停止点”“手动定位”等状态；
- playing 使用青色动态状态，barrier 禁用运行按钮；
- 393px 下控制条变为两列，状态占据第二行，触控目标与文字不会挤出页面。

## 6. 自动化证据

纯单元测试覆盖：

- play/pause/reset 保留倍率；
- speed ID 唯一；
- 0.5× > 1× > 4× 的等待关系；
- Direction 4× 为 450ms，无限速为 60ms；
- blocked、choice、ending、scene-end barrier 优先级。

fake-timer UI 集成覆盖：

- 无限速仍按三次 60ms 调度依次经过 Direction 和两句 Dialogue；
- 到第 4/4 Choice 停止，显示“选择停止点”并禁用运行；
- 自动运行后手动下一步立即显示“手动定位”，再推进 10 秒也不会后台继续；
- 制造未闭合 Script draft 后显示“草稿未提交”并禁用运行。

## 7. 真实浏览器证据

- 原有用户标签持有 writer lease；新测试标签正确进入单写者冲突闸门，没有抢占编辑权；
- 随后在持有租约的当前编辑标签只操作会话级 Preview 状态；
- 选择无限速并运行，约 350ms 后到达 4/4 `stmt_gate_choice`，状态为“选择停止点”，运行按钮禁用；
- 手动回退到 3/4 后等待 180ms，仍停留在该 Dialogue，状态为“手动定位”；
- source revision 保持 r1，未制造剧情或存储修改；
- 393×852：控制条宽 354，document/body scrollWidth 378 < innerWidth 393；
- 测试后恢复第 1 步、1×、原 viewport 和页面顶部；测试标签与临时 viewport 清理；
- 为避免干扰 writer lease 曾启动 5174 隔离服务，但该地址被浏览器本地 URL 策略拒绝；服务随即停止，没有把不可达测试误报为成功。

## 8. 本地质量门

2026-08-11 结果：

- `npm ci`：按锁文件干净安装 128 个包；
- TypeScript strict：通过；
- 常规测试：20 个测试文件、127/127 通过；
- 五工作区构建：通过；Editor JS 285.50 kB / gzip 87.70 kB，CSS 30.92 kB / gzip 6.86 kB；
- 架构审计：20 个 portable 文件与 2 个 Node adapter 文件通过；
- 10k 句性能：parse 54.94 ms、projection 14.30 ms、末句 patch 129.73 ms、总计 198.97 ms，低于 12,000 ms 总预算；
- 官方 `registry.npmjs.org`：0 vulnerabilities；
- `git diff --check`：通过。

## 9. 明确未完成

- 当前单步只移动场景内索引，不是带变量、舞台状态和副作用检查点的 VM 回滚；
- 尚未实现选择结果、重新选择后截断前进历史和 barrier 插件；
- 尚未实现跨场景 Continue、Step Over、Run to Cursor；
- 尚未实现语音时长等待、转场/动画时钟、音频/视频快进策略；
- 尚未实现玩家四类快进、已读判断和持久化玩家设置；
- 尚未实现 Android 后台切换、计时器降频和真机输入审计。

这些边界继续阻断“正式玩家快进与回滚完成”的声明。

## 10. 远端证据

- 实现提交 `9426251c0aa308a7d2dbf52fa500a0c2245f33d8` 已推送到 `origin/agent/visual-production-bar`；
- 既有 Draft PR #1 保持 Draft，没有创建重复 PR；
- PR 标题更新为 `Add Preview transport speed controls and adjustable viewport profiles`；
- REST API 回读确认 PR head 与实现提交一致，正文保留 S0.1 累计索引并包含完整 S0.15 标题、`127/127` 与“全局 M1 阻断项”；
- 首次回读正文长度 3,160 字符；本次 PR 更新没有发生元数据覆盖或未确认网络失败。
