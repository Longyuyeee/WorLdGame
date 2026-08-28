# N51-E6d Choice / UI 呈现策略入口合同

> 日期：2026-08-28
> 分支：`codex/n51-e6-p0-coverage-exit`
> 直接基线：N51-E6c 最终绿色头 `02988d2`
> 授权：`RA-N21-010`，最大节点 N51
> 当前判定：实现头同头 Windows / Node 22 完整门绿色；E6d Engineering 关闭

## 1. 目标与字段

E6d 只增加 Editor Preview 与正式 Player 当前已有界面可真实消费的呈现默认：

| 字段 | 默认值 | 层级 | 必须产生的实际效果 |
|---|---|---|---|
| `choice.showOptionNumbers` | `true` | Basic | Editor 与 Player 的 Choice 选项显示稳定的 1-based 编号；false 时编号节点不渲染，选项 ID/顺序与选择 Intent 不变 |
| `choice.layout` | `vertical` | Advanced | `responsive-grid` 在足够宽度下使用两列，窄视口回退单列；只改变布局，不改变 Runtime Choice |
| `ui.defaultTextboxTemplate` | `adv` | Advanced | 没有显式 `@textbox set` 时 Editor/Player 使用该模板；显式 `adv/nvl/bubble` 始终优先，reset 回到配置默认 |
| `ui.showInputHints` | `true` | Basic | 控制现有标题页键盘提示的可见性，不禁用任何输入路径 |

字段总数由 32 增至 36，Basic 由 21 增至 23。严格文档形状变化使当前写入版本由 v4 提升为 v5；v1–v4 按各自历史白名单读取并统一写 v5，v4 伪装 v5 字段必须 `UNKNOWN_FIELD`，v6+ 必须 `FUTURE_SCHEMA`。

## 2. 优先级与停止边界

1. Story/Runtime 的显式 Textbox Effect 高于 Settings 默认值；Settings 不改写 Story、Compiler IR、Runtime State、Choice option ID、顺序、target 或 receipt。
2. `choice.layout` 与 `showOptionNumbers` 只改变 Host DOM/CSS；键盘数字直选仍按 Runtime option 顺序工作，即使视觉编号隐藏。
3. 不加入 Choice 倒计时、超时默认项或自动选择：这些依赖 N52 Scheduler/Player Controls，不是纯 presentation。
4. 不加入玩家 Route 剧透、未知节点、完成率、章节重玩或 Scene Replay：当前没有玩家 Route 页面，执行与解锁归 N62；无 Host 的字段不得冒充覆盖。
5. 不加入任意 CSS/HTML、主题 JSON 或字符串模板；Catalog 继续只接受受限 boolean/select/number。

## 3. 冻结测试与真实验收

- parser/catalog/application：v5 迁移、36/23、来源、v4 unknown、v6 future，以及四字段投影；
- Editor：Choice DOM 的编号/布局实际变化，默认 bubble Textbox 生效，显式 nvl 保持优先；Settings ChangeSet、Undo/Redo 与保存重开使用真实 Canonical Project；
- Player：热应用保持同一 waiting-choice Core，编号节点移除、layout 改变、标题提示隐藏；默认 bubble 与显式 nvl 优先级分别验证；
- production browser：冷 production build 上编辑、保存、释放、重开；Player 活跃 Choice 热应用后比较 prompt/options/Core、真实 DOM 数量和 computed grid columns；1440×900 与 390×844 均测 overflow、触控尺寸和 console；
- 先记录首次失败数与实际差异，再实现；不得删除断言、缩减 corpus 或放宽预算。

## 4. 首次实际与差异修正

冻结断言后的首次运行是 5 files / 88 tests，实际 79 通过、9 失败：当前写入仍是 v4，Catalog 仍为 32/21，`choice`/`ui` patch 被严格 parser 拒绝，Preview 的默认 Textbox 固定为 `adv`，Player 的编号、布局和标题提示不读取策略。失败点与冻结缺口逐项一致，旧能力 79 项保持通过。实现后相同 5 files 为 88/88；扩展 Settings Workspace、Editor App、Player parity 后为 8 files / 101 tests 全绿。

N51 聚合首次运行又暴露 4 个持久化测试仍冻结迁移后 v4。实际 Canonical、IndexedDB 与原生目录均正确写 v5，因此只把旧迁移期望更新到 v5；同一聚合复跑为 10 files / 94 tests。完整门首轮先暴露四个 Compiler Build ID 改变而四个 Story IR Hash 完全不变；第二轮普通回归再暴露 Route 两端 State、Scene/Statement State、History Session 与空白工程 semantic hash 的 source identity 更新。路线、Ending、IR 位置、History Back/Forward 等价与保存/重开相等断言均保持，定向 3 files / 44 tests 复跑全绿。

