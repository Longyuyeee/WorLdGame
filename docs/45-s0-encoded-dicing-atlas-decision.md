# S0.26 Dicing Atlas 无损 PNG 与编码后复决策审计

## 需求与阶段边界

S0.25 已能把原始 RGBA Atlas Page、Manifest、血缘和 Build Root 原子发布，但 RGBA 体积不是玩家实际下载或安装的体积，不能作为最终收益依据。S0.26 增加 Web Worker 无损 PNG 交付层，以真实编码字节执行第二次决策。

本阶段只验证 Web 兼容 PNG 路径，不宣称 KTX2/Basis、ASTC/ETC2/BCn、Windows/Android 原生纹理、Runtime Loader、GPU 上传或真机性能已经完成。

## 冻结契约

1. 严格分组的 RGBA 代理报告只负责筛出候选，不再直接授权发布；
2. Worker 生成 S0.24 布局后，将每个 Atlas Page 编码为 `image/png`；
3. PNG 必须在 Worker 内再次解码，尺寸一致且每个 RGBA 字节与编码前 Page 相同；任意差异失败关闭；
4. Delivery Manifest 同时绑定布局 Manifest、`sourcePlanDigest`、编码器身份、Page 尺寸、RGBA 摘要、PNG 内容摘要和实际字节数；
5. 客户端复验 Delivery Manifest、PNG 签名/摘要/长度、稳定 Asset ID、Plan 摘要和 RGBA 重建；
6. 源成本按唯一内容摘要 Blob 计数，不因多个 Asset ID 复用同一 Blob 而重复累加；
7. `publicationBytes = PNG Page 实际字节总和 + 规范 Delivery Manifest 实际 UTF-8 字节`；
8. 只有 `sourceEncodedBytes - publicationBytes > 0` 才允许进入发布事务；等于零也保持 Original；
9. 仓储事务重新读取并校验当前唯一源 Blob，再独立复算收益，防止 Worker 或旧报告虚报；
10. PNG Pages、Delivery Manifest、血缘节点和 Build Root 仍在同一 writer-fenced IndexedDB 事务提交；失败显式中止事务。

## Recipe 与血缘

Delivery recipe 为 `dicing-atlas/web-png-delivery-v1`，绑定：

- `lossless-dicing-png-delivery/v1`；
- `web-offscreen-canvas-png/v1` 编码器身份；
- 布局算法、Cell、Padding 和最大 Atlas 尺寸。

Page 节点使用 `image/png` 与 `dicing-atlas/web-png-page-v1`；Manifest 节点使用 `application/vnd.world-studio.dicing-delivery+json` 与 `dicing-atlas/png-delivery-manifest-v1`。Original 继续由 Current Root 保护，发布不修改 Asset Index，也不覆盖源 Blob。

## UI 与失败语义

资源保险库把入口改为“编码并复决策发布”。运行期间显示“正在编码复决策”；若实际字节无净收益，界面明确列出源字节与交付字节，保持 Original 且不进入事务。成功时显示无损 PNG Page 数量、实际净节省字节和 Original 保护状态。

## 测试与审计

自动化覆盖：

- Delivery Manifest 规范往返、摘要与 encoder recipe；
- 正收益、零收益和负收益边界；
- 编码 Page 摘要/长度替换、Plan/Asset ID 替换与 RGBA 重建；
- 唯一源 Blob 成本口径；
- PNG Page、Manifest、血缘和 Build Root 幂等原子发布；
- 实际编码无收益时 Manifest/Page 均不存在；
- 源变化和失败路径整体回滚。

阶段收口证据：

- `npm run check` 单次完整通过：TypeScript、36 个测试文件/236 项测试、生产构建、架构与全部性能门禁；
- 架构审计通过：30 个可移植文件、3 个 Node 适配器文件；新增 Delivery 契约没有引入 DOM、文件系统、进程或运行时第三方依赖；
- 脚本性能通过：10,000 句基线总耗时 420.72 ms，预算 12,000 ms；
- 资源性能通过：媒体/哈希/索引总计 772.76 ms（预算 10,000 ms），生命周期两项分别 114.88/95.04 ms（各预算 2,000 ms），Dicing 分组 1,792.13 ms、Atlas 排布/Extrusion/重建 2,243.89 ms、合计 4,036.02 ms（预算分别 3,000/3,000/5,000 ms）；
- 真实浏览器桌面视口确认 S0.26 状态、复决策说明和禁用态可见，默认舞台 334 × 187.9、比例 1.778（16:9）；
- 真实端到端素材由两张约 219.5 KiB、15/16 Tile 相同的 256 × 256 PNG 构成：Worker 发现 1 个严格相似组，将其编码为 1 个无损 PNG Atlas Page，原子创建 Page＋Manifest 两个派生 Blob，实际净节省 307,570 B，Original 保持受保护；
- 同一浏览器立即重发按相同 PNG recipe 精确复用，未创建重复 Blob；最终加入 `colorSpaceConversion: none` 与 `premultiplyAlpha: none` 后又使用持久化素材复跑真实 Worker，并再次精确复用；页面控制台无 warning/error；临时素材、标签页和开发服务均已清理。

## 后续边界

S0.27 应进入可失败关闭的 Runtime Loader：读取并校验 Delivery Manifest/PNG Blob，在受控解码预算内重建目标图片，并在派生物缺失、损坏、版本不兼容或内存预算不足时读取当前 Original。平台纹理与真机 GPU 指标应在该基础上分阶段验证，不能由本阶段 PNG 结果代替。
