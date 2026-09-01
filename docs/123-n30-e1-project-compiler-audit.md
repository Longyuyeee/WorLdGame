# N30-E1 Project Compiler 最小内核审计

> 审计日期：2026-08-15  
> 变更前基线：`5150465226c8adbdd61d5fc494a31e6b1a4c7fdc`  
> 审计分支：`agent/n30-project-compiler`  
> 节点判定：N30-E1 工程候选；N30 尚未整体验收，N31 及以后未获准进入

## 1. 结论

仓库第一次拥有独立于 Editor、N23 单文件试玩器和 `narrative-vm-spike` 的正式 `@world-studio/project-compiler` 产品边界。它把 Canonical Project 确定性降级为版本化 Runtime IR v1，并生成 Manifest、Source Map、Asset Manifest、Localization/Ending Catalog。Tiny、Branching、Media、CJK 四个冻结工程已经获得可复算的 Story IR SHA-256。

这一步解决“编辑器能试玩，但没有正式编译边界”的首个核心缺口，不等于完整游戏引擎已经完成：N30 的场景级缓存、Gallery/Replay/Music Catalog、licenses/SBOM 输入和跨机器实体复验仍待后续切片；N31 正式 Runtime、Save/History、Player 与发布链仍未开始。N21 `0/1` 与 N23 `0/2` 的真人记录保持 pending，不能用本轮自动化替代。

## 2. 需求与实现对齐

| N30 要求 | E1 状态 | 本轮证据 | 后续缺口 |
|---|---|---|---|
| Project AST → Story IR | 已实现 | `compileProject`、Runtime IR v1 类型和四类 Golden | 未来 IR 迁移/兼容测试 |
| P0 语句降低 | 已实现 | dialogue、narration、direction、choice、label、jump、call、return、set、condition、wait、end 测试 | Runtime 执行归 N31 |
| Source Map | 已实现 | instruction → scene/statement/index；一字符文本修改不使 Source Map 失效 | 文件/行列级映射与 Debugger 接入 |
| Asset Manifest | 已实现 | 稳定 Asset ID 排序、演出 `key=value` 类型化、缺失资源拒绝 | 血缘、平台变体、打包产物归 N70/N83 |
| Catalog | 部分实现 | Localization 与 Ending Catalog | Gallery/Replay/Music Catalog |
| 结构诊断 | 已实现最小集 | 缺入口/脚本/角色/场景/标签/变量/资源、表达式类型、Wait、不可达场景、无出口、无可达结局 | 语句级 CFG、循环/路线覆盖归 E2/N60 |
| 确定输出 | 已实现 | Unicode NFC、码点键排序、有限数、`-0` 规范化、版本与 SHA-256 | Windows/Linux/macOS 实体交叉复验 |
| 增量失效 | 部分实现 | 一字符对白修改只改变 `story.ir.json` 和 Build ID；Source Map/Asset/Catalog Hash 不变 | 场景级缓存与依赖图 |
| Debug/Release Profile | 已建立边界 | Profile 进入 Manifest/Build ID，运行数据保持一致 | Release 剥离策略与调试符号分包 |
| 发布输入 | 部分实现 | 五文件构建集合与 Artifact Hash 表 | licenses、SBOM、Build Core 消费契约 |

## 3. Runtime IR v1 与失败边界

输出文件固定为：

- `manifest.json`：Compiler/IR 版本、Profile、工程/源 Hash、入口、Build ID、全部 Artifact Hash；
- `story.ir.json`：按 Canonical 场景与语句顺序排列的 P0 指令；表达式保存为已解析 AST，Wait 保存为整数毫秒，演出参数保存为类型化对象；
- `source-map.json`：每条有效指令回到稳定 Scene/Statement ID 与语句序号；
- `asset-manifest.json`：按稳定 Asset ID 排序的资源元数据；
- `catalogs.json`：稳定排序的 Ending 与 Localization 条目。

