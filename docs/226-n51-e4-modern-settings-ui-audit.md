# N51-E4 现代 Settings UI 与保存重开审计

> 日期：2026-08-28
> 分支：`codex/n51-e4-settings-ui`
> 直接基线：N51-E3 最终头 `410be14`
> 授权：`RA-N21-010`，最大节点 N51
> 判定：本地 Engineering 候选通过；同头远端 Windows / Node 22 完整门待验证；Product Acceptance 仍阻断

## 1. 原始需求与本切片边界

E4 继续服务 PRD 3.14、Gal 基础规格第 2 节、REQ-GAL 与 AC-19。冻结目标是用现有代码设计系统实现现代、简洁、适度多彩并采用渐进披露的项目设置任务：Basic/Advanced、搜索与分区、项目/Windows/Web/Android 层、继承来源、修改态、恢复、关联字段错误、保存/撤销反馈，以及桌面与 390×844 的真实 production-browser 证据。

边界保持不变：

1. UI 必须复用 E1 Catalog、E2 Editing contract、E3 Canonical Project / Project Service / Lifecycle，不能创建 localStorage 或独立 settings store；
2. 设置是已有七模式之上的工程任务，不新增第八个 workspace mode；
3. 右侧保留既有默认 16:9、可调尺寸的上下文 Preview；E4 不宣称设置已热应用到 Preview/Player，该能力唯一属于 E5；
4. 本切片不补齐 REQ-GAL 剩余 P0 字段，也不进入 N52 的 Save/History/Auto/Skip/Back/Forward 玩家行为；
5. UI 直接使用仓库代码设计系统，不引入与当前实现脱节的 Figma 权威副本。

## 2. 实际代码审计与架构纠偏

实现前确认真实产品入口为 `StudioLauncher → App`，Launcher 持有 `ProjectLifecycleSession / ProjectWorkspace`，App 内原有保存桥只向宿主传出 `StoryProject`。若设置 UI继续复用该回调，设置变化可能在剧情投影中丢失，且依赖父层重渲染重新拼 Canonical Project，不能满足 E3 的唯一权威链。

本轮因此增加精确 `onCanonicalProjectSave(CanonicalProject)` 桥：App 在保存开始时捕获完整 canonical snapshot，Launcher 直接以该对象执行 `markProjectDirty → saveCompiledLifecycleProject`。旧 `StoryProject` 回调仅保留兼容，不被 Settings 产品路径使用。Editor 同时显式声明 `@world-studio/gal-settings` 依赖，workspace registry 与 architecture gate 都校验该边界；没有放宽 portable/core 隔离规则。

Settings UI 作为覆盖左侧创作区的任务面板实现，右侧继续挂同一个 `PreviewPanel`。这样既不增加模式数量，也不复制 Preview 或 Runtime。React state 只保存尚未应用的输入草稿和当前 Project Service 事务视图；每个分区应用后，唯一工程事实立即成为 `settings.edit` 生成的新 Canonical Project，保存仍走受控 Lifecycle。

## 3. 实际实现

- 新增 `SettingsWorkspace`，提供 Basic 16 / Advanced 23、NFKC 搜索、显示/文本/推进/音频/输入五分区；
- 提供项目、Windows、Web、Android 四层选择；项目层可选择来源预览平台；每项显示默认/项目/平台来源、当前层覆盖与待应用状态；
- number/select/boolean 控件完全由冻结 Catalog 生成，共用 parser/control 约束；
- 同一分区的草稿作为一条原子 `settings.edit` 提交，保证 width/height/orientation 等关联字段不会产生中间非法工程；非法组合保留草稿并显示稳定 `INVALID_SETTINGS + path`；
- 单项恢复、整层恢复、撤销和重做都进入 Project Service revision/ChangeSet，不创建空 revision；
- App 顶部增加“项目设置”任务入口；进入其他编辑视图/模式会关闭设置任务，七模式注册表保持 `7`；
- 保存状态、冲突/只读/不可用状态与 Lifecycle 反馈直接映射到设置页，保存按钮调用完整 Canonical Project 宿主桥；
- 桌面为设置主区 + 右侧 Preview；窄屏改为单列，44/48px 触控目标，设置任务打开时收起无关模式/历史控件，并暂时隐藏会遮挡内容的 Launcher 固定返回按钮；关闭任务后全部恢复；
- 新增可复跑的冷 production build + Edge/Chromium CDP 审计脚本与桌面/移动截图、机器可读 JSON 证据。

## 4. 预期—实际—修正

