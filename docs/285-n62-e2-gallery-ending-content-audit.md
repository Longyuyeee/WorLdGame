# N62-E2 Gallery / Ending 内容体验审计

> 审计日期：2026-09-22
> 分支：`codex/n60-e1-debugger-session`
> 起点：`10668b22ec241ad581544647ffdcffaad17813c8`
> 状态：本地 Engineering 候选已通过；等待 exact-head GitHub Actions 后关闭 E2

## 1. 原始需求与本切片边界

N62 的原始目标不是再维护一份附加内容清单，而是让 Compiler 自动生成的 Catalog 与 Runtime 单调 Meta 直接成为玩家所见内容的权威。E1 已完成入口和四类摘要；E2 只关闭玩家当前最直接需要的 Gallery 与 Ending 内容体验：

1. Gallery/Ending 条目必须来自现有 Compiler Catalog，解锁判断必须来自 Runtime Meta；Shell 不得建立私有清单或私有解锁状态。
2. 未解锁条目不得泄露名称；空 Catalog、未解锁与已解锁但资源不可用必须是三种可区分状态。
3. 玩家可以查看已收录图片和已达成结局；退出详情或全屏预览后，剧情位置与历史位置不得改变。
4. 桌面和 390×844 都要可阅读、可键盘/触控操作、无横向溢出，并且失败时提供可理解的恢复反馈。

Replay 隔离会话、Music 正式解锁 Meta、作者覆盖配置、玩家自动 Route 和三端一致性不属于 E2，不借本切片提前登记完成。

## 2. 实际代码审计与实现

### 2.1 单一数据来源

`PlayerAdditionalContentSnapshotV1` 新增 `galleryItems` 与 `endingItems`。Core 直接遍历当前 build 的 `catalogs.gallery` / `catalogs.endings`，并用 Runtime `galleryIds` / `endingIds` 判定解锁；Ending 名称复用现有 `translatedPlayerText`。未解锁条目的 `displayName` / `name` 明确投影为 `null`，所以剧透信息不会先进入 Shell DOM。

### 2.2 玩家可见路径

- 总览中的 Gallery 与 Ending 进入真实列表；Gallery 展示已收录图片并支持全屏预览，Ending 展示已达成名称与状态。
- 未解锁 Gallery 显示“未发现的画面”，未解锁 Ending 显示“未发现的结局”，均不显示真实名称。
- 已解锁但缺少可用图片时显示“资源暂不可用；收藏记录仍然保留”，Host 提供恢复能力时显示“重试资源”。这不会回滚玩家已获得的收藏。
- Gallery 空 Catalog 与 Ending 空 Catalog 使用各自明确空状态，不把空内容误写成锁定内容。

### 2.3 用户视角纠偏

真实 Chrome 路径首次跑通内容后，证据显示从总览进入 Gallery/Ending 时焦点落回页面主体。视觉上虽可用，但键盘用户失去当前位置。现已补齐分层焦点合同：

- 进入 Gallery/Ending 后聚焦“返回总览”；
- 返回总览后聚焦原来的 Gallery/Ending 入口；
- 打开预览后聚焦“关闭预览”，Escape 只关闭预览并回到原缩略图；
- 第二次 Escape 才从详情回总览，第三次才返回剧情。

这项纠偏只影响展示与焦点，不写 Runtime、History、Save 或 Meta。

## 3. 本地验证与视觉复核

| 检查 | 本地结果 |
|---|---|
| N62 定向产品测试 | `2 files / 5 tests`，PASS |
| 根级完整门 | 普通 `168 files / 1000 tests`；Editor 集成、存储、VM、17 workspace build、架构与性能全部 PASS |
| TypeScript | PASS |
| Player production build | JS `426.62 kB / gzip 124.71 kB`；CSS `32.03 kB / gzip 6.49 kB` |
| 真实浏览器 | Chrome 120 cold production，PASS |
| 锁定防剧透 | title 状态 Gallery `2` 个锁定条目、`0` 个图片，DOM 不含真实名称 |
| Gallery | `Deterministic Actor`、`Deterministic Sunset` 列表和全屏预览通过 |
| Ending | 达成后显示 `Curtain / 已达成` |
| 焦点 | 详情入口、返回总览、预览关闭、Escape 分层与焦点返回均通过 |
| 状态完整性 | presenting 与 ended 两种会话的 Runtime State Hash / History Cursor 打开关闭前后均一致 |
| 桌面/移动 | 1440×900 与 390×844；最小交互 44px，移动入口/返回 48px，横向 overflow `0` |
| 浏览器诊断 | console error/warning 与未捕获异常均为 `0` |

视觉复核确认：桌面 Gallery 双列、Ending 单列、全屏预览遮罩和移动 Gallery 单列均没有截断、重叠或不可见操作；移动首屏明确保留当前层级和返回路径。

完整门保留原预算：VM 10k 约 `32.37s < 90s`，Route 编辑 P95 `74.68ms < 500ms`，Asset dicing/atlas 总计 `2082.36ms < 5000ms`。Editor 仍只有既有主 chunk 大于 500 kB 的提示；该提示不是 E2 引入，拆包仍归 Optimization 范围。

机器证据：`evidence/n62/additional-content-e2-browser.json`。截图 SHA-256：

- Gallery desktop：`d6dd17654ba2efba87fee970d283b54c74881db643ff2218741054c5a2f1f798`
- Preview desktop：`44ad2d77911525a64878c268c477e7b4307aaa24d8c1d7e2ed5322bfb2a11f56`
- Ending desktop：`c8f6fcd014a3fe9d00633e4832f668d8cb5fd2c155574551f03d9cd88ce6d851`
- Gallery mobile：`80b60181f37d025dfdb188b33ed95ded80d17bd6a51f94decedec6ab8fa65905`

资源缺失恢复由 Shell 集成测试使用真实已解锁 Meta、再移除对应 Host 媒体输入验证；没有绕过 Effect 安全边界或直接伪造解锁状态。真实浏览器覆盖锁定、已解锁、预览、Ending、双视口和会话身份，证据范围不夸大为浏览器资源注入测试。

## 4. 当前结论与接续顺序

E2 的本地功能、回归与真实页面证据已完成，但在本实现头获得 exact-head GitHub Actions 之前，状态保持“Engineering 候选”，不提前关闭。远端绿色后按以下顺序继续：

1. 把 exact-head run/job 写回本审计并关闭 N62-E2；
2. N62-E3 先审计现有 Music Catalog 与 Runtime Meta 的实际缺口，再实现正式、单调、可保存的 Music 解锁与播放器列表；
3. N62-E4 实现 Replay 隔离 Checkpoint，会话退出必须精确恢复原 Runtime/History/媒体状态；
4. 后续才处理作者覆盖配置与玩家自动 Route，并在 N62 总出口统一核对 AC-17/18/20。

N62 Product Acceptance、N70 Engineering、M1 Stable 与发布继续阻断。`xlsx` high 和 Vitest moderate 仍是独立维护债，不混入 E2 产品提交。
