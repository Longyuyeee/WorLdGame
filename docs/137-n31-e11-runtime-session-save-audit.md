# N31-E11 Runtime Session Save 开发与审计

> 后续节点更新：永久 Meta Progress 的 Back/Forward 与旧存档加载边界见 [N31-E12 审计](138-n31-e12-monotonic-meta-audit.md)。本文件保留 E11 Session Save 节点证据。

> 审计日期：2026-08-20  
> 起始基线：`6430789faa1d8ee75d78e2adb4ed4cee448b9e6b`（`agent/current-development-audit-2026-08-16`）  
> 开发分支：`agent/n31-runtime-e11-session-save`  
> 交付：Draft PR #47；实现提交 `2e3f62bd78f79f6406e0c86e7ea28d3891ca57f1`；Windows / Node 22 `product-baseline` run `32341186865`、job `96340464971` 通过（5 分 31 秒）
> 节点边界：只关闭 VM-11 的正式 Session Save 实现缺口；不宣告 N31 Engineering、N31 Product Acceptance、M1 Stable 或任一平台发布通过。

## 1. 目标与修复前差异

| 项目 | 预期效果 | 修复前实际效果 | 本轮修正 |
|---|---|---|---|
| Load 后的剧情位置 | 恢复同一 History Cursor 与当前 State Hash | `world.runtime-save` 只恢复单个 State | 新增独立 `world.runtime-session-save` 协议 |
| Back / Forward | Load 后仍可沿原 checkpoint chain 前进、后退 | History Session 没有进入 Save | 保存完整 checkpoints、entries 与 cursor |
| 分支截断 | 已截断输入继续作为 tombstone，未来记录保持可 Forward | State Save 不包含二者 | 保存完整 `inputTombstones` 和游标之后的 entries |
| 待处理交互 | Choice / Effect / Barrier / Terminal 精确再水合，不重放副作用 | State Save 能再水合当前 State，但不能连同 History 恢复 | 从活动 checkpoint 推导 rehydration，同时恢复整个 Session |
| 损坏处理 | 版本、Build、身份、Hash、链或未知字段异常全部 fail closed | History 与 Save 分开校验，无法校验统一存档 | envelope、History Hash、History validator 三层拒绝，不返回部分 State/Session |

保留原 `world.runtime-save` 作为轻量 State Save，避免破坏既有 wire payload；Session Save 使用新格式与独立哈希域，不把两类产物混用。

## 2. 实现结果

- 新增 `RuntimeSessionSaveV1`、Create/Load 结果和选项类型；
- 新增 `createRuntimeSessionSaveV1` / `loadRuntimeSessionSaveV1`；
- 新增 `WORLd-RUNTIME-SESSION-SAVE\0v1\0` 域隔离 Artifact Hash；
- 载荷包含 Runtime/IR/Project/Build/Execution 身份、Cursor、History Hash 和完整 canonical History Session；
- 64 MiB UTF-8 上限在 Create 与 Load 两侧执行；History 自身仍受 10,000 entries 上限约束；
- 加载前验证 canonical JSON、精确字段集、协议版本、Build、身份一致性、History chain 与 History Hash；失败结果不暴露 `state` 或 `session`；
- Runtime package 升为 `0.10.0-n31`，`RUNTIME_VERSION = 0.6.0`、State Save schema 与 History schema 不变；VM Conformance workspace 的精确内部版本约束同步更新。

## 3. 真实测试与预期—实际对照

### 3.1 功能与确定性

