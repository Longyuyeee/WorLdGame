# N32-E7 共享 Runtime Presentation Host 与闭环纠偏审计

> 日期：2026-08-22
> 分支：`codex/n32-e7-shared-runtime-host`
> 直接基线：N32-E6 最终证据头 `5e55a4aea936261b852abee6374af097df392ae1`
> 授权：`RA-N21-004`，最大节点 N32；不授权正式 Player、N40、M1 或发布
> 当前判定：N32-E7 Engineering 实现、本地实测与远端 Windows / Node 22 完整门通过；N32 Engineering 总出口仍未通过

> 远端首次裁决：Draft PR #58 的 run `32505380712` 首次 job `96844244975` 与失败重跑 job `96844792467` 均在 N23 launcher prerequisite 处失败；父审计只报告 gate 失败并吞掉子进程细节。本轮先修正失败详情透传，再以新提交复测，不把重复红灯写成通过。

> 远端诊断裁决：详情透传提交 `fd7a797` 的 run `32505681115` / job `96845194905` 证明干净 `npm ci` 后 launcher 先于 workspace build，`runtime-host` 的 `dist` 入口不存在，Vite 无法解析；本机曾因已有 `dist` 被掩盖。纠偏为与 Runtime/Compiler 一致的 `./src/index.ts` workspace 入口，并以无 `runtime-host/dist` 的 Node 22 launcher smoke 复测。

> 远端最终裁决：纠偏提交 `c93514e5fb2710ebd13c9571d1f150deedd5360d` 的 run `32505981631` / job `96846121361` 在干净 checkout、locked dependency install 后完成 Windows / Node 22 `full check`，用时 4 分 16 秒并成功。首次红灯、诊断红灯和最终绿灯均保留，不以重跑覆盖失败历史。

## 1. 冻结目标与非目标

E7 只关闭 E6 出口审计中的 Editor 私有 Host 偏移：建立可移植、确定、可独立验证的 Effect/Stage presentation Host contract，让 Editor Preview 与真实浏览器测试宿主消费同一 reducer。契约必须覆盖 execute、complete、cancel、Back compensation、Forward replay、checkpoint、active channel、幂等 receipt、状态校验和 canonical SHA-256 快照。

E7 不创建或冒充正式 Web Player，不修改 `playable-web-export.ts` 的历史 N23 候选身份，也不把 Worker 测试宿主写成产品 Acceptance。画面渲染、复杂音频/GPU 策略、Player UI 与三端设备证据仍在后续授权节点。

## 2. 实现结果

- 新增 portable workspace `@world-studio/runtime-host` `0.1.0-n32`，生产依赖只有 `@world-studio/runtime`；
- 冻结 `RuntimePresentationHostStateV1`、有界 operation receipt、校验代码、canonical snapshot 与域隔离 SHA-256；
- Editor `formal-preview-runtime.ts` 和热更新 rebasing 改为消费共享包，删除 `formal-preview-effect-host.ts` 及其私有测试；
- Web Worker conformance harness 执行同一个 Host conformance vector，并与 Node Golden 比较；固定快照 Hash 为 `e84fe19367494828020b5802367dc036d3667eb570dc7479fa371d7e4d5532cd`；
- workspace registry、TypeScript project references、root build 和架构审计同步纳入新包；
- 架构门明确禁止 Runtime Host 依赖 UI、DOM、shell、filesystem、wall clock 或 ambient randomness。

## 3. 测试先行与实现差异

Host 测试在实现文件不存在时先得到真实红灯，再补实现。实现复审又发现两个短向量不易暴露的边界并新增回归：

| 检查 | 首次实际 | 纠偏 | 最终实际 |
|---|---|---|---|
| 已取消 Effect 重复投递 | execute receipt 虽幂等，但通道会被错误重新激活 | 只有真正追加 execute/replay receipt 时才激活 | 重复投递不增加 operation，也不恢复已取消通道 |
| 1000 条有界日志滚动 | 长驻 active channel 的原始 execute 被裁掉后会误报 identity 缺失 | 完整日志期校验 execute 身份；滚动后以 active record 为权威 | 1001 次执行、日志 1000 条、旧长驻通道仍合法 |
| conformance tuple 类型 | 首次 build 得到 TS2352 | 先验证实际 kind 序列，再返回冻结 tuple | runtime-host、Editor、Worker build 通过 |
| 工作区治理 | 首次 `audit:workspaces`/`audit:architecture` 因白名单未更新失败 | 同步 Editor、Worker 与架构精确依赖规则 | 13 workspaces、88 portable files 审计通过 |

