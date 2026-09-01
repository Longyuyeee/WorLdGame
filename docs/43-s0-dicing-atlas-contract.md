# S0.24 Dicing Atlas 与安全回退契约审计

## 问题与需求对齐

S0.23 已能自动发现严格相似组并淘汰无代理收益候选，但仍没有定义唯一块如何进入 Atlas、Manifest 如何绑定页面、采样边缘如何避免接缝，以及派生文件损坏时运行时必须怎样回退。若这些规则在发布派生 Blob 后再补，会同时威胁确定性构建、画面正确性和源素材可恢复性。

S0.24 冻结可移植 `lossless-rgba-atlas/v1` 契约：从源 RGBA 重新建立可信 Dicing Plan，生成确定性多页 Atlas 和 Manifest，逐字节重建全部图片，并提供失败关闭的 Original 运行时解析入口。本阶段不编码 PNG/WebP/KTX2，不发布派生 Blob，也不把 RGBA 页面大小描述为最终包体。

## 确定性排布

- 唯一块按高度降序、宽度降序、摘要升序排列；
- 使用确定性的 first-fit shelf 排布，页面 ID 固定为 `atlas-000`、`atlas-001`……；
- 默认 Cell 为 64px、Padding 为 2px、页面上限为 2048px、最多 16 页；输入顺序不改变 Manifest 或页面摘要；
- 单块连同 Padding 超过页面、或确定性排布超过页数预算时失败关闭，不静默缩放、裁切或改用有损策略。

这里的 shelf 是可验证基线，不宣称已经得到最优装箱率。后续真实编码成本不足时，可以在保持 Manifest 语义与确定性的前提下升级 recipe 版本。

## Padding 与 Extrusion

每个块四周保留至少 1px、默认 2px Padding。Padding 内容不是透明空白，而是把最邻近的边缘像素向外复制，角落复制对应角像素。块的 Manifest 坐标指向内区，重建只读取内区；外扩像素专供线性采样、缩放和后续 Mip 流程减少色彩渗漏。

解析器验证包含 Padding 的矩形完整落在页面内，并拒绝任意两个块的 Extrusion 区域重叠。缩放、旋转、滤镜和 Mip 的真实渲染截图仍属于后续 Web/Windows/Android Runtime 门禁，本阶段不能仅凭 RGBA 单测宣称“三端无接缝”。

## Manifest 与页面完整性

Manifest 记录源 Plan 摘要、Cell、Padding、最大页面、页面尺寸与 RGBA 摘要、块到页面的内区坐标，以及每张稳定 Asset ID 图片的源摘要和块放置。规范摘要覆盖所有这些字段。

解析器失败关闭并拒绝：

- 未知 schema/算法、非规范 SHA-256、越界参数；
- 页面 ID 缺号或乱序、重复页面/块/Asset ID；
- 块摘要或 Asset ID 非规范排序；
- 块越界、Padding 越界、Extrusion 重叠、图片放置越界或引用缺失块；
- Manifest 规范摘要不匹配；
- 页面缺失、多余、尺寸不符、RGBA 长度不符或像素摘要不符。

## 逐字节重建与回退

构建阶段必须从生成的页面重建每张图片，并与原始 RGBA 逐字节一致；重建结果还必须匹配 Manifest 中绑定的源摘要。

运行时解析遵守 Source of Truth：

1. Manifest/Page 全部有效且稳定 Asset ID、尺寸、当前源摘要一致时，返回 Atlas 重建结果；
2. 当前源与 Atlas 绑定版本不同，返回当前 Original，原因为 `source-mismatch`；
3. Manifest 畸形、页面缺失/篡改、重建摘要错误或 Atlas 不存在，返回当前 Original，原因为 `atlas-unavailable`；
4. 回退返回调用方提供的原始 `Uint8Array`，不修改、不重新编码源素材。

该入口是运行时行为契约，不代表播放器加载器、GPU 纹理上传或平台 Capability Matrix 已实现。

## 测试与性能门禁

Golden 与反例覆盖多页重建、输入乱序确定性、透明/部分块、完整 Padding 边缘扩展、规范 Manifest 往返、篡改 Manifest、缺页、页面像素篡改、畸形运行时对象、旧源 Atlas 和页数预算失败。

性能门禁在 8 张 512×512 RGBA 差分图上分别约束自动分组与重建、Atlas 排布/Extrusion/重建和两者总耗时。

## 非声明范围

S0.24 尚未实现 Atlas PNG/WebP/KTX2 编码、真实磁盘/下载收益、派生 Blob 原子发布、生命周期根切换、增量重建、GPU 上传、Draw Call/峰值内存测量、低内存卸载、平台 Capability Matrix 或 Runtime 视觉截图。下一阶段必须把经过验证的 Manifest/Page 作为确定性派生 recipe 接入现有原子发布与血缘系统，同时继续保留 Original。

## 审计证据

- `npm run check` 通过：35 个测试文件、226 项测试全部通过；生产构建、29 个可移植文件的架构约束、脚本性能与资源性能门禁均为 PASS；
- 8 张 512×512 RGBA 差分图的严格分组与重建为 1067.91 ms，Atlas 排布、Extrusion 与逐字节重建为 1400.99 ms，总计 2468.90 ms，低于各 3000 ms 与总计 5000 ms 预算；
- 性能样本生成 1 个 Atlas 页面、验证 441 个重复放置，RGBA/Manifest 前置代理净节省为 85.83%；
- 浏览器实机确认 S0.24 Atlas 契约与“不发布派生 Atlas”边界可见，无安全候选时按钮禁用；
- 浏览器实机确认即时预览默认仍为 16:9 / 1920×1080，并保留 16:10、4:3、21:9、9:16 与自定义尺寸。
