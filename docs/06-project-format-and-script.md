# 工程格式与脚本设计

## 1. 设计目标

- 人类可读，可用普通文本工具修改；
- 适合 Git Diff 和多人分场景协作；
- 可视化与文本编辑共用同一 AST；
- 重命名、移动文件和格式化不破坏引用；
- 未安装插件时不丢失未知命令；
- 支持确定性构建、格式迁移和长期存档兼容；
- 大资源与剧情文本分离；
- 不依赖云数据库才能打开。

## 2. 工程目录（提案）

    MyGame/
      world.project.json
      story/
        chapters.json
        scenes/
          scn_prologue.world
          scn_rooftop.world
        layouts/
          scn_prologue.layout.json
      cast/
        characters.json
        expressions.json
      assets/
        assets.json
        images/
        audio/
        video/
        fonts/
      localization/
        zh-CN.csv
        en-US.csv
        ja-JP.csv
      ui/
        theme.json
        screens/
      plugins/
        plugins.lock
        config/
      tests/
        routes/
      .world/
        cache/
        thumbnails/
        recovery/
      dist/

## 3. 源文件与派生文件

### 3.1 源文件

- `world.project.json`
- `story/**/*.world`
- 角色和资源清单
- 本地化表
- UI 主题/组件声明
- 插件锁文件和配置
- 路线测试

### 3.2 可删除并重建

- `.world/cache`
- 缩略图
- 搜索索引
- 编译 IR
- 流程图边索引
- Gallery/Replay/Music/Ending Catalog
- Dicing/Delta Atlas、平台纹理和重建 Manifest
- 多分辨率画廊缩略图
- `dist`

编辑器不得把唯一数据只放在缓存数据库。

## 4. 稳定 ID

### 4.1 原则

- 项目、场景、语句、选项、角色、资源、变量、UI 组件均有稳定 ID；
- ID 不由显示名称、文件名、行号或内容哈希直接决定；
- 推荐 UUIDv7/等价时间有序随机 ID；
- 显示名称可以修改，ID 保持不变；
- 复制创建新 ID，移动保留原 ID；
- 合并时重复 ID 视为明确冲突。

### 4.2 文本 ID

每条面向玩家的文本都有 `textId`，用于：

- 本地化；
- 配音；
- 已读记录与跳过已读；
- 历史记录；
- 修改追踪；
- 截图上下文；
- 分析与 QA。

修改原文不改变 `textId`，但目标语言状态变为“源文已更新/需复审”。

### 4.3 S0 稳定 ID 文本映射

- 场景、选择语句、选项、演出语句和结局使用 `@id(...)` 表达各自实体/语句 ID；
- 对白同时具有语句身份和玩家文本身份：`@sid(statementId)` 用于执行顺序、回滚和 Source Map，`@id(textId)` 用于本地化、配音、历史和已读状态；
- Formatter、移动和改名必须同时保留两类 ID；复制对白时两者都生成新值；
- 缺少必要 ID 时可以容错打开源文件，但不得无提示投影为 Canonical `StoryScene`；
- 此映射仍是 S0 v0 候选，需通过大型工程、迁移和存档验证后才能冻结。

局部修改必须以稳定 ID 定位 CST 节点，只替换目标字段；不得通过重新生成整个场景脚本覆盖注释、Opaque Node、未知参数、换行风格或用户分段。源文本与解析文档不一致时必须进入冲突，而不是按旧行号继续写入。

结构修改同样使用稳定 ID。Delete 必须产生 Tombstone，活动 Tombstone 的 `statementId/textId` 禁止被新实体复用；Undo 恢复实体时撤销对应活动 Tombstone，Redo 再建立。注释归属规则未冻结时，直接相邻注释的 Delete/Move/插入切分必须拒绝，不能猜测。

## 5. Canonical Model

场景脚本是剧情语义的主要持久化形式；内存 AST 是编辑期间的权威模型。

Route、Sequence、Script、Stage 的关系：

- Script 直接投影场景 AST；
- Sequence 按执行顺序投影 AST；
- Route 从场景入口、跳转、调用、选择和结局派生；
- Stage 模拟执行 AST 后投影视觉状态；
- Layout Sidecar 只保存位置、分组、折叠和视口，不保存剧情边。

