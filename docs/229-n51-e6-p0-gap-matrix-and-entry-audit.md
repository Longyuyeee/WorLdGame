# N51-E6 Gal P0 Gap Matrix 与入口审计

> 日期：2026-08-28
> 分支：`codex/n51-e6-p0-coverage-exit`
> 直接基线：N51-E5 检查点 `0b4acbf`
> 授权：`RA-N21-010`，最大节点 N51
> 当前判定：E6 设计入口已冻结；字段实现尚未开始，N51 Engineering 与 Product Acceptance 均未关闭

## 1. 开发目标与停止边界

E6 的目标不是把《Gal 基础系统与自动化生产规格》2.1–2.9 中出现的所有系统提前塞进 Settings，而是完成三件事：

1. 把属于 N51 的 P0 配置事实补全为唯一 typed schema、catalog、Project transaction、UI 和 application 链；
2. 对属于 N52/N61/N62/N80–N83 的字段或执行系统建立唯一归属，不建立占位执行器或第二 Runtime；
3. 以真实 Canonical Project、Editor Preview 和正式 Player 为验证链，逐切片记录“冻结预期 → 首次实际 → 差异 → 修正 → 复测”。

出现以下任一事实必须停止扩展并先修正设计：

- 新字段只能通过 Editor 私有 state 或第二份 settings store 生效；
- settings-only 更新会重建 Player Core、改写 Runtime State 或改变剧情 Outcome；
- 为了让 N51 看似完整而实现 Save/History/Auto/Skip/Back/Forward；
- 用 jsdom、开发者断言或响应式浏览器冒充 production browser、实体 Windows/Android Host 或真人验收；
- 修改 Schema 却没有旧工程迁移、future schema 拒绝和确定性序列化证据；
- 文档、追踪矩阵与真实代码字段数或应用范围不一致。

## 2. 真实代码基线

当前 `@world-studio/gal-settings` 只有 23 个 scalar 字段，分为 display 5、text 5、advance 2、audio 7、input 4。它们已经具备：

- `schemaVersion: 1` 严格解析，未知 section/field 失败关闭；
- default → project → Windows/Web/Android 覆盖和逐字段来源；
- Basic 16 / Advanced 23、双语 catalog、NFKC 搜索；
- Project Service 原子 ChangeSet、stale revision、Undo/Redo；
- `settings/project.json` 的 Node Directory 与 IndexedDB 保存重开；
- Editor Preview / Player 共享 application v1，显示、文字时长、音量/ducking 和输入门产生实际效果。

当前 catalog 只支持 boolean、number、select，尚不支持 string、resource reference、localized value、list/map、复合模板或按键映射。application v1 也只正式投影 display、text、advance、input，并通过 helper 消费 audio；没有 stage、choice、route、accessibility、localization、build application contract。

## 3. 原始 P0 → 当前事实 → 唯一归属

状态含义：`已有` 表示当前 23 字段和 E5 application 已形成真实链；`部分` 表示有相邻底座但没有 N51 typed configuration/application；`缺` 表示当前没有对应字段或产品链；`后续节点` 表示不得在 E6 实现其执行系统。

