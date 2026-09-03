# N62-E1 自动附加内容入口实现审计

> 审计日期：2026-09-03  
> 分支：`codex/n60-e1-debugger-session`  
> 起点：`9bdd1171ca87acfb3f532d5eee193b99e830c9e5`  
> 状态：代码与自动化 Engineering 证据完成；production-browser 证据被本机管理员安全策略阻断，因此 E1 尚未关闭

## 1. 本步交付的用户路径

玩家从正式 Player 推进剧情，Runtime 提交真实 Gallery/Ending 解锁后，可在底部控制区打开“附加”入口。页面从当前 build 的 `artifacts.catalogs` 和当前会话的 `metaProgress` 自动投影 CG 画廊、场景回想、音乐室、结局四类摘要，明确显示总数、已发现、未发现或暂无内容。关闭页面后回到原剧情，Runtime State Hash 与 History Cursor 不改变。

E1 不在 Shell 维护第二份 Catalog，也不提前实现 Replay 会话、Music 解锁规则、作者覆盖或缩略图生成。等待 Effect/Barrier 时入口禁用，避免解锁提交前读取瞬态状态；附加页打开时除 Escape 返回外不把键盘输入透传到剧情。

## 2. 预期、首次实际与纠偏

| 阶段 | 结果 |
|---|---|
| 预期 | 正式 `Canonical → Compiler → Player Core → Player Shell` 路径显示四类自动摘要，返回前后剧情身份不变 |
| 实现前实际 | Core snapshot 没有附加内容投影，Shell 没有入口；新增两条产品测试均失败 |
| 首轮实现实际 | Core/Shell 入口已出现，但测试在 awaited Effect 尚未完成时预期 Gallery `2/2`，真实 Runtime 正确保持 `1/2` |
| 纠偏 | 不篡改 Runtime 解锁时点；等待 Effect/Barrier 时禁用入口，测试先完成正式 Effect，再验证 Gallery `2/2` |
| 修正后实际 | 标题态为 Gallery `0/2`、Replay/Music/Ending `0/1`；推进并提交 Effect 后为 Gallery `2/2`，其余仍按 Meta `0/1`；返回前后 Runtime State Hash 与 History Cursor 相同 |

## 3. 代码所有权

- `packages/player-core/src/player-core.ts`：新增只读 `PlayerAdditionalContentSnapshotV1`，仅消费 Compiler Catalog 与 Runtime Meta；Gallery 按 `unlockedGalleryAssetIds`，Ending 按 `reachedEndingIds`，Replay 按关联 Ending，Music 在正式 Meta 合同建立前保持 0 解锁。
- `apps/player-shell/src/PlayerShell.tsx`：增加可发现入口、四类状态、等待态禁用、Escape/返回剧情和输入隔离。
- `apps/player-shell/src/player-shell.css`：提供桌面四卡与移动单列布局，不改变剧情舞台或既有控制语义。
- `packages/player-core/src/n62-additional-content-player-core.test.ts` 与 `apps/player-shell/src/n62-additional-content-player-shell.test.tsx`：使用真实 Compiler 输出和 Runtime 推进验证，不手写 Player Catalog。

## 4. 审计结果

| 检查 | 结果 | 判定 |
|---|---|---|
| N62 定向路径 | `2 files / 2 tests` | 通过 |
| 受影响回归 | `8 files / 85 tests` | 通过 |
| 根 TypeScript | `npm run typecheck` | 通过 |
| Player Core build | `tsc -b` | 通过 |
| Player Shell production build | JS `420.86 kB / gzip 123.33 kB`；CSS `27.77 kB / gzip 5.93 kB` | 通过 |
| Requirements | 50 requirements、10 USP、13 P0、27 AC、6 owners | 通过 |
| 风险登记 | RA-N21-011 扩至 N62，N62 Product Acceptance 与 N70 Engineering 继续阻断 | 通过 |
| production browser | CUA 在选择已启用浏览器后拒绝打开 `http://127.0.0.1:4174/`，返回管理员安全策略不可用/拒绝；工具规则禁止绕过 | **阻断** |

production build 成功和 jsdom 产品测试不能冒充 production-browser。按照既有补偿控制，本步只能登记“实现候选”，不能登记 E1 Engineering 关闭；应在允许访问本地 production preview 的浏览器环境补齐 1440×900 与 390×844 的入口、状态、返回身份、overflow、44px 与 console 证据。

## 5. 安全与依赖审计

`npm audit --json` 报告一个既有直接依赖高风险：`xlsx` 命中 SheetJS prototype pollution（`<0.19.3`）与 ReDoS（`<0.20.2`），npm registry 没有可用自动修复。该依赖来自 N61 CSV/XLSX 交换，不由 E1 引入；不得隐瞒，也不在本 UI 切片中擅自替换文件格式实现。后续需作为独立、可回归的安全纠偏，评估升级来源或替代库并重跑 N61 双格式往返。

## 6. 与最初需求对齐

- 对齐 Delivery Plan N62 Goal：自动结果已首次进入正式 Player，而非停留在 Compiler 数据结构。
- 对齐 AC-18：四类自动摘要与真实 Gallery/Ending Meta 已接线，但完整页面、Replay、Music 仍未完成。
- 不冒充 AC-17：本步没有玩家流程图，N40 创作者 Route 证据也不等于 N62 玩家自动图。
- 不冒充 AC-20：Windows/Android 正式 Host 与三端一致性归 N92，本步无权关闭。
- 不扩到 N70/N80+/N90+，全部 Product Acceptance 保持阻断。

## 7. 下一接续顺序

1. 在可用 production browser 中补齐 E1 双视口真实证据；通过后更新本文、提交推送并等待 exact-head CI，才关闭 E1。
2. N62-E2：实现 Gallery/Ending 的内容列表、锁定/空/缺失反馈和返回身份；仍消费现有 Catalog/Meta。
3. N62-E3：冻结并实现 Music 的正式解锁 Meta，禁止用“Catalog 中存在”冒充玩家已解锁。
4. N62-E4：实现隔离 Replay Session 和所有退出路径的 Runtime/History/Save/Meta/Host 完整恢复。
5. 后续再做作者标题/排序/封面/剧透/本地化覆盖、缩略图诊断与已发现玩家流程图，最后总出口复审。

每一项都必须独立审计、提交推送并等待 exact-head CI 后再进入下一项。