因此，删除 `layout.json` 只会丢失图的位置，不会丢失剧情。

## 6. 脚本语法草案

下面只用于验证可读性与 AST 能力，不是最终冻结语法。

```text
scene "序章 · 天台" @id(scn_rooftop)

@background asset=bg.rooftop transition=fade duration=800ms @id(stmt_bg_rooftop)
@show asset=char.lin.smile expression=smile position=center @id(stmt_show_lin)
@audio asset=voice.lin.001 bus=voice loop=false @id(stmt_voice_lin_001)
@audio asset=bgm.snow.promise bus=bgm loop=true fade=800ms @id(stmt_bgm_promise)

lin: 如果明天真的下雪，你还会来这里吗？ @sid(stmt_01J...) @id(txt_01J...)

choice "要怎么回答？" @id(choice_01J...)
  "我答应你，一定会来。" -> promise @id(opt_01J...)
  "你是不是有事瞒着我？" -> ask_truth @id(opt_01K...)

label promise
lin: 那就说好了。雪停之前，谁都不许失约。 @sid(stmt_01K...) @id(txt_01K...)
end "约定之雪" @id(stmt_end_promise)

label ask_truth
set asked_the_truth = true
lin: 等雪落下的时候，我会把一切告诉你。 @sid(stmt_01M...) @id(txt_01M...)
end "未寄出的真相" @id(stmt_end_truth)
```

## 7. 语法原则

### 7.1 文本优先

- 普通对白占据最简语法；
- 角色名、文本和选项易读；
- 演出命令使用 `@` 前缀；
- 标签、跳转和条件明确；
- 元数据 ID 由编辑器弱显示/折叠。

### 7.2 不直接执行 JavaScript

表达式使用受限类型系统：

- Boolean、Number、String；
- List、Map（P1）；
- 比较、逻辑、算术和空值处理；
- 纯函数；
- 明确注册的有副作用命令。

禁止默认 `eval`，避免工程脚本获得文件、网络或进程权限。

### 7.3 插件命令

```text
@inventory.add item=pocket_watch count=1
@weather.set kind=snow intensity=0.7
```

插件声明：

- 命令 ID；
- 参数类型、默认值和是否可本地化；
- 编辑器显示名称与 Inspector 控件；
- 编译验证；
- 运行时处理器；
- 是否等待、是否可取消、是否可回滚；
- 所需权限与平台能力。

## 8. Round-trip 规则

### 8.1 必须保留

- 注释；
- 未知插件命令；
- 稳定 ID；
- 未识别但语法有效的参数；
- 用户分段；
- 字符串原始值；
- 语义顺序。

### 8.2 格式化可以改变

- 缩进；
- 参数之间空格；
- 规范化引号（需设置允许）；
- 空行上限；
- 参数排序（只对声明为无序的命令）。

### 8.3 格式化不得改变

- 命令执行顺序；
- 选项顺序；
- 注释所属节点；
- 稳定 ID；
- 字符串内容；
- 有序参数；
- Route Layout。

## 9. 外部编辑

当磁盘文件在编辑器外变化：

1. 增量解析新文件；
2. 按稳定 ID 比较当前 AST；
3. 未保存的本地变化与外部变化无冲突时自动合并；
4. 同一语义字段冲突时显示三方合并；
5. 未安装插件的命令作为 Opaque Node 保留；
6. 合并成功后，所有视图接收同一 Change Set。

不能简单弹出“是否覆盖整个文件”作为唯一处理方式。

## 10. Layout Sidecar

示例语义：

```json
{
  "schemaVersion": 1,
  "sceneId": "scn_rooftop",
  "nodes": [
    { "nodeId": "scn_rooftop", "x": 320, "y": 120 }
  ]
}
```

当前 `schemaVersion: 1` 已冻结节点坐标的最小 portable 契约：`nodeId/x/y`。分组、折叠与视口仍是 N40 后续 schema 演进项，不能提前写进已实现示例；未知或非有限坐标在 codec 边界 fail closed。

位置冲突不应阻塞剧情文件合并；可以选择本地布局、远端布局或自动重排。

## 11. 资源清单

资源条目包含：