| 原始范围 | 当前真实覆盖 | 状态 | 唯一归属 | E6 决定与可验证 Host |
|---|---|---:|---|---|
| 2.1 设计宽高、横竖屏、安全区、质量 | `designWidth/Height`、`orientation`、`safeArea`、`quality` | 已有 | N51 | 保持 application v1；Preview/Player production browser |
| 2.1 窗口/全屏 | Player 有浏览器容器，无项目设置 | 缺 | N51 配置；N80–N82 Host 执行 | E6 只冻结 typed intent 和 Web 可验证降级；正式宿主证据后续 |
| 2.1 帧率、渲染比例、色彩空间、低性能档 | quality 仅映射 DPR 上限 | 部分 | N51 配置；N70/N80–N82 执行 | E6 建立明确枚举/数值及 Preview/Player 可观察投影，不冒充真机性能 |
| 2.1 默认语言、支持语言、地区、时区 | Project 只有 `defaultLocale`，Settings 无字段 | 部分 | N61 为语言生产与切换；N51 只存 Host-neutral preference 时才准入 | E6 不复制 Localization Catalog；先由 gap contract 标阻断 |
| 2.1 标题、图标、包名、版本、版权 | manifest 只有 title；构建资料未形成 | 部分 | N83 Build Center | 不进入 N51 runtime settings；由 N83 统一拥有发布元数据 |
| 2.1 Debug/Preview/Test/Release Profile | 现有 project/platform 两轴，没有 build profile 轴 | 缺 | N51 运行配置与 N83 构建 Profile 需分层 | E6 不在现有三层上临时增加第四层；先冻结 profile identity/precedence ADR |
| 2.2 ADV/NVL/气泡/全屏/多窗口 | Stage 有 textbox template 指令，Settings 无默认模板 | 部分 | N42 语义；N51 项目默认配置 | E6 可提供默认 presentation policy，但必须复用 N42/Host，不建第二模板模型 |
| 2.2 字体、字号、行距、字距、边距、描边 | 仅 `fontScale` | 部分 | N51；字体资源由 N61/N70 | 先补 Host 可直接验证的排版 scalar；资源引用待安全 typed reference |
| 2.2 CJK、Ruby、语言字体回退 | Story Language 有语法/文本底座，Settings 无配置 | 部分 | N61 | E6 不复制排版/本地化引擎；只允许跨节点已冻结的 portable preference |
| 2.2 文字速度、最短时长、标点停顿 | 三字段已影响实际 reveal | 已有 | N51 | 保持并补真实 Unicode/标点/browser 证据 |
| 2.2 瞬显、点击补全、换页、已读标记、等待光标 | Player 有首次确认补全文本，但不可配置 | 部分 | N51 配置；已读事实来自 N52 | E6 只实现不依赖 N52 状态的显示/补全文本策略 |
| 2.2 文本框透明度、位置、自动隐藏 | 仅 opacity；Stage 有 textbox placement | 部分 | N51 + N42 Host | 复用既有 textbox projection，禁止 CSS-only 假设置 |
| 2.3 四类普通推进输入、长按、等待语音 | 六字段已进入 Player/Preview | 已有 | N51 | 保持 application/Core intent 链 |
| 2.3 Auto/Skip/玩家速度/Stop Point/已读策略 | Runtime 有内核，Player 产品功能未实现 | 后续节点 | N52 | E6 不新增这些字段或执行策略；由 N52 同一 Core 实现 |
| 2.3 Editor Preview 测试倍率 | Editor 已有 transport speed，但不在 project settings | 已有相邻能力 | Editor session，不是发布 Project setting | 不写入 Canonical Project，避免制作偏好污染作品语义 |
| 2.4 Save/Load/History/Back/Forward 全部策略 | N31 有内核；正式 Player UI 未实现 | 后续节点 | N52 | E6 完全阻断，不以 typed placeholder 冒充覆盖 |
| 2.5 舞台层、角色、Camera、Transition | N42 Canonical/Compiler/Runtime 已有 | 已有相邻能力 | N42 语义；N51 只拥有项目默认值 | E6 只接默认时长/缓动/无障碍策略，并复用正式 Host effect |
| 2.5 Live2D/Spine | 插件愿景，无 M1 正式适配 | 缺 | 插件/后续路线 | 不进入 E6 P0 出口 |
| 2.5 减少闪光/剧烈位移/震动替代 | N43 有 Editor motion preference，不是作品 Player 设置 | 部分 | N51 项目可访问性配置；N50 Host 应用 | E6 必须产生 Player 可观察替代，不能只改设置页标签 |
| 2.6 六类音量与 voice ducking | 七字段实际应用 | 已有 | N51 | 保持真实 HTMLMediaElement gain 证据 |
| 2.6 静音、声像、循环、淡入淡出、响度 | Effect/媒体有部分事实，Settings 无全局策略 | 部分 | N51 默认策略；具体 Effect 仍属 Story/Runtime | 只补不会覆盖单条 Effect 的默认/限制策略 |
| 2.6 角色语音、多语言映射、缺失检查 | Asset/Localization 有相邻底座 | 部分 | N61 | 不在 N51 建第二映射表 |
| 2.6 设备切换、失焦静音、中断恢复 | Web lifecycle 有 pause/resume | 部分 | N50/N80–N82 Host；N51 可配置 policy | E6 可冻结 intent；实体设备证据不得由浏览器替代 |
| 2.7 选项样式、倒计时、默认项、已选标记 | Choice Core 存在，Settings 无配置 | 部分 | N51 配置；条件语义仍属 Story/Runtime | E6 先补纯 presentation/default policy；计时执行若依赖调度需单独审计 |
| 2.7 变量、条件、跳转、结局命名 | Canonical Story/Compiler 已有 | 已有相邻能力 | N20/N30，不是 Settings | 不复制到 N51 |
| 2.7 玩家流程图剧透、未知节点、完成率 | Route/Meta 有底座，玩家页面未实现 | 部分 | N51 配置；N62 页面执行 | E6 可定义 portable presentation policy，实际页面验收留 N62 |
| 2.8 标题/菜单/暂停/帮助/确认/退出模板 | Player 有 title/dialogue/choice/ending，模板不完整 | 部分 | N50 Shell；N51 主题/可见性配置 | E6 只配置已存在 Host 能验证的模板槽，不新增平行页面 Runtime |
| 2.8 Settings/History/Save/Load | Settings 已有 Editor UI，玩家页面未完整 | 部分/后续 | Settings=N51；其余=N52 | 不把 Editor SettingsWorkspace 当玩家设置页验收 |
| 2.8 Gallery/Replay/Music/Ending 等附加页 | Compiler Catalog 有底座，Player 页面未生成 | 后续节点 | N62 | E6 只允许模板偏好/覆盖契约；生成、解锁与页面属于 N62 |
| 2.8 通知、Tips、内容警告、Credits、License | 无统一模板/config | 缺 | N51 模板配置；N62/N83 内容与产物 | 必须按内容、主题、构建资料分开所有权 |
| 2.8 Theme Token、响应式和输入提示 | Editor/Player 有 CSS，未 Canonical 化 | 部分 | N51 | E6 需 portable token contract；禁止把任意 CSS/HTML 写入工程 |
| 2.9 语言切换与语言专用媒体 | Localization/Asset 有底座，Player 未产品化 | 后续节点 | N61 | E6 不宣称覆盖 |
| 2.9 字幕、高对比、大字体、减少动效/闪烁 | fontScale 已有；N43 是 Editor preference | 部分 | N51 + N50 Host | E6 优先补可真实应用的 Player accessibility policy |
| 2.9 按键重映射、自动推进、操作超时 | 仅四类输入开关 | 部分/后续 | 基础输入配置=N51；Auto=N52 | E6 不实现 Auto；复杂 mapping 先冻结安全 schema |
| 2.9 分包、补丁、缓存、离线、签名、商店、隐私/遥测 | 未形成发布系统 | 后续节点 | N70、N80–N83 | 不进入 N51；Build/Release Manifest 唯一持有 |

