# 开发暂停与换机接续审计（2026-08-14）

> 暂停日期：2026-08-14
> 仓库：`https://github.com/Longyuyeee/WorLdGame.git`
> 接续分支：`agent/n22-stage-media`
> 已验证代码/审计基线：`bc7835fdbaf8cdc4058510354bb990fe93238520`
> Draft PR：[#33](https://github.com/Longyuyeee/WorLdGame/pull/33)
> 后续状态：接续开发已完成 N22 退出条件审计；权威后续记录见 [`113-n22-exit-condition-audit.md`](../../docs/113-n22-exit-condition-audit.md)。本文件保留为换机时点历史快照。

## 1. 暂停点结论

当前开发停在 N22“最小 Stage 与媒体预览”的工程验收候选阶段，没有进入 N23、正式 Runtime、Player、Build 或发布阶段。分支工作树在交接审计开始时干净，`HEAD` 与 `origin/agent/n22-stage-media` 同为 `bc7835f`。

相对已抓取的 `origin/main`：当前分支领先 155 个提交、落后 0 个提交，累计差异为 539 个文件、63,903 行新增、165 行删除。这说明完整产品开发链仍承载在串联 Draft PR/集成分支上，默认分支还不是当前能力的权威来源；换机后必须切到指定分支，不得从 `main` 直接继续开发。

## 2. 当前已完成能力

- N00–N20 工程门已建立；N21 Writer/Sequence 工程门完成，但真人产品验收仍缺失；
- N22 已完成前十个工程切片：真实 Blob 媒体导入/释放、Stage 几何与安全区、DPR 与输入等价、媒体隔离和错误回退、Render Host v2、Canvas 2D 场景层与 DOM Overlay/命中代理分离、DOM fallback、真实 PNG/WAV Media Golden、Move、Hide/Fade，以及角色层 Show 单语句过渡生命周期；
- 右侧预览默认 16:9，浏览器 Golden 观察到 3840×2160 Canvas 设计像素（DPR 2），其他预览比例仍可切换；
- Show 动效只作用于角色层，Move/Show 瞬时标记在下一语句沉降，后退时确定性恢复；
- 相关证据登记于 `evidence/n22/`，最新审计见 `docs/107` 至 `docs/111`。

## 3. 验证与已知红项

代码/审计基线 `bc7835f` 的 GitHub Actions `product-baseline` run [`31787551479`](https://github.com/Longyuyeee/WorLdGame/actions/runs/31787551479) 已成功；前一个代码实现提交 `908edb0` 的 run `31787057050` 也成功。

本轮本地验证事实：

- 定向测试 25/25、类型检查通过；
- 常规测试 89/89 文件、540/540 项通过；
- 10 个 workspace 构建、65 个 portable/4 个 Node adapter 架构门、10 项 Script 性能门、4 项 Asset 性能门通过；
- Editor 主包 595.61 kB，gzip 169.12 kB，仍有大 chunk 警告；
- 本机 10,000-seed VM corpus 在固定 90 秒门三次分别约 103.8、93.2、98.7 秒超时；没有放宽门限。该差异在更早审计中也存在，而同一冻结门在上述 Windows CI 中通过，因此记为本机性能环境差异，不写成本地全绿，也不归因于本次 Stage 代码。

## 4. 不得越过的边界

`RA-N21-001` 仍有效，只允许 N22 工程工作，截止 `2026-09-14T00:00:00+08:00`。它没有关闭 N21 真人验收，并继续阻断：

- N21 Product Acceptance；
- N23 Acceptance；
- M1 Stable；
- Public Release。

当前没有正式 Compiler → Runtime → Player → Web/Windows/Android Build 链，不能把“编辑器开发版可运行”描述为“可生产并发布商业 Galgame”。

## 5. 新电脑恢复步骤

```powershell
git clone https://github.com/Longyuyeee/WorLdGame.git
Set-Location WorLdGame
git fetch origin --prune
git switch --track origin/agent/n22-stage-media
git pull --ff-only
git status --short
git log -3 --oneline
npm ci
npm run audit:goldens
npm run typecheck
npm run dev
```

恢复后应先确认：

1. 分支为 `agent/n22-stage-media`，工作树干净，提交不早于 `bc7835f`；
2. Draft PR #33 与最新 `product-baseline` 为绿色；
3. `RA-N21-001` 未过期且没有被误标为关闭；
4. 本地 `http://localhost:5173/` 能打开，默认预览为 16:9；
5. 若完整 `npm run check` 只在 VM 90 秒门失败，应保留原始耗时并用远端同配置复核，不能直接提高阈值。

## 6. 恢复开发后的第一步

不要直接增加新功能。先以 `docs/89-engine-product-delivery-plan.md`、`docs/90-m1-requirement-traceability.md` 和 `docs/99-current-development-status-audit.md` 做一次 N22 退出条件审计：逐项确认哪些属于 N22 基础 Preview，哪些已明确归入 N42/正式 Runtime；确认 Golden、失败路径、浏览器证据和 PR 集成状态后，再冻结下一个最小纵向切片。N21 真人门恢复可用时应优先补做，且必须在 N23 前关闭例外。

## 7. 暂停状态

本次换机暂停不代表 N22 产品通过，不创建新节点，也不修改发布状态。旧电脑上的开发服务器已在性能复核时停止；新电脑按上面的 `npm run dev` 重新启动即可。
