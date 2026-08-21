# N32→N40 Route Map Engineering 治理检查点

> 日期：2026-08-22
> 分支：`codex/n40-e1-route-graph-core`
> 直接基线：N32-E7 最终头 `3b0b426e9804f9ed3842d05abd01171e9393655b`
> 授权：`RA-N21-005`，最大节点 N40，2026-09-22 到期
> 判定：只准入 N40 Route Map Engineering；所有产品验收、N41+、正式 Player、M1 Stable 与发布继续阻断

## 1. 触发与顺序纠偏

N32-E7 已完成共享 Runtime Host、正式 Compiler/Runtime Benchmark 闭环、本地全仓实测和两次 Windows / Node 22 远端完整门。产品负责人在已获知剩余正式 Player/真人门缺口后，于 2026-08-22 再次明确要求按计划继续开发，并要求偏移与文档错误及时纠正、每步审计推送、所有测试实际执行。

交付图的真实顺序是 N32 Preview → N40–N43 专业多视图 → N50 Player Shell → N80 Web 构建。`apps/player-web` 的 workspace 规划也冻结为 `firstNode=N80`。因此直接从 N32 创建正式 Web Player 虽能表面靠近 N32 Acceptance，却会跳过 N40–N43；本检查点关闭该偏移，进入 N40 Route Map，而不把 N32 Product Acceptance 伪造为通过。

## 2. 有界授权

`RA-N21-004` 关闭，`RA-N21-005` 成为唯一 active 例外。它只允许：

- N40 Route Map Engineering；
- 从 Canonical Project 与 Compiler 控制流事实确定性投影章节、场景、选择、条件、跳转、调用和结局；
- 布局 Sidecar、搜索/过滤/局部加载、诊断、路线高亮和进入 Sequence 的工程实现；
- 通过现有 Project Service/命令边界执行真实编辑，保持稳定实体 ID；
- 自动化、性能测试和 production browser 开发者实测。

它不允许：

- 登记 N21、N23、N30、N31、N32 或 N40 Product Acceptance 通过；
- 进入 N41、N42、N43、N50、N80 或任何后续节点；
- 创建或重命名测试宿主为正式 Player；
- 把开发者、AI 或自动化操作冒充真人证据；
- 合并 Draft PR、宣布 M1 Stable 或发布。

## 3. N40-E1 冻结起点

首个实现切片只建立可落地的 Route Graph 核心闭环：

1. 任意 Canonical Project 确定性投影稳定节点与边，不复制故事正文为第二份权威；
2. 覆盖章节/场景、Choice、Jump、Call、Ending 的基础图语义和悬空目标诊断；
3. 编辑器可打开 Route Map、搜索/选中节点、从场景节点进入现有 Sequence/内容编辑入口；
4. 至少一个真实图编辑操作必须通过现有 Project Service 生效，并在 Route/Sequence/Script 重新投影后保持同一稳定 ID；
5. 固定预期—实际向量，执行单元、集成、production build、production browser 与全仓检查；任何差异先修实现或文档再登记证据。

10k 图、完整自动布局、折叠/分组、路线状态高亮和 500 ms 增量同步仍属于后续 N40 切片，E1 不以空壳 UI 冒充完成。

E1 的本地实现、实测与剩余边界记录在 [N40-E1 Canonical Route Graph 核心闭环审计](153-n40-e1-route-graph-core-audit.md)；远端 Windows / Node 22 完整门回填前不得关闭 E1。

## 4. 策略测试与关闭条件

风险策略必须实际证明：唯一 active 为 RA-005；N40 正例通过；N41 越界失败；到期失败；删除 N40 Product Acceptance 阻断失败；RA-004 重新 active 失败。N40-E1 只有在定向测试、生产浏览器、全仓门、文档审计、推送与 Windows / Node 22 CI 全部有实际成功记录后才可关闭。
