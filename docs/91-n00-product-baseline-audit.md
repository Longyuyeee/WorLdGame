# N00 产品主线与仓库基线审计

> 日期：2026-08-13
> 节点：N00
> 对齐需求：R0 仓库治理、全部 `REQ-*`/`AC-*` 的共同工程前置
> 状态：通过（本地与 Draft PR Windows CI 均通过）

## 1. 节点目标

N00 不实现用户功能。它建立可持续开发产品功能所需的仓库边界，确保正式产品、平台适配器和可抛弃 Spike 不再混为同一进度口径，并让每次提交在干净 Windows 环境运行统一检查。

完成定义：

1. 当前全部 workspace 均有唯一分类、owner、稳定性和允许依赖；
2. 正式产品/候选包不能依赖 Spike 或 Conformance；
3. 未来 Domain、Compiler、Runtime、Build 和三端 Player 有明确首次创建节点；
4. 任何新增 workspace 未登记时 CI 失败；
5. 全新 checkout 可用 `npm ci && npm run check` 验证；
6. Pull Request 自动运行完整检查。

## 2. 审计发现

### 2.1 原有边界

- 根 `package.json` 已使用 npm workspaces，但只有路径通配符，没有 workspace 身份或依赖白名单；
- `tools/audit-architecture.mjs` 对已知包有较强的源码级约束，但新增 workspace 不会自动进入审计；
- `apps/editor` 是产品原型；`apps/vm-conformance*` 和 `apps/windows-shell-conformance` 是验证宿主；
- `packages/narrative-vm-spike` 名称和版本明确为 Spike，但没有机器规则禁止正式产品依赖它；
- 仓库没有 `.github/workflows`，远端 PR 没有统一的干净环境门；
- 目标 `project-domain`、`project-compiler`、`runtime`、`build-core` 和三端 Player 仅存在于文档，没有可检查的路径所有权。

### 2.2 风险

| 风险 | 影响 | N00 处理 |
|---|---|---|
| 新包绕过架构审计 | 平台或 Spike 依赖进入正式产品 | workspace 注册表必须与磁盘一一对应 |
| 产品依赖验证包 | 原型变成不可替换的生产依赖 | `product/portable-candidate/adapter` 禁止依赖 `spike/conformance` |
| 依赖方向随意变化 | Domain、Compiler 和 Host 循环耦合 | 每个 workspace 声明精确内部依赖白名单 |
| Owner 不明确 | 失败没有责任边界 | 每个 workspace 必须有 owner |
| 本机通过但干净环境失败 | 无法稳定交付 | Windows GitHub Actions 运行 `npm ci` 和完整 `check` |
| 提前创建空架构包 | 目录看似完整但无真实节点成果 | 未来边界只登记 `firstNode`，到节点开始时才创建 |

## 3. 实现

### 3.1 Workspace Boundary Registry

新增 `config/workspace-boundaries.json`：

- 9 个当前 workspace 全部登记；
- 分类：1 个 product、3 个 portable-candidate、1 个 adapter、1 个 spike、3 个 conformance；
- 每项记录 package name、kind、stability、owner 和允许的内部依赖；
- 预登记 7 个正式产品边界及首次实现节点。

### 3.2 机器审计

新增 `tools/audit-workspaces.mjs`，检查：

- 注册路径与磁盘 package 完全一致；
- package name/path 唯一；
- owner、kind、stability、ESM、private 和 build script；
- 实际内部依赖与白名单完全一致；
- 正式产品、候选包和适配器不得依赖 Spike/Conformance；
- portable candidate 只能依赖 portable candidate；
- 计划边界不能同时处于“计划”和“已注册”。

该审计加入根 `check` 的第一步，使错误依赖在编译和长测试前快速失败。

### 3.3 干净环境 CI

新增 `.github/workflows/ci.yml`：

- Pull Request 和 `main` push 触发；
- `windows-latest`、Node `22.12.0`；
- 只使用锁文件 `npm ci`；
- 运行完整 `npm run check`；
- 同分支新提交取消旧运行；
- 30 分钟硬超时。

Windows 是 M1 主编辑器和本地构建主机，因此 N00 先以 Windows 为必须门。Android/浏览器/发布产物矩阵在对应产品节点加入，不能用 N00 CI 冒充平台验收。

## 4. 本地验收证据

环境准备：

```powershell
npm.cmd ci
```

结果：146 个 package 安装，156 个 package 审计，0 vulnerability。

完整门：

```powershell
npm.cmd run check
```

结果：

- workspace audit：9 个当前 workspace、7 个计划边界，PASS；
- typecheck：PASS；
- 普通测试：62 files / 415 tests，4 Workers，全部 PASS；
- VM 确定性与 10k 语料门：1 file / 5 tests，1 Worker，全部 PASS；
- 9 个 workspace build：PASS；
- architecture audit：51 个 portable files、3 个 Node adapter files，PASS；
- script performance：9 tests，PASS；
- asset performance：4 tests，PASS；
- 修正后完整复跑总耗时：73.1 秒。

首次远端运行暴露并保留了两项跨环境问题：VM 重负载文件与其余测试并行时，VM-14 10k 循环在共享 Runner 上超过 Vitest 通用 5 秒单测超时；GitHub Windows Runner 的临时目录经过 junction，导致授权根测试在进入用例前被生产安全检查拒绝。修正方式没有减少 10k 规模、删除断言、提高单测超时或放宽重解析点检查：普通测试与 VM 重负载门改为分阶段运行；测试辅助函数先规范化系统临时目录，再创建授权根，显式 junction 拒绝用例保持不变。N31 正式 Runtime 仍需独立性能预算和 CI 历史证明。

远端验收：Draft PR #23 的 GitHub Actions run `31708751792` 在 `windows-latest` / Node `22.12.0` 上通过，作业 `94475915357` 总耗时 3 分 2 秒；Checkout、锁定依赖安装、完整 `npm run check` 与收尾步骤全部成功。

## 5. 需求对齐

| 计划要求 | 结果 | 证据 |
|---|---|---|
| 选择完整审计代码基线 | 通过 | 产品计划分支基于 `daa86f9` + PR #22 文档基线 |
| 正式应用与验证宿主隔离 | 通过 | workspace kind/stability 注册 |
| 目标产品包边界明确 | 通过 | 7 个 `plannedProductBoundaries` 和 `firstNode` |
| Owner 与允许依赖明确 | 通过 | 9/9 workspace 全量登记 |
| 干净环境一条命令验证 | 通过 | `npm ci` + `npm run check` |
| PR 自动检查 | 通过 | `product-baseline` workflow，run `31708751792` |

## 6. 不证明

N00 不证明：

- 通用项目已经实现；
- 固定 `campusStoryProject` 已移除；
- Compiler、正式 Runtime 或 Player 已存在；
- Windows/Android 编辑器已经产品化；
- 任一 P0 产品功能已经通过。

这些边界分别从 N10、N30、N31、N80 和 N90/N91 开始实现。

## 7. 下一节点

N00 已通过实现、自审、本地完整门、推送和远端 Windows CI。下一节点进入 N10：Canonical Project Schema。N10 必须先建立通用 `project-domain`，再迁移固定样例；不得直接在 `apps/editor` 中继续增加硬编码字段。