## 4. 首次预期—实际—纠偏

| 检查 | 冻结预期 | 首次实际 | 纠偏决定 |
|---|---|---|---|
| E6 范围 | 2.1–2.9 都可在 N51 补字段 | 文档同时把播放控制、Localization、自动页和构建分别交给 N52/N61/N62/N80–N83 | 以唯一执行节点为准；N51 只补 typed configuration/application，不抢执行系统 |
| Schema 扩展 | 在 v1 后追加字段即可 | v1 parser 严格拒绝 unknown field；旧读取器会把同为 v1 的新文件判错 | 下一代码切片先冻结并实现 settings v1→v2 迁移，不允许静默扩 v1 |
| 控件能力 | catalog 可表达全部 P0 | 只有 boolean/number/select，不能安全表达字符串、列表、资源引用、模板和按键映射 | E6 按实际字段需求增加受限 typed control；禁止任意 JSON/HTML/CSS 文本框 |
| 运行应用 | 所有设置能沿 application v1 热应用 | 当前只覆盖 display/text/advance/input/audio；stage/choice/route/accessibility 缺 contract | 每批字段必须同时定义 Host application 或明确后续 owner；无 Host 的字段不得冒充 E6 已完成 |
| 平台证据 | Web 响应式可代表三平台 | 当前只有 Web production browser；Windows/Android 正式 Host 未传 profile | E6 记录 Web Engineering 证据，实体 Host 与设备继续失败关闭 |

## 5. 冻结实施顺序

E6 后续必须按以下小切片推进，每个切片独立审计、需求对齐、完整门、提交和推送：

1. **E6a Schema v2 与迁移安全**：冻结字段分组、v1→v2 默认升级、v2 round-trip、future schema/read-only、旧工程 Node/IndexedDB 保存重开；不增加 UI 假入口。
2. **E6b Text/Accessibility application**：优先补能由现有 Preview/Player 真实观察的文本完成策略、排版 scalar、高对比/减少动效与闪烁等，不依赖 N52。
3. **E6c Stage/Audio default policy**：复用 N42 Effect/Host；验证默认时长/缓动/音频生命周期策略，不覆盖脚本显式值。
4. **E6d Choice/Route/UI presentation policy**：只做 presentation/config；Route 页面生成和解锁仍归 N62。
5. **E6e Profile/Host boundary**：冻结 project/platform/runtime/build profile 的优先级；Web 做可执行证据，Windows/Android 实体 Host 保持阻断。
6. **E6f 出口复审**：逐项回填本矩阵，任何无代码/Host/测试证据的条目不得计为完整；执行 production browser、完整 `npm run check` 和同头 Windows / Node 22 CI。

