# D1 视觉系统规格

> 状态：Phase 0 已批准；产品负责人随后明确停止 Figma 工作流，活动视觉原型与 Token 均以代码实现为准。2026-08-25 的壳层收敛审计已修正首页、工程结构页和桌面三栏滚动，但 D1 高保真关键屏、七模式、三级动效和目标用户验证仍未完成，详见[《N42-E3a UI 壳层收敛与防摊大饼审计》](192-n42-e3a-ui-shell-convergence-audit.md)。
> 目标：现代化、极简、动效丰富、过渡平滑、色彩丰富、表达清晰，并与专业高密度同时成立。

## 1. 视觉主张

WorLd Studio 的工作区像一间安静但信息充足的数字导演台：内容始终最亮，工具表面保持深色克制，语义对象用明确高彩色建立身份。辉光、渐变和透明度只出现在当前上下文、运行因果和空间过渡中，不铺满全部界面。

六项已确认原则：

| 原则 | 在编辑器中的含义 | 验收反例 |
|---|---|---|
| 现代化 | 清楚的层级、成熟的排版、响应式布局和一致组件语言 | 传统 IDE 拼接感、过时系统控件混用 |
| 极简 | 去掉重复边框、无效容器、冗余文案和不必要步骤 | 为了空旷而隐藏诊断、ID、预算或批量操作 |
| 动效丰富 | 关键操作、因果、空间和运行同步都有适当动态反馈 | 装饰循环很多，但操作关系仍不清楚 |
| 过渡平滑 | 对象来源与去向连续、帧节奏稳定、可被输入打断 | 突跳、卡顿、等待动画结束或状态错位 |
| 色彩丰富 | 高彩色承载内容类型、状态和路径语义 | 随机彩虹色、同色多义或错误红用于装饰 |
| 表达清晰 | 当前对象、状态、风险、结果和下一步一眼可辨 | 只靠颜色/悬停、术语无解释、主要操作难发现 |

“极简”与“专业高密度”不冲突：减少的是认知噪声，不是信息量；高频信息保留在首层，低频细节通过渐进展开呈现。

禁止方向：

- 大面积低对比毛玻璃；
- 无语义的彩虹渐变；
- 把所有面板都做成悬浮卡片；
- 用动画遮掩等待、保存或构建；
- 为“简洁”隐藏专业用户必须持续观察的 ID、诊断和预算；
- 直接套用 Material 3 外观，使桌面工作区失去产品辨识度。

## 2. Token 架构

受当前 Figma Starter 单模式能力限制，D1 使用三个单模式集合。将来落地时仍按平台中立语义 Token 输出，不把 Figma 计划限制写入产品架构。

| 集合 | 模式 | 内容 | 预计数量 |
|---|---|---|---:|
| `Primitive` | `Default` | 中性色阶、语义原色和透明值 | 32 |
| `Semantic.Dark` | `Dark` | 表面、文字、边框、焦点及七类内容语义 | 28 |
| `Scale` | `Default` | 间距、圆角、尺寸、线宽、动效时长 | 32 |

所有 Primitive 变量 `scopes=[]`；Semantic 变量按填充、文字或描边设置明确 Scope；Scale 变量只进入适合的 Gap、Radius、Size 或隐藏范围。每个变量保留未来 Web/Android 代码语法槽位，但D1不创建实现文件。

## 3. 色彩

### 3.1 深色表面候选值

| Token | 值 | 用途 |
|---|---|---|
| `color/bg/canvas` | `#080A10` | 画布外与窗口底色 |
| `color/bg/base` | `#0D111A` | 主工作区 |
| `color/bg/surface-1` | `#121824` | 项目树、Inspector |
| `color/bg/surface-2` | `#182131` | 工具栏、卡片、选中容器 |
| `color/bg/surface-3` | `#202B3D` | 弹层、活动面板 |
| `color/border/subtle` | `#273247` | 常规分隔 |
| `color/border/strong` | `#3C4962` | 可交互轮廓 |
| `color/text/primary` | `#F4F7FF` | 主要文字 |
| `color/text/secondary` | `#B2BDD0` | 次要文字 |
| `color/text/muted` | `#78859D` | 辅助和禁用信息 |

### 3.2 语义色候选值

