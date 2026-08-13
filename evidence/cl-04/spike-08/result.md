# CL-04 Spike 08 Result

## 结论

`1c3bf1e` 在单一 Node 开发宿主通过 VM-13 的最小 Meta Progress 语义。已读、CG 与结局是独立、只增、内容寻址的 canonical 数据；Runtime Back 不触碰 Meta，旧 Save 引用只与当前进度合并，不能覆盖。CL-04 保持“进行中”。

## 已观察结果

- `textRead`、`cgUnlocked`、`endingReached` 事件只增加稳定 ID，重复事件幂等；
- 合并满足交换、结合、幂等，且不修改输入；
- project/scope 不同、集合无序/畸形、事件非法、Save 项目不符均 fail closed；
- Meta 使用独立域 SHA-256，与剧情 State Hash 分离；
- Save 引用由 Meta 内容 Hash 推导，调用者不能提交任意引用；
- 引用快照缺失或不匹配时，Save + Meta 原子失败，保留活动 Session/Meta 且不产生取消/Effect；
- Runtime Save 绑定升级到 `.8`，重新签摘要的 `.7` envelope 仍不兼容；
- 全仓 `npm.cmd run check` PASS：57 files / 402 tests，构建、架构和两套性能审计全部通过。

固定向量见 [`raw/vm-13-meta-golden.json`](raw/vm-13-meta-golden.json)。

## 未完成

当前 Meta 快照只在内存中传入，没有文件/OPFS/Android 存储、原子提交、索引、GC、配额与故障注入。`progressScopeId` 是本地命名空间，不是账户；没有账户或云同步。IR 尚无正式 `say(textId)`，所以尚未把 Meta `readTextIds` 接入 Spike 07 的 Skip Read。SHA-256 只做内容寻址与意外损坏检查，不提供真实性。画廊/结局 UI、10k 生成序列、三宿主与独立审阅仍待完成。
