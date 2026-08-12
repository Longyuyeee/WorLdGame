# WorLd Studio（工作名）产品与开发设计文档

> 状态：S0.31 图形化演出 Inspector、类型匹配资源选择与稳定 ID Directive Patch 已完成；全量、性能与真实浏览器审计已通过
> 文档基线：2026-08-10
> 当前阶段边界：产品负责人已于 2026-08-11 批准继续开发并取消 Figma 工作流；当前只实现有明确验收的 S0 代码原型，尚未宣称进入 M1 Stable 功能完成阶段。
> 当前交付边界：只规划到 M1；M2 以后保留为愿景池，不进入当前开发承诺。
> M1 发布定位：首个可正式公开发布的 Stable 版本，不是功能演示或技术预览。

WorLd Studio 的目标不是再做一个只能完成短篇 Demo 的 Galgame 制作器，而是建立一套兼顾新手、职业编剧、美术、程序、翻译和 QA 的跨平台视觉小说生产系统。

一句话定位：

**在 Windows 与 Android 上完整创作，以可视化、时间线或文本脚本编辑同一个项目，并在 M1 发布到 Web、Windows 和 Android；iOS 与云能力以后再决定。**

## 当前结论

我们不会机械拼接竞品功能。产品差异化聚焦八点：

1. **同一内容，多种视图**：场景流程图、演出时间线、文本脚本、舞台预览共享同一个语义模型，不产生两份互相漂移的数据。
2. **真正的移动端创作**：手机不是只读预览器，而是为单手操作重新设计的完整编辑端。
3. **大型项目不会被节点淹没**：全局使用“章节/场景路线图”，场景内部使用“顺序时间线/脚本”，避免把数万句对白摊成一张巨型节点图。
4. **生产级叙事 QA**：内建不可达剧情、死路、变量状态、循环、缺失资源、本地化溢出、存档兼容和路线覆盖检查。
5. **本地优先且不锁定**：工程可离线、可导出、可版本控制；脚本和清单为可读格式，核心运行时与编辑器解耦。
6. **无账户本地生产**：M1 不建设账户、云同步或云构建；Windows 本地构建 Web、Windows 和 Android，工程始终可导出、可离线恢复。
7. **多彩强动效与商业级成品并重**：编辑器采用现代图形化导演台体验，同时以专业脚本、批量生产、演出时间线和质量门禁保证作品达到商业发行标准。
8. **预算驱动的自动优化**：M1 即包含自动识别相似 CG/立绘、无损 Dicing/Delta、逐像素验证和无收益回退，并同时优化下载/安装容量、内存、加载、帧时间和长期稳定性；自动策略可解释、可验证、可回退且不覆盖源素材。

## 文档导航

