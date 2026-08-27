# N51-E5 换机接续与 E6 启动检查点

> 日期：2026-08-28
> 暂停分支：`codex/n51-e5-settings-runtime-application`
> E5 最终审计头：`894797d`
> 直接基线：N51-E4 最终头 `968a2f7`
> Draft PR：[#95](https://github.com/Longyuyeee/WorLdGame/pull/95)，base `codex/n51-e4-settings-ui`
> 授权边界：`RA-N21-010` 只允许 N51 Engineering；N52、全部 Product Acceptance、M1 Stable 与 Public Release 仍阻断

## 1. 暂停结论

当前可以安全换电脑接续。复核时本地 `HEAD` 与 `origin/codex/n51-e5-settings-runtime-application` 均为 `894797d05e946abc1bebebcae818815bbf092e2d`，工作树干净；PR #95 为 OPEN / Draft / CLEAN。该最终头的 GitHub Windows / Node 22 完整门 run `33099070555` / job `98611613942` 用时 `12m46s`，PASS。

E5 源码、自动化测试、冷 production-browser JSON/截图、需求追踪和详细审计全部已经进入 Git。换机不依赖当前电脑的 `node_modules`、`dist`、浏览器 profile、IndexedDB、临时文件或未提交改动。

## 2. 已完成的权威开发链

N51-E1–E5 已形成一条连续链：

1. E1：dependency-free typed settings core，23 个 v1 字段和 default→project→Windows/Web/Android 继承；
2. E2：runtime-frozen catalog、Basic 16 / Advanced 23、NFKC 搜索与原子 editing service；
3. E3：`settings/project.json`、Canonical Project、Project Service ChangeSet/Undo/Redo、Node/Web 保存重开；
4. E4：现代 Settings 产品 UI、来源/覆盖/恢复、完整 Canonical 保存桥和桌面/390×844 浏览器证据；
5. E5：唯一 settings application v1 接入 Editor Preview 与正式 Player Core/Host，settings-only 保持当前 Core，显示、文本、推进、六类音量/ducking 与四类输入产生实际效果。

E5 的实现提交顺序为：

- `cf204ca feat(settings): add runtime application contract`；
- `81c874f feat(settings): hot-apply settings in preview and player`；
- `b963c91 test(settings): add production runtime application evidence`；
- `c018602 docs(audit): close N51 E5 engineering`；
- `894797d docs(audit): record N51 E5 remote gate`。

详细事实以 [E5 审计 #227](227-n51-e5-settings-runtime-application-audit.md)为准，机器浏览器证据为 `evidence/n51/settings-runtime-browser.json`。

## 3. 最终验证事实

- 本地完整门 `npm run check`：PASS；普通 `149 files / 856 tests`；
- N51 专门门：`10/69`；Player/Core：`5/31`；Editor integration：`8/54`；storage：`1/1`；
- 本地 Runtime 10k `8.009s`、VM `30.38s`、Route edit P95 `57.55ms`、Asset dicing `1544.16ms`；
- 最终远端头 `894797d`：run `33099070555` / job `98611613942`，`12m46s` PASS；
- production browser：Chrome 120，桌面运行中热切到 9:16 后 Core/对白不变，pointer 关闭实际拒绝推进；390×844 stage `390×693`、overflow 0、browser failures `[]`。

## 4. 本次开发情况复审发现的文档漂移

代码边界没有越过 N51，但 `docs/89-engine-product-delivery-plan.md` 的 N51 Implementation 仍把 Auto、Skip、Save、History、Back 列为 N51 内容，与 [范围消歧 #220](220-n50-n52-scope-reconciliation.md)冲突。本检查点已纠正为：N51 只负责 typed configuration 与 application 边界；Save/History/Auto/Skip/Back/Forward 的玩家执行策略唯一属于 N52。

不得因 N51 UI 中未来可能出现相关配置字段，就在 N51 实现这些玩家执行系统。字段所有权与执行策略所有权必须分别追踪。

## 5. 尚未完成，禁止误报

- N51-E6 尚未开始，REQ-GAL/AC-19 完整 P0 字段和附加页模板没有覆盖完成；
- 当前 23 项只是首批 application contract，不代表《Gal 基础系统与自动化生产规格》2.1–2.9 全覆盖；
- Windows/Android 正式 Host 尚未接入并在实体平台验证 profile；Web browser 不能替代该证据；
- N51 Product Acceptance、真人/实体触屏与手柄、正式安装包、M1 Stable 与发布均未通过；
- N52 Save/History/Auto/Skip/Back/Forward 未获准开发；
- Editor 生产 JS 仍约 972 kB，既有 >500 kB 拆包债未关闭；
- 当前版本仍为 `0.0.0-s0.41`，不是可发布第一版。

## 6. 新电脑恢复步骤

在新的 PowerShell 环境中：

```powershell
git clone https://github.com/Longyuyeee/WorLdGame.git
Set-Location WorLdGame
git fetch origin --prune
git switch --track origin/codex/n51-e5-settings-runtime-application
git pull --ff-only
git status --short --branch
npm ci
npm run audit:workspaces
npm run audit:requirements
npm run audit:n51-gal-settings
```

若本地已经存在该分支，使用 `git switch codex/n51-e5-settings-runtime-application`，不要再次创建 tracking branch。恢复后应先在 GitHub 确认 PR #95 与最新 Windows / Node 22 check 绿色；不要复制旧电脑的构建输出或浏览器缓存。

## 7. E6 唯一允许的启动顺序

换机后的第一项工作不是直接增加字段，而是重新读取并对齐：

1. `docs/03-prd.md` 的 3.14、`docs/11-gal-foundation-and-automation.md` 的 2.1–2.9、`docs/90-m1-requirement-traceability.md` 的 REQ-GAL/AC-19；
2. 实际 `packages/gal-settings/src/settings.ts`、`catalog.ts`、`application.ts`，以及 Editor SettingsWorkspace、Preview 和 Player Shell；
3. 生成“原始 P0 要求 → 已有 23 字段 → 缺口 → N51/N52/N62 唯一归属 → 可验证 Host”的逐项 gap matrix；
4. 先冻结 E6 可在 N51 内完成的字段和明确阻断项，再按小切片实现 catalog → parser → Canonical Project → UI → Preview/Player；
5. 每个小切片继续执行实际代码审计、预期—实际—纠偏、专门门、完整门、production browser、提交、推送与同头远端 CI。

只有 gap matrix 证明字段属于 N51，且能沿现有 application/Core/Host 接入时才允许编码。不得新建第二 Runtime、旁路 settings store 或把 N52 执行策略回流 N51。

确认恢复无误后，从本检查点创建下一开发分支：

```powershell
git switch -c codex/n51-e6-p0-coverage-exit
```

该分支必须从远端 E5 最新检查点创建；若 PR #95 后续发生 review 修改，应先 fast-forward E5 再创建或 rebase E6，不得从旧 `main`、E4 或本地未验证提交起步。
