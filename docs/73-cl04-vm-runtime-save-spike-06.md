# CL-04 Narrative VM Runtime Save Spike 06 审计

> 实现 Revision：`63382f6a3dcaea18eda40cfc3f47b2565fb8e726`
>
> 风险：CL-04
>
> 判定：Spike 06 通过本轮门；CL-04 保持“进行中”，未通过
>
> 范围：VM-11/12 的内存 canonical Save 协议，不是商业级持久化、签名安全或跨版本兼容承诺

## 1. Save envelope 与真相边界

Runtime Save 与源工程、Editor Undo/Redo 和 Project WAL 分离。V0 envelope 精确包含 `saveSchemaVersion`、IR/project/build/runtime/opcode registry、独立 Meta Progress 引用、完整 Runtime Session 与 integrity digest。完整 Session 保留 State、History cursor/checkpoint、输入 tombstone、Effect ledger 和 Barrier record。

Save 不包含时间戳、路径、DOM/Canvas、Promise、线程、平台句柄或密钥。16,777,216 字符限制是解析前 fail-closed 门，不是产品容量结论。

## 2. 加载顺序与原子性

加载顺序冻结为：

1. 验证当前 Program/Session；
2. 限制尺寸并要求原始文本就是 canonical encoding；
3. 识别 schema，未来与未知版本拒绝；
4. 验证独立 Save domain SHA-256；
5. 验证 project/build/IR/runtime/opcode/Meta/Session 全部不变量；
6. 成功时返回旧 pending Effect cancellations；
7. 返回存档 pending Effect rehydrate intents；
8. 宿主按上述顺序原子采用加载 Session。

任何失败都返回原活动 Session，且不产生 cancellation/effect。当前只有 v0，所以 migration 只做深拷贝 identity；不存在的旧版本不得伪装为迁移成功。

## 3. 测试与结果

VM 定向测试 61 项，其中 Spike 06 新增 11 项。全仓 `npm.cmd run check`：

- 常规测试：55 files / 384 tests / 0 failed；
- 全 workspace build：PASS；
- 架构审计：45 portable files / 3 Node adapter files，PASS；
- 脚本性能：9 tests，PASS；
- 资源性能：4 tests，PASS。

证据包位于 [`evidence/cl-04/spike-06`](../evidence/cl-04/spike-06/result.md)。

## 4. 审计结论与诚实缺口

| 契约项 | 当前状态 |
|---|---|
| VM-11 Save/Load + History Cursor | Spike 06 基础通过；单 Node、内存字符串 |
| pending Effect/Barrier 恢复 | cancel + rehydrate、Barrier Back 阻断基础通过 |
| VM-12 损坏/未来/缺 Opcode | fail closed 且保留活动 Session |
| 非破坏迁移 | v0 identity clone 通过；无真实旧版本语料 |
| 文件/OPFS/Android 原子持久化 | 未开始 |
| 真实性签名、加密与隐私 | 未开始；SHA-256 不是签名 |
| 跨 Build 显式迁移 | 未开始，当前严格拒绝 |
| Skip/Auto、Meta Progress、10k 生成序列 | 未开始 |
| Web/Windows/Android Save Corpus | 未开始 |
| Architecture + QA 独立审阅 | 待完成 |

下一切片是 Spike 07：冻结 Normal/5/10/20/40/Instant Skip、Read/All/Hold/Toggle、Auto 与选择/输入/错误/资源/Stop Point/Barrier 停止语义，执行 VM-09/10；仍不得提前接入 UI。
