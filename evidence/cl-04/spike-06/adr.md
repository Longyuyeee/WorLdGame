# CL-04 Spike 06 临时决策

状态：**保留 Save envelope 与加载顺序为正式 Runtime 候选，不形成最终存储/安全 ADR**。

保留候选：Save 与源工程/Editor WAL 分离；envelope 精确绑定 project/build/IR/runtime/opcode；完整 Session 作为 payload；Meta Progress 仅保存独立版本化引用；canonical bytes 使用独立 Save domain SHA-256；加载全程在隔离副本验证，失败不取消活动 scope、不替换活动 Session；成功后按 cancellations → rehydrate effects → Session 的顺序交给宿主。

摘要不等于真实性。若产品需要防作弊或云端可信进度，必须另行威胁建模并采用认证签名/MAC；不得把公开 SHA-256 描述为安全签名。实际持久化还必须通过各平台的临时写、重新读取校验、原子替换或双槽指针与故障注入。

下一决策点：Spike 07 冻结 Skip/Auto 调度策略与停止边界，执行 VM-09/10；随后再进入 Meta Progress、生成序列与三宿主证据。
