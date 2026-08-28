# N51-E6c Stage / Audio 默认策略入口合同

> 日期：2026-08-28
> 分支：`codex/n51-e6-p0-coverage-exit`
> 直接基线：N51-E6b 最终绿色头 `53f0acd`
> 授权：`RA-N21-010`，最大节点 N51
> 当前判定：实现与本地真实证据已完成；等待完整门、推送及同头 Windows / Node 22 CI 裁决

## 1. 目标与字段

E6c 只增加现有 N42 Stage / N50 Player Host 能真实消费的默认策略：

| 字段 | 默认值 | 层级 | 实际效果 |
|---|---:|---|---|
| `stage.defaultDurationMilliseconds` | `360` | Advanced | 当 Stage Effect 未显式给出 `duration/fade` 时，Editor Preview 与 Player 使用该默认时长 |
| `stage.defaultEasing` | `linear` | Advanced | 当 Stage Effect 未显式给出 `easing` 时，Editor Preview 与 Player 使用该默认缓动 |
| `audio.resumeAfterInterruption` | `true` | Basic | Player Host suspend 必须暂停媒体；恢复 active 时仅在此策略为 true 且 Effect 仍为 playing 时恢复 |

字段总数由 29 增至 32，Basic 由 20 增至 21。严格文档形状变化使当前写入版本由 v3 提升为 v4；v1/v2/v3 按各自历史字段白名单读取并统一写 v4，v3 伪装 v4 字段必须 `UNKNOWN_FIELD`，v5+ 必须 `FUTURE_SCHEMA`。

## 2. 优先级与停止边界

1. Story/Runtime Effect 中显式 `duration`、`fade`、`easing` 永远高于 Settings 默认值；Settings 不改写 Story、Compiler IR、Runtime State 或 receipt。
2. `audio.resumeAfterInterruption=false` 只阻止宿主恢复时自动调用 `play()`；suspend 仍必须调用 `pause()`，Effect 的 stop/pause 状态也不得被设置覆盖。
3. 不增加 `defaultFadeMilliseconds`：当前 Web Host 没有真实 gain ramp，实现该字段只会产生假设置。淡入淡出执行待形成可测试音频 envelope 后再准入。
4. 不实现设备切换、声像、响度、音频资源映射或实体移动端中断；这些仍属于 N50/N61/N70/N80–N82 后续边界。

## 3. 冻结测试

- parser/catalog/application：v4 迁移、32/21、来源、范围、默认/显式时序解析、音频恢复策略投影；
- Editor：Canvas 与 DOM fallback 都必须读取同一默认时长/缓动，显式 Stage 参数保持优先；
- Player：无显式时序的 Effect 使用 Settings 默认，显式 400ms 等不被覆盖；suspend 始终 pause，resume policy false 时不调用 play 且 Core 不变；
- production browser：冷 production build 上读取真实 computed animation/transition timing，并以真实 visibility suspend/resume 或宿主入口验证音频策略；
- 先记录首次失败数和具体差异，再实现；不得删除断言、缩减 corpus 或放宽预算。

## 4. 首次实际与差异修正

冻结断言后首次运行 9 files / 82 tests，实际为 68 通过、14 失败：schema 仍写 v3，Catalog 仍为 29/20，Stage section 与 Audio boolean 被严格 parser 拒绝，Preview/Player 仍使用各自历史 300/320/360ms fallback，Player 恢复路径无策略门，Editor/Player 也没有新 application 属性。这些失败与冻结缺口一致，剩余 68 项无回归。

首次实现后为 81/82；唯一差异是旧 Canvas 测试仍期望无效 duration 回退 300ms。E6c 已把所有未声明或无效来源统一回退到当前配置，默认值为 360ms，因此更新历史断言为 360ms，没有删除测试或放宽范围。代码复审又发现 Canvas 背景与角色透明度仍按线性进度执行，补上默认/显式 easing 的真实进度计算与反例后，最终定向 9 files / 83 tests 全绿，N51 聚合 10 files / 87 tests 全绿。