## 4. 真实产品闭环发现与纠偏

完成共享 Host 后没有停在单元测试。生产构建从项目首页实际打开“五分钟验收工程”，首次点击“试玩完整流程”立即得到 `INVALID_STATEMENT`：Benchmark 的四条 Direction 仍是自然语言旧描述，正式 Compiler 要求显式 `key=value`。迁移 Direction 后新增“两条路线必须由正式 Compiler/Runtime 到结局”的测试，又真实暴露 `promise_state` 被脚本引用但变量表未声明。

纠偏包括：

- Benchmark 四条 Direction 改为显式安全动作并保留 description 元数据；
- Story schema 0 增加可选 typed variables 投影，Canonical adapter 往返变量而不是静默丢失；
- Benchmark 声明 `promise_state:string`，默认 `unanswered`、scope `story`；
- 新增两条正式路线回归，任何 Compiler error、错误结局或 100 步内未终止都会失败。

这证明此前“可运行验收工程”只在旧解释器/内容时长门成立，不能代表正式 Compiler/Runtime 闭环；文档已按实际纠正。

## 5. 本地自动化与构建实测

| 门 | 实际结果 |
|---|---|
| Host/Editor 定向 | `3 files / 22 tests` 通过；新增 Benchmark/adapter `2 files / 6 tests` 通过 |
| Runtime | `55/55`；10,000 seeds、20,000 replays、40 chunks、0 failed，digest `20e9a842…92ef2` |
| 常规回归 | `100 files / 617 tests` 通过 |
| Storage / heavy VM | IndexedDB `1/1`；heavy VM `5/5` |
| Type/build | `tsc -b` 与 13 workspaces production build 退出码 0 |
| Governance/architecture | 需求、风险、基线、Golden、Compiler、13 workspaces 全通过；88 portable / 4 Node adapter |
| Performance | Script `10/10`、Asset `4/4` 通过 |
| Editor bundle | JS `735.17 kB` / gzip `208.53 kB`，仍有 >500 kB warning；不提高阈值、不写成优化完成 |

上述完整 `npm run check` 是在本机 Node `v25.2.1` 实际执行并以退出码 0 完成。Node 25 符合仓库 `engines >=22.12.0`，但远端权威裁决仍固定 Windows / Node 22。

为排除本地既有构建产物掩盖依赖入口问题，还将 `packages/runtime-host/dist` 临时移出包目录，并用准确的 Node `22.12.0` 执行 N23 product acceptance launcher；实际退出码为 0，随后恢复构建目录。远端 run `32505981631` 又在全新 checkout 中重复验证了该链路。

## 6. Production browser 实测

### 6.1 Worker 跨宿主 Host Golden

对 `apps/vm-conformance/dist` 启动 production preview，真实 module Worker 完成完整 corpus 后页面显示 PASS；状态节点实际为 `data-status=passed`、`data-runtime=passed`、`data-runtime-host=passed`。页面 console error/warning 为 `[]`。这证明 Node 与浏览器 Worker 的共享 Host snapshot/receipt 向量零差异，不证明正式 Player 已存在。

### 6.2 Editor 五分钟工程

对 `apps/editor/dist` 从空的产品入口执行：

1. 打开新的五分钟验收工程，状态为已同步、可编辑；
2. 进入项目结构和内容编辑器，正式 Runtime 完整流程按钮可用；
3. 16 次 Continue 到 Choice，选择“登上列车”，再 14 次 Continue 到 `驶向仍可抵达的清晨`；
4. 实际 Back 后状态回到“驶向旧夏天”，Forward 后重新得到同一结局；
5. 退出重开，16 次 Continue 到 Choice，选择“留在站台”，再 14 次 Continue 到 `雨停以后重新出发`；
6. Editor console error/warning 为 `[]`。

## 7. 需求与授权判定

E7 实质推进 REQ-RUNTIME、REQ-QA、USP-09、AC-05、AC-13 和 AC-16：Editor 不再拥有私有 Effect Host 语义，浏览器 Worker 有可复现 receipt/hash，真实验收工程也终于通过正式 Compiler/Runtime 两路线闭环。

但 N32 冻结项写的是 Preview 与 Player 共用 Adapter，Acceptance 写的是 Editor 与 Web Player 状态和画面一致。当前没有 `apps/player-web`，Worker 不是 Player，旧单文件 HTML 也没有迁移到正式 Runtime。因此 E7 只能把 Implementation 6 从“未对齐”推进到“部分”，不能登记 N32 总出口或 Product Acceptance 通过。最新出口判定见 [151](151-n32-engineering-exit-reaudit.md)。
