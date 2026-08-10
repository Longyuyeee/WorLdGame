# D1 发现与交互原型计划

> 状态：Phase 0 候选基线，等待产品负责人批准。
> Figma 文件：[WorLd Studio — D1 Interaction Prototype](https://www.figma.com/design/WfeAzd4cTv1E2KEUkDiPmF)
> 边界：本阶段只做研究、设计系统、可点击/可播放原型和用户验证，不创建产品代码。

## 1. D1 要证明什么

D1 不以“画出几张好看的编辑器界面”为完成。它必须用真实长度内容证明：

1. 新手能够理解 Route、Sequence、Script、Stage 是同一故事的四种视图；
2. 专业用户能保持高密度生产，不被动画、面板或向导拖慢；
3. Windows、平板和手机不是同一界面的机械缩放；
4. 七种模式切换时保持同一场景、语句、对象和运行上下文；
5. 诊断、恢复、构建失败和优化建议可以被普通创作者理解和处理；
6. 多彩语义系统在不依赖颜色的情况下仍能表达内容类型与状态；
7. 强动效确实解释空间、因果和运行同步，并能被打断或减少；
8. 原型信息架构不阻碍后续 10 万行脚本、10k Route 节点和低端设备目标。

## 2. Phase 0 发现结果

### 2.1 仓库与实现状态

| 项目 | 发现 | 结论 |
|---|---|---|
| 产品代码 | 仓库只有 Markdown 设计文档 | 无 Code Connect、现成组件或实现 Token；文档是当前唯一产品真相 |
| Figma | 新文件只有一个空白 Page，无变量、样式或组件 | 可以建立干净系统，但必须从 Token 开始，不能直接画散装页面 |
| 字体 | Figma 可用 Noto Sans SC/JP/KR、IBM Plex Sans/Mono 等 | D1 可用真实 CJK 文本；字体方案仍需产品负责人批准 |
| Figma 计划 | Starter，变量集合的模式能力受限 | D1 先建立深色正式主题；浅色主题保留为后续同等级设计，不伪造多模式 |
| 目标设备 | 设备类别已确认，具体型号和预算未冻结 | D1 使用逻辑画板；S0 前再映射真实设备和性能预算 |
| 品牌 | “WorLd Studio”仍是工作名 | 原型使用工作名，不生成不可逆品牌资产 |
| 动效能力 | Figma Motion 功能标志尚未验证 | 静态系统先行；进入动效阶段时单独验证，失败则停止 Motion API 工作并报告 |

### 2.2 设计库检查

新文件可访问 Material 3 Design Kit 与 Simple Design System。

| 资源 | 可复用部分 | 不直接复用的原因 | 决策 |
|---|---|---|---|
| Material 3 | Android 触控尺寸、Text Field、基础 Button、移动导航结构 | 视觉语言偏通用消费应用，无法表达专业叙事语义和桌面高密度 | 作为移动交互与无障碍参照，不作为品牌外观 |
| Simple Design System | 基础图标、常规 Button/Input 的结构参考 | 令牌和组件 API 不包含 Route、Timeline、Stage、Diagnostics | 优先复用图标；常规控件按兼容性决定复用或包装 |
| Apple UI Kits | 当前文件可访问 | iOS 不属于 M1 | D1/M1 不使用，避免范围漂移 |
| WorLd 专用系统 | 当前不存在 | 必须覆盖语义色、多视图、路线、时间线、Dicing 与构建 | 自建 Token 与核心专业组件 |

### 2.3 Code Connect 与现有屏幕检查

- 仓库没有产品实现或 `*.figma.*` 文件，Code Connect 检查记为 N/A；
- Figma 文件为空，现有屏幕复用检查记为 N/A；
- D1 阶段禁止为了满足 Code Connect 人为创建产品代码；
- M1 实现开始后，再将批准的组件 API 与实际代码逐项连接。

## 3. 原型统一上下文

所有屏幕使用[校园 Benchmark Episode](17-benchmark-episode.md)中的同一工程，避免每张图使用互不相关的假数据。

统一定位状态：

- 项目：`after-school-signal`；
- 章节：`ch02 / 放送室`；
- 场景：`sc_broadcast_room`；
- 当前语句：`st_02_0147`；
- 当前角色：夏遥，表情 `hesitate`；
- 当前路线：公共线即将进入“公开播放/私下寻找”分支；
- 当前变量：`tape_repaired=true`、`clue_count=2`、`trust_xiayao=3`；
- 当前诊断：一个英文文本溢出警告、一个不可达回收分支错误；
- 当前资源预算：Dicing 候选 18 张，预计净节省 41%，移动端峰值内存接近软预算。

切换模式或设备时，这些 ID 与状态保持不变。

## 4. 画板与断点

| 类别 | 逻辑尺寸 | 用途 | 说明 |
|---|---:|---|---|
| Desktop | 1440 × 960 | Windows 主工作区 | 验证专业密度、停靠区和底部工具面板 |
| Tablet Portrait | 800 × 1280 | Android 平板 | 验证双栏/单栏切换与触控笔路径 |
| Mobile | 393 × 852 | Android 手机 | 验证单任务、底部 Sheet、键盘和安全区 |
| Motion Review | 1280 × 720 | 动效导出 | 降低导出成本并保持关键文字可读 |

这些是 D1 逻辑画板，不等于最终目标设备；具体设备在 S0 前冻结。

## 5. 原型屏幕范围

### 5.1 Wave A：最高风险闭环

| ID | 画板 | 模式/任务 | 必须展示 |
|---|---|---|---|
| D-A01 | Desktop | Writer | 项目树、对白流、角色/术语、即时预览、脏状态和诊断 |
| D-A02 | Desktop | Flow | 两级 Route、局部分支、条件摘要、路径追踪、覆盖与不可达诊断 |
| D-A03 | Desktop | Director | Stage、Sequence、多轨时间线、关键帧、波形、Inspector |
| D-A04 | Desktop | Debug & QA | 运行预览、当前语句、变量、调用栈、诊断来源和影响路径 |
| D-A05 | Desktop | Optimization + Build | 容量/内存预算、Dicing 对比、应用/回退、五阶段构建和错误解释 |
| M-A01 | Mobile | Writer | 单列对白、连续录入、键盘工具栏、上一条/下一条和自动保存 |
| M-A02 | Mobile | Flow | 场景列表、局部分支、“连接到……”替代拖线、路径按钮 |
| M-A03 | Mobile | Stage + Preview | 画布、底部控制条、精确 Sheet、即时预览和变量抽屉 |

Wave A 通过内部走查后，才能进入 Wave B。

### 5.2 Wave B：范围覆盖

| ID | 画板 | 模式/任务 | 必须展示 |
|---|---|---|---|
| D-B01 | Desktop | Production | Utage 式批量表格、本地化、配音映射、状态列和批量审核 |
| D-B02 | Desktop | Quick Start | 校园短篇模板、渐进字段、可预览演出预设和退出新手模式 |
| D-B03 | Desktop | Build Failure | SDK/签名/资源错误、人类语言解释、定位、修复和局部重跑 |
| T-B01 | Tablet | Director | 65/35 双栏、Drawer、触控笔选择和底部 Sheet 回退 |
| M-B01 | Mobile | Project Transfer | 本地导入导出、构建配置编辑、Windows 构建交接和离线状态 |
| M-B02 | Mobile | QA + Recovery | 诊断详情、自动修复预览、误删恢复和快照状态 |

## 6. 首批组件范围

Phase 1/2 建立基础后，Phase 3 按依赖顺序创建：

1. `Icon` 与 `IconButton`；
2. `Button`；
3. `ModeTab` 与 `ViewTab`；
4. `StatusBadge` 与 `SemanticChip`；
5. `PanelHeader` 与 `InspectorField`；
6. `NavigationItem` 与 `SceneTreeItem`；
7. `DialogueBlock`；
8. `RouteNode` 与 `RouteEdgeLegend`；
9. `TimelineClip` 与 `KeyframeMarker`；
10. `DiagnosticRow`；
11. `BudgetBar` 与 `OptimizationProposal`；
12. `BuildStage`；
13. `MobileBottomNav` 与 `BottomSheetHeader`。

不在首批组件中创建完整数据表、代码编辑器、波形渲染器或节点画布引擎；D1 只定义它们的视觉和交互契约。

## 7. 六组强动效原型

| ID | 动效 | 完整方案 | 减少动效方案 | 验证问题 |
|---|---|---|---|---|
| MOT-01 | Route 连线 | 目标吸附、因果路径流动后收敛，300–520 ms | 120 ms 颜色/线型确认 | 用户是否理解连接方向与影响范围 |
| MOT-02 | 四视图切换 | 当前语句锚点保持，内容形态连续转换，280–360 ms | 交叉淡化 ≤120 ms | 用户是否理解是同一内容而非复制 |
| MOT-03 | Stage 操控 | 对象、吸附线、轨迹、时间线块同步，输入实时 | 去除惯性/缩放，只保留吸附提示 | 动画是否妨碍精确拖动和撤销 |
| MOT-04 | 实时预览 | Script/Sequence/Stage 同步脉冲和滚动定位，180–300 ms | 直接定位 + 静态当前标记 | 当前执行语句是否始终明确 |
| MOT-05 | QA 路径 | 变量来源、条件和受影响结局分段追踪，400–700 ms | 分步高亮，无路径流动 | 用户能否解释错误原因而非只看到红色 |
| MOT-06 | 构建过程 | 校验—编译—优化—签名—打包真实推进，可展开日志 | 无位移动画，仅进度与状态文字 | 用户能否定位失败阶段并继续工作 |

所有动画必须允许输入打断；动画播放中仍可保存、撤销、切换和打开诊断。

## 8. Phase 0 差距与建议

| 差距/风险 | 影响 | 建议 | 冻结阶段 |
|---|---|---|---|
| 无实现 Token | Figma 暂无代码真相可对齐 | D1 Token 成为候选规范，M1 开发前转成平台中立 Token 文件 | D1/S0 |
| 字体未定 | CJK 密度和字符宽度会改变布局 | UI 使用 Noto Sans SC，脚本/ID 使用 IBM Plex Mono；日英使用对应 Noto 回退 | Phase 0 批准 |
| Starter 单模式限制 | 无法在一个集合中完整演示深/浅模式 | D1 只冻结深色正式主题；浅色主题后续另做同等级审计 | D1 |
| 现成库过于通用 | 容易做成普通 Material 后台 | 只复用基础图标/结构，核心专业组件自建 | Phase 0 批准 |
| Benchmark 细节未定 | 原型内容可能漂移 | 采用文档17的单一候选故事，批准后所有画板共用 | Phase 0 批准 |
| 精确目标机未定 | 原型无法声称性能完成 | D1只验证触控/密度；S0真机冻结性能预算 | S0 前 |
| Motion API 未验证 | 可播放动效存在工具风险 | 动效阶段先做功能标志检查；不可用则停止并报告，不以静态图冒充通过 | Motion 阶段 |
| 无真实参与者名单 | 无法完成用户证据 | 按文档18招募5名创作者和5名玩家，记录同意与匿名ID | D1 测试前 |

## 9. Phase 0 批准点

产品负责人已确认总体视觉方向：现代化、极简、动效丰富、过渡平滑、色彩丰富、表达清晰。下列批准点用于冻结实现这一方向的具体方案，而不是重新选择视觉路线。

进入 Figma Foundations 前，产品负责人需要批准或修改：

1. Wave A/Wave B 屏幕清单；
2. 深色主题优先及字体建议；
3. “核心组件自建、基础图标优先复用”的策略；
4. 校园 Benchmark Episode 候选故事；
5. D1 用户验证样本与门槛；
6. 动效功能不可用时必须暂停报告，而不是降格为静态验收。

批准 Phase 0 仅允许创建 Figma Token、样式、组件和原型，不允许产品编码。