## 6. E6a 入口验收合同

下一代码切片开始前冻结以下预期：

- 现有合法 v1 文件加载后解析为与当前 23 字段完全相同的 resolved values/source；
- 首次保存升级为确定性的 v2 文件，第二次保存字节不变；
- v1 非空合法 override 不丢失，损坏 v1 和 future schema 继续失败关闭；
- Project Service settings ChangeSet、Undo/Redo、stale revision 在迁移后语义不变；
- Node Directory 和 IndexedDB 都用真实工程完成打开 → 升级 → 保存 → 释放/重开 → Hash/字节验证；
- Editor Preview 与 Player 在只有 schema migration、没有 resolved setting 变化时不得重建 Core或改变当前 dialogue/choice/ending；
- 测试必须先记录预期，若首次实际不同，保留差异和修正原因，不删除断言、不放宽门槛。

## 7. 本机真实验证与差异

本入口切片先执行需求、风险、治理、工作区、架构、PR 追踪和 delivery baseline 审计，全部通过：50 requirements、27 acceptance criteria、17 workspaces、100 portable / 4 Node adapter files；`RA-N21-010` 仍以 N51 为 maximum delivery node。

随后从头执行 `npm run check`。真实结果不是全绿：

- 普通回归 `149 files / 856 tests`、Compiler `29/29`、Runtime `60/60`、N41/N42/N43、Player/Core `31/31`、N51 `69/69` 均通过；Runtime 10k shard runner `36.545s` 通过；
- autosave storage conformance 在累积负载下约 `17.22s`，冻结的 5 秒内未出现 `已恢复 · s3`；原命令隔离复跑仍约 `14.60s` 失败；
- 为排除 Node 25 版本差异，又用 Node `22.23.2` 原断言、原 5 秒预算复跑，仍约 `11.98s` 失败；没有放宽 timeout；
- 重型 VM 10,000-seed 测试语义 `4/5` 通过，但 corpus 用时约 `99.49s > 90s`，保持冻结规模与预算后失败；
- 17 workspace build 全部通过；Editor JS `972.17/272.56 kB`，既有 >500 kB 拆包债保留；Player Host `308.65/95.88 kB`；
- Script `13/13` 通过；Route `9/9`，edit P95 `155.88ms < 500ms`；Asset `4/4`，dicing `2916.05ms < 5000ms`；架构门通过。

这两个红项都位于 E5 基线已有代码，本切片没有修改 autosave、VM、测试、规模或预算；但本机仍不得记为完整门通过。按照既有项目裁决规则，本切片推送后必须由干净 Windows / Node 22 CI 对同一提交执行完整门：若远端任一红灯，本入口切片不关闭并停止 E6a；只有同头远端绿色才可把本机差异登记为环境负载差异。

入口提交 `ec35570` 推送后，Draft PR [#96](https://github.com/Longyuyeee/WorLdGame/pull/96) 的 Windows / Node 22 完整门 run `33133914830` / job `98729511942` 用时 `12m5s`，PASS：普通回归 `149/856`，autosave 实际测试 `3.744s < 5s`，重型 VM `64.00s < 90s`，Runtime shard runner `30.356s`；Editor `972.25/272.55 kB`、Player Host `308.65/95.88 kB`，Route edit P95 `133.34ms < 500ms`，Asset dicing `3255ms < 5000ms`。因此本机两项红灯由同一代码、同一规模、未放宽预算的权威环境关闭为本机负载差异；E6 入口设计切片可以关闭，但不代表 E6a 代码、N51 Engineering 或任何 Product Acceptance 已完成。

## 8. 当前诚实状态

本入口切片只完成代码/需求审计和设计冻结，没有新增字段、没有关闭 E6，也没有改变任何 Product Acceptance：

- N51-E1–E5 Engineering 保持关闭；N51-E6 为“设计冻结”；
- N51 Product Acceptance、N52 Engineering、M1 Stable、Public Release 继续由 `RA-N21-010` 阻断；
- N21 `0/1`、N23 `0/2` 真人记录保持 pending；
- E5 最新 Draft PR #95 和远端绿色门不能换算为 `main` 已集成；
- 下一步只允许进入 E6a Schema v2 与迁移安全。