| 语义 Token | 值 | 非颜色冗余编码 |
|---|---|---|
| `color/semantic/dialogue` | `#8B7CFF` | 引号/文本行图标、实线左边 |
| `color/semantic/character` | `#FF62A5` | 人形图标、圆角头像 |
| `color/semantic/visual` | `#3ED7FF` | 画框/摄像机图标、双线轨道 |
| `color/semantic/audio` | `#FF9B4A` | 波形图标、锯齿缩略 |
| `color/semantic/choice` | `#55D98A` | 分叉图标、菱形端点 |
| `color/semantic/logic` | `#4D91FF` | 花括号/变量图标、虚线边 |
| `color/semantic/condition` | `#F0D45C` | 漏斗/条件图标、六边形节点 |
| `color/status/error` | `#FF5F72` | 错误图标、粗实线、阻断文字 |
| `color/status/warning` | `#FFC557` | 警告三角、点划线 |
| `color/status/success` | `#4ED6A0` | 对勾、完整环 |

中央主区同时最多出现五个高饱和语义色；其余退为低透明标签或灰阶结构。错误红不用于品牌装饰。

### 3.3 状态与层级

- Hover：表面亮度提升一级，80–120 ms；
- Selected：语义色 12%–18% 背景 + 1 px 语义边 + 明确选中图标；
- Focus：2 px 高对比焦点环，不能只靠辉光；
- Disabled：降低对比但保持 WCAG 可辨文字，不使用透明到不可读；
- Running：静态当前标记始终存在，脉冲只是增强；
- Dirty：标题或语句旁显示文字/点标，不用仅改变保存按钮颜色。

## 4. 排版

### 4.1 字体候选

| 用途 | 字体 | 原因 |
|---|---|---|
| 中文 UI/正文 | Noto Sans SC | Figma 可用、CJK 覆盖完整、跨平台可替代 |
| 日文/韩文回退 | Noto Sans JP/KR | 同家族指标接近，便于真实多语言测试 |
| 拉丁 UI | Noto Sans | 与 CJK 家族协调 |
| Script、ID、变量、日志 | IBM Plex Mono | 专业工具辨识强，数字和代码扫描清楚 |

品牌展示字体不在 D1 冻结；不得用品牌字体承载长正文。

### 4.2 Text Styles

| Style | Size/Line | Weight | 用途 |
|---|---:|---|---|
| `Display/Workspace` | 24/32 | Bold | 欢迎页、模式标题 |
| `Heading/Panel` | 16/24 | Bold | 主面板标题 |
| `Heading/Section` | 14/20 | Bold | Inspector 分组 |
| `Body/Default` | 14/21 | Regular | UI 正文 |
| `Body/Compact` | 13/18 | Regular | 高密度表格/树 |
| `Label/Default` | 12/16 | Medium | 控件标签、徽标 |
| `Caption/Muted` | 11/16 | Regular | 元数据、时间 |
| `Mono/Script` | 14/22 | Regular | 脚本正文 |
| `Mono/Compact` | 12/18 | Regular | ID、变量、日志 |
| `Mono/Numeric` | 12/16 | Medium | 时间码、预算、坐标 |

所有样式用真实中文、英文和日文长字符串验证，不用 Lorem Ipsum。

## 5. 间距、圆角与密度

### 5.1 Scale

- Spacing：`2, 4, 6, 8, 12, 16, 20, 24, 32, 40`；
- Radius：`2, 4, 6, 8, 12, 16, full`；
- Desktop 控件高度：Compact `28`、Default `32`、Comfortable `36`；
- Mobile 触控高度：最小 `44`，主要操作 `48–56`；
- 边框：常规 `1`，焦点/阻断 `2`；
- 桌面 Panel Header：`36`；顶栏 `48`；左侧模式轨 `56`；
- Mobile Bottom Navigation：含安全区前 `64`。

全部 92 项 Variable 的逐项冻结值、别名、Scope 与 Web/Android 语法见[《D1 Token 冻结清单》](19-d1-token-manifest.md)。原先 30 个 Scale 的估算在逐项审计后修正为 32 个：补回已经写入本规格、但未进入初步计数的模式轨 `56` 与移动底栏 `64`，不新增需求。

### 5.2 密度规则

- Writer 和 Production 默认 Compact；
- Director 和 Flow 默认 Default；
- Quick Start 默认 Comfortable；
- 手机不提供低于 44 px 的独立触控目标；
- 200% 缩放时允许面板转为 Drawer，不允许文字裁切；
- Inspector 每层最多展示 7 个连续字段，更多内容分组折叠但保留搜索。

## 6. 深度与效果

