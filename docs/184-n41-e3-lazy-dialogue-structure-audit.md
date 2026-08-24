# N41-E3 Route-first lazy 对白结构闭环审计

> 日期：2026-08-24  
> 分支：`codex/n41-e3-lazy-dialogue-structure`  
> 直接基线：N41-E2 `8b0e9574d1f13af43a16a94d60fcd67234d72d2e`  
> 判定：本地 Engineering 闭环与完整门通过；远端 Windows 完整门待裁决  
> 边界：不代表 N41 Product Acceptance，不授权 N42、M1 或发布

## 1. 冻结目标

本切片只扩展 Route-neutral 的 dialogue 结构事务：在 Route-first 单场景页中，以同 revision 的 Trusted Lazy Edit Index 选择已声明角色，执行一次对白插入、移动或删除；候选必须依次通过 Canonical Source Command、专用 Compiler preflight、Route-neutral preflight、选定文件原子保存、完整 Compiler/Index 重建和重开。

choice、label、jump、call、condition 等会改变路线语义的结构族继续 fail closed，不借本切片扩大权限。

## 2. 实现与安全边界

- Compiler 增加 dialogue 专用结构声明，验证稳定 ID、speakerId、单一候选差异、目标 kind、终止锚点和精确顺序；
- Lazy Scene Session 增加对白插入/移动/删除事务，并在命令提交和保存前各执行一次 Compiler/Route 预检；
- speakerId 必须解析为同 revision 索引中的 character；statementId/textId 必须全局唯一；
- Sequence UI 从索引列出角色，提供新增对白及所选对白的移动/删除入口；dirty 页面只允许保存或撤销，不允许叠加第二个结构事务；
- 局部 ID 闸门与 Canonical Project 的 portable ID 契约统一为小写字母、数字和下划线分段；界面生成 `statement_lazy_sequence_N` / `text_lazy_sequence_N`。

## 3. 真实预期—实际—差异—修正

| 检查 | 预期 | 首次实际 | 差异与修正 | 当前实际 |
|---|---|---|---|---|
| 测试先行 | 缺失对白 API/UI 时定向门应红 | 3 files，5 failed / 18 passed | 失败精确落在 Compiler、Session、UI 三层 | RED 基线有效 |
| 对白文本 round-trip | 保存重开后 `Second` 不增添引号 | 实际为字面量 `"Second"` | dialogue 语法不使用 narration 的 JSON quote；改为原始 `textRaw` | 通过 |
| 结构闭环 | insert→save→rebuild→reopen→move→save→rebuild→delete | 首轮实现后仅文本引号差异 | 修正后稳定保留 speakerId、statementId、textId 和文本 | 23/23；扩展索引回归后 28/28 |
| 失败关闭 | 缺失角色、重复 ID、非对白目标不写盘 | 均返回 error，selected write 为 0 | 无差异 | 通过 |
| 生产 UI | Route 首屏直接显示角色选择、对白结构控件，并能保存重建 | 首次保存成功，但完整重建拒绝 `statement_lazy-sequence-1` | 真实浏览器发现局部 SAFE_ID 比 Project Domain 宽；统一 portable ID 正则并把 UI 命令后缀改为下划线 | 新干净工程保存、完整重建、进入完整编辑器后新增对白可见 1 次；console error 0 |
| 界面说明 | 不再声称仅能新增旁白 | production 首轮仍显示旧说明 | 更新为“一次已审计的旁白或对白结构事务” | 修正版 production 可见 |
| 类型/构建 | 全仓类型与 production editor build 通过 | 类型检查发现 union narrowing 与测试 optional 值问题 | 保持严格类型，修正判别联合访问和测试非空约束 | typecheck 通过；Editor JS 843.50 kB / gzip 236.31 kB，既有 >500 kB 债保留 |

## 4. 真实测试证据

- `audit:n41-lazy-dialogue`：Compiler 正反例、fake-indexeddb 真实选定文件写入、完整 Compiler/Index 重建与重开、UI 交互、索引契约；当前定向 `4 files / 28 tests`；
- production build：Vite production preview，不使用测试替身；从最近工程 Route 首屏进入单场景 Sequence，角色 `char_yu`，插入 `N41 E3 portable verification`，原子保存后加载完整工程，完整内容编辑器精确可见 1 次，console error `[]`；
- 首次 production 失败产生的不可移植 ID 被保留为差异证据，没有把“局部保存成功”冒充完整闭环成功；随后使用新干净工程从头复验；
- `npm run check` 与 Windows / Node 22 CI 证据在推送后补录，未绿色前不关闭 E3 Engineering。

本地 `npm run check` 已以退出码 0 通过：普通回归 `116 files / 732 tests`、storage `1/1`、重型 VM `5/5`（59.70 秒）、Runtime corpus 10,000 seeds / 20,000 replays（19.757 秒，digest 未变）、Route 编辑同步 P95 `206.24 ms < 500 ms`、Dicing 总计 `2707.09 ms < 5000 ms` 且净节省 `85.83%`。Editor production bundle 为 843.50 kB / gzip 236.31 kB，既有拆包债未掩盖。

## 5. 需求对齐与下一步

本切片推进 `REQ-SEQ`、`REQ-SCRIPT`、`USP-01` 和 `AC-03`，将 narration 之外第一种带跨实体引用的文本结构纳入同源闭环。它没有实现控制流 lazy 编辑、Stage、正式 Player、Android 编辑器、三端发布或真人 Product Acceptance。

下一步必须先取得远端 Windows 完整门；随后重新审计 N41 剩余出口条件，只能选择有专用 Compiler/Route 语义裁决的结构族。任何引用漂移、稳定 ID 不可移植、完整重建失败或 Route 语义被静默改变，都必须停止扩展并修正。
