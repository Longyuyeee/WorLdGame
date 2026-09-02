# N61-E3 Runtime 语言切换与回退审计

> 日期：2026-09-02
> 节点：N61-E3
> 工程状态：完成
> Product Acceptance：未开始
> 下一切片：N61-E4 CJK/Ruby/禁则与字体回退

## 1. 用户场景与边界

玩家打开正式 Player 后，可在现有播放控制区选择工程源语言或已生产的目标语言。选择立即作用于当前对白、旁白、选择提示、选项、结局和剧情历史；目标语言缺失、空白、状态非法或源文快照过期时继续显示源语言，并给出缺失数量和回退语言。Web Player 按工程身份保存玩家语言偏好，刷新或关闭重开后恢复；存储不可用时只影响下次恢复，不阻止当前切换。

语言是表现偏好，不进入 Runtime state、History 或 Session Save，因此不会改变剧情哈希、分支、已读状态或存档兼容性。本切片不声称已完成 CJK/Ruby/禁则、字体回退、语言专属媒体、Windows/Android 实体 Host 或 Product Acceptance。

## 2. 真实代码所有权

- N30 Compiler 继续生成唯一正式 `catalogs.json.localization`，不新增 Shell 私有翻译表；
- Player Core 从 Compiler artifact 解析源语言、可用目标语言和稳定键，并在 snapshot 层投影翻译；
- Runtime event、Runtime state、History checkpoint 和 Session Save 始终保留确定性源文；
- Web Player Shell 提供可访问的“显示语言”入口和按 `projectId` 隔离的 fail-soft 本地偏好；
- 稳定键对应规则保持 N61-E1：对白/旁白=`textId`，Choice prompt/ending=instruction ID，Choice option=option ID。

## 3. 预期—首次实际—修正后实际

| 场景 | 预期 | 首次实际 | 修正后实际 |
|---|---|---|---|
| Player 入口 | 玩家可选择源语言和目标语言 | 新真实 Shell 测试 `0/1`，找不到“显示语言” | 正式播放控制区显示 `en / zh-Hans` 并即时切换 |
| 部分翻译 | 已翻译项显示目标语言，缺失项显示源文且可解释 | Shell 始终只显示 Runtime 源文 | 提示/左侧选项使用中文，缺失 `Right` 保持英文；状态显示 4 项回退 |
| 过期保护 | 源文变化后旧译文不可冒充当前翻译 | 无 Runtime 本地化投影 | Core 比较 catalog `sourceText` 与当前 IR 源文，不一致即回退 |
| 确定性 | 切换语言不改变剧情状态或存档 | 未知 | 同一 Choice 的源语言/目标语言 `runtimeStateHash` 完全相同，History 仅在 snapshot 投影语言 |
| 重开 | 玩家选择按工程恢复 | 无语言偏好 | `zh-Hans` 刷新重开后仍被选中；偏好存储失败时当前会话仍可切换 |
| 手机操作 | 390px 无页面溢出且选择器至少 48px | 首次实测页面 `390/390`，控件完整，但语言 select 为 44px | 定向 CSS 修正后 select 48px；播放控制区 `x=14…376` |

## 4. 最小必要验证

- 新增 Core/Shell 真实路径：`2 files / 2 tests`，走 Canonical → Compiler → Core → Shell，覆盖即时切换、部分翻译、缺失/过期回退、History、Runtime hash 不变和重开偏好；
- 受影响完整 Core/Shell 回归：`4 files / 81 tests` 通过；
- `npm run typecheck` 通过；Player production build 通过：host JS `409.10 kB / gzip 119.60 kB`，CSS `23.99 kB / gzip 5.32 kB`；
- production browser：真实 localization demo 从标题页选择 `zh-Hans`，进入 Choice 后显示中文提示/左侧与英文回退项，进入对白显示中文，刷新仍为 `zh-Hans`；
- 390×844：body `390/390`，语言选择器 48px，控制区完整位于视口。既有舞台世界/装饰光晕刻意 bleed 保持不变，未误报为页面滚动。

## 5. 开发目标审计与下一接续点

本切片关闭了“生产出的翻译无法被玩家使用”的核心断点，直接推进 REQ-L10N，没有修改 Runtime/Save schema，也没有用额外安全或覆盖率工作拖延功能。REQ-L10N 仍为“实现中”：下一步 N61-E4 处理真实 CJK 长文本、Ruby 标注、行首/行尾禁则和字体回退，并以同一 Player 的桌面/手机文本框可读性为产品结果。配音映射与语言专属媒体随后进行；N61 Product Acceptance、N62 Engineering、M1 与发布继续阻断。