## 5. 真实实现链

- Settings 当前写 v5，保留 v1–v4 各自白名单；新增 `choice` 与 `ui` section，Catalog 为 Basic 23 / Advanced 36，Settings Workspace 支持真实 ChangeSet、来源和保存重开。
- application v1 投影 Choice/UI；Editor Preview 与正式 Player 都由同一 resolved Web profile 消费，而不是另建组件私有 store。
- Editor/Player Choice 都渲染稳定 1-based number node；关闭后只移除该展示节点，option ID、顺序、prompt 和选择 intent 不变。`responsive-grid` 桌面两列，640px 以下回到单列。
- Preview timeline 与 Player presentation adapter 都以配置模板初始化；显式 `textbox.set` 优先，`reset` 返回配置默认。标题输入提示只控制 DOM 可见性，不改变键盘输入 gate。

## 6. Production browser 预期—实际

| 链路 | 冻结预期 | 实际 | 判定 |
|---|---|---|---|
| Editor 冷 production build | Basic 23；Web Choice/UI 修改后保存、释放、重开，值与来源不丢失 | `visibleSettings=23`；`showOptionNumbers=false`、`showInputHints=false` 均为“Web 覆盖”；1440×900/390×844 overflow 0、undersized `[]`、console 0 | PASS |
| Player 标题与 Choice 热应用 | 同一 title/waiting-choice Core；提示 1→0、编号 2→0、prompt/options 不变 | title hint `1→0`；Choice 状态保持 `waiting-choice`，prompt=`Choose a route`、options=`Left/Right`，number nodes `2→0` | PASS |
| 响应式与 Textbox | 1440 两列、390 单列；缺省对白 ADV→bubble；真实选路仍可达 | computed columns `354px 354px` / `358px`；恢复后选择 Left，再热应用 class `player-dialogue--bubble`；overflow 0、console 0 | PASS |

机器证据见 `evidence/n51/settings-ui-browser.json` 与 `evidence/n51/settings-runtime-browser.json`，截图来自同一次 Chrome 151 冷 production build 运行。

## 7. 需求对齐与退出边界

E6d 关闭的是现有 Choice 与 UI Host 可真实消费的呈现策略，不是 Route 玩家页、Choice 调度器或自动附加页。Route 字段因当前没有 Player Route 页面而从本切片排除；倒计时、超时默认项归 N52；解锁、剧透、完成率与重玩归 N62。`RA-N21-010` 仍只允许 N51 Engineering，所有 Product Acceptance、N52、M1 Stable 与发布继续阻断。

下一切片只能进入 **E6e Profile/Host boundary**：先审计 project/platform/runtime/build profile 的真实优先级和 Web/Windows/Android Host 所有权，再冻结测试；Windows/Android 实机证据不得由 Web 浏览器代替。

## 8. 本地退出门

- 定向冻结：首次 5 files / 88 tests 为 79 通过、9 失败；实现后 88/88；扩展端到端定向 8 files / 101 tests 全绿；
- N51 聚合：10 files / 94 tests，PASS；N50 Player/Core：5 files / 36 tests，PASS；
- 双 production browser：Editor 与 Player 均 PASS，Chrome 151，1440×900 / 390×844，overflow 0、browser errors 0；
- 完整 `npm run check`：普通回归 149 files / 885 tests；App 45/45；autosave 2.69s；固定 VM 5/5、54.39s；17 workspace build 与 100 portable / 4 adapter 架构审计通过；
- 性能：Script 13/13；Route 9/9，edit P95 `111.06ms < 500ms`；Asset 4/4，dicing total `4021.24ms < 5000ms`。

实现提交 `6d99928` 已推送到 Draft PR [#96](https://github.com/Longyuyeee/WorLdGame/pull/96)。同头 Windows / Node 22 完整门 run `33147113913` / job `98770473532` 用时约 `12m35s`，PASS：普通回归 `149 files / 885 tests`、App `45/45`、N50 `36/36`、N51 `94/94`、autosave `4.14s`、固定 VM `66.52s < 90s`、Route edit P95 `147.21ms < 500ms`、Asset dicing `3473ms < 5000ms`，100 portable / 4 adapter 架构审计绿色。相同实现、规模、断言和预算在干净远端环境通过，E6d Engineering 关闭。

关闭 E6d 不提升 N51 Product Acceptance，不解除 N52、M1 Stable 或 Public Release 阻断。最终文档提交仍须通过自己的同头完整门；它只证明审计文本没有破坏仓库门，不重复声称新功能证据。
