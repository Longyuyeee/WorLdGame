# N30-E2 Project Compiler 工程退出审计

> 审计日期：2026-08-15
> 变更前基线：`2e95be762bb1f5ecbb4f1dfdb49adfb5a3addb87`
> 审计分支：`agent/n30-project-compiler-e2`
> 节点判定：N30 工程退出条件候选；N30 Product Acceptance 与 N31 Engineering 仍由 `RA-N21-002` 阻断

## 1. 执行结论

E2 补齐了 E1 明确留下的 Compiler 工程缺口：语句级控制流、无交互闭环诊断、可校验的场景增量缓存、Gallery/Music/Replay Catalog、Debug/Release 实质差异以及许可证/SBOM 输入。N30 计划中属于 Compiler 的六项 Implementation、Artifact 和自动化验收现已形成完整工程候选。

这仍不表示软件已经成为完整游戏引擎。Compiler 只负责产生确定数据；N31 Runtime 尚不存在，Editor Preview 和独立 HTML 尚未消费本 Runtime IR。N21 真人记录仍为 `0/1`，N23 为 `0/2`，所以 N30 Product Acceptance、N31、M1 Stable 与发布均不能前移。

## 2. 语句级 CFG 与诊断边界

每个场景现在建立稳定的 statement-index CFG：

- 普通语句落到下一语句；
- `jump` 只指向目标 Label；
- `condition` 同时保留条件目标和 fallthrough；
- `call` 保守连接调用目标与返回后续点；
- `choice`、`return`、`end` 构成当前场景出口；
- 只有从 index 0 可达的 Choice 才进入场景图，只有可达的 End 才进入 Ending/Replay Catalog。

新增 `UNREACHABLE_STATEMENT` warning 和 `NON_INTERACTIVE_LOOP` error。闭合 SCC 必须同时满足“存在环、没有外出边、没有对白/旁白/演出/选择/等待/结局”才判为无交互死循环；带条件 fallthrough 的环不会被误报。无条件跳转后的 End 会被标为不可达，并同时触发无出口与无可达结局，而不再像 E1 一样被粗粒度 `hasExit` 放行。

## 3. 场景级增量缓存

`compileProjectIncremental` 返回版本化 `ProjectCompilerCacheV1` 和结构化统计：

- `compiledSceneIds`：本轮真实重新编译的场景；
- `reusedSceneIds`：输入与输出哈希均有效、直接复用的场景；
- `removedSceneIds`：相对上一缓存已移除的场景；
- `resourceCatalogChanged`：Asset/Localization 输入是否变化。

场景输入 Hash 包含场景/脚本文档、所引用角色/场景/资源的存在性以及变量类型表。资源显示名或许可证变化不会重编剧情场景，只重建 Asset Manifest、Catalog、Release Inputs 与 Build ID；一条对白变化只重编所属场景。变量类型表属于全场景共享语义依赖，因此变量类型变化会安全地失效所有场景，而不是冒险复用旧表达式类型结果。

缓存条目另有 `outputHash`。版本不匹配、输入不匹配或输出被修改时均拒绝复用并重新编译，缓存不能成为绕过诊断的第二权威源。

## 4. Catalog 与发布输入

Catalog 不使用占位空数组，而从可达剧情和真实 Asset 文档生成：

| 输出 | 生成规则 | 当前边界 |
|---|---|---|
| Ending | 可达 `end` 语句 | 解锁状态归 N31/N62 |
| Gallery | 可达 background/show 资源引用 | 标题覆盖、封面、剧透与发现状态归 N62 |
| Music | 可达 `audio action=play bus=bgm` 引用 | 播放器 UI 与解锁归 N50/N62 |
| Replay | 含可达 Ending 的场景 | 隔离 Checkpoint 与退出恢复归 N31/N62 |
| Localization | Canonical Localization 文档稳定排序 | CSV/XLSX、翻译状态和运行切换归 N61 |

`release-inputs.json` 记录 Compiler/Project Schema/Story Language 组件身份以及每个 Asset 的 SPDX/license/attribution 输入。它是 N83/N110 生成 SBOM、许可证和第三方声明的确定性输入，不是最终 SBOM，也不证明许可证齐备。

## 5. Profile 与 Artifact

Debug 输出六类文件：Manifest、Story IR、Source Map、Asset Manifest、Catalog、Release Inputs。Release 输出不包含 Source Map，并在 Manifest 中写入 `debugSymbols=false`；其 Story IR、Asset Manifest、Catalog 和 Release Inputs 与 Debug 保持相同语义 Hash。两种 Profile 的 Build ID 必须不同。

Runtime IR 版本保持 `1.0.0`，因为指令语义没有变化；Compiler 版本提升为 `0.2.0`，因此 E2 Build ID 与 E1 不同。Tiny/Branching/Media/CJK 的 `story.ir.json` Hash 保持不变，证明 Compiler 增强没有偷偷改变已冻结 IR。

## 6. 需求验收表

| N30 条目 | E2 结果 | 自动化证据 |
|---|---|---|
| Project → validated Story IR | 工程候选完成 | 四类 Golden 与失败不产 Artifact |
| Source/Asset/Catalog | 工程候选完成 | 六文件 Debug、五文件 Release、Media Catalog |
| 不可达/悬空/缺资源/无出口/循环 | 工程候选完成 | CFG、SCC、引用与错误定位测试 |
| 排序/版本/Hash | 工程候选完成 | Canonical JSON、固定 IR/Build Hash、缓存双 Hash |
| 场景/资源增量失效 | 工程候选完成 | 单场景编辑、纯资源变化、损坏缓存拒绝测试 |
| Debug/Release | 工程候选完成 | Source Map 发布差异和公共 Runtime Artifact 等价测试 |
| licenses/SBOM 输入 | 工程候选完成 | `release-inputs.json` 组件和 Asset license 表 |
| 跨机器复验 | 待本分支远端 CI | 本地完整门通过后由 GitHub Windows / Node 22 重算 |

本地完整门已通过：Compiler 20/20，常规并行测试 97 个文件/588 项，串行存储测试 1 项，VM 重型门 5/5，11 个 workspace 构建、架构门、Script/Asset 性能门均通过。Editor 仍有既存的单 chunk 超过 500 kB 警告，不影响本轮门禁判定，也未被误记为已解决。

## 7. 诚实缺口与下一顺序

N30 工程门通过后没有新的合法 Compiler 扩展项。下一产品动作仍是执行 N21-HV-01，再执行 N23-PA-01 并关闭 `RA-N21-002`；在此之前不得创建 N31 Runtime 分支。以下能力明确不属于本轮：

- Runtime State、PRNG、Effect、Save/Load、History、Back/Forward；
- Editor Preview/Player 消费正式 IR；
- Gallery/Replay/Music 的解锁状态和玩家 UI；
- 最终 SBOM、签名、安装包与发布产物；
- 完整 Story Solver、Debugger 和路线覆盖报告。

## 8. 验证命令

```bash
npm run audit:n30-compiler
npm run audit:goldens
npm run audit:risk-acceptance-policy
npm run typecheck
npm run check
git diff --check
```
