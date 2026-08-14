# N23-E2 空工程可运行闭环审计

> 审计日期：2026-08-15
> 变更前基线：`8f32b8fbc6f134dd1dde3d4c5c3b4719503381a0`
> 分支：`agent/n22-stage-media`
> 结论：N23-E2 工程门通过；N21/N23 产品门、M1 和发布仍未通过

## 1. 需求对齐

| 验收点 | 结果 | 证据 |
|---|---|---|
| 从空工程开始，不借用硬编码样例 | 通过 | 浏览器新建 `N23 Blank Flow Audit`；自动化断言项目不是示例 ID |
| 3 个场景、2 名角色、1 个变量 | 通过 | 入口、晨光路线、星空路线；阿澄、小夜；`route` 字符串变量 |
| Writer 创建选择、变量、条件和两结局 | 通过 | 入口 8 步；“晨光抵达”“星空抵达” |
| 真实资源与演出 | 通过（当前工作区） | PNG/WAV 签名和预算检查通过，Asset Index r2；背景和 BGM 指令写入入口 |
| 内容保存到权威工程 | 通过 | `App` 将 Story 变化合并回 Canonical Project，生命周期宿主完成保存 |
| 关闭、重开不丢数据 | 通过 | 重开恢复 storage revision 6、入口 8 步、2 项资源及稳定 ID |
| 两条路线实际到达结局 | 通过 | 自动化双路线；浏览器重开后再次到达“晨光抵达”，此前同工程已到达“星空抵达” |
| 工程导出/导入语义稳定 | 文档层通过 | Golden semantic hash 固定为 `56c361a9b16d1fd532e280f4f21ee5e131d9bdaef7765365c6d88d4f3d7cb0e1` |

## 2. 真实断点与修复

1. 项目结构页保存 `CanonicalProject`，内容编辑器只保存独立 IndexedDB `ProjectSnapshot`，因此用户在 Writer/Script 的修改不会进入工程 ZIP。新增 `projectCanonicalWithStory` 和生命周期宿主回调，把内容编辑重新并回同一权威工程。
2. 结构页新增场景没有语句，内容编辑器无法打开空场景。场景创建现在以一个批事务同时写入场景和“未命名结局”占位，随后可立即编辑。
3. 结构页变量没有进入 Writer 引用选择器。Writer 现在合并 Canonical 变量 ID 与脚本内已使用变量。

## 3. 自动化证据

- `canonical-project-save-app.test.tsx`：Script 提交并保存后，生命周期宿主收到修改后的 Story。
- `canonical-project-adapter.test.ts`：Story 合并保留 Canonical 变量、资源和角色扩展字段。
- `project-entity-manager.test.tsx`：新场景在同一事务中包含可编辑结局占位。
- `n23-blank-project-flow.test.ts`：空工程实体创建、Canonical 保存、重开、ZIP 导出/导入、固定语义哈希和双路线结局。
- 浏览器结构化记录：[`evidence/n23/blank-project-flow-browser.json`](../evidence/n23/blank-project-flow-browser.json)。

## 4. 浏览器 Golden

实际操作顺序：项目首页新建工程 → 结构页建立场景/角色/变量 → Writer 建立对白/变量/条件/标签/选择/双结局 → 导入真实 PNG/WAV → 写入背景和音频演出 → 自动保存 → 返回首页 → 最近工程重开 → 进入内容编辑器 → 完整流程试玩到结局。

重开后观察：入口 `8` 个步骤、资源库 `2` 项 / Index `r2`、storage revision `6`；背景 `n23_background` 和音频 `n23_theme` 均仍在权威脚本引用中。

## 5. 后续状态与下一顺序

N23-E2 当时只证明当前浏览器工作区内的创作与运行闭环。该断点已由 [N23-E3 自包含资源工程 ZIP 审计](117-n23-e3-portable-resource-bundle-audit.md)关闭：源 Blob、Asset Index 和 Canonical 文档现可随同一 ZIP 迁移，并已在新工作区运行及重载复验。当前顺序为：

1. N21 真人任务 T01–T08；
2. N23 五分钟内容量与两名未参与实现者验收；
3. N30/N31 正式 Compiler、共享 VM 与 Player；
4. 构建、安装、签名和发布。

在真人门完成前，不得宣称 N23、M1 或“可落地发布的游戏引擎”已经通过。

## 6. 复现命令

```bash
npx vitest run apps/editor/src/n23-blank-project-flow.test.ts apps/editor/src/canonical-project-save-app.test.tsx apps/editor/src/canonical-project-adapter.test.ts apps/editor/src/project-entity-manager.test.tsx --maxWorkers=1
npx tsc -p apps/editor/tsconfig.json --noEmit
npm run check
git diff --check
```