| 文档 | 内容 |
|---|---|
| [调研范围与方法](docs/00-research-method.md) | 竞品范围、评价维度、证据等级与限制 |
| [竞品分析](docs/01-competitive-analysis.md) | 核心竞品、扩展竞品、用户痛点、机会地图 |
| [产品战略](docs/02-product-strategy.md) | 用户、定位、产品原则、差异化、非目标 |
| [产品需求文档](docs/03-prd.md) | 模块、优先级、用户故事和验收标准 |
| [信息架构与交互设计](docs/04-ux-architecture.md) | 桌面/平板/手机工作区及关键流程 |
| [技术架构](docs/05-technical-architecture.md) | 编辑器、IR、运行时、平台壳、同步和云构建 |
| [工程格式与脚本设计](docs/06-project-format-and-script.md) | 目录结构、稳定 ID、脚本/图形双向编辑和兼容策略 |
| [质量与发布体系](docs/07-quality-and-release.md) | 测试、性能、可访问性、安全和发布门禁 |
| [路线图与评审门](docs/08-roadmap.md) | 阶段、里程碑、退出条件与指标 |
| [待确认决策](docs/09-open-decisions.md) | 开发前必须由产品负责人确认的问题 |
| [视觉体验与商业制作基准](docs/10-visual-and-production-bar.md) | 现代多彩界面、强动效、七种编辑模式与商业成品门槛 |
| [Gal 基础系统与自动化生产规格](docs/11-gal-foundation-and-automation.md) | 全套基础配置、差分切图压缩、快进/前后退、自动路线图与画廊 |
| [容量、性能与运行稳定性优化规格](docs/12-size-performance-stability.md) | 自动优化中心、资源管线、加载/内存、弱网恢复与性能门禁 |
| [程序工程详细设计](docs/13-program-engineering-blueprint.md) | 模块/进程边界、数据契约、状态机、插件沙箱、构建链与兼容演进 |
| [工程审计与质量保证体系](docs/14-engineering-audit-and-assurance.md) | 风险分级、证据链、安全/供应链审计、测试矩阵与发布准入 |
| [D1 发现与原型计划](docs/15-d1-discovery-and-prototype-plan.md) | Figma 发现、差距分析、首批屏幕范围和阶段门 |
| [D1 视觉系统规格](docs/16-d1-visual-system.md) | 色彩、排版、密度、组件、动效和无障碍原型基线 |
| [校园 Benchmark Episode 设计](docs/17-benchmark-episode.md) | 原创校园短篇、路线、素材、Dicing 样本与商业评分表 |
| [D1 用户验证协议](docs/18-d1-validation-protocol.md) | 招募、任务、竞品对照、指标、证据和退出判定 |
| [D1 Token 冻结清单](docs/19-d1-token-manifest.md) | 92 项 Variable 的值、别名、Scope、Web/Android 语法与审计规则 |
| [S0.1 代码原型与审计记录](docs/20-s0-code-prototype.md) | 取消 Figma 后的代码原型决策、首个共享语义切片、验收证据与下一步 |
| [S0.2 脚本往返与审计记录](docs/21-s0-script-roundtrip.md) | `.world` 容错 CST、未知命令保留、稳定 ID、诊断与属性测试 |
| [S0.3 脚本事务与审计记录](docs/22-s0-script-source-transaction.md) | 草稿/已提交 CST 隔离、幂等命令、ChangeSet 与 Undo/Redo 边界 |
| [S0.4 稳定 ID 与投影审计](docs/23-s0-stable-id-projection.md) | 对白双 ID、演出语句 ID 与 CST → StoryScene 拒绝式投影 |
| [S0.5 稳定 ID 局部 Patch 审计](docs/24-s0-stable-id-local-patch.md) | Writer 对白命令局部修改权威 CST、字节保留与冲突保护 |
| [S0.6 结构 Patch 与 UI 准入审计](docs/25-s0-structural-patch-and-ui-gate.md) | 对白 Insert/Delete/Move、Tombstone、注释保护及 S0.7 UI 测试门 |
| [S0.7 Script UI 原型与审计](docs/26-s0-script-ui-prototype.md) | 权威脚本事务、Writer/Preview 投影、错误草稿隔离、桌面与手机浏览器证据 |
| [S0.8 输入批次、IME 与性能审计](docs/27-s0-input-ime-performance.md) | 事务批次边界、组合输入安全、键盘工作流、10k 句大文本性能门 |
| [S0.9 本地保存、WAL 与恢复审计](docs/28-s0-local-save-wal.md) | 项目快照、SHA-256、两阶段 WAL、崩溃故障矩阵与 IndexedDB 刷新恢复 |
| [S0.10 平台存储契约审计](docs/29-s0-platform-storage-contract.md) | 适配器能力/错误语义、Windows 文件系统参考实现与 Android 私有工作区边界 |
| [S0.11 Web 单写者租约审计](docs/30-s0-single-writer-lease.md) | IndexedDB 原子租约、fencing token、双窗口冲突闸门与平台边界 |
| [S0.12 安全自动保存与备份审计](docs/31-s0-safe-autosave-backup.md) | 串行自动保存、固定槽备份、配额降级和可逆恢复 UX |
| [S0.13 项目格式迁移与未来版本只读审计](docs/32-s0-schema-migration-readonly.md) | schema 0→1 原始归档、故障安全迁移、未知字段保留、旧备份兼容与只读闸门 |
| [S0.14 预览画布尺寸 Profile 审计](docs/33-s0-preview-viewport-profiles.md) | 默认 16:9、五种生产预设、自定义宽高、真实比例与桌面/手机几何验证 |
| [S0.15 Preview 运输状态机审计](docs/34-s0-preview-transport.md) | 逐步前后退、五档测试倍率、可取消定时器、选择/错误/结局停止点与手机控制条 |
| [S0.16 内容寻址资源与 Blob 安全契约审计](docs/35-s0-content-addressed-assets.md) | SHA-256 不可变 Blob、稳定资源索引、精确去重、损坏/缺失/孤儿审计与 Node 参考适配器 |
| [S0.17 Web 资源原子导入审计](docs/36-s0-atomic-web-asset-import.md) | IndexedDB schema 2、Blob+Index fenced 原子事务、真实 File 进度/取消、刷新恢复与手机资源面板 |
| [S0.18 不可信媒体 Inspection Gate 审计](docs/37-s0-untrusted-media-inspection.md) | 魔数/MIME/Kind 一致性、像素/时长预算、SVG 隔离、字体边界、Worker 检查与写前拒绝 |
| [S0.19 资源血缘、保留与两阶段回收审计](docs/38-s0-asset-lineage-lifecycle.md) | Source/Derivative DAG、保护根、隔离、可恢复 Trash、备份失效安全锁定与性能门 |
| [S0.20 备份资源根与确定性派生任务审计](docs/39-s0-backup-roots-derivative-jobs.md) | checksummed Asset Index 快照、崩溃一致对账、精确 GC 准入与幂等 Sidecar 派生任务 |
| [S0.21 备份一致恢复与隔离缩略图审计](docs/40-s0-restore-intent-thumbnail-worker.md) | 持久恢复意图、启动续作、旧备份降级语义、无主线程回退的缩略图 Worker 与原子血缘发布 |
| [S0.22 无损 Dicing 候选分析审计](docs/41-s0-lossless-dicing-analysis.md) | 隔离 RGBA 解码、跨图精确块去重、逐字节重建、可解释成本模型与无收益回退 |
| [S0.23 自动 Dicing 分组与去重成本审计](docs/42-s0-dicing-group-discovery.md) | 非零块相似度、严格全成员聚类、反传递误合并、源去重感知收益与分组级报告 |
| [S0.24 Atlas 与安全回退契约审计](docs/43-s0-dicing-atlas-contract.md) | 确定性多页排布、Padding/Extrusion、严格 Manifest/Page 校验、逐字节重建与 Original 回退 |
| [S0.25 Atlas 原子发布与血缘审计](docs/44-s0-atomic-dicing-atlas-publication.md) | Worker 产物复验、Plan 摘要绑定、fenced 多 Blob 事务、Page/Manifest 血缘与幂等 Build Root |
| [S0.26 Atlas 无损 PNG 与编码后复决策审计](docs/45-s0-encoded-dicing-atlas-decision.md) | Worker PNG 往返验证、唯一源 Blob 成本、实际发布字节复算、无收益不发布与 PNG 血缘 |
| [S0.27 Atlas Runtime Loader 与安全回退审计](docs/46-s0-dicing-runtime-loader.md) | Build Root 解析、受控 PNG 解码、当前源身份绑定、逐字节重建、预算回退与 Original 兜底 |
| [S0.28 Runtime 资源调度与内存纪律审计](docs/47-s0-runtime-resource-scheduling.md) | 优先级队列、解码并发上限、请求合并、引用保护、LRU、低内存清理与取消语义 |
| [S0.29 Story Graph 资源预测与切场景生命周期审计](docs/48-s0-story-resource-prediction.md) | 显式场景资源清单、分支公共预取、epoch 取消、两阶段切换、回滚/画廊引用与压力降级 |
| [S0.30 类型化演出资源清单编译审计](docs/49-s0-typed-resource-manifest-compiler.md) | asset/transitionAsset、背景/立绘/语音/BGM、语句窗口、Asset Index 校验、语义漂移与禁止猜测 |
| [S0.31 图形化演出 Inspector 与 Directive Patch 审计](docs/50-s0-graphical-direction-inspector.md) | 类型匹配资源选择、过渡/表情/位置/音轨参数、旧描述显式迁移、稳定 ID 局部事务与 Undo/Redo |
| [调研来源](docs/sources.md) | 官方文档、源码仓库、演示与社区反馈 |

## 开发启动门槛

S0 的可抛弃代码原型已获批准，用于完成下列证据；以下条件全部满足后，才允许把候选方案冻结为 M1 正式工程：

- 产品定位和首要用户已确认；
- P0 范围已冻结；
- 工程格式与脚本语义完成评审；
- 程序模块边界、核心契约、失败语义与工程不变量完成评审；
- 工程审计制度、风险分级、证据归档和发布职责完成评审；
- Windows、Android、Web 的最小技术验证方案已批准；
- 原型完成至少 5 名目标用户的任务测试；
- 里程碑 M1 的验收标准、排除项和时间预算已确认；
- 用户明确发出“开始开发”的指令。
## 文档约定

- “编辑器”指创作者使用的应用。
- “运行时”指最终游戏中解释剧情、保存状态和渲染演出的组件。
- “工程”指可继续编辑的源项目。
- “发布包”指面向玩家的目标平台产物；M1 仅指 Web/Windows/Android，iOS 属于未排期愿景。
- 功能优先级采用 P0（M1 正式首发必需）、P1（首发后的规模化生产增强）、P2（生态扩展）。
