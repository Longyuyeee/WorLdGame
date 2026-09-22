# 项目归档索引

> 建立日期：2026-09-01
>
> 目的：把已经被后续权威结论取代、且不再被活动文档、机器合同、脚本或代码引用的材料移出主工作区；归档不是删除，历史仍由 Git 保留并可直接查阅。

## 归档标准

文件只有同时满足以下条件才进入归档：

1. 不属于 README、#89、#90、#99、当前交接或机器合同的活动权威链；
2. 仓库内没有其他文件按文件名引用它；
3. 不被 npm script、Vitest 配置、审计工具、源码 import 或构建配置消费；
4. 已有更晚的文档或实现关闭其结论，移动不会改变当前需求和开发接续点。

## 文档归档

| 文件 | 归档原因 | 当前替代权威 |
|---|---|---|
| [149 N32 E6 时点出口对齐](docs/149-n32-engineering-exit-alignment-audit.md) | `5/6` 中间快照，无外部引用；E7 已关闭当时 Host 缺口 | `docs/150`、`docs/151` |
| [193 N42-E3b Preview 生产闭环](docs/193-n42-e3b-preview-production-loop-audit.md) | 中间切片记录，无外部引用；N42 后续切片与出口已覆盖 | `docs/194`–`docs/200` |
| [228 N51-E5 换机与 E6 入口](docs/228-n51-e5-handoff-and-e6-entry-checkpoint.md) | 已完成的换机快照，无外部引用；E6a–E6f 与 N51 出口已覆盖 | `docs/229`–`docs/235` |
| [79 CL-04 Spike 12](docs/79-cl04-vm-generated-web-worker-conformance-spike-12.md) | 旧 VM Spike 中间证据，无外部引用；正式 Runtime corpus 已接管 | `packages/runtime` 与 N31 审计链 |
| [80 CL-04 Spike 13](docs/80-cl04-vm-effect-barrier-meta-conformance-spike-13.md) | 旧 VM Spike 中间证据，无外部引用；正式 Runtime/Host 已接管 | `packages/runtime`、`packages/runtime-host` 与 N31/N32 审计链 |
| [112 N22 换机快照](docs/112-development-handoff-2026-08-14.md) | N22 已完成，恢复命令和暂停提交不再是当前入口 | `docs/113` 与当前 `docs/99` |
| [213 N50-E1 换机快照](docs/213-n50-e1-development-handoff-2026-08-26.md) | N50 Engineering 已完整关闭，旧 E1 恢复顺序失效 | `docs/219`、`docs/220` |
| [237 N52 准入前暂停快照](docs/237-n52-development-pause-and-handoff.md) | N52 Engineering 已完整关闭，旧 E1 接续点失效 | `docs/265`、`docs/266` |
| [269 N60-E2 换机快照](docs/269-n60-e2-cross-device-handoff.md) | E3/E4 已完成，旧“E3 尚未开始”状态被替代 | `docs/270`、`docs/271` |

## 测试文件审计

本次没有归档测试文件。当前共有 177 个已跟踪的 `*.test.*` / `*.spec.*` 文件：

- 170 个由 `npx vitest list --filesOnly --staticParse` 直接发现；
- 其余 7 个位于 `tools/`，全部由 `vitest.governance.config.ts`、`vitest.delivery-baseline.config.ts`、`vitest.performance.config.ts`、`vitest.route-performance.config.ts` 或 `vitest.asset-performance.config.ts` 显式执行；
- 因而没有测试文件满足“未发现、未引用、未执行”的归档条件。

后续只有在测试已被正式替代、从所有配置和脚本移除且引用扫描为零时，才可移动到 `archive/tests/`。不得通过归档测试来减少失败数或缩短门禁。
