# S0.21 备份一致恢复与隔离缩略图审计

## 本阶段需求对齐

S0.21 只推进两个已冻结的基础能力：关联备份必须一致恢复剧情与 Asset Index，并能在浏览器崩溃后续作；首个图片缩略图派生必须在独立 Worker 内完成解码、缩放与编码，禁止回落主线程。早期未携带 Asset Index 快照的备份仍可用，但只能明确执行“仅剧情恢复”。

## 一致恢复协议

关联恢复使用持久 `AssetBackupRestoreIntent`。准备事务会校验目标快照、当前 Asset Index、Lifecycle 与目标源 Blob，然后持久化目标完整索引、前后 revision、校验摘要及带过期时间的恢复保护根。随后项目存储把备份写成新的 revision；只有项目写入成功，第二个事务才切换 Asset Index 与 current/history 根并删除意图。

启动时必须先解析恢复意图，再向 React 暴露会话：

- 当前 revision 等于 `restoredProjectRevision`：完成 Asset Index 切换；
- 当前 revision 仍等于 `headBeforeRevision`：项目恢复未提交，撤销意图并保持当前索引；
- revision 落在其他值：按冲突失败关闭，不猜测、不覆盖；
- 目标源 Blob 缺失、摘要不符或 Lifecycle 审计失败：不提交资源索引。

`asset-backups` 中的保留意图键不会再被快照对账器当作普通备份解析。意图内保存目标完整索引，因此即使轮换备份在项目恢复时覆盖同一槽位，也不会失去恢复目标。

## 隔离 Worker 缩略图

当前 recipe 为 `thumbnail/web-canvas-png-v1/320`：仅接收已通过导入检查的 PNG、JPEG 与 WebP；在 Dedicated Worker 中用 `createImageBitmap` 解码、以 contain 规则缩至最长边 320 px，并通过 `OffscreenCanvas` 输出 PNG。源文件 256 MiB、1 亿像素、输出 4 MiB 是硬上限；客户端另有 12 秒期限与取消终止。

若 Worker、`createImageBitmap`、`OffscreenCanvas` 或 2D 上下文不可用，返回 `DERIVATIVE_UNAVAILABLE`。实现没有主线程解码/Canvas 回退。发布事务会再次核对稳定 Asset ID 的源摘要、源 Blob、PNG 签名与输出尺寸，再原子写入内容寻址 Blob、Derivative 节点及 Build 根；相同输出幂等复用。

Web Canvas PNG 编码字节不承诺跨浏览器/跨系统完全确定。recipe 摘要固定处理参数与执行边界，实际输出仍以自身 SHA-256 寻址；严格跨平台确定性仍由 `metadata-sidecar/v1` 示例承担。

## 审计门槛

- 类型、全部单元/集成测试、生产构建和架构审计全部通过；
- 脚本与资源性能门槛无回退；
- 真实浏览器验证默认 16:9、关联/旧备份文案、缩略图 Worker 成功或明确失败、刷新后状态；
- 审计证据写入仓库并随实现同一提交推送。

## 非声明范围

本阶段不是完整图像优化流水线，也没有实现 CG 相同区域切片、纹理图集、格式质量策略、批量调度、Windows/Android 打包或跨平台像素一致渲染。这些仍需后续独立规格、基准样本与发布审计。

## 本次审计证据

- `npm run check`：32 个测试文件、206 项测试全部通过；生产构建成功；架构审计 PASS；脚本与资源性能审计均在预算内。
- 生产包独立产出 `thumbnail.worker` chunk，证明缩略图实现未合并进主线程入口。
- 真实浏览器默认预览为 `16:9 · 标准横屏`、`1920 × 1080`。
- 真实浏览器同时显示关联备份“剧情 + 资源索引 · 崩溃可续 / 一致恢复为新版本”和旧备份“仅剧情”。
- 在真实持久项目中把关联备份 s6 一致恢复为新 revision s8；页面刷新并重新取得 writer lease 后，剧情、Asset Index r2、默认 16:9 与 s8 状态均保持一致。
- 未检查的历史媒体在真实浏览器中保持“生成缩略图”禁用；通过媒体检查后的启用条件、Worker 成功/取消/不可用分支及原子发布由集成与边界测试覆盖。