| Style | 规则 | 用途 |
|---|---|---|
| `Elevation/Panel` | 低半径、低透明黑色阴影 | 停靠面板边界 |
| `Elevation/Popover` | 中等阴影 + 1 px 边 | 菜单、Tooltip、浮层 |
| `Glow/Context` | 当前语义色小范围外发光 | 当前运行/跨视图定位，不能常驻全屏 |
| `Focus/HighContrast` | 无模糊 2 px 对比环 | 键盘与无障碍焦点 |

不建立大面积 Glass Effect。低端设备档可关闭所有 Glow，不影响状态理解。

## 7. 图标与图形语言

- 基础操作图标优先检查 Simple Design System；
- 缺失图标使用统一 20/24 px SVG，不用旋转线段拼接；
- 重要按钮同时显示文字；
- Route 节点、Timeline Clip 和 Diagnostic 不能只靠通用图标，必须有专用形状；
- 图标笔画、端点和视觉尺寸统一，填充与线框不混用表达同一级操作；
- 不使用受竞品版权保护的图标或品牌图形。

## 8. 组件 API 候选

### 8.1 基础控件

| Component | Variant 轴 | 内容属性 | 状态 |
|---|---|---|---|
| Button | Size × Style | Label、Leading Icon、Trailing Icon | Default/Hover/Pressed/Disabled/Focus |
| IconButton | Size × Style | Icon、Tooltip | Default/Hover/Pressed/Disabled/Focus |
| ModeTab | Mode × Selected | Label、Icon、Shortcut | Default/Hover/Focus |
| StatusBadge | Severity | Label、Icon、Count | Default |
| InspectorField | Type × Density | Label、Value、Unit、Help | Default/Focus/Error/Disabled |

Button 变体矩阵超过 30 时拆成普通 Button、Danger Button 或尺寸子组件，避免变体爆炸。

### 8.2 专业语义组件

| Component | 关键属性 | 必须表达 |
|---|---|---|
| DialogueBlock | Speaker、Text、Voice、Language、Selected | 稳定 ID、配音、本地化和诊断 |
| RouteNode | Kind、Reachability、Coverage、Selected | 场景/结局/条件、入口出口和问题 |
| TimelineClip | Track、Duration、Resource、Selected | 对话/画面/音频/逻辑语义和边界 |
| DiagnosticRow | Severity、Rule、Location、Fixable | 原因、影响、位置和修复 |
| BudgetBar | Metric、Soft/Hard、Value | 当前值、趋势、预算和阻断状态 |
| OptimizationProposal | Type、Risk、Savings | 原始/派生对比、质量、应用和回退 |
| BuildStage | Stage、Status、Duration | 真实构建阶段、日志和重试范围 |

## 9. 动效 Token 与行为

### 9.1 时间

| Token | 候选值 | 用途 |
|---|---:|---|
| `motion/duration/instant` | 80 ms | 按下、焦点 |
| `motion/duration/fast` | 140 ms | Hover、选中 |
| `motion/duration/standard` | 200 ms | 折叠、插入 |
| `motion/duration/panel` | 260 ms | Drawer、Inspector、Sheet |
| `motion/duration/mode` | 340 ms | 模式/视图切换 |
| `motion/duration/trace` | 600 ms | 路径追踪、构建阶段解释 |

进入通常 `ease-out`，退出通常比进入短 15%–25%；直接操控跟手，不用固定时长追赶指针。

### 9.2 三级动效

| 等级 | 保留 | 降低/移除 |
|---|---|---|
| Full | 空间连续、路径追踪、适量缩放/辉光 | 禁止无意义循环 |
| Simplified | 位置/透明度、短路径高亮 | 移除视差、大范围缩放和弹性过冲 |
| Reduced | 静态状态 + ≤120 ms 淡化 | 移除路径流动、自动滚动动画、脉冲和惯性 |

三个等级必须产生相同功能结果和信息，不允许 Reduced 缺少定位、构建阶段或诊断原因。

## 10. 无障碍与验证

- 所有正文和重要状态按 WCAG 2.2 AA 对比度检查；
- 键盘焦点顺序与视觉层级一致；
- 颜色语义都有图标、文字、形状或线型冗余；
- 手机主操作触控目标不小于 44 px；
- 200% 缩放、长角色名、中文/英文/日文长文本进入截图检查；
- Full 与 Reduced 动效执行同一任务并比较完成时间、误操作和眩晕反馈；
- 每个组件必须检查 Default、Hover、Focus、Pressed、Disabled 和错误状态中适用的全部集合。