| 验证 | 冻结预期 | 首次实际 | 修正与复测 |
|---|---|---|---|
| 保存权威 | 设置保存完整 Canonical Project | App 旧桥只传 `StoryProject`，存在丢 settings 风险 | 增加精确 canonical save callback；App 集成测试验证 Web `audio.master=0.4` 原样传给 Launcher 路径 |
| UI 事务 | 关联字段一个 ChangeSet，非法输入不污染工程 | Android portrait 只改 orientation 被正式规则拒绝 | UI 同分区三字段批量提交成功；单字段显示 `INVALID_SETTINGS / settings.platforms.android.display`，canonical 未变 |
| 持久化 | UI 修改经正式工作区保存并重开 | 组件测试只能证明内存回调 | 新增真实 IndexedDB UI→Project Service→Lifecycle→openProject 集成，Web 来源和值原样恢复 |
| 模式边界 | 不新增第八模式 | 把 Settings 做成 workspace mode 会破坏 N43 七模式契约 | 采用独立工程任务面板；浏览器实测 workspace modes 仍为 7 |
| Preview 边界 | 右侧默认 16:9 且可调，不提前宣称热应用 | 初始测试误写不存在的 `desktop-16-9` ID | 按真实冻结 ID `landscape-16-9` 纠正测试；桌面/移动实际比率均为 16:9 |
| 移动触控 | 所有可见设置控件至少 44px | 首轮整层“恢复继承”按钮因 CSS specificity 只有 36px；审计还误计 1×1 的视觉隐藏 checkbox | 提高具体性至 44px；审计只测真实可见交互面，label 承载的 toggle 为 48px；最终 undersized `[]` |
| 移动溢出 | 390×844 横向 overflow 0 | 精确 390 复测发现顶部 workspace navigation/history 向右多 10px | 设置任务窄屏收起无关导航/历史项；最终 document overflow 0，offender `[]` |
| 视觉遮挡 | 固定工具不得覆盖设置反馈 | 指标通过后截图发现 Launcher“返回项目结构”压住移动反馈区 | 设置任务打开期间隐藏外层固定返回按钮；最终截图复核无覆盖 |
| 可访问性 | 键盘焦点清晰，reduced motion 生效 | 浏览器初始审计未记录实际样式 | 搜索框焦点成功，focus ring 可见；设置卡 transition 为 `1e-05s`，console/runtime error 为 0 |

## 5. 本地证据

- `npm run audit:n51-gal-settings`：`7 files / 49 tests`，PASS；其中 Settings 组件与 App 集成 `2 files / 6 tests`；
- `npm run audit:n51-settings-browser`：冷 Editor production build 后真实 Edge `137.0.3296.68`，PASS；
- 桌面 1440×900：Basic 16、七模式不变、Settings `1059px` + Preview `380px`、overflow 0、默认 `landscape-16-9`；
- 保存重开：Web `audio.master=0.4`、来源 `Web 覆盖`、`已恢复 · s1`；
- 移动 390×844：Settings/Preview 各 `390px`、16:9、overflow 0、可见控件低于 44px 为 `[]`、越界元素 `[]`、focus 成功、reduced-motion `1e-05s`、浏览器错误 `[]`；
- 机器证据：`evidence/n51/settings-ui-browser.json`；截图 SHA-256 为桌面 `410c002c…c5af4`、移动 `4c325688…b65d5`；
- 最终本地 `npm run check`：PASS；普通回归 `147 files / 847 tests`，Editor integration `8 files / 54 tests`，storage `1/1`，VM `5/5`、`27.09s < 90s`；
- 17 workspaces production build PASS；Editor CSS `138.52/24.70 kB`，JS `969.46/271.59 kB`，既有 >500 kB 拆包 warning 保留；
- architecture `99 portable / 4 Node adapter`；10k Runtime `7.737s`、Route edit P95 `60.06ms < 500ms`、Asset dicing `1745.71ms < 5000ms`，全部 PASS。

## 6. 诚实边界与下一切片

E4 已把首批 23 个 typed settings 变成可搜索、可继承、可恢复、可撤销并能真实保存重开的产品 UI，直接推进 REQ-GAL/AC-19；但仍不能宣称 N51 或配置中心完成：

1. 右侧 Preview 目前只是既有创作上下文，设置值尚未热应用；
2. 正式 Player 尚未消费显示、文本、推进、六路音量和输入设置；
3. REQ-GAL 剩余 P0 字段、附加页模板和逐字段追踪仍缺；
4. Windows/Android 正式宿主、实体设备、真人 Product Acceptance、M1 Stable 与发布继续失败关闭；
5. Editor 大包拆分债未因本轮通过而关闭。

下一切片冻结为 N51-E5 Preview/Player settings hot application。E5 必须从同一 resolved settings 输出驱动现有 Preview 与正式 Player Core/Host，不得建立第二套解释规则；热应用与需要重启的字段必须明确区分，并以 Editor↔Player 对照、保存重开、桌面/390×844 production browser 和失败恢复证据关闭。E4 Engineering 的最终关闭仍等待本实现头的远端 Windows / Node 22 完整门。
