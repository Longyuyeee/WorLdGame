# N43-E5 Production 资源生产工作区审计

> 日期：2026-08-26  
> 分支：`codex/n43-e5-production-workspace`；Draft PR #80  
> 直接基线：N43-E4 最终头 `d4b5f4d76a7a9c177205c8fd235bf83e7b669640`，GitHub run `32930327420` 绿色  
> 授权：`RA-N21-008`，只覆盖 N43 Engineering  
> 判定：**Production 的真实资源生产任务切片通过，七模式可用度由 4/7 提升为 5/7；N43 总出口、Product Acceptance、N50+、M1 与发布继续阻断。**

## 1. 冻结目标与非目标

E5 不是新增一个空面板，也不复制资源状态。它把既有权威 Asset Index / Lifecycle / Dicing / Runtime 资源验证能力组织为 Production 中央任务：

1. 直接显示当前工程的资源数、Index revision、媒体检查、源/派生血缘和 Dicing 候选；
2. 以“入库→安全检查与派生→相似 CG 无损优化→交付验证”表达真实状态和下一步；
3. 提供可过滤的资源映射批量表，实际写入仍进入既有 writer-fenced IndexedDB 事务；
4. 桌面用专业表格，手机用完整状态卡；模式切换、保存退出和重开必须保持同一 stable-ID 上下文。

本切片不宣称 Utage 级本地化/配音列、批量粘贴、多人审阅、正式 Optimization Center、构建打包或 Android 真机已经完成。这些仍按 PRD P1、N70–N72、N91/N92 与产品验收推进。

## 2. 权威边界与实现

- `production-workspace.ts` 是纯投影，只读取 `AssetIndex`、`AssetLifecycleManifest` 和 `LosslessDicingDiscoveryReport`，不保存第二份资源清单。
- `ProductionWorkspace.tsx` 提供指标、非颜色阶段状态、下一任务、搜索/类型组合过滤和资源映射表；“打开资源生产流水线”复用现有 `AssetVaultDialog`。
- 资源导入仍执行真实文件读取、Worker 签名/尺寸/媒体预算检查、SHA-256 Blob 和原子 Index 发布；Dicing 仍使用既有严格相似发现、逐字节重建、编码复决策、Loader/内存/剧情预测/资源编译验证。
- Production 只在真实任务接入后由 disabled 改为 available；Debug & QA、Mobile Focus 继续 fail closed。
- Production 不显示无关的 Sequence/Script/Flow 视图栏；`≤820px` 把表格行投影为六字段状态卡，不改变数据或桌面表格语义。

## 3. 预期—首次实际—修正后实际

| 检查 | 预期 | 首次实际 | 修正后实际 | 判定 |
|---|---|---|---|---|
| 真实测试启动 | 渲染后进入 Production | single-writer 启动门尚在获取 fencing token，模式未挂载 | 测试等待安全编辑权后操作，不绕过租约 | PASS |
| 可访问名称 | 背景过滤与弹窗字段可区分 | 两个 select 都叫“资源类型” | 背景控件明确为“筛选资源类型” | PASS |
| 任务相关性 | Production 只显示生产控件 | Sequence/Script/Flow 仍显示，手机会占底部栏 | 仅 Production 隐藏无关视图栏 | PASS |
| 手机资源审阅 | 六字段无需横向扫描 | 表容器不溢出文档，但内部仍需横向滚动 | 820px 以下改为纵向状态卡 | PASS |
| 真实数据 | 读取工程而非固定 Demo 数值 | `3` 资源、Index `r3`、`3/3` 检查通过、Lifecycle `r19→r21`、2 张可分析图 | 无数据差异 | PASS |
| 组合过滤 | 搜索与类型共同生效 | sunset `1/3`；sunset+audio 空；audio 单独 1 行 | 无差异 | PASS |
| 手机边界 | 390px 无文档横溢出、主操作 ≥44px | 请求 390×844，实际 inner 390 / client 375；按钮 `351×48`；table `351`；scroll/client `375/375` | 无差异 | PASS |
| 保存重开 | Production、Index 与 stable ID 恢复 | 实际 `s3→s4`，重开 `production/restored/media_background`，`3/3` 资源 | 无差异 | PASS |
| 浏览器日志 | warning/error 为 0 | `[]` | 无差异 | PASS |

版本化实际值见 `evidence/n43/production-workspace-browser.json`。

## 4. 自动化与真实测试

- 纯投影正反例覆盖：无存储失败关闭、空 Index、检查通过、Dicing 候选与收益投影。
- Production 产品集成使用真实 `File` 字节，执行媒体检查、原子写入 `Index r1`、表格投影、保存 `s1`、关闭、重新获取 writer lease、重开并恢复同一资源与 stable-ID。
- 既有资源集成改由 Production 入口执行两项相同 PNG 的 SHA-256 去重、Sidecar 幂等、Dicing 发现与 Atlas 发布，以及 Runtime Loader、内存调度、剧情预测、资源编译；MIME 混淆负例保持 Index `r0`。
- N43 聚合门现为 `14 files / 73 tests`，通过；普通回归 `135 files / 776 tests`，storage `1/1`，冻结 VM `5/5`、测试体 `70.20s <90s`。
- 首次全仓门在连续重型集合后，一个既有 Stage 范围选择测试以 `6.21s >5s` 超时；没有放宽 timeout。原样单测复跑实际 `2.68s <5s`，第二次完整 `npm run check` 退出 0，同一 App 集合在 N41/N42/N43 与普通产品回归均通过，判定为本机累积负载差异而非 Production 语义回归。
- 14 workspace 构建、架构、Script/Route/Asset 性能门全绿；Editor production build 为 CSS `116.98/21.44 kB`、JS `925.46/258.19 kB`，既有 `>500 kB` 分包债未关闭。
- 实现头 `afc095d39e91a938dcfc86cff569b5020a1fef88` 已通过远端 Windows / Node 22 完整门：run `32933485910` / job `98070145468`，用时 `11m37s`。普通回归 `135/776`，冻结 VM 测试体 `72.77s <90s`，Route P95 `135.91ms <500ms`；Editor CSS `116.98/21.44 kB`、JS `925.54/258.17 kB`，分包债结论不变。
- 没有以浏览器自动化冒充真人 Product Acceptance。

## 5. 需求与出口对齐

- `USP-01 / AC-03`：Production 与其它模式共享同一 workspace context；资源表来自同一 Canonical Asset Index，不复制 JSON。
- `USP-06 / REQ-UX`：七模式身份仍为 7 个，真实任务可用度提升到 5/7；Production 使用现代多彩层级、明确文字/符号状态和桌面/手机两种密度。
- `REQ-ASSET / AC-22 / AC-23`：真实导入、哈希去重、Dicing、Original 保护与 Runtime 验证链保持可操作；本步没有宣称正式构建收益或三端 Golden。
- `AC-11`：Production 当前写入的是同一工程的权威资源 Index，而不是修改另一套工程；但 Debug & QA、Mobile Focus 仍禁用，且“七模式修改同一语句”的完整字面门仍未通过。

因此 N43 总出口仍为 FAIL：真实任务为 `5/7`，真人为 `0`，main 尚未集成。下一步仍在 `RA-N21-008` 内实现 Debug & QA 的正式 Runtime 诊断/运行任务；完成正例、负例、保存重开、真实浏览器和差异记录前保持禁用。
