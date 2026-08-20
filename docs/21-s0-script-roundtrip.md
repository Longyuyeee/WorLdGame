# S0.2 Canonical Script Round-trip 与审计记录

> 状态：已实现、通过本地门禁并完成远端提交与 PR 证据回读。
> 决策日期：2026-08-11。
> 风险等级：R3（触及 AST、稳定 ID 与未来持久化格式）。本轮是可抛弃的 S0 技术证据，不是最终语法冻结，也不构成 M1 Stable 的独立审阅。

## 1. 需求对齐

本切片只回答一个高风险问题：`.world` 脚本经过解析、格式化和再次解析后，能否保持语义、注释、未知命令、稳定 ID、原始字符串与用户分段。

范围内：

- `scene`、演出指令、对白、`choice`/选项、`label`、`set` 与 `end`；
- `@id(...)` 读取、重复 ID 诊断；
- 未知插件命令和无法识别语法的 Opaque Node；
- 行列与 offset Source Range；
- CRLF/LF 归一化、确定性 Formatter；
- `parse(format(parse(x)))` 语义等价测试。

范围外：

- 最终冻结语法、表达式求值、引用解析、Compiler、Runtime IR 与 VM；
- Script UI、CodeMirror、增量 Worker、LSP、磁盘保存、WAL 与三方合并；
- 从 CST 直接修改当前 `StoryProject`。在 Command/CST 变更契约冻结前不建立第二份可编辑语义真相。

## 2. 临时契约

`packages/story-language` 是纯 TypeScript 可移植包，只允许依赖 `story-core` 的领域类型。它禁止 React、DOM、Node 文件系统、Electron、Tauri、Capacitor 与平台全局。

Parser 使用容错的行级 CST：局部错误产生稳定诊断并保留原始行，不因单行残缺丢弃整个文件。未知插件命令原样保留且不伪装成已执行；`set` 表达式只作为原始文本保存，禁止 `eval`。

Formatter 只规范已识别节点的缩进和结构空格。它不得重新排序节点、选项或参数，不修改引号内原始值；注释、空行和 Opaque Node 保留原有顺序与文本。

## 3. Claim / Evidence

| Claim | 自动证据 | 当前边界 |
|---|---|---|
| 规范样例可解析 | 参考场景覆盖全部最小语法 | 不是最终 Grammar |
| 往返语义等价 | 参考样例、CRLF 和 100 组确定性空格变体 | 尚未接入成熟属性测试/Fuzz 框架 |
| 未知内容不丢失 | 未知 `@weather.set`、注释、空行与异常行断言 | 注释归属目前由顺序表达 |
| 稳定 ID 可审计 | 场景、对白、选择、选项、结局 ID 与重复诊断 | 尚未生成 UUIDv7 |
| 错误可定位 | 错误/警告包含 1-based 行列及 offset | 尚未提供自动修复建议 |
| 核心可移植 | 架构脚本扫描依赖与平台全局 | Worker 隔离在后续 Spike |

## 4. 失败语义

- 引号未闭合：记录对应 `MALFORMED_*`，原行转 Opaque；
- 选项缺少 `-> target`：记录 `MALFORMED_CHOICE_OPTION`，原行转 Opaque；
- 指令名、标签或赋值结构残缺：分别记录 `MALFORMED_DIRECTIVE`、`MALFORMED_LABEL` 或 `MALFORMED_SET`，原行转 Opaque；
- `@id` 缺值、未闭合或同一行重复：记录 `MALFORMED_ID`；
- 跨节点 ID 重复：第二处记录 `DUPLICATE_ID`，两个节点都保留；
- 未识别普通行：记录 `UNRECOGNIZED_SYNTAX` warning 并原样保留；
- 缺少有效场景头：记录 `MISSING_SCENE_HEADER`，仍返回完整文档。

## 5. 退出条件

本切片只有在严格类型检查、全部单元/属性抽样、生产构建、架构审计、依赖漏洞审计和差异人工复核通过后才可推送。由于 R3 要求独立审阅，而当前没有第二位独立审阅者，结论只能记为“S0 技术假设初步通过”，不能升级为最终格式批准。

下一切片为 **S0.3 Script Source Transaction**：先冻结文本草稿到已提交 CST 的原子 ChangeSet、局部残缺状态和撤销边界；CST 到 `StoryProject` 的映射在稳定 ID 契约明确后继续验证。

## 6. 本地审计结果

2026-08-11 本地门禁结果：

- `npm run check`：通过；TypeScript 严格检查、17/17 测试、三个 workspace 构建和架构审计全部成功；
- Round-trip：参考场景、CRLF 与 100 组固定随机种子的空格变体通过语义等价；
- 架构审计：扫描 8 个可移植生产源文件，`story-language` 只依赖 `story-core`，未发现 UI、DOM、平台壳、文件系统或进程依赖；
- Editor 生产构建：JS 206.37 kB（gzip 64.79 kB），CSS 18.73 kB（gzip 4.78 kB）；本轮未引入 Editor 运行时代码；
- `npm audit --registry=https://registry.npmjs.org --audit-level=moderate`：0 vulnerabilities；
- `git diff --check`：通过。

这些证据只覆盖本切片。增量解析性能、10 万字工程、深层/超长/畸形 Unicode Fuzz、Android Worker、磁盘故障和独立 R3 审阅仍为未证明。
