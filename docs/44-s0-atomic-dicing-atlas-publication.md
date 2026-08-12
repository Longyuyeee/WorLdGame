# S0.25 Dicing Atlas 原子发布与资源血缘审计

## 问题与需求对齐

S0.24 已冻结确定性 Atlas、Padding/Extrusion、Manifest 完整性和 Original 回退契约，但产物只存在于内存，不能作为项目中可管理、可回收、可重建的派生资源。S0.25 将通过收益门槛的严格候选组接入现有 writer-fenced IndexedDB 资源事务和 Source/Derivative 生命周期。

本阶段发布的是原始 RGBA Atlas Page 与规范 JSON Manifest，目的是证明多 Blob、血缘和 Build Root 的一致性。它不是最终 PNG/WebP/KTX2 编码，也不代表 Web、Windows、Android Runtime Loader 已完成。

## 发布流程

1. 用户先运行 S0.23 严格分组，只允许 `decision = adopt` 的组显示“发布可重建 Atlas”；
2. 编辑器重新读取组内所有内容寻址源 Blob，并在隔离 Worker 中重新解码；
3. Worker 使用 S0.24 契约生成 Atlas，并逐字节验证所有图片重建；
4. 客户端重新解析 Manifest、验证 Page 摘要并重建每个稳定 Asset ID；
5. 本轮 Manifest 的 `sourcePlanDigest` 必须与分析报告的 `planDigest` 完全一致；
6. 发布事务再次核对 Asset Index 中每个稳定 Asset ID 的编码源摘要和实际源 Blob；
7. 同一 writer-fenced IndexedDB 事务写入全部内容寻址 Page/Manifest Blob、Derivative 节点和组级 Build Root；
8. 任一步失败，事务整体回滚，不产生可达的半发布 Atlas。

## 血缘与保护根

RGBA Page 使用 `dicing-atlas/raw-rgba-page-v1` recipe，父节点为组内全部编码 Source Blob。Manifest 使用 `dicing-atlas/manifest-v1` recipe，父节点同时包含 Source 与 Page Blob。两者共享由算法、Cell、Padding 与页面上限生成的 recipe digest。

组级根为 `build:dicing:<groupId>`，同时保护 Manifest 与全部 Page。相同组重新发布会原子替换该 Build Root；旧派生物失去其他可达引用后才能进入既有隔离与可恢复 GC 流程。Current Root 始终继续保护 Original，发布逻辑不修改 Asset Index，也不覆盖源 Blob。

## 幂等与失败关闭

- 相同源、参数和确定性输出重复发布时复用内容寻址 Blob，不增加生命周期 revision；
- 分析后任一 Asset ID 被删除、替换或源摘要变化时返回 `STALE_INDEX_REVISION`；
- `planDigest` 错配、Worker 替换 Asset ID、Manifest/Page 畸形、现有同摘要 Blob 损坏或 writer lease 丢失时拒绝发布；
- 多页输出中任何一个 Blob 写入失败，Manifest、Page、血缘和 Build Root 均不能部分提交；
- 运行时仍遵循 S0.24：派生物不可用时读取当前 Original。

## UI

资源保险库在通过收益门的严格组中显示“发布可重建 Atlas”。发布期间组按钮锁定并显示事务状态；成功后生命周期的派生文件与保护根立即更新，并区分“新建内容寻址 Blob”和“相同 recipe 精确复用”。

## 测试

核心与集成反例覆盖：

- Atlas Page、Manifest、血缘节点和 Build Root 同事务发布；
- 相同发布幂等复用且生命周期 revision 不增长；
- 源摘要在分析后变化时拒绝并确认输出 Blob 不存在；
- Worker Atlas 的稳定 Asset ID 与分析 Plan 摘要替换攻击；
- UI 仅对 `adopt` 组开放发布入口。

常规 Vitest 门禁显式限制为最多 4 个 Worker，避免 Windows 开发机或共享 CI 在多项目构建期间过度订阅 CPU/内存而产生随机 5 秒墙钟超时。单测超时、断言和独立性能预算均未放宽。

阶段收口证据：

- TypeScript 项目引用检查通过；生产构建通过；架构审计通过（29 个可移植文件、3 个 Node 适配器文件）；
- 全量 Vitest 在单 Worker 降噪复核中通过：35 个测试文件、231 项测试；常规脚本仍保持最多 4 Worker；
- 脚本性能门禁通过：10,000 句基线总耗时 339.08 ms，预算 12,000 ms；
- 资源性能门禁在既定预算下独立复核通过：Dicing 分组与逐字节重建 2,031.29 ms（预算 3,000 ms），Atlas 排布/Extrusion/逐字节重建 2,892.35 ms（预算 3,000 ms），总计 4,923.64 ms（预算 5,000 ms）；未放宽任何性能预算；
- 真实浏览器在 1280 × 720 桌面视口确认 S0.25 文案和控制可见，默认舞台实测 334 × 187.9（1.778，16:9），切换 9:16 实测 240 × 426.7（0.563），恢复后仍为 16:9；控制台无 warning/error。

发布前完整 `npm run check` 已验证类型检查、231 项测试、生产构建、架构审计和脚本性能；同一次运行的最终 Atlas 基准受到本机并行 Rust 构建将 CPU 持续占满的影响而超时。负载持续期间的一次复跑也在四项互不相关的固定 5 秒测试上超时，均无逻辑断言失败；随后同代码的单 Worker 全量复核全部通过。因此性能证据采用紧邻完整门禁、同代码、同预算、独立进程的通过结果，并保留环境失败记录，不将共享机器噪声伪装成产品回归。

## 非声明范围

S0.25 尚未实现 PNG/WebP/KTX2 编码、真实磁盘与下载成本复决策、增量只重建受影响组、构建 Profile、Runtime Loader、GPU 上传、Draw Call/峰值内存测量、低内存卸载或 Web/Windows/Android 真机画面门禁。下一阶段应优先实现真实无损编码与“编码后无净收益则不发布”的二次决策，再进入播放器加载。
