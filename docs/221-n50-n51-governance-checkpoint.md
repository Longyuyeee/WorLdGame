# N50→N51 Gal Settings Engineering 治理检查点

> 日期：2026-08-27
> 分支：`codex/n50-n51-governance`
> 直接基线：N50-E6 最终绿色头 `6580b34`
> 授权：`RA-N21-010`，最大节点 N51，2026-09-26 15:07:12（UTC+8）到期
> 判定：只准入 N51 Engineering；N51 Product Acceptance、N52+、Android 实体包、M1 Stable 与发布继续阻断

## 1. 触发与前置事实

N50-E1–E6 已完成正式 Core、媒体、输入、生命周期和 v1 嵌入 API；实现头与最终文档头两轮 Windows / Node 22 完整门均绿色。范围消歧确认 Settings 唯一属于 N51，Save/History/Auto/Skip/Back 唯一属于 N52，因此 N50 Engineering 通过、Product Acceptance `0/1`。

产品负责人已被告知 RA-009 最大到 N50、N50/N52 范围冲突和 N51 阻断，随后于 2026-08-27 再次明确要求进入后续步骤，并要求真实预期—实际差异、修正、文档、逐步审计、需求对齐和推送。因此关闭 RA-009，建立只覆盖 N51 Engineering 的 RA-010。这不解除真人、产品、设备或发布门。

## 2. 有界授权

RA-010 允许：

- N51 typed Gal Settings schema、默认值、default→project→platform 继承和严格序列化；
- Basic/Advanced、搜索、恢复默认、继承来源和实时预览的有序 Engineering 切片；
- Windows/Web/Android Profile 作为同一 schema 的覆盖数据，不建立平台语义分叉；
- 桌面与 390×844 production-browser 的真实操作和差异修正。

RA-010 不允许：

- N51 Product Acceptance 或任何真人门通过；
- Save/History/Auto/Skip/Back/Forward 玩家产品化（N52）；
- Windows/Android 正式应用、APK/AAB、签名、安装、M1 或发布；
- 用无效占位控件、静态设置表或浏览器 localStorage 冒充正式 typed settings / Project 数据。

## 3. 真实正反例

| 检查 | 预期 | 实际 | 判定 |
|---|---|---|---|
| 唯一 active | RA-010 active，RA-001–009 closed | 策略门通过 | PASS |
| N51 正例 | current/maximum 均为 N51 | 专用正例通过 | PASS |
| N52 越界 | current=N52 被拒绝 | `RA-N21-010: current delivery node exceeds the accepted maximum` | PASS |
| N51 产品门 | 缺失阻断被拒绝 | `active N21 exception must block N51 Product Acceptance` | PASS |
| 旧例外 | RA-009 恢复 active 被拒绝 | active 身份与 superseded 两项精确失败 | PASS |
| 真人记录 | N21 `0/1`、N23 `0/2` | 均保持 pending | PASS |

治理切片没有修改产品 UI，因此没有宣称浏览器实测；N51-E1 产品代码开始后恢复 production-browser 证据。

## 4. N51-E1 冻结起点

1. 建立独立 portable typed settings package，不依赖 React、DOM、文件系统或平台壳；
2. 先覆盖一组能贯通继承的 P0：显示/文本/推进/音量/输入基础值，而不是一次铺满 UI；
3. 冻结 canonical defaults、project override、platform override、来源追踪、非法值拒绝和 deterministic serialization；
4. 用正反例证明 reset 只删除当前层覆盖、平台 Profile 不修改项目层；
5. E1 不进入 N52，不创建存档/历史/自动/快进按钮。

## 5. 关闭条件

风险策略、需求追踪、真人 pending、交付基线、文档格式与完整仓库门必须通过；远端 Windows / Node 22 在同一治理头绿色后，本检查点才关闭并允许建立 N51-E1 分支。

## 6. 本地真实验证（2026-08-27）

| 验证 | 冻结预期 | 实际 | 差异与处置 |
|---|---|---|---|
| 普通自动化 | 全部通过 | `142 files / 808 tests` PASS | 无功能差异 |
| N50 Player 专门门 | 全部通过 | `5 files / 26 tests` PASS | 无功能差异 |
| 编辑器集成 | 全部通过 | `45/45` PASS | 无功能差异；保留既有 Node localStorage 路径警告，不影响判定 |
| 存储一致性 | 全部通过 | `1/1` PASS | 无功能差异 |
| VM 10,000 seeds | `< 90 s` 且 replay equality | 完整串行检查首次 `102.913 s` 超时；无并发隔离复跑 `81.96 s`、`5/5` PASS | 首次实际超出门限 `12.913 s`；未放宽门限，保留为本机累积负载/性能余量风险，交由同头远端完整门复核 |
| 构建 | 16 workspace 全部构建 | PASS | editor 主 bundle `938.18 kB` 仍有既有 `>500 kB` 警告，未把警告冒充失败或在治理切片越界改产品代码 |
| 架构 | portable / adapter 边界无违规 | PASS，95 portable files、4 Node adapter files | 无差异 |
| Script 性能 | 全部低于预算 | `13/13` PASS | 无差异 |
| Route 性能 | P95 `< 500 ms` | P95 `171.51 ms`，`9/9` PASS | 无差异 |
| Asset 性能 | 全部低于预算 | `4/4` PASS；dicing total `3036.79 ms < 5000 ms` | 无差异 |

本地结论采用 fail-closed：由于一次完整串行门在 VM 处真实失败，本检查点尚不以本地结果宣称关闭；只有同一提交的远端 Windows / Node 22 完整 `npm run check` 绿色，才可关闭该波动疑点。此次仅修改治理、策略测试和文档，没有产品 UI 变化，因此不制造浏览器截图来替代下一切片的 production-browser 操作证据。

## 7. 远端裁决与检查点结论

治理实现头 `649fc08` 的 Draft PR #90 Windows / Node 22 完整门 run `33050123723` / job `98443305419` 用时 `12m14s`，结果 PASS。远端普通回归为 `142 files / 808 tests`，N50 为 `5 files / 26 tests`；VM 10,000 seeds replay equality 实际 `68.403 s`、VM 总测试 `68.51 s < 90 s`；Route P95 `146.72 ms < 500 ms`，Script `13/13`、Route `9/9`、Asset `4/4` 均通过。

预期与实际裁决：预期 VM 在冻结门限内；本机完整串行首跑超限、隔离复跑和同头远端完整门均低于门限。没有代码功能差异需要掩盖，也没有放宽预算；将本机性能余量偏低保留为后续观测风险。本治理检查点据此关闭，允许从该最终绿色基线建立 N51-E1；N51 Product Acceptance、N52 Engineering、真人/实体设备、M1 和发布仍保持阻断。
