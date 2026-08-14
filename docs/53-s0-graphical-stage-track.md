# S0.34 图形化演出轨道与安全指令插入审计

## 阶段目标

S0.34 把 S0.33 已冻结的舞台动作从“只能编辑已有 Directive”推进到“可以完全通过图形界面新增 Directive”。本阶段不创建第二套时间线数据：轨道、卡片、Inspector、Preview 和 Script 仍读取同一份权威脚本投影。

| 对齐要求 | 交付 | 验收标准 |
| --- | --- | --- |
| 图形化、方便编辑 | BG / CHAR / AUDIO / STORY 四轨概览 | 每个语句保持相同横向索引，点击 cue 同步 Writer 与 Preview |
| 现代、平滑、多彩 | 分轨色彩、玻璃面板、进入动效和活动状态光晕 | 不牺牲文字表达、键盘焦点或移动端触控尺寸 |
| 不手写脚本新增演出 | 背景、角色、音频插入面板 | 动作相关字段按需显示，提交后生成稳定 ID 并选中新步骤 |
| 专业性与稳定性 | 结构命令、锚点规则、幂等和注释保护 | UI 不直接拼接状态；命令失败不会污染投影 |
| 前进/后退一致 | 插入结果直接进入 S0.33 状态机 | 新步骤可立即 Preview、Undo、Redo 和自动保存 |

## 冻结的结构契约

新增命令为 `script.insert-directive`，包含命令 ID、基础 revision、锚点 ID、新 statement ID、Directive 类型和类型化参数。提交路径固定为：

```text
图形插入面板
  → script.insert-directive
  → CST 局部结构 Patch
  → 重新 parse / project / validate project
  → Writer / Script / Stage Track / Preview 同步
```

- 普通步骤：插在选中步骤之后。
- `choice`：选项组是不可拆分原子结构，插在最后一个 option 之后。
- `end`：结局后不允许执行演出，自动插在结局之前。
- 相邻注释：归属未冻结时拒绝跨越，避免静默改变作者意图。
- ID：扫描当前工程、文本 ID、选项 ID 与 tombstone 后分配，恢复页面后不会从 `1` 盲目复用。
- 参数：只接受该 Directive 暴露的 key 和无歧义单 token；set/show/play 必须有资源，控制动作禁止携带资源专属残留字段。

## UI 与交互

四条轨道保持同一语句列宽，空 cue 仅用于对齐。BG、CHAR、AUDIO、STORY 使用不同语义色，不依靠颜色单独传达含义；每个有效 cue 同时显示序号与类型。横向区域支持鼠标滚动和触摸 `pan-x`。

插入入口提供显式按钮与 `Alt+1 / Alt+2 / Alt+3` 快捷键。背景、角色和音频分别复用 S0.33 动作表；角色面板提供槽位与层级，音频提供 bus。资源动作只接受 Asset Index 中类型兼容的资源，clear/hide/stop/pause/resume 不显示资源字段。`Escape` 可关闭面板。

## 审计结论

1. `structural-patch` 承担实际源码插入和锚点解析；React 只发送意图，不成为脚本真相源。
2. Source command fingerprint 包含锚点、statement ID、命令和排序后的参数，同 command ID 重放幂等，不同载荷复用会冲突拒绝。
3. Studio reducer 在提交后重新构建项目、选中新步骤并同步 Preview index；Undo/Redo 沿用原子 source history。
4. `patch-direction` 与新 `insert-direction` 均纳入 dirty generation，修复已有 Inspector 修改未显式触发本地保存状态的审计缺口。
5. 新增非法动作、缺资源、错误 bus、控制动作残留字段、重复 ID、注释归属、choice/end 定位、CRLF、快捷键和 UI Undo 回归。

## 验证证据

- `npm run check` 全部通过：类型检查、44 个测试文件 / 284 项测试、生产构建，以及 34 个可移植文件 / 3 个 Node adapter 的架构边界。
- 性能审计通过：10,000 行脚本全链路 149.86 ms；10,000 场景资源预测 20.16 ms、Manifest 编译 79.86 ms；10,000 语句 Preview 时间线 2.02 ms；约 16 MiB 媒体检查/哈希与 2,000 项索引往返合计 614.70 ms；8 张 512×512 图片切图与图集重建 2,623.02 ms；2,000 资源压力调度 13.54 ms。
- 真实 Chromium 验证四轨对齐与语义色、真实 Asset 背景插入、自动选中新 cue、Script 出现规范 Directive、Preview 显示已验证 Blob、Alt+3 快捷键、stop 不显示资源字段、Undo、自动保存和错误日志为空。
- 默认预览元数据保持 1920×1080（16:9）。移动端规则经响应式代码与自动化可访问性审计：440 px 以下按钮扩大、插入字段单列、轨道维持触控横向滚动；当前浏览器控制面不提供 viewport 仿真，因此未把桌面窗口误报为真实手机实测。

## 未扩张边界与下一阶段

本阶段不做 Directive 删除、拖拽重排、跨场景移动或批量编辑，也不引入账户、云端或导出格式。S0.35 应冻结演出 cue 的删除与重排：加入可恢复 tombstone、choice/end 边界、资源窗口差分、拖拽/键盘等价操作，并继续以权威脚本为唯一持久化结果。
