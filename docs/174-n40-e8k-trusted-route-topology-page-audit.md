# N40-E8k Trusted Route Topology Page 审计

> 日期：2026-08-24
> 实现提交：`192b2bbd776b731d9188f2e2a713433255618be8`、性能纠偏 `37ee47c2664ccd518889d5cb7a920a38b38397ca`
> 范围：Route-first topology 权威读取、选中 scene/layout 分页、缓存路径索引、revision/Hash 失败关闭与 10k 性能门
> 结论：Route 首屏和换窗不再读取全部 SceneDocument；它只读取 manifest、全部 chapter 拓扑、当前最多 64 个 scene 与对应 layout，并保持同一 trusted source revision、逐个正文 size/SHA 校验及前后 generation/version 稳定。100 场景首窗由 `[1,1,100,64]` 降为 `[1,1,64,64]`，源文件数由 166 降为 130；10k Windows 实测 `301.56 ms < 500 ms`。这关闭 N40 的 structure/topology 分页缺口，但不等于完整工程按需加载、N40 Product Acceptance 或 N41 准入。

## 1. 需求对齐与真实缺口

E8j 后的 Route UI 虽只挂载 64 个节点，但 `readTrustedRouteOverview` 仍调用 `readTrustedProjectStructure`，先把所有场景结构正文读入内存。100 场景首窗的真实批次是 `[1,1,100,64]`；因此“窗口有界”只成立在 DOM/图查询层，不成立在存储正文读取层。

E8k 冻结以下边界：

1. manifest 与全部 chapter 必须读取，用于获得权威章节顺序和完整 topology；
2. scene/layout 正文只读取当前 Route window，单页最多 64，底层通用 API 上限 256；无匹配查询只能出现 `[1,1]`；
3. 每个实际读取正文必须与 trusted commit 的 path/size/SHA-256 一致；读前后 version/generation 必须稳定；
4. Route artifact 必须绑定 exact sourceVersion、完整图、图节点顺序对应的权威 scenePaths 和 envelope Hash；
5. 不能从 `scenes/<id>.json` 文件名猜 scene ID。自定义合法路径必须工作，图节点 ID/标题必须与选中真实 SceneDocument 对齐；
6. Script、角色、变量、资源和其他全局正文不得被 Route window 顺带读取；
7. 本节点只纠正 N40 Route topology 读取，不开放其他 P0 结构命令，不进入 N41。

## 2. 红灯与两次纠偏

首轮红测实际得到 `2 files / 4 failed / 6 passed`：分页 API 不存在，两个 Route 窗口仍分别读取全部 100 个 scene。初版分页实现把批次收敛为 `[1,1,64,64]`，但 10k 本机为 `636.47 ms > 500 ms`；随后把 scene/layout 合并到同一个读前/读后 trusted envelope，本机降至 `395.65 ms`，复跑为 `264.30 ms`。

继续审计发现更重要的语义偏移：初版用 scene 文件名反推 ID，而 Canonical schema 只规定 chapter.scenePaths 指向 SceneDocument，并不要求文件名等于 scene.id。修复包括：

- `route-graph` 改为按 Canonical chapter 路径数量与 `project.scenes` 的权威顺序建立章节 sceneIds；路径/场景基数不一致失败关闭；
- Route artifact 升级为 v2，保存图节点顺序对应的 canonical scenePaths，不再猜文件名；
- 自定义 `content/opening.json` / `content/finale.json` 的真实 save/compile/publish/read 测试通过；
- 即使攻击者同时修改图标题并重算 envelope Hash，选中页仍会与真实 SceneDocument 交叉校验并拒绝。

实现提交首次 Windows CI run `32655628393` / job `97233754161` 又给出真实红灯：`644.8756 ms > 500 ms`。没有放宽预算。审计确认缓存重复携带 10k 完整 SceneDocument，分页热路径又重复校验已由 workspace adapter 验证的整份 30k 文件 commit。性能纠偏将 artifact 收敛为 scenePaths，并保留对本次实际读取正文的逐文件 size/SHA 校验；完整 commit 的生成/解析校验仍由 trusted workspace 存储边界负责。连续三次本机专项为 `156.43 / 156.89 / 148.07 ms`。

