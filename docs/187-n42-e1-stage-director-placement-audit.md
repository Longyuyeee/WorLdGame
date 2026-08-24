# N42-E1 Stage Director 语义定位审计

> 日期：2026-08-24
> 分支：`codex/n42-e1-stage-runtime-projection`
> 直接基线：N42 治理最终绿色头 `69e33ffe573bf571ff8f84b193c2686071c410c0`
> 授权：`RA-N21-007`，只覆盖 N42 Stage Engineering
> Draft PR / Windows CI：提交推送后补录
> 判定：工程候选；语义定位通过，真实媒体 production-browser 子门与本机 VM 性能裁决尚未关闭

## 1. 冻结切片与代码级差距

本轮没有把 N22 的基础 Track、Canvas Preview 或 Effect Host 重命名为完整 N42。代码审计发现：现有画布能显示、选中和报告坐标，但点击画布不会产生剧情命令；Stage 画面按源码索引投影，正式 Runtime 的演出 Effect payload 又保留 `x/y` 字符串。首个切片因此冻结为：

`选择 Show/Move → 点击 16:9 Stage → stable-ID patch → 权威 Script → 保存重开 → Compiler / 正式 Runtime Effect Host 数值 payload → Preview 同坐标`

它不包含多轨时间轴、关键帧、缓动、镜头系统、完整模板或 N42 Product Acceptance。

## 2. 实现边界

- 新增 `createStagePlacementPatch`：只接受角色 `show/move`，把设计像素映射为 0–100、0.1 精度的 X/Y；清除互斥的 `position` preset，保留 statement stable ID；
- Preview 增加现代渐变 Director 状态条；点击画布空白区直接提交 `patch-direction`，正式 Runtime、草稿或非角色指令时失败关闭；
- 角色 hit proxy 阻止事件冒泡，首次点击只负责选择，不产生意外位移；
- 正式 Runtime Host 只在演出 payload 边界把 `x/y/scale/rotation/anchor/z` 归一为有界数值；源码和 IR 仍保持确定、可读，未知插件标量继续保留；
- `x=101`、NaN、Hide、Background 等反例不得进入 Host 执行。

## 3. 真实预期—实际—差异—修正

| 检查 | 冻结预期 | 首次实际 | 修正 | 当前实际 |
|---|---|---|---|---|
| 画布定位 | 点击得到 stable-ID X/Y 语义补丁 | 旧画布只记录 pointer，剧情不变 | 新增 Director patch 与 UI 状态 | 75%/45%，`@id(stmt_gate_bg)` 保持 |
| Runtime Host 类型 | X/Y 为有界数值 | Effect payload 为字符串 `"75"/"45"` | Runtime presentation 边界类型化，范围不放宽 | Host payload `75/45`；`101` 返回 `RUNTIME_INVALID_IR` |
| 保存重开 | r2/s2 重载后同命令 | 初次 production 操作为 r2、autosave s2 | 无需修正 | 重载显示“本地项目已恢复”，命令与 stable ID 零差异 |
| 真实媒体 | 实际图片在 16:9 Stage 以 75/45 渲染 | E: 文件桥接得到 0 B / `NotFoundError`；临时路径重试又在 chooser 超时 | 停止重试；Index 维持 r0/0，安全占位未被冒充成功 | **未关闭**；下一修正切片建立可重复的 production-browser 媒体夹具 |
| 独立 typecheck | Editor workspace 有单独脚本 | workspace 没有 `typecheck` script | 使用真实 `build = tsc -b && vite build` | 类型检查与生产构建通过 |
| 本机重型 VM | 10k corpus ≤90 秒 | 91.698 秒；清理 Preview 服务后 96.664 秒 | 不减规模、不改 digest、不放宽超时；交由干净 Windows/Node 22 同门裁决 | **本机红，待 CI** |

## 4. 自动化、构建与生产浏览器

- 测试先行 RED：缺少 `stage-director` 模块；实现后又精确发现 Host payload 字符串差异；
- 定向：`4 files / 103 tests` 绿色；包含 Stage helper、App 交互、Canvas、正式 Runtime 55 项全回归；
- 全仓常规：`117 files / 737 tests`；真实 IndexedDB storage `1/1`；N41 出口复验 `10 files / 85 tests`；均绿色；
- Runtime corpus：10k seeds / 20k replays / 40 chunks，21.764 秒，digest `20e9a842…fc92ef2` 未变化；
- 全部 workspace 构建、93 portable / 4 adapter 架构门、Script/Route/Asset 性能门绿色；Route P95 190.22 ms，Dicing 3343.86 ms、净节省 85.83%；
- Editor production：CSS 89.24 kB / gzip 16.74 kB，JS 846.91 kB / gzip 237.46 kB；`>500 kB` 拆包债保留；
- production browser：默认 `1920×1080` / 16:9；Stage 实际 rect `334×187.875`；点击实际值 X 75% / Y 45%；Script r2、autosave s2、重载恢复；console error/warning `[]`；真实资源仍按安全占位失败关闭。

## 5. 需求对齐与出口判定

| 门 | 结果 |
|---|---|
| Goal：画布操作生成 canonical stable-ID Stage 命令 | 1/1 |
| Implementation：有界映射、语义 patch、Runtime Host 数值化、交互防误触 | 4/4 |
| Acceptance：自动化、保存重开、production 交互/console、真实媒体、Windows CI | 3/5（媒体与 CI 待关闭） |

方向与最初需求一致：现代、图形化、多彩且清晰；同时坚持 Naninovel/Utage 级的权威数据、确定性 Runtime、失败关闭和可审计保存链。没有账户、收费、N43 七模式、正式 Player 或发布范围漂移。E1 在真实媒体和 Windows CI 都通过前保持候选，下一步不得宣布完整 N42。

## 6. 下一修正

E1b 建立可重复的 production-browser 媒体夹具，通过产品现有的 IndexedDB Asset Repository 与真实签名检查准备测试资源，而不是依赖人工文件选择桥接；随后复验角色实际画面、75/45 DOM/Canvas 几何、正式 Runtime Host、Back/Forward 和 console。Windows CI 同时裁决本机 VM 超时；任一失败则继续修正，不进入关键帧切片。