| 测试 | 预期 | 实际 | 判定 |
|---|---|---|---|
| E11 定向 Runtime 测试 | 3 项全部通过 | `3 passed / 49 skipped` | 通过 |
| 分支 Session round-trip | Cursor=1；2 条 entry；保留右侧未来；左输入成为 tombstone；Forward/Back State Hash 恢复 | 与预期逐项一致 | 通过 |
| 待处理 Effect | Load 后 rehydration 为同一 Effect Intent，State Hash 不变 | 与预期一致 | 通过 |
| 篡改/兼容 | future schema、unknown member、wrong Build、非 canonical、错误 Hash、重签损坏 checkpoint 均拒绝且不返回部分状态 | 与预期一致 | 通过 |
| Node 固定向量 | 新增 5 项观测后与冻结 Golden 一致 | 首次因 Golden 缺 5 字段按预期失败；按实际值冻结后 `2/2` 相关回归通过 | 通过 |
| 类型与生产构建 | Runtime/Conformance 类型正确，生产 Worker bundle 可生成 | `npm run typecheck` 通过；VM Conformance build 通过 | 通过 |
| 浏览器正式 Runtime 快速门 | 真实模块 Worker 与 Node Golden 零差异 | `data-runtime=passed` | 通过 |
| 全仓并行回归 | 97 文件 / 588 项全部通过 | 首轮 `96 files / 587 tests` 通过，1 项 Editor 交互测试在 5 秒门超时；该项隔离重跑 3.939 秒真实通过 | 无语义回归；完整并行门仍待 Node 22 CI 复验 |
| 全仓生产构建/架构 | 12 workspaces 构建；portable 边界不倒置 | 构建通过；84 portable / 4 Node adapter 通过 | 通过 |

冻结的 E11 浏览器/Node 观测为：Session Save Artifact Hash `bec6f978…f798d1`、History Hash `2f98afc4…3db6c`、Cursor `2`、Back State Hash `b2a3ce52…37aab`、Forward State Hash `90838d6d…06b6b`。

### 3.2 本机性能差异（不得隐去）

本机当前默认 Node 为 `v25.2.1`，而权威 CI 固定 Node `22.12.0`。完整 Runtime 串行门第一次得到 `49 passed / 3 timed out`：超时项为 Node conformance、Scheduler 组合和既有 10,000-seed 双重重放；前两项在负载恢复后分别于 301 ms 和 189 ms 真实通过。10,000-seed 双重重放实际执行约 134.9 秒，但测试冻结上限为 90 秒，仍应记为性能门失败，不能通过提高阈值掩盖。

真实浏览器的正式 Runtime 快速门通过，但包含 Spike 与完整 10,000-seed corpus 的总门超过冻结的 180 秒，得到 `data-status=failed`。权威 Windows / Node 22 完整门随后在 GitHub Actions 用 5 分 31 秒通过，证明 E11 语义、固定 Golden 和仓库基线在支持版本上成立；本机 Node 25 的时限差异仍作为性能环境事实保留，不据此放宽产品门。

测试过程中还发现 Runtime 包升版后 VM Conformance 仍精确依赖旧版本，导致 npm 尝试从公共 registry 获取私有包。已同步 workspace 版本并重新执行 `npm install`，本地 workspace 链恢复；该差异已实际修正。

## 4. 需求与出口审计

- VM-11：正式实现、真实浏览器 Runtime Golden 与 Windows / Node 22 完整门均通过，登记为关闭；
- VM-13：仍未对齐，Back 仍可能回退 checkpoint 内的 Meta Progress；
- VM-14：仍未对齐，尚无单次 10,000-step 正式向量；
- N31 Engineering：仍未通过；即使远端 E11 绿色，也必须完成 E12、E13、E14；
- AC-07：Session Save 内核前置已补齐，但三端 Player、存档槽、Meta 边界和设备证据仍缺；
- AC-16：History 持久化前置已补齐，但 Player 控件、媒体宿主与三端证据仍缺；
- N21/N23 真人门保持 `0/1`、`0/2`；`RA-N21-003` 不授权 N32。

## 5. 下一步

1. E11 已在 Draft PR #47 取得 Windows / Node 22 完整远端门绿色；
2. 进入 N31-E12 Monotonic Meta boundary；
3. 再按 E13 Bounded 10k-step、E14 Engineering exit re-audit 推进；
4. 不进入 N32，不把自动化证据替代真人验收。