- asset ID；
- 类型；
- 逻辑名称；
- 相对路径或内容对象引用；
- 内容哈希；
- MIME/编码；
- 尺寸、时长、采样率等元数据；
- 标签；
- 许可证、作者和来源（可选但推荐）；
- 每平台变体；
- 导入器与导入设置；
- 优化策略：auto/original/lossless-dicing/delta/platform；
- 相似资源组、章节/加载范围和平台内存预算；
- 依赖插件。

剧情只引用 asset ID，不引用文件绝对路径。

派生资源记录源 asset ID、输入哈希、算法/参数版本、Atlas 块映射和输出哈希。剧情、画廊和路线图不得直接引用派生文件路径，因此删除整个缓存后仍能从源工程完整重建。

### 11.1 自动内容目录

编译产物包含可版本化、可重建的目录：

- `story-graph`：节点、连接、条件摘要、结局、可达性和剧透等级；
- `gallery-catalog`：CG 组、差分、缩略图、解锁条件和排序覆盖；
- `replay-catalog`：入口 `stepId`、初始状态策略和退出行为；
- `music-catalog`：音频 asset ID、标题、作者、循环点和解锁；
- `ending-catalog`：结局 ID、路线、显示信息和达成状态。

自动目录来源于脚本与资源清单，手工配置只允许覆盖展示元数据，不复制剧情逻辑。

## 12. 本地化格式

最小字段：

| 字段 | 说明 |
|---|---|
| textId | 稳定文本 ID |
| source | 当前源文 |
| translation | 目标语言文本 |
| status | missing/draft/reviewed/outdated/locked |
| speakerId | 角色上下文 |
| sceneId | 场景上下文 |
| note | 编剧/翻译注释 |
| voiceAssetId | 该语言配音 |
| sourceRevision | 源文修订号 |

CSV/XLSX 是交换格式；内部也必须能保留换行、富文本和状态，不依赖表格软件特性。

## 13. 编译产物

发布包不直接解释源脚本，而使用版本化 Runtime IR：

    build/
      manifest.json
      story.ir
      source-map.json        # Debug 构建
      assets.pack
      localization/
      ui/
      licenses/
      sbom.json

Release 可移除注释和开发映射，但必须保留运行所需稳定 ID 与存档兼容信息。

## 14. 保存文件兼容

### 14.1 保存格式

保存记录当前语义 ID，而非源文件行号。

### 14.2 构建更新

新版本加载旧存档时：

1. 检查工程 ID 和保存 Schema；
2. 应用插件状态迁移；
3. 查找原语句 ID；
4. 如果语句删除，查找显式迁移映射；
5. 仍无法定位时，提供最近安全检查点或拒绝加载并解释；
6. 自动化测试验证代表性旧存档。

### 14.3 发布门禁

以下变化必须触发兼容警告：

- 删除可保存检查点；
- 改变变量类型；
- 删除插件状态；
- 修改调用栈语义；
- 更换随机算法；
- 改变命令的回滚行为。

## 15. 格式迁移

- Manifest 和每类文件独立版本；
- 迁移前自动快照；
- 迁移函数确定、可测试、可重复运行；
- 不允许直接跳过未知主版本；
- 迁移后生成报告；
- 尽可能支持只读打开未来版本；
- CLI 与编辑器使用同一迁移库。

## 16. 导入/导出策略

### P1 导入

- CSV/XLSX 台词；
- Yarn Spinner；
- ink；
- WebGAL；
- Ren'Py 的基础对白/选择/跳转子集。

### 原则

- 先生成兼容报告；
- 不支持的命令成为注释/Opaque Node，不静默丢失；
- 保留原文件备份；
- 导入后运行结构和路线 QA；
- 不承诺完整往返其他引擎的任意自定义代码。

## 17. 冻结语法前的验证

至少使用以下样本：

- 20 行无分支短篇；
- 10 万字多章节作品；
- 嵌套条件、循环、调用和局部变量；
- 中日英混合、Ruby 和富文本；
- 100 个自定义命令；
- 插件缺失后的打开/保存；
- 两人同场景冲突；
- 文本/Sequence/Stage 连续互改 1,000 次；
- 从早期版本迁移和旧存档恢复。

语法冻结必须优先保证数据不丢失和大型项目可维护，而不是追求最短字符数。
