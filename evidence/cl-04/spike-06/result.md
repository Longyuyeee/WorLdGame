# CL-04 Spike 06 Result

## 结论

`63382f6` 在单一 Node 开发宿主通过 VM-11/12 的最小 Runtime Save 协议。Save envelope 规范绑定 project/build/IR/runtime/opcode registry、Meta Progress 引用与完整 Session；加载验证失败始终保留原活动 Session；成功加载返回旧 scope cancellations 和已恢复 pending Effect intents。CL-04 保持“进行中”。

## 已观察结果

- Save serialization 相同输入产生相同 canonical string 与域分离 SHA-256；
- Save/Load 保持 History cursor、State Hash、Back/Forward、输入 receipt/tombstone、Effect 与 Barrier ledger；
- pending Effect Load 先取消旧活动 scope，再返回存档 Effect rehydrate intent；
- Barrier Load 后仍阻止 Back；
- 非 canonical 编码、未知字段、超限文本、摘要损坏、未来/负 schema 均 fail closed；
- 重新计算摘要也不能使错误 Build、缺 Opcode、损坏 Session 或猜测 stepId 通过深度校验；
- v0 identity migration 在深拷贝上执行，不修改输入 Save；
- 全仓 `npm.cmd run check` 为 PASS：55 files / 384 tests，构建、架构和两套性能审计全部通过。

固定向量见 [`raw/vm-1112-save-golden.json`](raw/vm-1112-save-golden.json)。

## 未完成

SHA-256 只检测意外损坏，不提供密钥认证、签名或加密。当前只有 schema v0，故只证明 identity migration 管线和未知版本拒绝，没有真实旧版本迁移。Save 尚未写入文件、OPFS、移动沙箱或云端，也没有双槽/原子替换、断电恢复、配额、隐私、跨 Build 显式映射和三宿主语料。
