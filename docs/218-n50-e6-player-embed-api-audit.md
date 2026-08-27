# N50-E6 Player 宿主嵌入 API 审计

> 日期：2026-08-27
> 分支：`codex/n50-e6-player-embed-api`
> 基线：N50-E5 最终头 `e5dac3a`
> 授权：`RA-N21-009`，仅 N50 Engineering
> 当前判定：N50-E6 实现、本机完整门、开发浏览器与冷生产浏览器通过；远端门待本分支推送后登记。N50 总出口不在本文件冒充通过

## 1. 冻结目标与边界

E6 关闭 Player Shell 从“只有 Vite 页面入口”到“可由平台宿主显式管理”的工程缺口：对外提供版本化 mount/update/suspend/unmount API，并以独立 `embed.html` 从公开 package export 挂载同一个正式 Player。宿主只持有工程、媒体和生命周期，不解释剧情，正式链仍为 Canonical → Compiler → Runtime/Host → Player Core。

本步不实现 Save/History/Settings/Auto/Skip/Back/Gallery，不建设 Windows/Android 应用壳，也不把响应式 Web 页面称为 Android 包。N50 与 N52 对部分玩家控制范围存在重复，必须先在治理文档中消歧，不能借 E6 偷渡后续节点。

## 2. 实现事实

- `mountWorldPlayerV1(container, options)` 与 `WORLD_PLAYER_EMBED_API_VERSION=1.0.0` 从 `@world-studio/player-shell` 根入口导出。
- Handle 提供 `setProject`、`setMediaAssets`、`setHostActivity`、`getObservation` 和幂等 `unmount`；观察值包含 Core/Compiler/Runtime/Host 版本和当前状态。
- detached container、重复所有权和 disposed handle 均以稳定错误码失败关闭；卸载释放 React root，原容器允许 fresh remount。
- package 升至 `0.5.0-n50`；portable Player Core 保持 `0.3.0-n50`，因为未改变剧情协议。
- Vite 生成普通页与独立 `embed.html` 两个入口；独立宿主只消费公开包入口，并在 Player 外控制暂停、恢复、卸载和重挂。

## 3. 预期—首次实际—修正

| 检查 | 冻结预期 | 首次实际 | 修正与复测 |
|---|---|---|---|
| 严格类型 | 类型与双入口构建直接通过 | 闭包非空收窄和 optional callback 明确 `undefined` 被拒绝 | 稳定非空别名、缺省时省略属性；通过 |
| 宿主观察 | Player 内部推进后标签同步 | Player 已 presenting，标签仍 title | 监听公开 data attributes；标签变为 presenting |
| 暂停后恢复 | 宿主按钮始终可点 | Player 遮罩 z25 覆盖宿主 z20 | 宿主层升至 z40；pause/resume 通过 |
| 冷预览 | 根目录命令可找到 dist | Vite 按根目录找 dist 而拒绝启动 | 从子应用目录启动；冷产物通过 |
| 构建兼容 | 无配置兼容警告 | `__dirname` 触发未来 native loader 警告 | 改为 `import.meta.dirname`；干净重建无该警告 |

原始实际值见 [player-embed-api-browser.json](../evidence/n50/player-embed-api-browser.json)。

## 4. 实测与完整门

- N50 聚合：`5 files / 26 tests`；E6 新增 4 项，覆盖公开入口、身份替换、暂停保持、卸载/重挂和三类失败关闭。
- 开发浏览器：`title → presenting → suspended → active → unmounted → title`；卸载后 Player 节点 `0`，console error/warning `0`。
- 390×844：document `390/390`，控制层横向边界 `20..370`，页面高度 `844`；1280×720 为 `1280/1280`，均无横向溢出。
- 冷 production preview：同一链通过，公开 package self-reference 与 `embed.html` 构建入口实际可运行，console error/warning `0`。
- 本机 `npm run check` 退出 0：普通回归 `142 files / 808 tests`，N50 `26/26`，VM `5/5`、`48.00s <90s`，16 workspace build、架构、Script `13/13`、Route `9/9`、Asset `4/4` 全绿；Route P95 `101.21ms <500ms`。
- Player build：共享 CSS `11.22/3.18 kB`，共享 JS `289.54/89.98 kB`，embed CSS `1.08/0.59 kB`、host JS `2.45/1.15 kB`（raw/gzip）。这只是 Web 工程产物，不是 N80 发布包体结论。
- 既有 Editor build 仍报告单 chunk `938.18 kB` 的 >500 kB 警告；不属于 E6 引入，继续作为性能债保留。

## 5. 需求对齐

E6 直接推进“可嵌入 Web/Windows/Android”与“同一 Player Core、无剧情逻辑复制”的前置工程边界，并让未来 WebView/应用壳可以稳定控制 Player 生命周期。它没有制造第二解释器、没有进入账户/云端、没有把代理浏览器冒充实体设备或真人，方向对齐。

E6 Engineering 通过不等于 N50 总出口、三宿主 Acceptance 或商业 Player 完成。下一判定见 [N50 Engineering 出口复审](219-n50-engineering-exit-reaudit.md)。
