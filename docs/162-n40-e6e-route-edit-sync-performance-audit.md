# N40-E6e Route 局部编辑同步性能审计

> 日期：2026-08-23  
> 实现提交：`cba9be907729659e3c88b4944d8354b1fe94eeb0`  
> 范围：10k 单场景 Project Service 修改、Compiler 权威增量分析、Route 投影/索引/窗口、编辑器真实接线与事务 Hash 边界

## 1. 需求与偏移审计

PRD 明确要求万级 Route 局部编辑，并要求视图修改在 500 ms 内同步。E6d 虽已把宿主 Compiler cache 接入 Launcher/Route，但未保存修改仍调用 `buildRouteGraph()` 全量编译；这与需求不对齐。另一方面，“冷启动存储级局部正文读取”尚未冻结可信宿主协议，不能为追求表面 lazy loading 擅自引入宿主变更日志。因此 E6e 先关闭明确的 10k/500 ms 子门，冷启动读取继续保持未完成。

## 2. 红灯与瓶颈

真实 10k 二叉分支 Canonical Project 的初始红灯为 5 样本 P95 `2478.08 ms`。分段后发现：

- Project Service：约 `760–826 ms`；
- 即使复用 9,999 个场景，正式 Compiler 仍生成整套发布产物并重算工程语义 Hash：约 `1482–1733 ms`；
- Route 投影、索引与锚点窗口本身仅约 `21–30 ms`。

第一轮优化降至约 `1.16 s`，第二轮在单独运行曾达到 `417.39 ms`，但完整 `npm run check` 负载下分别出现 `614.27 ms`、`527.80 ms` 红灯。没有放宽 500 ms 门，也没有把单次幸运结果登记为通过。

## 3. 实现与边界

1. `analyzeProjectIncremental()` 复用正式 Compiler 的场景语义、诊断和 cache，但不生成发布 artifacts；
2. `trustedChangedSceneIds` 只接受 Project Service 已确认的场景局部变更，previous cache 必须是宿主已验证或当前进程生成；场景集合不同自动禁用提示并完整校验；
3. 未变场景不重复计算 dependency/output Hash；变更场景仍由正式 Compiler 重新分析，Route 不直接解析 Script；
4. Editor 把 Route 改名及 Script/Sequence 的 `edit/patch/insert/delete/move/p0-batch/undo/redo` 动作登记到当前场景，界面显示实际 compiled/reused 数；
5. Project Service 的 ChangeSet Hash 明确为 SHA-256 事务修订链；Canonical 工程语义 Hash 继续用于保存、外部变化与 Compiler 对齐，避免把全工程持久化 Hash 阻塞在每次 UI 事务中；
6. 场景改名快路径仍验证稳定 ID、场景存在和非空标题；其他命令继续 Canonical save/load 完整验证。

## 4. 实际测试结果

最终完整 `npm run check` 退出码为 0：

- 普通并行测试：`104 files / 655 tests`；
- 存储一致性：`1/1`；VM 重载一致性：`5/5`；
- Runtime：`10,000 seeds / 20,000 replay executions`；
- Compiler 定向：`21/21`；Project Service / Route / App 定向：`57/57`；
- 构建：14 workspaces 完成；Editor CSS `83.50 kB`（gzip `15.81 kB`），JS `770.13 kB`（gzip `217.90 kB`），既有 `>500 kB` warning 保留；
- 架构：`91` portable files、`4` Node adapter files；
- Route full projection：10,000 节点 / 9,999 边 / 0 诊断，`1714.07 ms`；索引 `7.97 ms`；三次查询 `3.48 ms`；
- Route 局部编辑 20 样本：`48.91–96.52 ms`，P95 `64.10 ms`，预算 `<500 ms`；每次 `1` 场景编译、`9,999` 场景复用；
- 最终样本分段：Project Service `0.19–1.07 ms`、增量分析 `43.02–82.00 ms`、Route 投影/索引/查询 `4.57–13.98 ms`。

实现提交的 GitHub Windows / Node 22 完整门同样通过：run `32585973663` / job `97062279378`，耗时 `4m31s`，locked dependencies、完整产品基线与 post steps 全绿。

页面服务通过 `npx vite --host 127.0.0.1 --port 5176` 实际启动，Vite ready `98 ms`。应用内浏览器连续三次在页面加载前被管理员策略校验拒绝访问 localhost；没有绕过安全控制，因此 production browser 仍记为未验证。

## 5. 结论与剩余工作

E6e 关闭 N40 的“10k Route 单场景编辑 / 500 ms P95”工程子门，并纠正未保存改动全量编译与 Sequence P0 动作未登记的偏移。它不关闭：

- 冷启动存储级正文局部读取；
- Runtime 当前路线高亮；
- E5/E6d/E6e production browser 复验；
- N40 Product Acceptance，以及受 `RA-N21-005` 阻断的 N41+、M1 Stable 与发布。
