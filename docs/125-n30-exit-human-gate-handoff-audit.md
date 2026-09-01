# N30 退出与真人门交接审计

> 后续状态：产品负责人在本审计明确 N31 阻断后再次要求严格按顺序继续开发；`RA-N21-003` 因而只把工程上限扩至 N31，详见 [N31-E1 审计](126-n31-e1-runtime-kernel-audit.md)。本文件保留当时的真实门禁快照。

> 审计日期：2026-08-15
> 审计基线：`63e0886968f6124518fae736f3bd7da0b61e3674`
> 当前分支：`agent/n30-project-compiler-e2`
> 当前交付：Draft PR #35；Windows / Node 22 run `31876261375` 通过

## 1. 顺序判定

N30-E1/E2 的 Compiler 工程退出条件已经完成本地与跨机器复验。当前下一节点不是 N31 Engineering，而是按冻结协议依次完成：

1. 一名合格非程序参与者执行 `N21-HV-01` 的 T01–T08；
2. N21 记录通过后，两名不同的非实现参与者执行 `N23-PA-01` 的 P01–P06；
3. 两门均通过、Severity 0/1 为 0、产物 Hash 有效后关闭 `RA-N21-002`；
4. 重新审计 N30 Product Acceptance，满足后才允许创建 N31 正式 Runtime 分支。

AI、开发者演示、主持人代操作或自动化测试不能替代真人证据。当前继续实现 N31 会违反 `RA-N21-002.maximumDeliveryNode=N30`，所以本轮没有新增 Runtime 或平台功能。

## 2. 验收就绪复验

| 检查 | 结果 | 真实含义 |
|---|---|---|
| `audit:n21-human-validation` | PASS；`pending-participant`；0/1 | 协议与空白记录有效，不表示真人通过 |
| `audit:n23-product-acceptance` | PASS；`pending-participants`；0/2 | 双参与者协议有效，不表示产品通过 |
| `audit:n23-acceptance-launcher` | PASS；production preview smoke | Windows 双击入口、生产 HTML/JS/CSS 与固定本地 HTTP 可启动 |
| `audit:risk-acceptances` | PASS；`RA-N21-002` active | N31、M1 Stable 与发布继续被阻断 |

复验入口为 `start-n23-acceptance.cmd`，固定地址为 `http://127.0.0.1:43123/`。启动器通过只证明参与者无需安装开发工具即可进入验收环境，不证明任务可用性或理解成本已经通过真人验证。

## 3. 需求对齐

- `REQ-SEQ`：工程能力已就绪，N21 真人可用性证据仍缺失；
- `REQ-RUNTIME`：N30 编译数据候选完成，正式 Runtime State、Save/History 与共享 Player 仍归 N31；
- `REQ-QA`：Compiler 诊断和 Source Map 已完成工程候选，真人任务问题与 Severity 仍待记录；
- 27 条 M1 AC 继续保持 `0/27` 完整通过，不把协议 PASS 或启动器 PASS 换算为产品完成。

## 4. 交接输入与完成定义

N21 执行人只需获得仓库工作副本、双击启动入口和 [N21 执行包](114-n21-human-validation-execution-kit.md)。主持人可以宣读任务并记录问题，但不能操作编辑器或讲解准确控件。若任何任务失败，应如实把记录改为 `fail`，登记缺陷并回到对应功能修复；不得跳到 N23。

N23 只能在 N21 权威记录为 `pass` 后开始。两位参与者必须分别完成工程打开、文本编辑保存重开、编辑器双路线、独立 HTML 构建和独立 HTML 双路线。完成定义及证据字段以 [N23 执行包](121-n23-product-acceptance-execution-kit.md)为准。

## 5. 当前阻断

当前缺少的是外部真人执行资源，不是尚未实现的验收启动流程。因协议要求参与者未参与代码或设计且不熟悉 Story Script，Codex 不能自行填充记录或代替参与者。等待真人证据期间，合法动作仅包括修复验收发现的缺陷、维护现有门禁和处理安全/构建回归；不得继续 N31 或无关平台扩展。
