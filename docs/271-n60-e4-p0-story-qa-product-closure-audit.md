# N60-E4 P0 Story QA 产品闭环审计

> 日期：2026-09-02
> 分支：`codex/n60-e1-debugger-session`
> 直接基线：N60-E3 最终证据头 `916d6959434600d94b0d8cf85f47c906a46d4353`
> 状态：E4 本地 Engineering 证据已完成；精确提交 Windows CI 待推送后回填；N60 Product Acceptance、N61 与真人门不变

## 1. 目标与真实代码边界

本步直接关闭 PRD 3.10 P0 剩余的剧情 QA 产品路径：在真实 Debug & QA 工作区集中呈现不可达、缺少出口、悬空引用、缺失资源和非交互循环，允许按五类聚焦，并从诊断返回稳定 Scene/Statement 源位置。

实现复用 N30 Compiler 已有 CFG/SCC、资源与引用诊断以及正式 Source Map；React 只负责分类投影、计数、筛选和定位，不建立第二套诊断器，也没有抢跑 P1 的结局 Solver、分支覆盖率或变量读写图。

五类映射冻结为：

- 可达性：`MISSING_ENTRY_SCENE`、`NO_REACHABLE_ENDING`、`UNREACHABLE_SCENE`、`UNREACHABLE_STATEMENT`；
- 出口：`SCENE_NO_EXIT`；
- 资源：`MISSING_ASSET`、`INVALID_ASSET`；
- 循环：`NON_INTERACTIVE_LOOP`；
- 引用完整性：其余 Compiler/Runtime/Source Map/草稿诊断，确保未知或新增诊断不会从产品结果消失。

## 2. 预期—首次实际—修正后实际

| 真实路径 | 预期 | 首次实际 | 修正后实际 |
|---|---|---|---|
| 故障 QA Golden App | 五类 P0 风险同时可见并可操作 | `0/1`；真实诊断卡已出现，但找不到可访问区域“P0 Story QA 分类” | Golden 检出 `UNREACHABLE_SCENE`、`SCENE_NO_EXIT`、`MISSING_LABEL`、`MISSING_ASSET`、`NON_INTERACTIVE_LOOP`，五类计数均非零 |
| 分类筛选 | 选择资源后只聚焦资源问题 | 没有分类模型和分类控件 | 点击“资源”后保留 `MISSING_ASSET`，循环诊断从结果中移除；严重级别筛选继续可组合使用 |
| 稳定源返回 | 从资源问题返回原语句 | 旧卡片可定位，但没有五类 Golden 证明 | 从 `MISSING_ASSET` 点击“定位并修复”回到 Writer 的 `qa_missing_asset` |
| 正常路线反例 | 五类均已检查且无误报阻断 | 旧页面只显示总计“无诊断”，不能看见五类覆盖状态 | 校园工程模型与 production UI 均显示五类 `0`、`已检查 · 无问题` |
| desktop production | 分类总览不溢出、可读 | 无分类总览 | 1440×900：五类并排，每类约 `256.6×87.6px`，document 横向 overflow `0` |
| mobile production | 单列、无横溢出、控件满足触控 | 无分类总览 | 390×844：五类单列，每类 `325×87.6px`，document 横向 overflow `0` |
| 浏览器稳定性 | 真实生产交互无 console error/warning | 无 E4 路径 | desktop/mobile 均 `0 error / 0 warning` |

Golden 不是静态断言 Compiler 函数：`n60-story-qa-app.test.tsx` 构造真实 Canonical 工程，通过 `App → Debug & QA → 运行正式 QA 检查 → 分类筛选 → 定位并修复` 完整产品链执行。正常校园工程作为反例，防止“检出越多越好”的验证偏移。

## 3. 本地测试与构建证据

- 首次产品红测：`npx vitest run apps/editor/src/n60-story-qa-app.test.tsx --maxWorkers=1` → `0/1`，精确失败为缺少“P0 Story QA 分类”；
- 聚焦修正：QA model + real App → `2 files / 3 tests`；
- N60 聚合：`npm run audit:n60-debugger-session` → `8 files / 88 tests`；
- TypeScript project graph：`npm run typecheck` 通过；
- production build：17 个 workspace 全部成功；Editor CSS `148.37 kB / gzip 26.21 kB`，JS `1006.99 kB / gzip 281.51 kB`，既有 >500 kB 拆包债继续保留；
- production browser：真实打开示例工程、进入内容编辑器、运行 QA；桌面与手机结果见上表。

完整 `npm run check` 已在原预算下通过：普通回归 `158 files / 986 tests`，Editor 主 App `45/45`，autosave 测试体 `4.71s < 5s`，冻结 VM `85.68s < 90s`，Runtime corpus `10,000 seeds / 20,000 replay` 用时 `18.734s`；Script `13/13`、Route `9/9`、Asset `4/4` 全绿，Route 10k 编辑 P95 `171.85ms < 500ms`，Asset Dicing 总计 `3511.41ms < 5000ms`。精确提交 Windows / Node 22 CI 仍须在推送后回填，不跨提交复用 E3 绿色结论。

精确实现头 `0e3f7363e65cd16daeedf889c3c9fdd46ecc8537` 随后由 Draft PR #123 的 Windows / Node 22 run `33583516296` / job `100102687001` 在 `14m34s` 内完整通过。相同冻结预算下，N60 为 `8 files / 88 tests`、普通回归为 `158 files / 986 tests`、Runtime corpus 用时 `30.973s`、autosave 测试体 `4.47s < 5s`、VM 测试体 `67.44s < 90s`、Route 10k 编辑 P95 `164.42ms < 500ms`、Asset Dicing 总计 `3677.54ms < 5000ms`。追加本段的纯证据提交仍须自己的精确 head CI，不复用实现头结论。

## 4. 需求与开发目标审计

E4 直接服务“创作者发布前发现剧情结构错误并回源修复”，没有陷入只增加安全、治理或测试数量的循环。PRD 3.10 P0 的运行入口、断点/单步/继续、状态观察、五类剧情错误和源跳转现在都有产品实现；因此 **P0 功能范围可进入 N60 总 Engineering 出口复审**，但不能仅凭本切片自动宣布整个 N60 Engineering 或 Product Acceptance 通过。

仍不得提前宣称：

- 当前分类是 Compiler 正式诊断的产品投影，不是 P1 的状态空间 Solver 或分支覆盖率；
- QA Golden 自动化与 production 浏览器不是 N21/N23 真人验收，真人记录继续为 `0/1`、`0/2`；
- Delivery Plan 中“诊断抑制需有理由”及“完整报告”尚需在总出口复审中逐项判断是否为 P0 出口缺口；
- Windows/Android 正式 Host、实体设备、M1 Stable 与发布仍未完成。

## 5. 精确接续点：N60-E5 Engineering 总出口复审

下一步先做一次最小 N60 Engineering 总出口核对，而不是直接进入 P1。核对以用户能否完成“发现问题 → 聚焦问题 → 回源修复 → 重新检查”的真实任务为准；已有代码和证据足够的条目直接确认，不重复测试或扩张审计。只有实际阻碍用户的缺口才建立一条最小真实 App 反例并做纵向修正。

若 P0 出口满足，再单独规划 P1 的选择路径录制/回放、结局可达性 Solver、分支覆盖率、变量读写图等；真人参与继续等到功能与整体 UI 收束后，由产品负责人统一开始。
