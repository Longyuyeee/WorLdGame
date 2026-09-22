# N62-E5 作者目录展示覆盖审计

> 审计日期：2026-09-23  
> 分支：`codex/n60-e1-debugger-session`  
> 起点：`e896a2d59129ec3f7d6d2dd4a714d3a941326f45`  
> 实现头：`5f3f70c7cc081dbd331b7dc60c859f0d9b2dbb5a`  
> 状态：N62-E5 Engineering 已关闭；下一切片为玩家自动 Route

## 1. 原始需求与本步边界

PRD 与 N62 路线要求四类附加内容继续由故事真实引用、可达结局和 Runtime Meta 自动生成，同时允许作者覆盖标题、排序、封面、剧透与本地化，并诊断缺失缩略图。上一接续点明确禁止 Shell 维护第二份 Catalog。

本步只关闭上述展示覆盖与诊断。玩家自动 Route、画廊差分/自定义解锁表达式、Windows/Android 正式 Host、实体设备与三端 Product Acceptance 仍未完成；二元“解锁前显示标题和封面”只覆盖当前冻结的剧透展示策略，不冒充更丰富的多级剧透系统。

## 2. 实际代码审计与权威来源

实现前核对得到以下事实：

- `catalogs.json` 的四类成员由 Compiler 根据可达语句与结局生成，不能由作者 UI 手工增删；
- `ui/screens.json` 已是 Canonical 工程的 UI 配置文件，适合保存稀疏展示覆盖；
- `localization/catalog.json` 已按 stable key 保存源文、译文与审阅状态，不应建立第二套目录翻译；
- Player Core 已是 Catalog、Localization 与 Runtime Meta 的唯一投影边界；Shell 只负责呈现 Core snapshot。

因此冻结并实现以下单一链路：

1. `ui/screens.json` 中稳定 screen `additional_content_catalog` 只保存实际被修改的 `catalog / entryId / title / order / coverAssetId / revealBeforeUnlock`；
2. Compiler 先生成真实 Catalog 成员，再校验和应用稀疏覆盖；重复项、过期目标、非法范围、未知封面与非图片封面均 fail closed；
3. 未配置覆盖的旧工程保持原 Catalog 生成方式，只有附加内容覆盖屏存在时才把缺少可用缩略图作为非阻断 warning 发给作者；
4. Catalog cache identity 只加入该稳定 screen，不因其他无关 UI screen 变化误报资源目录变化；
5. 目录标题沿用现有 stable localization key：Gallery/Music 使用 Asset ID，Replay 使用 Scene ID，Ending 使用 Ending ID；缺失译文计数也包含这些真实玩家文本；
6. Player Core 决定锁定标题与封面是否可见并执行翻译，Shell 不再自行推断剧透规则。

这修正了三个用户痛点：作者不再手工同步成员清单；封面错误会在构建前定位；锁定条目的标题/封面不会因 Shell 分支疏漏而意外泄露。

## 3. 作者与玩家可见行为

- Production 新增“附加内容展示”任务面板，明确说明成员由剧情自动生成；
- 每项显示分类、stable ID、玩家名称、排序、图片封面和“解锁前显示标题和封面”；
- 面板直接显示自动生成总数与缺少缩略图数量，图片选择只列出通过 Asset Index 的图片资源；
- 表格有独立可访问名称；桌面完整展示，移动端只在组件内部横向滚动，不制造页面级溢出；
- 标题覆盖自动进入既有本地化生产、CSV/XLSX 和过期源文流程；
- Player 的 Gallery、Replay、Music、Ending 按编译顺序显示，解锁后显示本地化标题与封面；锁定时默认隐藏，只有作者明确选择后才显示；
- 缺少封面不阻断故事或附加内容，Shell 保持可理解的无图降级。

## 4. 开发中发现并纠正的偏移

1. 首轮只诊断“封面引用无效”，没有覆盖“条目未配置缩略图”。现已补为作者面板缺失计数，并在覆盖配置存在时发出 Compiler warning；非法引用仍为 error。
2. 首轮对所有旧工程直接发缩略图 warning，导致既有正式 Preview 把非阻断诊断误当启动失败。现已收敛为旧工程零行为变化，作者进入覆盖合同后才产生 Compiler warning。
3. Catalog schema 扩展改变 Build ID，正式 Runtime State/History Golden 随 build identity 合法变化；Story IR Hash 与路线语义保持不变，相关 Golden 已按实际产物重新冻结。
4. Production 新增第二张表后，旧测试依赖“页面唯一 table”。现已给两张表补独立可访问名称，并让测试按用户可感知名称定位。
5. 完整 workspace build 比增量 typecheck 更早发现只读 JSON union 缩窄不足；已使用显式 `JsonObject` 窄化并通过干净全构建。

## 5. 验证结果

| 检查 | 结果 |
|---|---|
| N62 定向链 | `5 files / 47 tests`，PASS |
| 普通测试 | `170 files / 1010 tests`，PASS |
| Editor 集成 | 8 个集成文件、合计 54 tests，PASS |
| Storage / VM | Storage `1/1`；VM `5/5`，PASS |
| TypeScript / 构建 | TypeScript 与 17 workspace build，PASS；仅保留既有 Editor 主 chunk warning |
| 架构审计 | `101` portable files / `4` Node adapter files，PASS |
| Canonical 持久化 | 稀疏覆盖保存、重开后 `ui` 字节语义一致，PASS |
| Compiler | 生成成员不可被覆盖清单替代；排序/标题/封面/剧透确定性应用；无效目标与封面 fail closed，PASS |
| Localization | 目录标题进入稳定文本键；Player 翻译、过期/缺失回退和计数，PASS |
| 防剧透 | 默认锁定标题与封面均为 `null`；仅明确 reveal 后可见，PASS |
| 浏览器 | Chrome production 1440×900 与 390×844；标题编辑生效；4 个自动条目/4 个缺图；document overflow `0`；console/exception `0` |

机器证据为 `evidence/n62/additional-content-e5-authoring-browser.json`。截图 SHA-256：

- desktop：`9c1cb2f7f7f9db2f4df08ab0ab6f52f900441ecaaf36cef75fba67d58c6f23fb`
- mobile：`2a9835ea72ce55449f8dc29ffd830b9c54875ff39fc00b5f585461917b76cbad`

视觉复核确认桌面五列可扫描；390×844 下工作模式与任务状态仍可见，宽表限制在面板内部滚动，后续本地化卡片不被页面级横向溢出破坏。

## 6. 远端门与接续点

实现头 `5f3f70c7cc081dbd331b7dc60c859f0d9b2dbb5a` 已推送到 Draft PR #123。exact-head GitHub Actions `product-baseline` run `35762476885` / Windows job `106863672405` 于 2026-09-23 成功，完整 job 用时约 `14m52s`。

下一步严格进入 N62 玩家自动 Route：

1. 先审计现有 `@world-studio/route-graph`、Compiler 可达信息、Runtime Meta 与 Player Additional Content，冻结“已发现路线”的唯一判断；
2. 在正式 Player 附加内容中提供自动路线视图，只显示玩家实际发现的节点/边，不从作者 Flow UI 复制第二份图；
3. 返回剧情必须保持 Runtime、History、Host、Save、Meta 与播放策略不变；空状态、分支未发现和数据不完整必须有明确反馈；
4. 完成后统一复审 N62 Engineering；AC-17/18/20、Windows/Android 正式 Host、实体设备和三端 Product Acceptance 在正式证据前继续阻断。

N70 Engineering、N21/N23 真人、M1 Stable 与发布仍未开始或仍被阻断。
