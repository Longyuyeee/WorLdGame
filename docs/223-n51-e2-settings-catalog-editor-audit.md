# N51-E2 Settings Catalog 与 Editing Service 审计

> 日期：2026-08-27
> 分支：`codex/n51-e2-settings-catalog-editor`
> 直接基线：N51-E1 最终绿色头 `c2257e4`
> 授权：`RA-N21-010`，最大节点 N51
> 判定：实现头 `e4fa4b5` 的本地与远端 Windows / Node 22 完整门均通过；N51-E2 Engineering 关闭

## 1. 冻结目标与边界

E2 将 E1 的 23 个 typed 字段提升为可供设置界面消费的正式目录和编辑事务，但不创建产品 UI，不接 Canonical Project 持久化，不做 Preview 热应用，也不进入 N52。

冻结闭环：

1. 每个字段只有一份 metadata：path、section、Basic/Advanced、简中/英文名称与说明、关键词、控件类型和数值/枚举约束；
2. Basic 只显示常用字段，Advanced 显示全部；搜索支持 NFKC、英文大小写、简中/英文与多词 AND；同分结果按目录顺序稳定；
3. parser 的数值和枚举边界直接消费 catalog control，避免 UI 与正式校验范围漂移；
4. project 或单一 platform 层的批量编辑整批最终校验后才提交，支持关联字段原子更新；
5. reset、no-op、override 前后值以及三个平台 resolved value/source 均显式返回；
6. 未知 path、重复 edit、非法 layer/value/search option fail closed；输入文档不可变；
7. 不新增 Auto/Skip/Save/History/Back/Forward 玩家执行功能。

## 2. 实际实现

`GAL_SETTING_DEFINITIONS` 以运行时深冻结的 23 项目录覆盖 E1 全部 path：Basic 16 项，Advanced 模式显示 23 项。number/select validator 从目录读取 minimum/maximum/options，因此 catalog 是控件约束和 parser 约束的共同事实源。

`searchGalSettingDefinitions` 提供 mode/section 筛选、NFKC 搜索、多词 AND 和 exact→prefix→contains 稳定评分。`applyGalSettingsEdits` 提供 typed set/reset command、单层事务、重复检测、最终文档严格校验、no-op 抑制和三平台 before/after resolution facts。

## 3. 真实预期—实际—修正

| 验证 | 冻结预期 | 首次实际 | 修正与复测 |
|---|---|---|---|
| Catalog 完整性 | 23 path 唯一、双语文案与 control 完整 | 23/23 覆盖 | Basic `16`、Advanced `23`；目录/entry/label/control 均 runtime frozen |
| 搜索 | 全角/大小写归一，多词 AND，稳定排序 | `ＢＧＭ 音量` 精确返回 `audio.bgm`；不存在词返回空 | 中文“音量”按冻结目录顺序返回 7 个 Audio 字段 |
| 原子关联编辑 | Android portrait 的宽/高/方向一次成功 | 三命令单事务成功，Windows/Web 不变 | 单独改 portrait 因非法组合整批拒绝，源文档字节不变 |
| 来源与隔离 | project 传播三平台；Web override 只影响 Web | before/after value/source 与预期一致 | platform reset 恢复 project `0.75`，并记录 override present→absent |
| 无效/no-op | 重复、未知、越界、非法 layer 拒绝；同值不制造事务 | 正反例通过 | no-op 返回 `hasChanges=false`、`changes=[]` |
| Portable 架构 | catalog/editor 不访问浏览器或平台全局 | 首跑英文说明自然语言 `window.` 被静态门识别为 DOM global | 文案改为 `message panel`，保留 `window` 搜索词；99 portable files 架构门 PASS，未放宽规则 |
| 无类型搜索输入 | 非法 query/mode/section 不静默退化 | 初版 typed API 未作 runtime 检查 | 增加 runtime 反例与明确 TypeError；专门门由 `22/22` 增至 `23/23` |
| 宿主多余字段 | layer/search option/edit command 的拼写错误不得静默丢失 | 复核发现 typed 调用方安全，但非类型宿主的额外字段会被忽略 | 对三类边界增加 unknown-key fail closed 与反例；专门门由 `23/23` 增至 `24/24` |

这些测试直接调用正式 catalog、search、parser 和 editing transaction，比较实际文档字节、异常 code/path、resolved values/sources 和事务结果，不是静态占位。E2 仍无产品页面，因此不冒充 production-browser UI 证据；首个 Settings UI 切片必须执行桌面与 390×844 冷 production browser 操作。

## 4. 本地证据

- `npm run audit:n51-gal-settings`：`2 files / 24 tests`，PASS；
- `npm run typecheck`：PASS；
- `npm run build --workspace @world-studio/gal-settings`：PASS；
- `npm run audit:architecture`：99 portable files、4 Node adapter files，PASS；
- 最终代码第二轮完整 `npm run check` 已执行到末项并退出；普通回归 `144 files / 832 tests`，N50 `26/26`，N51 `24/24`；
- 冻结 VM：修改前一轮同切片 corpus 测试 `53.33 s < 90 s`（测试总时长 `55.38 s`）；最终代码第二轮也通过同一预算门；远端同头 corpus `66.876 s < 90 s`（测试总时长 `68.58 s`）；
- 最终代码证据复核：Script 性能 `13/13`；Route 性能 `9/9`、P95 `223.74 ms < 500 ms`；
- 最终代码证据复核：Asset 性能 `4/4`，dicing 总时长 `3458.41 ms < 5000 ms`；
- 17-workspace 全构建 PASS；editor 主 bundle 既有 `938.18 kB > 500 kB` 警告继续保留，不把它隐藏或误归因于本 portable service。
- Draft PR [#92](https://github.com/Longyuyeee/WorLdGame/pull/92) 的实现头 `e4fa4b5` 在 Windows / Node 22 完整门 run `33058884556` / job `98472432704` 用时 `11m28s` 并绿色；普通回归 `144/832`、N51 `24/24`、Route P95 `134.46 ms < 500 ms`、Asset dicing `3374.89 ms < 5000 ms`。

## 5. 需求对齐与剩余项

E2 直接推进 REQ-GAL/AC-19 的 Basic/Advanced、搜索、控件约束、恢复默认和可审计编辑事务，但仍不宣称 N51 或配置中心完成。后续至少需要：

1. typed settings document 接入 Canonical Project settings 文件和正式 undo/redo transaction；
2. 现代设置 UI，显示继承来源、修改状态、恢复默认与 platform selector；
3. Preview/Player 热应用及桌面/390×844 production-browser 差异修正；
4. 扩展剩余 P0 schema，同时保持 N52 执行功能唯一归属；
5. 真人 Product Acceptance、实体设备、三端正式产物、M1 与发布继续阻断。

E2 Engineering 已由同头本地/远端证据关闭。下一切片是 N51-E3 Canonical Project settings 文件与正式 undo/redo transaction；Settings UI、Preview 热应用和 N51 Product Acceptance 继续保持未完成。