Compiler Golden 首次实际只改变四个 Build ID：tiny `a42db4db…338b7`、branching `f0ff6099…1589`、media `cee30dc1…23d5`、cjk `a95a441a…d5cd`；四个 Story IR Hash 完全不变。只更新 source identity，未修改 IR/路线/Outcome 断言。

## 5. 真实实现链

- `@world-studio/gal-settings` 当前写 v4，分别保留 v1/v2、v3、v4 字段白名单；Stage 两字段与 Audio boolean 进入 default/project/platform、source、ChangeSet、Undo/Redo 和确定性序列化。
- Catalog 为 Advanced 32 / Basic 21；Settings Workspace 可搜索、编辑和提交 Stage 默认策略及 Audio 中断恢复策略。
- application v1 投影 `stage` 与 `audio.resumeAfterInterruption`；统一 helper 解析显式 `ms/s` 与 easing，并保持显式 Effect 优先。
- Editor Canvas、DOM fallback、Camera、Background、Character 全部接收同一 Stage 默认；显式 duration/easing 不被覆盖。
- Player presentation adapter 把默认策略应用于缺省 Effect，Player DOM 写入实际 animation duration/timing；Host suspend 始终 pause，active 仅在策略允许且 Effect 仍 playing 时 play，否则标记 `paused-by-policy`，Core state 不变。

## 6. Production browser 预期—实际

| 链路 | 冻结预期 | 实际 | 判定 |
|---|---|---|---|
| Editor 冷 production build | Basic 21；Web Audio 两字段同一 ChangeSet；保存、释放、重开后值和来源不丢失 | `visibleSettings=21`；master `0.4`、resume `false` 均为“Web 覆盖”；保存 `s1` 后重开恢复；1440×900/390×844 overflow 0，console 0 | PASS |
| Player 冷 production build | 热应用 Stage 720ms/ease-out 与 audio resume=false；settings-only 不改变活跃对白/Core | before `360/linear/true`，applied `720/ease-out/false`；对白仍 presenting 且文字相同；console 0 | PASS |
| 移动视口 | 390×844 无横溢出，控件至少 44px，portrait ratio 正确 | Editor undersized `[]`、overflow 0；Player overflow 0，stage ratio 0.5625 | PASS |

机器证据见 `evidence/n51/settings-ui-browser.json` 与 `evidence/n51/settings-runtime-browser.json`，截图由同一次真实 Chrome 151 production run 生成。

## 7. 需求对齐与诚实边界

本切片关闭的是 N51 的 Stage/Audio 默认策略配置与现有 Web Host application，不是音频淡入淡出引擎或三端产品验收。没有新增假 `defaultFadeMilliseconds`，没有覆盖 Story/Runtime 显式事实，没有创建第二 Stage/Audio store，也没有进入 N52 播放控制、N61 映射、N62 页面或 N80–N82 实体宿主。Windows/Android 中断语义和真实设备证据继续失败关闭。

E6c 完成后下一切片只能进入 **E6d Choice/Route/UI presentation policy**；开始编码前仍须先审计现有 Choice、Route 与 Player 页面真实所有权，排除依赖 N52 调度或 N62 页面生成的字段。

## 8. 退出门状态

- 定向：9 files / 83 tests，PASS；
- N51 聚合：10 files / 87 tests，PASS；
- TypeScript project references：PASS；
- 双 production browser：PASS；
- 首次完整门普通回归为 149 files / 875 tests，其中 871 通过，4 个冻结 source identity 断言失败；更新两条路线 State、Scene/Statement、History 与空白工程 semantic hash 后对应 2 files / 15 tests 全绿。第二次从头全门在前序重负载后，既有 `App.test.tsx` 2/45 项分别 6.45s/8.17s 超过冻结 5s；隔离复跑仍因本机负载为 42/45。未修改 timeout，等待同头 Windows / Node 22 CI 裁决；
- 提交/推送与同头 Windows / Node 22 CI：待完成，完成前不得把 E6c Engineering 标为关闭。
