# S0.22 无损 Dicing 候选分析审计

## 需求对齐与阶段边界

用户要求自动识别大量 CG/立绘中相同区域并切图压缩，同时减少容量、提高速度与稳定性。S0.22 先验证最危险的前置假设：能否在不修改源素材的前提下，隔离解码多张图片、精确识别重复块、逐字节重建，并在预计无收益时自动选择 Original。

本阶段只生成候选报告，不生成或发布 Atlas，不把 RGBA 代理成本描述为最终安装包体积，也不声明 Web/Windows/Android 平台纹理已经完成。

## 冻结契约

`lossless-rgba-dicing/v1` 接收 1–32 张具有稳定 Asset ID 的已检查 PNG/JPEG/WebP。Dedicated Worker 使用 `createImageBitmap` 与 `OffscreenCanvas` 解码和读取 RGBA；Worker、解码或读回能力缺失时返回 `DERIVATIVE_UNAVAILABLE`，禁止主线程回退。

可移植核心按默认 64×64 Cell 切块。块摘要包含实际宽高和完整 RGBA，避免边缘块与常规块发生语义碰撞。不同输入顺序按 Asset ID 归一化，因此相同候选组产生相同 `planDigest`。

只有 RGBA 每个字节均为零的块才能省略。Alpha 为零但隐藏 RGB 非零的块仍作为真实像素保存，以维持严格字节一致。每张图必须由计划重建并与解码后的源 RGBA 逐字节比较；任一差异都会让分析失败。

## 成本与自动回退

当前成本模型是 Atlas 前置代理：

- Original：所有解码 RGBA 字节；
- Diced：唯一非零块 RGBA + 每图 96 字节清单预算 + 每放置 48 字节清单预算；
- 默认要求存在精确重复块、净节省为正且节省比例至少 5%，才返回 `adopt`；
- 没有重复块返回 `no-repeat`；清单抵消收益返回 `insufficient-net-savings`；两者均保持 `original`。

该模型用于淘汰明显无收益候选，不能替代 PNG/WebP/AVIF/KTX2、Atlas Padding、GPU 内存、Draw Call、加载组和目标设备解码测量。后续 Atlas 阶段必须用真实产物成本重新决策。

## 安全与资源预算

- 编码输入总量上限 512 MiB；
- 解码组上限 1 亿像素；
- 默认最多 32 张图片，Cell Size 仅允许 8–512；
- 客户端 20 秒期限，取消或超时会终止 Worker；
- Worker 返回报告必须通过结构、数值、摘要和 `reconstructionVerified` 边界校验；
- 分析不写 Blob、不登记 Derivative、不修改 Asset Index 或源文件。

## 编辑器交互

资源保险库新增“跨图片重复块分析”。只统计通过媒体检查且格式受支持的候选；报告明确显示建议进入 Atlas 候选或保持 Original、图片数、Cell Size、重复/全零块、RGBA 代理成本、计划摘要及逐字节重建结果。进行中可取消。

## 非声明范围

S0.22 未实现候选自动分组、Atlas 排布与 Padding/Extrusion、Manifest 运行时重建、派生 Blob 发布、增量缓存、平台纹理、真实安装包收益、GPU/内存/Draw Call 评估或视觉 Inspector。这些必须继续按独立规格、Golden Dicing 样本和目标设备门禁推进。

## 本次审计证据

- `npm run check`：34 个测试文件、214 项测试通过；生产构建、架构审计、脚本与资源性能审计全部 PASS。
- 生产构建独立产出约 7.54 KiB 的 `dicing-analysis.worker` chunk，分析实现未合并进 UI 主线程入口。
- 8 张 512×512 RGBA 图片、64px Cell 的切块、哈希、成本计算和逐字节重建在最终全量审计中约 1,123 ms，预算为 3,000 ms；448 个重复放置，代理净节省约 87.2%。
- 单元测试覆盖跨图重复、全零块、隐藏 RGB、无收益回退、输入顺序确定性、畸形缓冲和像素预算。
- 客户端测试覆盖 Worker 不可用、取消终止和重建验证报告；UI 集成测试覆盖已检查图片的候选启用与 `adopt` 报告呈现。
- 真实浏览器确认 S0.22 资源保险库布局、阶段边界文案、历史未检查媒体候选数为 0 时的禁用门控，以及默认 16:9 / 1920×1080 预览保持不变。
