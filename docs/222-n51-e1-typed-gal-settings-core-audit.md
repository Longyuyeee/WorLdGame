# N51-E1 Typed Gal Settings Core 审计

> 日期：2026-08-27
> 分支：`codex/n51-e1-typed-settings`
> 直接基线：N51 治理最终绿色头 `e982520`
> 授权：`RA-N21-010`，最大节点 N51
> 判定：本地 Engineering 实现与专门门通过；待同头远端 Windows / Node 22 完整门后关闭 E1

## 1. 冻结目标与边界

N51-E1 只建立 Gal Settings 的 portable typed 事实，不铺设置 UI，不把浏览器 localStorage 当 Project 数据，也不进入 N52 玩家控制。

冻结闭环：

1. 一个依赖为零的 `@world-studio/gal-settings` package；
2. default → project → platform 的固定优先级，平台限定为 Windows/Web/Android；
3. 首批 P0 覆盖显示、文本、基础推进、六路音量/Voice Ducking、基础输入；
4. 每个字段可追踪实际来源；reset 只删除当前层覆盖并恢复继承；
5. 未知字段、未来 Schema、越界值、缺平台和非法组合 fail closed；
6. 严格 parse、确定性 serialization、round-trip 与不变输入对象；
7. Auto/Skip/Save/History/Back/Forward 执行产品化仍属于 N52。

## 2. 实际实现

`GalSettings` v1 当前冻结 23 个字段：

| 分组 | 字段 |
|---|---|
| Display | designWidth、designHeight、orientation、safeArea、quality |
| Text | charactersPerSecond、minimumDisplayMilliseconds、punctuationDelayMilliseconds、fontScale、messageWindowOpacity |
| Advance | allowHold、waitForVoice |
| Audio | Master、BGM、Voice、SFX、Ambient、UI、voiceDucking |
| Input | pointer、keyboard、touch、gamepad advance enable |

公共边界包含 create/parse/serialize/resolve、project/platform batch patch、project/platform 单字段 reset、稳定 `GalSettingsError` code/path。平台 Profile 只是相同 schema 的 override 数据，没有 Windows/Web/Android 三套语义分叉。

## 3. 真实预期—实际—修正

| 验证 | 冻结预期 | 首次实际 | 修正与复测 |
|---|---|---|---|
| 继承与来源 | default→project→platform，逐字段来源正确 | 正例通过 | Android 覆盖 BGM，Voice 继承 project，SFX 继承 default；Web 不受 Android 影响 |
| 当前层 reset | 只删除选中层，不修改上层或原输入 | 正例通过 | platform reset 回到 project，project reset 回到 default；原对象保持原值 |
| 严格反例 | 未知/越界/缺平台/未来版本/方向尺寸冲突均拒绝 | 反例通过 | 稳定 code/path；portrait 必须和尺寸原子更新 |
| 确定性序列化 | 不同输入键序得到相同字节并 round-trip | 通过 | 末尾换行与三平台空 Profile 均稳定 |
| TypeScript strict | `exactOptionalPropertyTypes` 通过 | 首跑 TS2375：section parser 的索引返回类型携带可选 `undefined` | 改为 `NonNullable` section 返回契约；复测 PASS，未放宽 tsconfig |
| Portable 架构 | 不引用 DOM/平台/文件系统，依赖为零 | 首跑静态门把局部参数 `document` 判作平台全局 | 统一重命名 `settingsDocument`，消除证据歧义；97 portable files 架构门 PASS |
| 运行时平台输入 | 非 Windows/Web/Android 必须拒绝 | 初版只由 TypeScript 约束 | 增加 runtime platform parser 与 untyped-host 反例；专门门由 `11/11` 增至 `12/12` PASS |

这里的“真实测试”是对实际 package API、JSON 字节、错误对象和三平台解析结果运行，不是静态占位断言。E1 没有产品 UI，故不伪造 production-browser 操作证据；从设置 UI/Preview 热应用切片开始必须恢复桌面与 390×844 冷 production browser 实测。

## 4. 本地证据

- `npm run audit:workspaces`：17 workspaces，PASS；
- `npm run audit:n51-gal-settings`：`1 file / 12 tests`，PASS；
- `npm run typecheck`：PASS；
- `npm run build --workspace @world-studio/gal-settings`：PASS；
- `npm run audit:architecture`：97 portable files、4 Node adapter files，PASS；
- 完整 `npm run check`：PASS；普通回归 `143 files / 820 tests`，N50 `26/26`，N51 `12/12`；
- 冻结 VM：corpus 测试 `69.80 s < 90 s`（测试总时长 `71.96 s`）；
- Script 性能 `13/13`，Route 性能 `9/9`、P95 `122.07 ms < 500 ms`；
- Asset 性能 `4/4`，dicing 总时长 `2922.57 ms < 5000 ms`；
- 17-workspace 全构建 PASS；editor 主 bundle 的既有 `938.18 kB > 500 kB` 警告仍保留，不属于本 data-core 切片的功能回归。

## 5. 需求对齐与剩余项

本切片直接推进 REQ-GAL/AC-19 的 Schema、继承、恢复默认、平台 Profile 和六路音量数据基础，但没有宣称 N51 完成。仍需：

1. E2 建立字段元数据、Basic/Advanced、搜索与设置编辑服务；
2. 后续把 typed document 接入 Canonical Project 持久化和撤销事务；
3. Preview/Player 热应用与桌面/移动 production-browser 差异修正；
4. 补齐 Auto/Skip/Save/History/Back、选择、路线、附加页等剩余 P0 schema，但执行产品功能仍归 N52；
5. 真人 Product Acceptance、Windows/Android 实体设备和三端发布继续阻断。

同一实现提交远端完整门绿色后，E1 Engineering 才关闭；否则保持 fail closed。
