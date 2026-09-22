# N62-E3 Music Meta 与音乐室审计

> 审计日期：2026-09-23
> 分支：`codex/n60-e1-debugger-session`
> 起点：`f9e6bbb606802d91124bfc76878f35f46e8d2b8e`
> 状态：N62-E3 Engineering 已关闭；下一切片为 N62-E4 Replay 隔离 Checkpoint

## 1. 原始需求与用户任务

N62 的原始要求是让 Compiler 自动生成的 Gallery、Replay、Music、Ending Catalog 与 Runtime 单调 Meta 成为正式 Player 的唯一来源，不让玩家或作者维护第二份附加内容清单。E3 只关闭以下玩家任务：

1. 玩家尚未在剧情中听过音乐时，可以看到存在未发现条目，但不能提前看到曲名；
2. Runtime 真正接受 `audio play` 后，对应曲目自动、单调地收录，并随 Back、Forward、State Save 和 Session Save 保留；
3. 玩家从附加内容进入音乐室即可试听，资源不可用时仍保留收录记录并获得明确反馈；
4. 桌面和 390×844 均可键盘/触控操作，进入/返回焦点明确，打开附加内容不改变剧情或历史身份。

Replay 隔离会话、作者标题/排序/封面/剧透/本地化覆盖、玩家自动 Route、Windows/Android 正式 Host 和三端 Product Acceptance 不属于 E3。

## 2. 实际代码审计与兼容性纠偏

Compiler 在 E3 前已经生成 `catalogs.music`，Runtime 也已有正式 audio `play` 执行路径；真实缺口是 audio 执行没有进入单调 Meta、Player Core 将 Music 解锁数硬编码为 `0`，Shell 因此没有可进入的音乐室。

最初方案曾考虑给严格 `MetaProgressV1` 新增 `unlockedMusicAssetIds`。实际验证发现这会使所有旧 Runtime State / Session Save 的严格 v1 读取失效，并造成与音乐无关项目的 State Golden Hash 全面变化，因此已撤销。最终采用兼容方案：

- Runtime 只在合法且被接受的 `audio play` 上，把 asset ID 写入既有 v1 单调“已解锁资源 ID”集合；stop/pause/resume 不重复解锁；
- Player Core 用 Compiler `catalogs.gallery` 和 `catalogs.music` 分别过滤同一资源 ID 集合，类型归属仍由 Catalog 决定，因此音乐不会出现在 Gallery；
- `MetaProgressV1`、严格验证器、Save schema 和既有无音频 State/Outcome Hash 均不变；未来若升级 Meta schema，可在版本迁移中把字段重命名为更通用的资产集合；
- Shell 只消费 Core 的 `musicItems`，没有第二份清单或私有解锁状态。

## 3. 玩家可见实现

- 总览把“音乐收录功能正在准备中”替换为真实“在剧情中听过的音乐会自动收录”，并开放音乐室入口；
- 锁定条目只显示“未发现的音乐”，曲名在 Core 投影阶段即为 `null`，不会进入 DOM；
- 已收录条目显示曲名和浏览器原生音频控件；音源缺失、MIME 不符或加载失败时显示“资源暂不可用，收录记录仍然保留”，有 Host 恢复能力时提供重试；
- 进入音乐室聚焦“返回总览”，返回后聚焦原音乐室入口；原有总览模态焦点与返回剧情焦点合同不变；
- 音频控件和返回操作最小高度至少 44px，移动端无横向溢出。

## 4. 验证结果

| 检查 | 结果 |
|---|---|
| E3 定向链 | Runtime + Player Core + Shell：`3 files / 69 tests`，PASS |
| N62 聚合 | `2 files / 5 tests`，PASS |
| 普通回归 | `168 files / 1000 tests`，PASS |
| Runtime corpus | 10,000 seeds / 20,000 replay，digest `01556a8c…3a9`，PASS |
| VM 冻结门 | `5/5`，`43.12s < 90s` |
| 构建与架构 | TypeScript、17 workspace build、100 portable / 4 adapter 文件审计均 PASS |
| 性能 | Route 编辑 P95 `78.05ms < 500ms`；Asset dicing/atlas `2666.13ms < 5000ms` |
| cold production | Chrome 120，1440×900 与 390×844，PASS |
| 锁定防剧透 | title 状态 Music `0/1`，1 个锁定条目、0 个 audio，DOM 不含 `Deterministic Theme` |
| 自动收录/试听 | Runtime 接受 audio play 后 Music `1/1`，出现 `试听 Deterministic Theme` 原生控件 |
| 焦点/布局 | 详情初始焦点为返回总览；最小交互 44px；移动 overflow `0` |
| 状态完整性 | presenting/ended 打开关闭前后的 Runtime State Hash / History Cursor 均一致 |
| 浏览器诊断 | console error/warning 与未捕获异常均为 `0` |

机器证据为 `evidence/n62/additional-content-e3-browser.json`。截图 SHA-256：

- Music desktop：`d4ee9026eeac4fa0f8719186a2a919de62a36e1a605aa7b392d81917dc6ece0e`
- Music mobile：`0d6623940ea1eb0f683c8dee1ce70a4c9cccee2bc1382bac29f6fe0529c4ff61`

视觉复核确认桌面和移动的曲名、序号、返回层级与原生控件均完整，没有裁切、重叠或不可见操作。Editor 仍只有既有主 chunk 大于 500 kB 的提示；该债不属于 E3。

## 5. 当前判定与接续点

实现头 `bfeb315b397f95b64620f8a1e942129719f01b7f` 已推送到 Draft PR #123；exact-head GitHub Actions run `35752617312` / Windows job `106830352298` 于 2026-09-23 成功，用时 `11m29s`。远端结果与本地完整门一致，N62-E3 Engineering 正式关闭。

下一步严格按原路线进入 N62-E4：

1. 先审计现有 Replay Catalog、Runtime History/Session Save 与 Player Host 的真实恢复边界；
2. 从原会话建立隔离 Replay Checkpoint，在回想内运行正式 Compiler/Runtime/Host；
3. 正常退出、异常退出和资源失败都必须精确恢复进入前的 Runtime、History、媒体和播放策略状态；
4. 不得把 History Back/Forward checkpoint、Shell 私有快照或第二 Runtime 冒充 Replay 隔离会话；
5. E4 完成后再处理作者覆盖配置与玩家自动 Route，最后统一复审 N62 Engineering。

N62 Product Acceptance、N70 Engineering、N21/N23 真人、M1 Stable 与发布继续阻断。
