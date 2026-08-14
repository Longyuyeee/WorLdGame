# CL-04 Narrative VM Conformance Bundle Spike 14 审计

> 实现 Revision：`ecc29a65bad3077ded05afe373d7060112c60aef`
>
> 判定：Spike 14 通过本轮问题；CL-04 保持“进行中”，未通过
>
> 范围：可移植 Bundle/Observation/Difference 协议与隔离 Node CLI 参考宿主，不是 Windows/Android Runtime 证据

## 1. 需求对齐

本轮把 Spike 10–13 已冻结结果封装为内容寻址 `bundle.cl04.spike14.v0`。平台宿主必须自行执行同一 VM 并输出 Observation；比较器按稳定路径生成机器可读 Difference Report。

退出码冻结为：`0` 一致、`2` 剧情一致性差异、`64` 调用/输入无效、`70` 宿主内部异常。

## 2. 固定结果

| 项目 | 结果 |
|---|---|
| Bundle Digest | `d67631d6aaf36157501c7328b2d6486fd70c0dfc98493c3844c61dfbecc16f21` |
| Node 参考宿主完整运行 | `match` / exit `0` |
| 摘要故障注入 | `result.spike13.suiteDigest` / `difference` / exit `2` |
| 非法 JSON | `invalid` / exit `64` |
| CLI 产物 | 130.21 kB；gzip 25.61 kB，仅参考工具体积 |

全仓 `npm.cmd run check`：62 files / 416 tests、全 workspace build、51 portable files / 3 Node adapter files 架构审计，以及脚本/资源性能门禁全部通过。

## 3. 限制与下一步

- Node CLI 只证明协议可执行，不计 Windows 产品壳或 Android 壳；
- 尚无 Windows/Android Runtime Observation、真实存储、目标设备或独立审阅；
- Runtime Save schema 仍绑定 `cl04-spike.9`。

下一动作转入平台接入：按 CL-03 契约让可抛弃 Windows 壳候选在自身进程执行 Bundle，再按 CL-02 工具链和真机条件接入 Android；不得用 Node CLI 输出代替平台 Observation。
