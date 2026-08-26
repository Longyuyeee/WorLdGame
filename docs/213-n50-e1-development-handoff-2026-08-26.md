# N50-E1 暂停开发与换机交接审计

> 日期：2026-08-26  
> 暂停分支：`codex/n50-e1-player-core`  
> 暂停前提交：`bf848e6`  
> 上游：`origin/codex/n50-e1-player-core`  
> Draft PR：[#84](https://github.com/Longyuyeee/WorLdGame/pull/84)，基于 `codex/n43-n50-governance`  
> 判定：可以安全暂停并换机；已完成内容已进入 Git/GitHub，未发现未提交源码或文档

## 1. 暂停时的真实开发位置

N43 七工作模式 Engineering 已完成，N50-E1 已建立 portable `@world-studio/player-core` 与最小共享 `apps/player-shell`。正式链为 `Canonical Project → N30 Compiler → N31 Runtime → N32 Runtime Host → Player snapshot`，没有把旧 `StoryStatement` 试玩解释器改名复用。当前 Player 已覆盖标题、开始、对白/旁白、选择、结局与结构化错误；桌面默认 16:9，手机使用全视口安全区。

实现最终头 `0b1fce0` 的 GitHub Actions Windows / Node 22 完整门已经绿色：run `32954927678` / job `98134398209`，`139 files / 787 tests`，storage `1/1`，冻结 VM `64.735s <90s`。随后仅文档提交 `bf848e6` 触发的同一完整门为 run `32956093770` / job `98137964979`，本交接审计时仍在运行；它不改变已经通过的实现判定，但换机后应确认最终 conclusion。

方向仍与最初需求对齐：现代、清晰、多彩和响应式 UI 是产品目标；正式 Compiler/Runtime/Host、确定性状态、跨宿主边界和 fail-closed 错误是商业级播放器基础。当前没有发生替换产品目标或另造运行时的偏移。需要继续防止的是“工程底座完成度高于用户可见产品能力”的结构性失衡：Stage/Media Player Adapter、存档/历史/设置、Auto/Skip/Back/Forward、Gallery、路线产品化、Web/Windows/Android 正式包仍未完成。

## 2. 预期与实际差异

| 项目 | 暂停预期 | 实际 | 处理 |
|---|---|---|---|
| Git 同步 | 当前工作可由远端恢复 | `HEAD` 与远端分支 ahead/behind 为 `0/0`，工作区无未提交文件 | 通过；本交接提交推送后以新头为准 |
| 实现完整门 | 干净 Windows / Node 22 全绿 | 实现头 run `32954927678` 全绿 | 通过 |
| 最新文档头 | 同一门有最终结论 | run `32956093770` 仍运行 | 不等待长任务；换机后确认 |
| Production browser | 桌面 16:9、390×844 无横溢出、双输入路线、console 0 | 已实测通过，并在 #212 记录尺寸、状态序列和修正 | 结论已固化；原始临时浏览器会话/截图没有独立提交 |
| 产品验收 | Engineering 证据不得冒充真人/设备验收 | N21 `0/1`、N23 `0/2`，Android 实体包和 Product Acceptance 均未完成 | 继续 fail closed |

## 3. 换机时哪些证据需要迁移

### 已远端固化，不需要人工拷贝

- 所有受 Git 跟踪的源码、测试、配置、锁文件、审计文档和既有 `evidence/` 证据；
- GitHub Draft PR、提交历史、Actions run/job 日志和远端分支；
- N50-E1 的预期—首次实际—修正数据，已经写入 [#212](212-n50-e1-formal-player-core-audit.md)。

### 不应迁移

- `node_modules/`、`dist/`、`.vite/`、`.typecheck/`、`coverage/`、`*.tsbuildinfo`；它们是忽略的可再生输出；
- 本地 Vite 进程、终端 session、浏览器标签页、npm 缓存和临时 console 状态；
- GitHub token、系统凭据或未来的 Android/Windows 签名密钥，不得提交 Git。当前仓库没有正式发布签名密钥。

### 当前尚未成为耐久物理证据

N50-E1 production-browser 的尺寸、交互序列、可访问名称和 console 结果已被审计文档记录，但这次操作的原始截图与浏览器会话是本机临时状态，没有作为 `evidence/n50/` 原始 artifact 提交。它们不影响 Engineering 实现门，因为核心行为由自动化测试和远端完整门覆盖，也不能替代真人 Product Acceptance。换机后开始 N50-E2 前，应重新运行 production build 浏览器验证，并优先把可重复的 JSON/截图采集器纳入仓库，使后续证据不依赖某台电脑的会话。

## 4. 新电脑恢复清单

```powershell
git clone https://github.com/Longyuyeee/WorLdGame.git
Set-Location WorLdGame
git fetch --all --prune
git switch codex/n50-e1-player-core
git pull --ff-only
node --version
npm ci
npm run audit:n50-player-core
git status --short --branch
```

Node 必须满足仓库 `>=22.12.0`。若仓库已存在，只执行 fetch/switch/pull，不复制旧电脑的依赖或构建目录。恢复后先确认 PR #84 最新 Actions 结论；随后运行 Player Shell production build，并在 1280×720 与 390×844 重采桌面/移动证据。`npm run check` 是长耗时完整门，安排在环境稳定后运行，不阻塞本次换机暂停。

## 5. 恢复开发后的严格顺序

1. 确认本交接头、PR #84 和最新 GitHub Actions 状态；
2. 重新采集并持久化 N50 Player production-browser 物理证据；
3. 在同一 Player Core 上进入 N50-E2：正式 Stage/Media presentation adapter 与玩家可见 Effect 生命周期；
4. 每个切片继续执行“冻结预期 → 真实首次实际 → 记录差异 → 修正 → 原样复测 → 文档 → 推送”；
5. 不得提前进入 N51、三端发布、M1 Stable 或 Public Release，也不得把自动化/开发者浏览器验证登记为真人验收。

## 6. 暂停结论

当前没有必须在旧电脑上完成的源码任务。最紧要的事项是把本交接记录推送，并保留最新 CI 链接；长耗时全仓复验和原始浏览器证据重采在换机后执行更合理。只要本提交成功推送，换机不需要手工搬运工程目录，直接从 GitHub 恢复即可。
