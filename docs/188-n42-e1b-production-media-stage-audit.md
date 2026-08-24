# N42-E1b 真实媒体 Stage 闭环审计

> 日期：2026-08-24
> 分支：`codex/n42-e1b-production-media-fixture`
> 直接基线：N42-E1 最终绿色头 `ea4eb3d00331760677f92215beda64ec3c05c276`
> 授权：`RA-N21-007`，只覆盖 N42 Stage Engineering
> 判定：本地工程门通过；等待本分支 Windows / Node 22 完整门后关闭 N42-E1 Engineering

## 1. 冻结目标与非目标

本切片只关闭 E1 遗留的真实媒体子门：产品提供一个无需人工文件选择的“Stage 媒体验收工程”，但仍必须把冻结 PNG/WAV 的真实字节送入现有媒体签名检查、SHA-256、writer lease、IndexedDB Asset Repository 和 Canonical Project 生命周期。验收链为：

`真实 PNG/WAV → Asset Index r3 → 16:9 Canvas → 点击 75/45 → stable-ID Script → s1 重开 → Compiler → Runtime / Effect Host → 0 diagnostics`

本轮不增加关键帧、多轨、镜头、N43 七模式、正式 Player、账户、收费或发布能力，也不把自动化冒充真人 Product Acceptance。

## 2. 产品实现与权威边界

- 首页新增“打开 Stage 媒体验收工程”，每次生成独立 project ID；真实 media golden 的 2 个 PNG 和 1 个 WAV 先核对冻结长度/Hash，再走产品媒体检查与仓库导入；
- `projectCanonicalWithAssetIndex` 把 Index 中同 ID 的真实 Blob 元数据投影到 Canonical 资源声明，同时保留已有 license、插件元数据和便携/外部资源声明；空 Index 不再被错误解释为隐式删除，删除仍必须走显式事务；
- Editor 的正式 Runtime 投影和导入后的生命周期保存都消费同一资源桥，结束 Preview Canvas 与 Compiler 各读一份资源事实的偏差；
- Stage 点击目标覆盖真实 Canvas 内容区，角色 Show/Move 仍通过稳定 ID 语义补丁写回；
- Runtime 保持“快照只含安全整数”的确定性约束：整数 `x/y/z` 保持数值，合法小数几何以规范十进制字符串进入 Effect payload，避免 `anchorX=0.5` 破坏 canonical hash。

## 3. 真实预期—首次实际—修正后实际

| 检查 | 冻结预期 | 首次实际 | 根因与修正 | 修正后实际 |
|---|---|---|---|---|
| 产品媒体准备 | 无 chooser，真实资源进入产品仓库 | 旧路径受本机文件桥接/chooser 阻断 | 新建产品可见夹具入口；仍走签名、Hash、lease 与 Repository | 3 assets / 3 unique blobs，Index r3；PNG/WAV URL 均由真实字节生成 |
| 真实 Canvas 点击 | 点击画布 75%/45% 后角色移动 | 点击真实 Canvas 后 Director 不变 | `.stage-content` 被误列为交互排除目标；改为仅排除 chrome/form controls，并让测试点击真实内容节点 | Director、DOM 与样式均为 75/45；`left:75%; top:45%` |
| 保存重开 | stable ID 与几何零漂移 | s1 重开后 Script 和 Canvas 均保持 | 无额外修正 | `media_show`、`x=75 y=45`、Index r3、Canvas 全部保持 |
| 正式编译资源 | Canvas 可见的资源也必须被 Compiler 接受 | Runtime 报 3 个 `MISSING_ASSET` | Canvas 读 Asset Index，Compiler 读空 `canonicalBase.assets`；新增通用资源投影并接入预览/保存 | 从 `media_show` 启动为 Runtime r1、History 1/1、Host 1 active、diagnostics 0 |
| 小数几何确定性 | `anchorX=0.5` 可运行且 hash 可序列化 | 资源修复后暴露 `Runtime numbers must be safe integers` | 小数 Stage 参数规范化为 canonical decimal string，整数坐标保持 number | Host payload `x=75/y=45/anchorX="0.5"`，正式快照正常 |
| 旧 Canonical 声明 | Index 未加载时不得删除便携资源声明 | 首轮全量 739/740；awaited `bg_host` 被空 Index 擦除 | 同 ID 覆盖、不同 ID 保留；删除必须显式发生 | 定向 67/67，第二轮全量全部绿色 |

## 4. 本地自动化、构建与生产实测

- 测试先行 RED：缺少资源桥函数、Canonical assets 为空；实现后继续真实暴露小数快照错误与空 Index 擦除旧声明；所有差异均在修正后复跑；
- 定向桥接/媒体/Runtime：`3 files / 60 tests`；Editor/App：首页 `2 files / 41 tests`；最终受影响矩阵 `4 files / 67 tests`，全部绿色；
- 全仓第二轮：普通 `118 files / 740 tests`、真实 IndexedDB storage `1/1`、VM conformance `5/5`，全部绿色；`npm run typecheck` 绿色；
- Runtime 与全部 workspace production build 绿色；最终 Editor CSS `89.24 kB / gzip 16.74 kB`，JS `855.61 kB / gzip 241.63 kB`；`>500 kB` 拆包债保留，不能冒充优化完成；
- 需求矩阵 `50 requirements / 10 USP / 13 P0 / 27 AC`、7 个 Golden 工程、架构 `93 portable / 4 adapters` 均通过；
- production browser 使用 `http://127.0.0.1:4173/` 的 build 产物：默认 1920×1080 / 16:9，真实 PNG Canvas 存在；点击与 s1 重开后角色 `data-stage-x=75`、`data-stage-y=45`；从 `media_show` 启动得到 Effect Host `1 active · 1 operations`、Runtime 结构化诊断 `0`；console error/warn `[]`。

## 5. 需求对齐、出口与剩余风险

本轮直接推进 `REQ-STAGE`、`REQ-ASSET`、`REQ-RUNTIME`、`AC-03` 与 `AC-13`：可视操作、权威 Script、真实资源、保存重开与正式 Runtime/Host 现在处于同一闭环。现代、图形化、多彩、清晰的 UI 方向未变，同时保留专业工具需要的单一事实、失败关闭、确定性快照和可审计恢复。

E1 的 Goal `1/1`、Implementation `5/5`，本地 Acceptance `5/5`。但本分支 Windows / Node 22 完整门绿色前，只能记为“本地关闭候选”；绿色后才关闭 N42-E1 Engineering。即使 E1 关闭，N42 全节点仍缺多轨、关键帧、缓动、镜头、模板及 Editor↔正式 Player 视觉一致性；N42 Product Acceptance、N43+、M1 Stable 与发布继续阻断。

下一切片只能在最终远端证据补录后，从 N42 冻结规格选择一个有界能力；不得因 E1 真实媒体闭环通过就宣称完整 Stage 或进入 N43。
