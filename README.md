# WorLd Studio（工作名）产品与开发设计文档

> 状态：S0.41 保留为 Web 技术证据原型；2026-08-13 起执行产品落地主线，D1、S0、M1 均未通过
> 文档基线：2026-08-24
> 当前阶段边界：N31 Engineering 已完成 VM-01–VM-15 `15/15`；N32-E1–E7 已把 Editor Preview 接到正式 Compiler/Runtime，并提取共享 portable Runtime Host。N40-E1–E8l 已建立 Compiler Route Map、10k/64 有界窗口、Layout/分组/过滤、Runtime History 路线高亮、`<500 ms` 局部编辑、trusted Route-first、局部 Script/Sequence 保存、narration 最小结构闭环、scene/layout topology 分页与指定结局候选路线审阅。当前仍缺诊断定位、目标导航、Route 驱动修复闭环、完整 Sequence/Stage/正式 Player 与真人产品验收；N40 Product Acceptance、N41+、M1 与发布仍被阻断。后续按[功能优先复审](docs/175-n40-function-first-development-reaudit.md)先补 Route 用户闭环，不继续优先扩张平台层。
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
| [当前开发状态审计](docs/99-current-development-status-audit.md) | 当前真实代码、能力、阻断项与下一步 |
| [N32-E7 共享 Runtime Host 审计](docs/150-n32-e7-shared-runtime-host-audit.md) | 共享 Host、跨宿主 Golden、验收工程纠偏与实测证据 |
| [N32 Engineering 出口复审](docs/151-n32-engineering-exit-reaudit.md) | N32 六项实现与 Acceptance 的最新 fail-closed 判定 |
| [N40-E1 Canonical Route Graph 审计](docs/153-n40-e1-route-graph-core-audit.md) | Compiler 图事实、Project Service 改名、跨视图同步、production browser 与剩余 N40 阻断 |
| [N40-E2 10k Branching Route 审计](docs/154-n40-e2-10k-route-window-audit.md) | 真实 10k 分支 Golden、性能预算、64 节点有界窗口、UI 分页与诚实按需边界 |
| [N40-E3 Canonical Layout Sidecar 审计](docs/155-n40-e3-route-layout-sidecar-audit.md) | Canonical 坐标、Project Service 写回、自动重建、剧情隔离与真实工程重开 |
| [N40-E4 Route Workspace 交互审计](docs/156-n40-e4-route-layout-interaction-audit.md) | 分组/折叠、视口、拖拽与键盘/触控移动、持久化复核及剩余 N40 边界 |
| [N40-E5 P0 Route 过滤审计](docs/157-n40-e5-route-filtering-audit.md) | 章节/节点类型/视觉分组组合过滤、64 节点有界窗口、P0/P1 纠偏与待复验状态 |
| [N40-E6a 宿主选择性读取审计](docs/158-n40-e6a-selective-project-read-audit.md) | Web/Node 按路径读取、安全边界、真实磁盘/句柄证据，以及尚未接入 Route 的诚实边界 |
| [N40-E6b 工程源文件 Inventory 审计](docs/159-n40-e6b-project-file-inventory-audit.md) | 无正文 path/size/modified 清单、真实磁盘与链接安全、缓存失效提示及 E6c/E6d 纠偏顺序 |
| [N40-E6c 可校验 Compiler 缓存审计](docs/160-n40-e6c-verified-compiler-cache-audit.md) | 派生目录隔离、版本/源 Hash/完整性校验、增量命中、篡改全量回退与尚未接入产品的边界 |
| [N40-E6d Launcher / Route 缓存接入审计](docs/161-n40-e6d-launcher-route-cache-integration-audit.md) | 工程打开/保存缓存生命周期、Route 正式结果复用、状态可观察、内存降级与 browser 待复验边界 |
| [N40-E6e–E8k 最新 Route 工程审计](docs/174-n40-e8k-trusted-route-topology-page-audit.md) | 局部编辑、Runtime 路线高亮、Route-first 内容编辑、全局索引、narration 闭环与 topology 分页的最新证据 |
| [N40 功能优先开发复审](docs/175-n40-function-first-development-reaudit.md) | 当前真实能力、剩余 Route P0 功能、方向纠偏和 E8l–E8n 用户闭环计划 |
| [N40-E8l 指定结局路线审阅](docs/176-n40-e8l-ending-route-review-audit.md) | 确定性候选路线、循环/悬空/不可达边界、跨 64 节点定位、10k 与 desktop/mobile production 实测 |
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
| [S0.32 实时舞台媒体执行与生命周期审计](docs/51-s0-live-stage-media-runtime.md) | 累积背景/角色/音频状态、已验证 Blob、可取消加载、Object URL/音频释放、回退重建与安全占位 |
| [S0.33 可逆舞台状态控制与多层演出审计](docs/52-s0-stage-state-controls.md) | 多角色 slot/z-order、背景 clear、音频 play/stop/pause/resume、累计资源窗口、Inspector 与无重载恢复 |
| [S0.34 图形化演出轨道与安全指令插入审计](docs/53-s0-graphical-stage-track.md) | BG/CHAR/AUDIO/STORY 四轨、类型化插入面板、choice/end 锚点、快捷键、稳定 ID、Undo/Redo 与触控滚动 |
| [S0.35 演出 Cue 安全删除与重排审计](docs/54-s0-stage-cue-editing.md) | Directive 删除/移动、拖放/键盘/触控等价操作、可恢复 tombstone、choice/end 边界与 schema v2 归档迁移 |
| [S0.36 演出 Cue 无损复制、多选与原子批量编辑审计](docs/55-s0-stage-cue-batch.md) | 原始 Directive 行无损复制、桌面/手机显式多选、同命令参数 all-or-nothing 批次、256 条上限与单步 Undo |
| [S0.37 批量预检与选择反馈审计](docs/56-s0-batch-preflight-selection-feedback.md) | 权威只读预检、场景步骤范围、选择同类/清空、修改/一致/冲突摘要、空 revision 防护与移动端反馈 |
| [S0.38 范围选择、整轨筛选与大场景性能审计](docs/57-s0-range-lane-selection.md) | Shift+Space/点击范围、触屏首尾填充、BG/CHAR/AUDIO 整轨选择、快捷键锁定、256 上限与 10k Cue 性能门 |
| [S0.39 演出轨道 64 步渲染窗口审计](docs/58-s0-stage-render-window.md) | 轨道/剧情卡片共享窗口、稳定分页、当前步骤定位、窗口外选择保留、拖放边界与 10k 场景性能门 |
| [S0.40 场景搜索与窗口感知跳转审计](docs/59-s0-stage-search-jump.md) | 步骤号/稳定 ID/文本搜索、确定性排序、草稿隔离、结果上限、焦点迁移与 10k 场景性能门 |
| [S0.41 全工程搜索与跨场景跳转审计](docs/60-s0-project-search.md) | 场景/稳定 ID/内容全局搜索、分组结果、Canonical 草稿隔离、原子跨场景定位与 100k 步性能门 |
| [S0 收口与方向纠偏审计](docs/61-s0-closure-course-correction.md) | 冻结 S0.41、偏移复盘、剩余风险登记、五波收口路线与强制阶段门 |
| [CL-01 目标设备矩阵与预算冻结](docs/62-cl01-target-device-budget.md) | Windows/Android/Web 支持档位、帧时间、内存、容量预算与实体设备取证门 |
| [S0 Claim / Evidence 登记表](docs/63-s0-claim-evidence-register.md) | CL-01–CL-12 的状态、Owner、阈值、证据、依赖与更新纪律 |
| [CL-02 Android 编辑壳可靠性证据契约](docs/67-cl02-android-editor-shell-evidence-contract.md) | Capacitor/最小 WebView 对照、私有工作区、SAF、IME、进程死亡、安全、真机预算与停止条件 |
| [CL-03 Windows 编辑器壳选型证据契约](docs/65-cl03-windows-shell-evidence-contract.md) | Electron/Tauri 同切片、安全边界、WebView2 分发、WAL/更新故障、WIN-L 预算与 ADR 停止条件 |
| [CL-04 Narrative VM 确定性证据契约](docs/64-cl04-narrative-vm-evidence-contract.md) | Runtime State、Step/Effect/Save、回滚前进、快进、Barrier、State Hash 与三宿主通过门 |
| [当前开发状态快照](docs/66-current-development-status.md) | 已完成设计与 Web 原型、尚未证明的 M1 能力、CL 阶段门、工程规模与修正后开发顺序 |
| [产品落地能力审计](docs/88-product-delivery-audit.md) | 特色功能、P0 模块、27 条 M1 验收与当前代码的逐项差距 |
| [游戏引擎产品落地开发计划](docs/89-engine-product-delivery-plan.md) | 从通用工程、创作闭环、Compiler/Runtime 到三端构建、验收作品和 Stable 发布的节点计划 |
| [M1 需求与验收追踪矩阵](docs/90-m1-requirement-traceability.md) | USP、P0、AC-01–AC-27 的节点、状态、阻塞项和完成证据权威表 |
| [N00 产品主线与仓库基线审计](docs/91-n00-product-baseline-audit.md) | Workspace 分类、owner/依赖白名单、计划产品边界、干净环境 CI 与完整检查证据 |
| [N01 需求追踪与 Golden 基线审计](docs/92-n01-requirement-golden-baseline.md) | 50 项 M1 owner/节点/证据机器门、七类 Golden Seed、PR 追踪纪律与每周空目录演示 |
| [N10 Canonical Project Schema 审计](docs/93-n10-canonical-project-schema.md) | 正式 project-domain、`.world` v1 多文件格式、稳定 ID、未知字段保留、S0/Golden 迁移和双工程 round-trip |
| [N11 Project Service 与事务命令审计](docs/94-n11-project-service.md) | 全实体事务命令、Revision/ChangeSet、批处理、Undo/Redo、引用冲突、提交保存门和 SourceSession 适配 |
| [N12 项目首页与文件生命周期审计](docs/95-n12-project-lifecycle.md) | 真实项目入口、Web/Windows 目录、最近引用、确定性 ZIP、外部变更与冲突边界 |
| [N13 章节、场景、角色和变量管理审计](docs/96-n13-entity-management.md) | 故事骨架管理、类型化实体、引用分析/迁移、非拖拽排序、真实保存重开 |
| [N20 Story Language P0 审计](docs/97-n20-story-language-p0.md) | 完整 P0 CST/AST、安全表达式、语言服务、通用稳定 ID Patch 与 100k 增量门 |
| [N21 最小 Writer/Sequence 编辑审计](docs/98-n21-writer-sequence.md) | 全部 P0 卡片、类型化 Inspector、原子批量事务、键盘/触屏等价与用户任务门 |
| [当前开发情况审计（N22 工程门后）](docs/99-current-development-status-audit.md) | 当前真实能力、P0 缺口、`0/27` 验收、Draft PR 集成风险与 N23 严格门禁 |
| [N21 真人验收临时风险接受](docs/100-n21-human-validation-risk-acceptance.md) | 真人暂不可用时的单节点例外、补偿控制、自动到期与 N23/M1 发布阻断 |
| [M1 N21 指定集成基线](docs/101-m1-n21-integration-baseline.md) | N00–N21 冻结祖先链、指定权威分支、整合 PR 和 N22 分支准入 |
| [N22 Stage 几何与安全区审计](docs/102-n22-stage-geometry-safe-area.md) | 角色 X/Y、缩放、旋转、锚点、层级、安全区与 N22 剩余阻断 |
| [N22 Stage DPR 与触摸选择审计](docs/103-n22-stage-dpr-touch-selection.md) | 设计像素/DPR 安全映射、触摸命中、键盘等价选择、跨视图同步与剩余 Golden 阻断 |
| [N22 Preview 媒体宿主安全审计](docs/104-n22-preview-media-host-safety.md) | 快速切场景 generation 隔离、解码失败分层回退、Object URL 释放矩阵与剩余宿主/Golden 阻断 |
| [N22 Render Host 边界审计](docs/105-n22-render-host-boundary.md) | Render Frame v1、视觉层与 DOM Overlay 分离、背景/角色平面、负 z 修复及 Canvas/Pixi 后端边界 |
| [N22 Media Golden Runtime 审计](docs/106-n22-media-golden-runtime.md) | 真实 PNG/WAV 物化、检查、导入、保存重开、预览加载与 URL 释放 |
| [N22 浏览器 Media 与视觉 Golden 审计](docs/107-n22-browser-media-visual-golden.md) | 浏览器真实导入、保存重开、16:9/9:16 媒体与视觉证据 |
| [N22 Canvas 2D 渲染后端审计](docs/108-n22-canvas-render-backend.md) | Canvas 主后端、DOM Overlay/命中代理分离与安全回退 |
| [N22 Stage Move 基础过渡审计](docs/109-n22-stage-move-transition.md) | Move 槽位继承、插值、沉降、回退与浏览器证据 |
| [N22 Stage Hide 基础退出过渡审计](docs/110-n22-stage-hide-transition.md) | Hide/Fade 退出、无障碍失活、回退与视觉证据 |
| [N22 Stage Show 单语句生命周期审计](docs/111-n22-stage-show-transition-lifecycle.md) | 角色层 Show 入场、下一语句沉降、回退与浏览器证据 |
| [开发暂停与换机接续审计](docs/112-development-handoff-2026-08-14.md) | N22 候选时点的分支、证据、CI 与接续边界历史快照 |
| [N22 最小 Stage 与媒体预览退出条件审计](docs/113-n22-exit-condition-audit.md) | 逐项需求对齐、真实 WAV 播放补证、工程门结论与 N23 阻断 |
| [N21 真人产品验收执行包](docs/114-n21-human-validation-execution-kit.md) | 冻结 20 分钟任务、参与者/主持人边界、结构化证据、通过失败与风险关闭规则 |
| [可运行流程审计与验收顺序纠正](docs/115-playable-flow-order-correction.md) | 真实代码断点、最小可运行流程、N21/N23 重排、逐节点完成定义与剩余缺口 |
| [N23-E2 空工程可运行闭环审计](docs/116-n23-e2-blank-project-flow-audit.md) | 空工程创作、Canonical 保存桥、资源演出、关闭重开、双路线 Golden 与下一阻断 |
| [N23-E3 自包含资源工程 ZIP 审计](docs/117-n23-e3-portable-resource-bundle-audit.md) | Canonical 文档、Asset Index 与源 Blob 同包迁移、原子恢复、新工作区运行重开与诚实边界 |
| [N21 真人验收就绪预演审计](docs/118-n21-human-readiness-rehearsal-audit.md) | 空工程 T02 非法引用阻断、角色/变量/资源前置门、协议重对齐与 pending 真人边界 |
| [N23-E4 独立单文件试玩 Web 审计](docs/119-n23-e4-independent-playable-web-audit.md) | 当前工程到自包含离线 HTML、确定性产物、双路线可执行证据与正式 Build 边界 |
| [N23-E5 五分钟内容审计](docs/120-n23-e5-five-minute-content-audit.md) | 五分钟内容量模型、两条 300 秒以上路线、无 Wait 灌水与产品入口 |
| [N23 双参与者产品验收执行包](docs/121-n23-product-acceptance-execution-kit.md) | 两名非实现者、编辑器/独立 HTML 双路线、Severity 与哈希证据门 |
| [N23-E7 一键验收启动器审计](docs/122-n23-e7-acceptance-launcher-audit.md) | Windows 双击启动、锁定依赖、生产构建、固定本地 origin 与真实 HTTP 烟测 |
| [N30-E1 Project Compiler 最小内核审计](docs/123-n30-e1-project-compiler-audit.md) | 正式 portable Compiler、Runtime IR v1、Source Map/Catalog、结构诊断、确定性 Golden Hash 与 N31 阻断 |
| [N30-E2 Project Compiler 工程退出审计](docs/124-n30-e2-compiler-completion-audit.md) | 语句级 CFG/SCC、场景增量缓存、完整 Catalog、Debug/Release、发布输入和 N30 工程退出边界 |
| [N30 退出与真人门交接审计](docs/125-n30-exit-human-gate-handoff-audit.md) | N30 远端退出证据、N21/N23 验收就绪复验、N31 阻断与解锁顺序 |
| [N31-E1 正式 Runtime 最小内核审计](docs/126-n31-e1-runtime-kernel-audit.md) | Compiler IR 消费、版本化 State、确定控制流、停点事件、受限例外与后续缺口 |
| [N31-E2 Runtime 确定状态基础审计](docs/127-n31-e2-runtime-deterministic-state-audit.md) | canonical State Hash、确定 PRNG、Scene/Audio/Meta State、Node/真实 Web Worker 固定向量 |
| [N31-E3 Runtime Effect/Barrier 审计](docs/128-n31-e3-runtime-effect-barrier-audit.md) | Effect Intent、awaited/detached、completion/cancel receipt、Barrier 批准、Node/真实 Web Worker 向量 |
| [N31-E4 Runtime Save/Load 审计](docs/129-n31-e4-runtime-save-load-audit.md) | canonical Save、版本/Build/State Hash 拒绝、pending Effect 无副作用恢复、Node/真实 Web Worker 向量 |
| [N31-E5 Runtime History 审计](docs/130-n31-e5-runtime-history-audit.md) | canonical checkpoint/entry、Back/Forward、原子分支截断、tombstone、Barrier 阻断与诚实持久化边界 |
| [N31-E6 Runtime Scheduler 审计](docs/131-n31-e6-runtime-scheduler-audit.md) | Normal/Auto/Skip Read/Skip All/Instant、预算让步、停止边界与跨 Worker Golden |
| [N31-E7 正式 Runtime Generated Corpus 审计](docs/132-n31-e7-runtime-generated-corpus-audit.md) | 10,000 seeds、20,000 次重放、七类场景、0 failures 与 Node/真实 Worker 同摘要 |
| [N31-E8 Runtime Source Map 诊断审计](docs/133-n31-e8-runtime-source-map-diagnostics-audit.md) | fail-closed Source Map、Diagnostic → Statement ID/Index 与跨 Worker 固定向量 |
| [N31-E9 Runtime Engineering 出口审计](docs/134-n31-e9-runtime-engineering-exit-audit.md) | VM-01–VM-15 逐项矩阵、出口未通过判定，以及 E10–E14 修复顺序 |
| [N31-E10 正式 VM Parity 审计](docs/135-n31-e10-formal-vm-parity-audit.md) | VM-02/03/07/08/12/15 正式向量、Story Outcome Hash、History reconciliation 与真实 Worker Golden |
| [当前开发情况综合审计（2026-08-16）](docs/136-current-development-audit-2026-08-16.md) | 当前真实代码、可运行闭环、需求门、正式引擎缺口、GitHub 集成风险与 E11–E14 严格顺序 |
| [CL-04 Narrative VM 语义核 Spike 01 审计](docs/68-cl04-vm-kernel-spike-01.md) | 六个纯 Opcode、精确 IR/State、canonical SHA-256、VM-01 Golden、证据包与诚实缺口 |
| [CL-04 Narrative VM 调用、随机与逻辑等待 Spike 02 审计](docs/69-cl04-vm-kernel-spike-02.md) | call/return、64 层调用栈、xorshift32、逻辑 tick、VM-02/03 Golden 与恢复边界 |
| [CL-04 Narrative VM Choice 与外部输入 Spike 03 审计](docs/70-cl04-vm-choice-input-spike-03.md) | 显式 execution、确定请求 token、严格输入匹配、幂等 receipt、恢复校验与 Save/History 顺序 |
| [CL-04 Narrative VM History、Back/Forward 与 Fork Spike 04 审计](docs/71-cl04-vm-history-spike-04.md) | 独立 Runtime Session、完整边界 checkpoint、VM-04/05、原子分叉、输入 tombstone 与诚实限制 |
| [CL-04 Narrative VM Effect、取消与 Barrier Spike 05 审计](docs/72-cl04-vm-effect-barrier-spike-05.md) | 确定 Effect token/hash、严格完成与 scope 取消、pure/reversible ledger、Barrier 许可和 Back 阻断 |
| [CL-04 Narrative VM Runtime Save Spike 06 审计](docs/73-cl04-vm-runtime-save-spike-06.md) | canonical Save envelope、VM-11/12、完整性、版本/Build/Opcode 拒绝、pending Effect rehydrate 与诚实限制 |
| [CL-04 Narrative VM Skip / Auto Spike 07 审计](docs/74-cl04-vm-skip-auto-spike-07.md) | Normal/Auto、5–40/Instant、Skip Read/All、Hold/Toggle、停止边界、VM-09/10 固定 Hash 与诚实限制 |
| [CL-04 Narrative VM Meta Progress Spike 08 审计](docs/75-cl04-vm-meta-progress-spike-08.md) | 已读/CG/结局只增集合、独立 Hash、内容寻址 Save 引用、Back/Load 不回退与 VM-13 |
| [CL-04 Narrative VM 生成属性语料 Spike 09 审计](docs/76-cl04-vm-generated-properties-spike-09.md) | VM-14/15、10k 固定生成序列、批处理上限、剧情结果 Hash 与诚实性能边界 |
| [CL-04 Narrative VM Web Worker 一致性 Spike 10 审计](docs/77-cl04-vm-web-worker-conformance-spike-10.md) | 可移植 Corpus/Trace、Node Golden、真实模块 Worker、12 条逐记录 Hash 零差异与诚实宿主边界 |
| [CL-04 Narrative VM History / Scheduler / Save 一致性 Spike 11 审计](docs/78-cl04-vm-history-save-conformance-spike-11.md) | 16 条跨宿主工作流记录、损坏 Save 拒绝、Load 后 Back/Forward 与调度模式最终一致 |
| [调研来源](docs/sources.md) | 官方文档、源码仓库、演示与社区反馈 |

## 开发启动门槛

S0 的可抛弃代码原型已获批准，用于完成下列证据；以下条件全部满足后，才允许把候选方案冻结为 M1 正式工程：

当前执行顺序以[《游戏引擎产品落地开发计划》](docs/89-engine-product-delivery-plan.md)为准，功能状态以[《M1 需求与验收追踪矩阵》](docs/90-m1-requirement-traceability.md)为准。《S0 收口与方向纠偏审计》和 CL-01–CL-12 继续保留为技术证据，但不再要求先关闭全部平台风险才开始产品纵向开发。

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
