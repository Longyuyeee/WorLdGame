# N23-E5 五分钟可玩内容审计

> 审计日期：2026-08-15  
> 实现前基线：`882439277dad4d75037ae4cda7deab0c56ec4b12`  
> 分支：`agent/n22-stage-media`  
> 结论：五分钟内容量工程门通过；两名非实现者验收仍未执行，N21/N23 产品门保持未通过

## 1. 审计发现

原 Benchmark Seed 虽有 3 场景、2 角色、选择和演出指令，但每条路线只有 2 个可读节点，冻结模型估算均为 13.67 秒。仓库此前也没有“五分钟”的机器定义，因此不能以文件名、场景数或手工等待冒充内容量。

本轮将 Benchmark 扩充为原创短篇《末班电车前的五分钟》，并把同一源文件接入项目首页“打开五分钟验收工程”。它由现有 S0 → Canonical → Editor → 保存/试玩 → 独立 HTML 链消费，不维护第二份故事副本。

## 2. 冻结内容量门

[`config/n23-content-gate.json`](../config/n23-content-gate.json)与 `tools/audit-n23-content.mjs` 固定以下口径：

- 每条路线最低 300 秒；
- 中文/日文/韩文按 240 字符/分钟，拉丁文本按 180 词/分钟；
- 单个可读节点最少 1.5 秒，选择 5 秒，演出 1 秒，结局 3 秒；
- 至少 3 场景、2 角色、2 条路线、2 个不同结局，每条路线至少 20 个可读节点；
- 单路线 `wait` 贡献不得超过 10 秒，防止用空等待灌满五分钟；
- 必须覆盖对白、旁白、演出、变量、条件、标签、选择和结局；背景与音频指令均不可缺失；
- 门禁参数本身在审计器中冻结，修改 JSON 降低阈值会直接失败。

该模型是保守、可复算的内容量工程门，不冒充真实玩家计时。实际语速、停留、回看和选择思考仍由 N23 两名非实现者验收记录。

## 3. 结果

| 路线 | 结局 | 估算时长 | 可读节点 | Wait 灌水 |
| --- | --- | ---: | ---: | ---: |
| `benchmark_board` | 驶向仍可抵达的清晨 | 366 秒 | 27 | 0 秒 |
| `benchmark_stay` | 雨停以后重新出发 | 370 秒 | 27 | 0 秒 |

源语义 Hash 为 `d3792762eac1e246748e95bf664117b03e5df8ada8bc4917d1203270d075f64f`。`demo:empty-to-web` 使用同一 Benchmark 生成 22,677-byte 单文件 HTML，项目摘要 `a68e67b58218dbebb9ecf1a4b29e9cfefe6f93ca5992bdee420ba88bdf274aa0`，产物 SHA-256 `f04bcc3681356e627c4cb675ef3451c56aaf7810f94e4aff02ecd647166f46e1`；两条路线均执行 30 个可见步骤并到达对应结局。

结构化证据见 [`evidence/n23/five-minute-content.json`](../evidence/n23/five-minute-content.json)。

## 4. 产品可达性

项目首页新增“打开五分钟验收工程”。点击后会把审计过的同一 Golden 物化到新的 OPFS Canonical 工程，用户可以：

1. 进入项目结构并核对 3 场景、2 角色；
2. 进入 Writer/Sequence 修改文本与控制流；
3. 保存、返回、重开；
4. 在完整流程试玩中选择任一路线到结局；
5. 构建并下载独立试玩 HTML。

## 5. 需求与剩余门

- N23 Required Artifact 的“5 分钟、3 场景、2 角色、2 结局”内容量工程部分已满足；
- N23 Required Flow 的现有 E1–E4 能力由同一作品复验，未新增平台包装；
- `REQ-RUNTIME` 与 `REQ-BUILD` 仍只登记工程候选，不登记正式通过；
- 两名非实现者、真实完成时长、Severity 0/1 为 0 仍未获得；任务与证据口径已由 [`N23-PA-01`](121-n23-product-acceptance-execution-kit.md)冻结，权威状态为 `pending-participants`、`0/2`；
- N21 真人记录仍为 `pending-participant`，`RA-N21-002` 继续阻断 N21/N23/M1/发布；
- 正式 Compiler/Runtime/Player 仍不得在 N23 产品门通过前宣告开始或完成。

## 6. 复跑命令

```powershell
npm.cmd run audit:goldens
npm.cmd run audit:n23-content
npm.cmd run demo:empty-to-web
npm.cmd exec vitest run apps/editor/src/n23-benchmark-project.test.ts apps/editor/src/project-home.test.tsx -- --maxWorkers=1
npm.cmd run check
```
