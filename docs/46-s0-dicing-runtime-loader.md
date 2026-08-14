# S0.27 Dicing Atlas Runtime Loader 与 Original 安全回退审计

## 需求对齐与范围

S0.26 已产出通过实际字节收益门的无损 PNG Atlas，但编辑器与未来播放器仍缺少从持久化派生物安全读取目标图片的路径。S0.27 实现 Web Runtime Loader 垂直切片：解析受保护 Build Root，校验 Delivery Manifest 与 PNG Pages，在隔离 Worker 和硬预算内重建目标 RGBA；任何派生故障都返回当前 Asset Index 指向的 Original。

本阶段不实现 GPU 上传、纹理缓存、Draw Call 合批、KTX2/Basis、Windows/Android 原生纹理、低内存 LRU 或正式播放器界面。

## 冻结不变量

1. Runtime 不按文件名猜测派生物，只读取 `build:dicing:<groupId>` 保护根；
2. 根内必须恰好有一个 `application/vnd.world-studio.dicing-delivery+json` Manifest，并且 PNG 节点集合与 Manifest 完全一致；
3. 所有 Blob 在读取时重新计算 SHA-256；Manifest、Page 长度、摘要和血缘不一致即视为派生不可用；
4. Loader 始终从当前 Asset Index 重新读取 Original，不能使用分析期或发布期缓存代替当前源身份；
5. Original 在 Worker 内先解码，Manifest 中目标 Asset 的尺寸与规范 RGBA 摘要必须与当前 Original 一致；
6. PNG Page 使用 `colorSpaceConversion: none` 与 `premultiplyAlpha: none` 解码，并重新执行 Page RGBA 摘要、布局和最终目标 RGBA 摘要验证；
7. 默认硬预算：目标图片 16,777,216 像素、Atlas 总计 33,554,432 像素、编码输入 256 MiB；
8. Manifest/Page 缺失、损坏、版本错误、源不匹配或 Atlas 预算超限均返回已验证的当前 Original；
9. 当前 Original 自身缺失、不可解码或超过目标预算时才返回不可恢复错误，不伪装成成功回退；
10. Worker 输出仍由客户端复验结构、尺寸、字节长度；Atlas 输出还必须再次匹配 Manifest 中目标源摘要。

## 失败语义

成功结果分为：

- `atlas`：派生链完整，当前源身份匹配，目标 RGBA 逐字节重建通过；
- `original / atlas-unavailable`：派生根、Manifest 或 Page 不可用；
- `original / source-mismatch`：派生物对应旧源；
- `original / budget-exceeded`：派生 Atlas 超出加载预算，但当前 Original 可安全解码。

只有 Original 自身不可用才抛出 `DERIVATIVE_UNAVAILABLE` 或 `RESOURCE_LIMIT`。这让播放器能够区分“优化失效但游戏可继续”与“源资源本身不可播放”。

## UI 验证入口

资源保险库的严格候选组增加“验证 Runtime Loader”。发布后可直接读取持久化 Build Root 并验证 Atlas 路径；未发布、派生损坏或超限时显示 SAFE FALLBACK 及原因。该入口只用于 S0 证据，不代表正式玩家 UI。

## 自动化覆盖

- Build Root/Manifest/Page 的持久化读取与缺失根；
- Atlas Worker 响应与当前源摘要绑定；
- 派生像素替换和异常响应拒绝；
- 缺失、源不匹配、预算超限三种 Original 回退；
- Original 不可用与无 Worker 的失败关闭；
- UI 从发布到 Runtime Loader PASS 的完整集成路径。

阶段收口证据：

- `npm run check` 单次完整通过：TypeScript、37 个测试文件/242 项测试、生产构建、架构和全部性能门禁；
- 生产构建独立输出 `dicing-runtime.worker`，未把浏览器解码能力引入可移植核心；架构审计继续通过 30 个可移植文件和 3 个 Node 适配器文件；
- 脚本性能：10,000 句基线总计 334.45 ms，预算 12,000 ms；
- 资源性能：媒体/哈希/索引 1,658.54 ms（预算 10,000 ms），生命周期两项 232.73/324.74 ms（各预算 2,000 ms），Dicing 分组 2,125.46 ms、Atlas 排布/Extrusion/重建 2,377.73 ms、总计 4,503.19 ms（预算分别 3,000/3,000/5,000 ms）；
- 真实浏览器直接复用 S0.26 留存的两张 Original、Delivery Manifest、PNG Page 与 Build Root，没有重新发布派生物；
- Runtime Loader 从 IndexedDB 读取并校验持久化链路，将 `audit_atlas_a` 从 Atlas 重建为 256 × 256 RGBA，当前 Original 身份匹配，界面显示 `Runtime Loader PASS`；
- 默认舞台实测 334 × 187.9、比例 1.778（16:9）；浏览器控制台无 warning/error，审计标签页与开发服务已清理。

## 下一阶段

S0.28 应验证 Runtime 资源调度与内存纪律：按场景/组预取、并发解码上限、引用计数或 LRU 卸载、峰值双份内存和取消语义。GPU 上传与平台纹理仍需独立 Capability Matrix 和真机预算，不由当前 Web RGBA Loader 代替。
