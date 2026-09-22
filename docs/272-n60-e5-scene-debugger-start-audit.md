# N60-E5 调试器“从当前场景启动”修正审计

> 日期：2026-09-02
> 分支：`codex/n60-e1-debugger-session`
> 直接基线：`38bae5937f94a2f536a5aa8c52c14964e9d24a98`
> 状态：本用户路径 Engineering 已完成；N60 总 Engineering、Product Acceptance 与 N61 尚未关闭

## 1. 用户场景与目标

- **用户**：正在编辑长场景、需要从该场景开头复现问题的剧情创作者。
- **入口**：选择场景后进入 `Debug & QA → 调试会话`。
- **操作路径**：点击“从当前场景启动”，随后继续使用单步、继续、断点和观察器。
- **预期反馈**：正式 Runtime 停在所选场景第一个可呈现语句，当前 Scene/Statement stable ID 可见。
- **失败恢复**：场景不存在、为空或 Source Map 无效时沿用正式 Runtime 的结构化错误；用户可修正源码后重新启动，不建立第二套解释器。

该场景直接对应 PRD 3.10“从任意入口运行”。模型层已有 `startFormalPreviewFromScene` 和结构化失败处理，但 Debug & QA 产品界面只有 Entry/Statement 两个按钮，因此真实用户无法完成 Scene Fresh Run。

## 2. 预期—首次实际—修正后实际

| 检查 | 预期 | 首次实际 | 修正后实际 |
|---|---|---|---|
| 真实 App 用户路径 | 可点击“从当前场景启动” | `0/1`；找不到该可访问按钮，界面只有 Entry/Statement | `1/1`；按钮可点击，当前位置为 `scn_school_gate / stmt_gate_bg` |
| Runtime 所有权 | 复用正式 Scene Fresh Run | 模型能力存在但产品未接线 | UI 直接调用 `startFormalPreviewFromScene`，未增加运行时或状态副本 |
| 受影响回归 | 原有断点、Watch、QA 不回归 | 尚未验证 | N60 聚合 `8 files / 88 tests` 全部通过 |
| 类型合同 | TypeScript project graph 通过 | 尚未验证 | `npm run typecheck` 通过 |

首次失败命令与修正后命令相同：

```text
npx vitest run apps/editor/src/n60-debugger-session-app.test.tsx --maxWorkers=1
```

没有新增测试文件、覆盖率任务、全仓本地重跑或真人计时；本步只扩展现有真实 App 路径，并运行直接相关的 N60 聚合门。

## 3. 开发目标与需求对齐

本步关闭的是一个真实 P0 产品入口缺口，不是安全、审查或测试数量工作。Entry、Scene、Statement 三种 Fresh Run 现在都能从 Debug & QA 到达正式 Runtime，符合“功能优先、用户场景先行”。

本步不代表 N60 总 Engineering 或 Product Acceptance 通过，也不进入 P1 Solver、覆盖率、变量图。总出口还需继续核对 Delivery Plan 中“诊断抑制需有理由”和报告交付是否存在会阻断创作者发布前 QA 任务的实际缺口；已有能力直接确认，不重复测试。

## 4. 精确接续点

1. 拉取本分支最新远端头并阅读本文、[#271](271-n60-e4-p0-story-qa-product-closure-audit.md)及[当前状态](99-current-development-status-audit.md)；
2. 先从真实用户任务判断“忽略已知诊断并保留理由、复查时可追溯”是否缺失；只有确认会阻断发布前 QA，才实现最小纵向切片；
3. “完整报告”只在确有导出/交接用户场景时进入范围，不因计划中的名词自动扩张；
4. 每个切片继续采用“用户场景 → 预期/首次实际 → 修正 → 必要回归 → 文档/目标审计 → 推送”，真人验收等功能和整体 UI 就绪后统一进行。
