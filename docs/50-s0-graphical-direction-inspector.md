# S0.31 图形化演出 Inspector 与 Directive Patch 审计

## 需求对齐与阶段边界

S0.30 已冻结类型化 `@background / @show / @audio` 参数和资源清单编译规则，但创作者仍需手写 `key=value`。S0.31 将这条专业语义链路接入现代化 Writer：背景/CG、角色立绘和音频按 Asset Index 类型选择，转场、表情、位置、音轨、循环、音量和时长使用图形字段配置。

本阶段不实现运行时图片解码、舞台渲染、音频播放、批量迁移、资源标签搜索、角色表情资产族、时间线或正式构建按钮。Inspector 修改的是 Canonical Script 中的一条 Directive，不建立第二份演出模型。

## 编辑契约

`script.patch-directive` 沿用脚本事务信封：稳定 `commandId`、`baseRevision`、`statementId` 和确定性 payload fingerprint。成功提交后统一产生 revision、semantic revision、ChangeSet、持久化脏标记和编译失效标记，并自动进入既有 Undo/Redo 历史。

局部 Patch 具备以下失败关闭规则：

- 解析错误、陈旧 source/document 对、目标缺失、错误语句类型或重复稳定 ID 均拒绝提交；
- 每类 Directive 只允许修改其公开参数，参数值不得包含空白、`=`、`@` 或超长输入；
- 同一个待修改参数重复出现时拒绝猜测；
- 只替换目标值或在 `@id(...)` 前插入/删除目标 token，不格式化整行或整份脚本；
- CRLF/LF、注释、未知 `key=value`、插件元数据和非目标语义保持不变；
- 旧式位置描述默认保留，只有 Inspector 明确显示迁移提示并提交时才删除旧 token。

## 图形化 Inspector

Writer 选中演出步骤后直接显示命令类型和表单：

- `background`：背景或 CG 主资源、过渡、时长、可选过渡资源；
- `show`：角色主资源、表情、左/中/右位置、过渡、时长、可选过渡资源；
- `audio`：音频主资源、voice/bgm/sfx/ambient 总线、循环、0–1 音量、带单位 fade、可选依赖资源；
- 主资源必须存在于当前 Asset Index，且 kind 与命令相容；过渡资源也必须存在于 Index；
- 无兼容资源、未知 ID、非法时长/音量、缺失音频总线或重复参数时，应用按钮保持锁定；
- 有旧式描述时按钮明确显示“迁移旧描述并应用”，不会把自然语言猜成 Asset ID。

界面延续多彩但克制的视觉体系：按命令区分色彩、平滑焦点/悬停反馈、紧凑双栏字段，并在窄屏沿用现有工作区响应式布局。

## 自动化覆盖

- Directive 参数 inspection：typed、positional、metadata 与 duplicate 分类；
- 已有值替换、新字段插入、可选字段删除和显式旧描述迁移；
- 未显式迁移时位置文本继续存在；
- CRLF、注释、未知参数、插件元数据和所有非目标语义字节/语义保持；
- 陈旧文档、错误目标类型、未知可编辑字段、重复目标参数拒绝；
- Studio reducer 的 revision、ChangeSet、投影与 Undo；
- UI 的旧描述提示、空 Asset Index 锁定和禁止猜测状态。

## 审计结论

实现未引入 DOM/文件系统到 story-language，可移植 Patch 逻辑保持在语言包；React 只负责表单状态和命令派发，Asset Index 只用于显式候选与提交前类型门禁。完整门禁与真实浏览器证据记录在本轮提交和 PR 检查中。

- 最终完整 `npm run check` 通过：42 个测试文件、266 项测试、TypeScript、五包生产构建、架构和全部性能门禁；
- 架构审计通过 33 个可移植文件与 3 个 Node 适配器，语言层没有 UI、DOM、文件系统、进程或平台外壳依赖；
- 10,000 句解析/投影/末句 Patch 合计 188.09 ms（预算 12,000 ms），10,000 场景预测 25.70 ms、Manifest 编译 54.20 ms（预算各 2,000 ms）；
- 16 MiB 媒体检查、SHA-256 与 2,000 项 Index 合计 927.51 ms；Dicing 分组/Atlas 合计 3,121.28 ms，均在既定预算内；
- 真实浏览器从持久化 Index r2 读取 2 个 CG 候选，将旧背景描述迁移为 `asset=audit_atlas_a transition=fade duration=400ms`，Writer、Preview 与 Script 同步到 revision 1；
- Script 精确回写为 `@background asset=audit_atlas_a transition=fade duration=400ms @id(stmt_gate_bg)`；Undo 恢复原始中文描述并进入 revision 2，Redo 可用，自动保存完成且控制台无 error；
- 默认舞台实测 334 × 187.875，比例 1.778（16:9），本阶段交互没有破坏尺寸 Profile。

## 下一阶段

S0.32 应实现类型化演出的实时舞台执行切片：从已验证 Asset Blob 创建受控预览 URL，在 16:9 舞台上执行背景/立绘层、过渡和音频生命周期；切场、前后退与取消必须释放旧资源，失败时显示可恢复占位而不是污染脚本或崩溃。
