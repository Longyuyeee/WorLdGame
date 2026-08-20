# CL-04 Spike 03 Result

## 结论

`d57f1f7` 在单一 Node 开发宿主通过 Choice 请求和外部输入内核测试。Choice 停止点、显式 execution 隔离、确定 request token、严格输入匹配、幂等 receipt、恢复后接受和固定六步 Hash 已形成可复现证据。CL-04 保持“进行中”。

## 已观察结果

- 宿主必须显式提供 canonical `executionId`，不同 execution 产生不同 request token；
- Choice 首次转换留在原 IP，revision 与 logical sequence 各推进一次，并返回与 State 中相同的请求；
- token 由 execution、choice、logical sequence 和 expected revision 规范派生，恢复校验会重算；
- 接受输入后清空 pending request、跳到选项目标并写入 canonical receipt；
- 相同 `inputId + payload` 重复提交不修改 State；同 ID 不同载荷稳定冲突；
- 缺失输入、旧 revision、外部 execution、错误 token、乱序、非法选项、伪造等待 State 和 receipt 上限均 fail closed；
- Program 事后修改 options 不会改变已生成的等待 State；
- 全仓 `npm.cmd run check` 为 PASS：52 files / 351 tests，构建、架构和两套性能审计全部通过。

固定向量见 [`raw/choice-input-golden.json`](raw/choice-input-golden.json)。

## 未完成

本轮 receipt ledger 是 History 的前置输入记录，不是正式 Runtime History；1024 上限是 Spike 的显式停止门，不是产品容量结论。没有 Back/Forward/Fork，故 VM-04/05 尚未通过。`RuntimeStateV0` 仍是私有可抛弃 Spike 草案，本轮精确字段扩展不承诺读取 Spike 01/02 的状态快照；正式 Save schema 尚未建立。
