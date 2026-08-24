# N40-E8m 诊断定位与直接导航审计

> 日期：2026-08-24
> 实现基线：`a7c7471`
> 分支：`codex/n40-e1-route-graph-core`，Draft PR #59
> 授权：`RA-N21-005`，仅允许 N40 Route Map Engineering
> 判定：E8m 本地 Engineering 证据已通过，远端 Windows / Node 22 完整门待本次推送后登记。N40 Product Acceptance、N41+、M1 Stable 与发布继续 fail closed。

## 1. 冻结目标与范围

E8m 的用户结果是让 Route Map 不再只“报告问题”，而能把创作者带到问题所在：

1. 点击带场景的正式 Compiler 诊断，清除会妨碍定位的过滤/结局审阅状态，锚定包含目标场景的 64 节点窗口并选中 stable scene；
2. 诊断同时携带可验证的顶层 `statementId` 时，进入同场景 Writer 并聚焦精确内容卡片；
3. 双击 Route 节点进入同一 stable scene 的 Writer；
4. Choice 场景目标、Jump/Call 标签目标可直接导航；悬空、缺失和全局诊断失败关闭；
5. 导航是只读行为，不修改 Canonical Project，不引入第二份路线语义；
6. 继续保持 64 节点窗口、默认 16:9 Preview、手机无横向溢出和 10k 性能门。

本切片没有实现目标名称编辑或自动补全写回。那会触及 Story Language/Project Service 的结构事务，必须在 E8n 只补 Route 修复闭环所需的最小写路径，或留到 N41；不能用普通输入框绕过正式事务边界。

## 2. 实现结果

- portable `locateRouteDiagnostic` 明确返回 `located`、`global` 或 `missing-scene`，只透传正式 Compiler 的 stable scene/statement ID。
- `focusRouteScene` 统一供节点、连接、Inspector 和诊断使用；导航前清除搜索、章节/类型/分组过滤、结局候选审阅和旧窗口 offset，再以 `anchorSceneId` 进入正确局部窗口。
- Route 节点单击仍用于选中，双击进入同场景 Writer；没有改变剧情内容或布局。
- valid Choice edge 与 Inspector 场景目标成为可访问按钮；dangling edge 保持不可导航。
- Inspector 能解析当前场景内的 Jump/Call label target；合法目标进入 Writer 并聚焦 label 卡，缺失目标禁用。
- 诊断只有在场景存在时允许定位；只有 `statementId` 确实对应当前 StoryProject 的顶层语句时才显示“进入内容”，避免把 option/entity ID 误当作可聚焦卡片。
- 手机诊断操作区折为单列；桌面保持信息与操作分栏。

## 3. 真实测试：预期、首次实际、差异与修正

