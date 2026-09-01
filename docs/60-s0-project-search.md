# S0.41 全工程搜索与跨场景跳转审计

## 阶段目标与非目标

S0.41 把 S0.40 的当前场景定位扩展为 Canonical Project 全工程搜索。创作者可从场景栏按场景标题/ID、Statement ID、关联稳定 ID 或内容文本查找，结果按场景分组；命中后一次完成场景切换、步骤选择、Preview 位置、64 步窗口显露和真实剧情卡片焦点。

本阶段不搜索资源、变量、标签或代码引用，不执行字符串替换和语义重构，不引入账户、云端、SQLite、Worker 或第三方搜索库，也不修改 project schema。全局查询、索引、结果位置和焦点请求均为可重建的会话状态，不进入快照、WAL 或 Undo。

## 索引生命周期与草稿隔离

- `createProjectSearchIndex` 仅读取 `session.project` 的已提交投影，按项目场景顺序和场内步骤顺序构建平坦内存索引。
- 任何成功 Script/Writer 修改、Undo/Redo 或恢复产生新 Project 对象后，React `useMemo` 整体失效重建；不依赖可遗漏的手写增量事件表。
- 无效 Script 草稿留在 `sourceDrafts`，不会进入 `session.project`；全局入口统计存在草稿的场景数并说明搜索仍使用最后一次有效投影。
- 索引没有持久化身份或版本号，刷新后可从 Canonical Project 完整重建；schema 继续为 v2。

## 冻结匹配与分组规则

- 查询统一执行 Unicode NFKC、去首尾空白和小写规范化；空查询不产生隐式结果。
- 场景 ID/标题精确与前缀优先；一个场景查询只生成一个“打开场景”结果，不按该场景步骤数膨胀。
- 内容继续按 Statement ID 精确/前缀、关联 ID 精确/前缀、Statement/关联 ID 包含、文本前缀/包含排序；场景包含匹配最后处理。
- 同一等级按项目场景顺序、场内步骤顺序稳定排列。UI 在场景边界显示分组标题，不维护第二份结果排序。
- 完整计算结果总数，DOM 最多挂载前 100 项；高频词不会重新制造与工程规模线性增长的结果 DOM。

## 原子跨场景跳转

`select-project-result` 是只读导航动作：先验证场景、Source Session 和 Statement ID，再在单次 reducer 返回中同步写入 `activeSceneId`、`selectedStatementId` 与 `previewIndex`。非法或已失效结果返回原 session，不产生半切换状态。

App 将界面模式切到 Writer，并暂存稳定 Statement ID 焦点请求。Writer 挂载目标场景后用现有 `revealStageIndex` 显露正确的 64 步页，再把焦点移到 `statement-card-{id}`。这一流程不创建脚本 revision，也不清空或提交任何场景草稿。

## 响应式与可访问性

全局入口位于场景栏并明确标记“全局搜索”，与 Writer 内的“定位步骤”保持不同名称。结果使用 `listbox/option`、`aria-selected` 和 polite live status；Arrow Up/Down 循环并立即定位，Escape 清空，触屏提供上一个/打开/下一个等价按钮。结果按场景标题分组并使用 sticky 标题保持上下文。

手机布局把输入和三个操作保持在场景横向列表之前，按钮最小高度 44 px，结果区限制为 260 px；最终尺寸和横向溢出由真实 Chromium 证据确认。

## 性能与架构决策

性能基准使用 1,000 个场景、每场景 100 步，共 100,000 个已提交步骤：完整索引预算 2,000 ms，连续执行文本、稳定 ID、场景标题三类查询预算 300 ms，DOM 结果上限 100。

最终全量门实测索引为 153.88 ms、三类查询为 65.55 ms，因此当前原型采用无依赖内存索引。该数字满足 PRD 的 100k 搜索响应门槛；但约 154 ms 重建仍可能跨越动画帧，进入 M1 前必须补充真实设备 P95、编辑高频重建和内存峰值证据，再决定 Worker 与增量索引。当前结果不能被误读为已经证明所有低端 Android 设备无阻塞。

## 验证证据

- 纯函数覆盖场景唯一 opener、全步骤索引、Statement/关联 ID、中文内容、稳定排序、完整总数和结果上限。
- reducer 回归确认跨场景目标在一次动作中同步选择、Preview 定位并保持 revision `r0`。
- UI 回归覆盖场景标题搜索、点击/提交跳转、真实卡片焦点、空结果和活动场景不变。
- `npm run check` 全量通过：49 个测试文件、323 项测试、生产构建、34 个可移植文件/3 个 Node adapter 架构边界及全部脚本/素材性能门。
- Chromium 验证“风中的天台”得到 `1 / 1`，跳转后焦点为 `statement-card-stmt_rooftop_bg`、窗口为 `1–3 / 3`、revision 为 `r0` 且 Preview 仍为 1920×1080；390×844 下无横向溢出，输入 42 px、按钮和结果均至少 44 px。

## 下一阶段入口

S0.42 应审计全局搜索的键盘命令面板与结果类型过滤，或优先进入路线图自动生成的局部渲染；不得在没有引用索引和重构事务设计时把本阶段扩张为批量替换。Worker/增量索引仅在真机 P95 或编辑重建门失败后进入实现。