任何 error 都返回诊断而不产生半成品 Artifact。Warning 目前仅用于不可达场景；不可达场景若仍导致无可达结局，编译会以 error 失败。诊断按 Severity、Code、Scene、Statement、Message 排序，避免文件遍历或宿主差异改变输出。

## 4. Golden Hash

| Golden | `story.ir.json` SHA-256 | Debug Build ID |
|---|---|---|
| Tiny | `19ed7a308c9762e34765601b3ce090a662bcce5436f4f3d36805783b91b6eb55` | `0ab204f9004acff380ba2732ff71a5c9bd619efae02f83b8c70398cb489dcad4` |
| Branching | `b845ba6270cb506366a7f3000c1823c67db769809bb76d0b53bbce0321266e7c` | `b541e641fba584650bf09f7bca1ccbd80e4cec037229102137482fa4ea4daf9e` |
| Media | `0a19dec5b213ab50758bdcd1a3483b5db59cd43cd500218339315101d7469c6d` | `741b24f0507e7fef07c99cfee3650690da29eed743c48715d537eb9a53d1f488` |
| CJK | `2dbe1079fefb2c8258510738583bf0d96824c2464cfa140d5ee803e608c03d3b` | `07776de7a22a636be8be31a3d5c78b05b8498715d3df0dc94933019b5b714d45` |

Golden 登记文件与编译测试互相校验，不能只改文档或只改测试绕过哈希漂移。Recovery、Size、Benchmark 的 IR 槽仍显式 pending：它们不属于 N30 计划冻结的四个 E1 接受样例。

> N50-E2 纠偏注记（2026-08-27）：上表保留 N30-E1 当时的历史值。正式 Player 首次运行 Media Golden 时发现音频 `loop/volume` 未规范化，修正后的当前 Media `story.ir.json` Hash 为 `b86a7178c3cf45ead3166dbb1fba28639b963af92bc171d4e21107cbfb839aea`，Debug Build ID 为 `24e4fb2d4003aca1ebdce398dc9fca010e83af93d0d3593c044c770c43c0c9d4`；现行证据见 [N50-E2 审计](214-n50-e2-player-stage-media-presentation-audit.md)。

## 5. 架构与风险控制

- `packages/project-compiler` 只能依赖 `project-domain` 与 `story-language`；架构审计禁止 Editor、DOM、Node 文件系统、平台壳及 VM Spike 反向进入。
- `RA-N21-002` 的工程上限透明扩至 N30，只授权 Compiler 工程候选；N31、N21 Product Acceptance、N23 Acceptance、M1 Stable 与 Public Release 全部保持阻断。
- 本轮不把 VM Spike 改名为正式 Runtime，也不让 Compiler 读取 N23 Playable Preview 的私有状态。
- `main` 仍不是当前长链能力的权威集成分支；推送和 Draft PR 只表示候选可评审，不表示发布或合并。

## 6. 验证与下一顺序

本轮必须通过：

```bash
npm run audit:n30-compiler
npm run audit:goldens
npm run audit:risk-acceptance-policy
npm run typecheck
npm run check
git diff --check
```

通过并取得远端 CI 后，N30 的下一工程切片只能是 E2：补齐 CFG/循环诊断、场景级依赖缓存、剩余 Catalog、Debug/Release 实质差异和发布元数据输入。除非 N21-HV-01 与 N23-PA-01 已完成并关闭 `RA-N21-002`，不得创建 N31 正式 Runtime 分支。

远端验证：Draft PR #34 的实现头 `7793b67` 已通过 GitHub `product-baseline` Windows / Node 22 全检，run `31875065060`。随后只有本段与当前状态表的结果回填发生变化；最新 head 仍由同一门复核。

> 后续状态：E1 留下的 CFG、增量缓存、剩余 Catalog、Profile 和发布输入已由 [N30-E2 工程退出审计](124-n30-e2-compiler-completion-audit.md)继续处理；本文件保留 E1 当时的真实边界与 Hash。