| 检查 | 预期 | 首次实际 | 修正后实际 | 判定 |
|---|---|---|---|---|
| 无效工程打开边界 | 产品只打开结构有效的 Story Project；Compiler 路线诊断在该边界之后产生 | 最初测试夹具让 Choice 指向不存在场景，实际在 Project projection/open 边界以 `MISSING_TARGET_SCENE` 正确拒绝，未进入 Session | 保留 fail-closed；夹具改为结构有效但存在闭环/不可达语句的工程，由正式 Compiler 产生 `NON_INTERACTIVE_LOOP`、`NO_REACHABLE_ENDING`、`SCENE_NO_EXIT`、`UNREACHABLE_STATEMENT` | 发现测试前提错误并修正，没有削弱产品校验 |
| Route portable helper | 有场景、全局、缺失场景三种状态精确 | 3 种状态与 stable ID 均一致 | 无需修正 | 通过 |
| 诊断跨窗口定位 | 65 场景首窗 `1–64 / 65`；点击后为 `65–65 / 65` | 与预期一致，目标节点 `aria-pressed=true` | 无需修正 | 通过 |
| 精确内容定位 | `UNREACHABLE_STATEMENT` 进入 Writer 并聚焦对应 End 卡；全局诊断禁用 | 功能行为正确；首次断言遗漏卡片可访问名中的类型前缀“结局 ·” | 断言对齐真实可访问名 `选择结局：结局 · Never` 后通过 | 关闭测试断言差异 |
| 目标导航只读性 | Choice/label 导航正确且不触发 Project mutation | Scene target 选中正确；label 卡获得焦点；`onProjectChange` 调用数不增加 | 无需修正 | 通过 |
| 10k 诊断定位 | 定位并锚定局部窗口 `<250 ms`，最多 64 节点 | 独立实测 `2.51 ms`；全门复测 `2.18 ms`，窗口 `9984–10000`，挂载 16 节点 | 无需修正 | 通过 |
| desktop production | 连接目标、Inspector 目标、节点双击均走真实生产页面 | 天台/广播室 stable scene 精确选中；双击天台进入同场景 Writer | 无需修正 | 通过 |
| Preview 默认画幅 | 仍为 `16:9 · 标准横屏` | value 为 `landscape-16-9`；实测舞台 CSS 比例约 `1.786`（布局取整），目标为 `1.777…` | 差异约 0.5%，无语义或断点偏移；保留现有 16:9 profile | 通过 |
| 390×844 production | Flow 可用且无横向溢出 | `innerWidth=390`、document `scrollWidth=375`，Flow 保持选中 | 无需修正 | 通过 |
| 控制台 | 0 warning / 0 error | `[]` | 无需修正 | 通过 |

浏览器测试使用 Editor production `dist`，由 `vite preview` 在 `http://127.0.0.1:4173/` 提供。示例工程本身没有 Compiler 路线诊断，因此 production browser 验收连接目标、Inspector 目标、双击、16:9 和手机布局；诊断正反例由实际 App + 正式 Project/Compiler 链路执行，不以静态 mock 列表伪造诊断。

## 4. 本地全仓门

`npm run check` 退出码 0：

- 普通并行测试：`113 files / 719 tests`；
- storage conformance：`1/1`；重型 VM：`5/5`；
- Runtime corpus：10,000 seeds、20,000 replays、40 chunks，digest 不变；
- workspace、需求、风险、delivery baseline、PR traceability、Golden、Compiler、Runtime、typecheck、全部 workspace build、architecture、Script/Route/Asset performance 全部 PASS；
- Route performance：`8/8`，诊断定位与局部窗口 `2.18 ms <250 ms`；
- Editor production build：CSS `87.02 kB / gzip 16.39 kB`，JS `835.28 kB / gzip 234.84 kB`；既有 `>500 kB` 拆包 warning 未关闭，也没有被误报为功能失败。

N21 仍为 `0/1 pending-participant`，N23 仍为 `0/2 pending-participants`，M1 纵向验收仍为 `0/27`。自动化与浏览器证据不能替代真人产品验收。

## 5. 需求对齐与剩余边界

E8m 关闭了功能优先复审中的“诊断定位”“直接进入场景”和“合法目标只读导航”缺口，且没有扩张 topology cache、平台壳、发布工程或 N41 全量 Sequence。

仍未关闭：

- 目标名称编辑/自动补全的正式结构事务；
- “发现问题 → 修改目标/内容 → 保存 → Compiler/Route 重建 → Formal Runtime Preview 抵达目标结局”的单一修复闭环；
- 键盘专用的 Route 诊断快捷入口（当前按钮可正常 Tab 聚焦/激活，但尚无专属快捷键）；
- 正式 Player、完整 Sequence/Stage 和三端发布。

下一步冻结为 N40-E8n Route 驱动创作修复闭环。只补闭环必须的最小目标编辑，写入必须经过正式 Story Language/Project Service/Compiler，并以 fake-IndexedDB 重开、revision race 反例和 Formal Runtime 实际结局作最终判断。
