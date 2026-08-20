# S0.33 可逆舞台状态控制与多层演出审计

## 目标与需求对齐

S0.33 在 S0.32 已验证媒体链路上补齐可生产演出的状态命令，而不是另建一套预览状态：背景、角色槽位、层级和音频总线全部来自同一份权威脚本，并能按每个语句窗口前进或后退重建。

| 用户要求 | 本阶段交付 | 验收口径 |
| --- | --- | --- |
| 基础 Gal 演出配置 | 背景 set/clear、角色 show/hide、音频 play/stop/pause/resume | Directive、Manifest、Preview、Inspector 共用动作定义 |
| 每句前进与后退 | 累积舞台快照和确定性重放 | 任意语句索引都能还原背景、全部角色和各音频总线 |
| 多角色专业演出 | 稳定 `slot` 与 `z=-100..100` | 同槽替换、指定槽退场、按 z/slot 稳定排序 |
| 稳定与速度 | 资源身份键与逻辑状态键分离 | pause/resume 不重建 Blob URL 或音频元素，真正保留播放位置 |
| 图形化易编辑 | Inspector 动作、槽位、层级及条件资源字段 | clear/hide/stop/pause/resume 不再强制填写资源 |

## 冻结的脚本契约

```text
@background action=set asset=bg_gate transition=fade @id(stmt_bg)
@background action=clear @id(stmt_bg_clear)

@show action=show asset=char_xia slot=left z=10 position=left @id(stmt_xia)
@show action=hide slot=left @id(stmt_xia_hide)

@audio action=play asset=theme bus=bgm loop=true volume=0.7 @id(stmt_bgm)
@audio action=pause bus=bgm @id(stmt_bgm_pause)
@audio action=resume bus=bgm @id(stmt_bgm_resume)
@audio action=stop bus=bgm @id(stmt_bgm_stop)
```

省略 `action` 时继续兼容既有脚本：`background=set`、`show=show`、`audio=play`。只有 set/show/play 要求 `asset`；控制动作不会把残留的 `asset` 当作依赖。`slot` 必须是最多 64 字符的稳定 ASCII 标识符，`z` 必须是 -100 到 100 的整数。音频总线维持 `voice|bgm|sfx|ambient`，每条总线独立保存资源、循环、音量和播放状态。

## 实现与审计结论

1. `directive-schema.ts` 成为参数、动作、默认值、资源要求、槽位与层级边界的共享定义，避免 Inspector 与编译器各自漂移。
2. Scene Resource Manifest 的语句窗口改为累计资源状态。持续背景、角色和音频会保留到明确 clear/hide/stop；转场资源只在触发语句瞬时存在。由此修复了运行调度器提前释放仍在舞台上的资源风险。
3. Preview 使用角色 Map 和音频总线 Map 单遍生成时间线；角色按 z 后 slot 排序。前进和后退读取同一确定性快照，不保留不可审计的命令式旁路状态。
4. `key` 表示完整逻辑状态，`resourceKey` 表示资源身份。pause/resume 只改变前者，因此同一 `<audio>` 与 Object URL 保持存活；play、stop、换资源、显隐和清场才触发受控加载或释放。
5. 媒体类型门禁、SHA-256 Blob 读取、取消、Object URL 去重与释放仍沿用 S0.32 契约。错误动作、非法槽位/层级和无活动音轨的 pause/resume 均安全失败并生成诊断。

## 自动化证据

- 类型检查、43 个测试文件、278 项测试、生产构建和架构边界审计全部通过。
- 新增动作编译、累计资源窗口、多角色排序、退场/清场、音频暂停/恢复/停止、非法动作/槽位/层级、资源身份不重载回归。
- 性能审计通过：10,000 行脚本全链路 246.74 ms；10,000 场景资源预测 27.00 ms、Manifest 编译 124.95 ms；10,000 语句 Preview 时间线 6.06 ms；约 16 MiB 媒体检查/哈希与 2,000 项索引往返合计 916.36 ms；8 张 512×512 图片的切图分析与图集重建合计 3,901.17 ms；2,000 资源压力调度与清理 23.00 ms。
- 真实 Chromium 审计验证 Inspector 动作切换、已验证背景 set/clear、Undo/Redo、默认 16:9 和控制台零错误。

## 明确未扩张的边界

本阶段没有引入账户、云服务、收费、Figma 或第二套工程格式；也没有把 Web 预览误称为最终播放器。混音效果链、跨场景音频保留策略、动态图形化指令插入和生产导出仍需后续里程碑分别冻结并审计。

## 下一阶段入口

S0.34 建议实现图形化演出轨道与指令插入：在不手写脚本的情况下新增 background/show/audio 控制语句，提供时间线层级概览、稳定 ID 插入、撤销重做和键盘/触控操作；输出仍必须落回同一权威脚本并通过本阶段状态机重放。
