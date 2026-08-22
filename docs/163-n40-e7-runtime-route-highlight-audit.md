# N40-E7 Runtime 运行路线高亮审计

> 日期：2026-08-23  
> 实现提交：`6fbc800495726a7666516fd6ba19b35f86751c5c`  
> 测试纠偏提交：`fb63329b6bc9c80e955b76f37731a88378b94106`、`bae2b7569d2d197f386147765e45c488b52bc74f`
> 范围：Formal Runtime History → Editor Preview → Flow Route Map 的当前场景、已访问场景、已走连接只读投影

## 1. 需求与顺序审计

N40 的冻结范围明确包含“路线高亮”。E6e 之后真实剩余项为运行路线高亮、冷启动存储级正文局部读取、production browser 复验与产品验收。代码审计确认 Formal Runtime 已维护带 cursor 的 History、Source Map 和 `choiceSelected.optionId`，但 Flow 完全没有消费运行状态；因此 Runtime 已知道走过哪里，Route UI 却不可见，这是本切片的直接偏移。

冷启动正文局部读取仍缺少可信宿主协议，不能为了沿用 E6 编号而伪造变更日志或跳过正文 Hash 校验。故下一顺序节点冻结为 E7 运行路线高亮，冷启动协议继续保持未完成。

## 2. 冻结语义

- 当前场景只取 Formal Runtime 当前 Source Map 位置；
- 已访问场景只取当前 History cursor 之前实际产生事件的场景；
- 已走连接只取当前 cursor 之前的 `choiceSelected.optionId`，该稳定 ID 与 Compiler Route edge ID 对齐；
- Back 必须撤销未来连接与场景高亮，Forward 必须恢复同一轨迹；
- Flow 只读取运行轨迹，不写 Canonical Project，不制造第二份剧情状态；
- Runtime 当前场景位于 64 节点窗口外时，Route Window 必须按该场景重新锚定；
- 退出试玩后清除运行高亮，编辑器普通选择态继续独立存在。

## 3. 红灯与实现

红灯命令：

```text
npm exec vitest run apps/editor/src/formal-preview-runtime.test.ts apps/editor/src/route-map-app.test.tsx
```

初始结果为 `2 files / 20 tests`，其中 `17 passed / 3 failed`：`visitedRouteEdgeIds` 为 `undefined`，Flow 中不存在“运行路线高亮”状态。这证明缺口位于真实数据链，而非单纯样式。

实现结果：

1. `FormalPreviewState` 新增 `visitedRouteEdgeIds`，从 active History cursor 内的 choice input 精确投影；场景和连接均用 Set 去重并保留首次访问顺序；
2. PreviewPanel 将 Formal Runtime 轨迹提升为 App 只读状态，Flow 不自行推断 choice 或 scene；
3. Route node 显示当前运行/已访问，暴露 `aria-current="step"` 与机器可检验状态；连接按稳定 option/edge ID 显示“已走过”；
4. Back/Forward 直接复用 Formal Runtime checkpoint 后重新投影，未增加 UI 私有历史；
5. Runtime 场景变化会重置显式分页偏移并以当前场景锚定有界窗口；搜索/类型/章节/分组过滤仍保持用户控制，过滤隐藏当前场景时不静默改过滤条件；
6. 高亮 CSS 使用既有设计 token；连接徽标单独占据网格行，避免与 dangling 错误状态混色。

## 4. 实际测试结果

最终定向测试：`2 files / 21 tests` 全部通过，覆盖：

- 广播室/天台两条正式 Compiler/Runtime 路线分别记录 `opt_broadcast` / `opt_rooftop`；
- Back 撤销已走连接，Forward 恢复同一连接；
- Flow 当前/访问节点及实际 edge 同步更新；
- 三场景完整 App 链验证 Runtime → Flow 当前/访问/edge 高亮，以及 Back 撤销、Forward 恢复；
- 真实 65 节点 Compiler Route Graph 验证运行场景位于窗口外时，锚点策略和窗口查询得到 `65–65 / 65`；
- TypeScript project build 通过。

首次实现头 `6fbc800` 的 Windows CI 在跨窗口 UI 用例触发默认 5 秒 timeout（103 files / 657 tests 已通过，只有该用例失败）。没有提高 timeout 或删除验收；第一次纠偏把 fixture 从 64 段连续 choice 改为一个入口 choice 连接其余 64 个合法结局，移除了与窗口验收无关的连续执行负载。该提交一度远端通过，但文档头再次出现同一 timeout，证明整应用挂载 65 场景仍受共享 runner 负载影响，不能把一次绿灯当成稳定通过。

第二次纠偏按职责拆分验收：三场景完整 App 用例继续覆盖真实 Runtime → Flow 高亮、choice edge 以及 Back/Forward；跨窗口边界则导出无副作用的运行锚点策略，并以真实 65 节点 Compiler Route Graph 和正式 `queryRouteGraphWindow` 验证第 65 场景回锚。该边界用例连续三次实跑为 `11–13 ms`。没有提高默认 timeout，也没有删除任一产品断言；只是避免用整个 Editor/Runtime 生命周期重复验证纯窗口边界。

完整 `npm run check` 退出码为 0：

- 普通并行测试：`104 files / 658 tests`；
- 存储一致性：`1/1`；VM 重载一致性：`5/5`；
- Runtime：`10,000 seeds / 20,000 replay executions`，0 failed seeds；
- 所有 workspace production build 完成；Editor CSS `84.48 kB`（gzip `15.97 kB`），JS `772.13 kB`（gzip `218.49 kB`），既有 `>500 kB` warning 保留；
- 架构：`91` portable files、`4` Node adapter files；
- Route 10k full projection `1738.57 ms`，index `5.36 ms`，three queries `3.64 ms`；
- Route 局部编辑 20 样本 P95 `62.14 ms`，预算 `<500 ms`；
- Script、Route、Asset 全部性能门通过。

Vite 以 `npm run dev --workspace @world-studio/editor -- --host 127.0.0.1 --port 5177` 实际启动，ready `111 ms`。应用内浏览器两次在页面加载前因管理员安全策略校验服务不可用而拒绝 localhost；没有绕过控制，也没有用 Vite ready 冒充浏览器交互通过。因此 production browser 仍明确记为未验证。

GitHub Windows / Node 22 完整门按真实结果保留完整链路：

1. 实现头 `6fbc800`：run `32588154189` / job `97067570183`，2m33s，单一跨窗口 UI timeout，失败；
2. 第一次纠偏头 `fb63329`：run `32588504610` / job `97068432489`，3m31s，完整通过；
3. 文档头 `3fb0768`：run `32588725352` / job `97069033851`，2m43s，再次发生同一 timeout，证明确有负载敏感性；
4. 稳定化头 `bae2b75`：run `32589014554` / job `97069769247`，3m40s，locked install、完整产品基线及 post steps 全部通过。

## 5. 结论与剩余工作

E7 关闭 N40“Runtime 运行路线高亮”Engineering 子门，并保持 Canonical Project、Compiler graph 与 Runtime History 的单一事实来源。它不关闭：

- 冷启动存储级正文局部读取；
- E5/E6d/E6e/E7 production browser 复验；
- N40 Product Acceptance；
- `RA-N21-005` 阻断的 N41+、M1 Stable 与发布。

下一步必须先冻结可校验的冷启动正文局部读取协议；若无法在不削弱正文 Hash/缓存失效保证的前提下成立，应记录为 N40 Product Acceptance 的真实阻塞，不得以已有 selective read API 冒充完成。