## 3. 实现契约与读取结果

`readTrustedProjectStructurePage` 的实际顺序为：

1. 读取 trusted commit envelope；
2. 读取并验证 `world.project.json`；
3. 读取并验证全部 chapter，拒绝重复 scene path；
4. 验证请求路径属于 chapter topology，再读取最多 256 个 scene；
5. 可选地在同一 envelope 中读取这些 scene 的 layout；
6. 再读 trusted commit，version/generation 变化即拒绝；
7. 返回完整 topology、选中 SceneDocument、选中源文件和 exact sourceVersion。

Route artifact v2 的 `graph + scenePaths + sourceVersion` 受 envelope Hash 保护。读取时先查询最多 64 节点的图窗口，以节点在完整图中的稳定顺序定位 source path，再调用上述分页 API；随后比较项目/入口/章节/path topology，以及选中 scene 的 ID/标题。缓存损坏、旧 schema、未知路径、重复路径/ID、正文 Hash 不符、revision race 和伪造元数据均失败关闭。

100 场景实际结果：首窗 `[1,1,64,64]`、130 个源文件；第二窗 `[1,1,36,36]`；零匹配 `[1,1]`。脚本与全局文档读取数为 0，`readFiles()` 全量入口调用数为 0。

## 4. 实际测试、运行与远端证据

最终定向测试为 `4 files / 36 tests` 全部通过，覆盖 project-domain 分页、Route graph 自定义路径、Route overview 窗口/篡改/race 和派生缓存失效。最终本地 `npm run check` 退出码 0：

- 普通并行测试 `113 files / 710 tests`；存储 `1/1`；VM `5/5`；
- Runtime `10,000 seeds / 20,000 replay executions`，0 failed seeds；
- 全部 workspace build、治理、需求、风险、架构和 Script/Route/Asset 性能门通过；
- 10k Route topology page `157.27 ms < 500 ms`；Route 编辑 P95 `64.44 ms < 500 ms`；
- Editor production build 成功，JS `828.22 kB`（gzip `232.89 kB`）；既有 `>500 kB` warning 保留。

软件实际启动第一次因根 npm 参数转发方式错误失败，随后使用 Editor workspace 的 Vite 明确参数重测：`127.0.0.1:5185` 在 `99 ms` ready，HTTP 返回 `200`、`528 bytes` 且存在 `#root`，服务随后关闭。该命令陷阱不冒充应用故障或成功证据。production browser DOM 自动化仍受管理员策略阻断，因此不登记浏览器交互通过。

性能纠偏头 GitHub Actions run `32656159511` / job `97235137319` 在 Windows / Node 22 用时 `5m01s` 完整成功，10k Route topology page 为 `301.56 ms < 500 ms`。此前 run `32655628393` 的 `644.88 ms` 失败保留为纠偏证据。

## 5. 当前边界与下一步

E8k 关闭的是 Route structure/topology 的 scene/layout 正文分页。以下仍未完成：

- Launcher/完整 Editor 仍需要完整 Canonical Project 的路径，以及全工程其他文档的统一 Lazy Project Session；
- topology 增量写、跨页多 dirty scene、统一 undo/redo 与缓存局部更新；
- Dialogue、Choice/options、Wait、Direction 等其他结构事务和跨实体引用；
- 外部目录 trusted selected write、production browser、真人验收与正式 Player/三端发布。

下一步必须先做 N40-E8l 准入复审，选择仍属于 Route Map Engineering 的最小缺口（优先 topology/derived artifact 增量更新或外部 trusted host 对齐），继续执行红测、正式契约、原子保存、完整重建、本地全门、实现推送/Windows CI、文档推送/最终 CI。N40 Product Acceptance、N41 及以后继续 fail closed。
