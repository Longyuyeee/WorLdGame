# S0.18 不可信媒体 Inspection Gate 审计

> 状态：需求、威胁模型、实现、故障测试、干净安装、性能、真实浏览器与远端证据回读均通过
> 日期：2026-08-11
> 范围：Web 导入事务之前的媒体结构检查；不冒充完整解码器、杀毒引擎、媒体转码、Android 后台导入或 Dicing 已完成

## 1. 需求对齐

S0.17 能原子导入真实文件，但浏览器提供的 `File.type` 只是声明，不能证明文件内容。若直接信任扩展名/MIME，错误格式、伪装文件、图片解码炸弹、危险 SVG、畸形媒体时长和越界字体目录可能进入内容寻址资源库，并在以后预览、打包或运行时触发问题。

S0.18 必须保证：

- 检查发生在 SHA-256 Blob 与 Asset Index 写事务之前；
- 真实签名、声明 MIME 和编辑器 Asset Kind 三者必须一致；
- 元数据解析只做有界字节读取，不调用活动 DOM，也不执行媒体内容；
- 图片宽高/像素、音视频时长、SVG 字节/元素和字体表数量受固定预算约束；
- 未知、矛盾、畸形或超预算内容默认拒绝，Index revision 与 Blob Store 保持不变；
- 检查通过报告随资源索引保存；旧资源明确显示“未检查”，不能自动冒充通过；
- 生产浏览器优先在独立 Worker 执行，取消会终止 Worker，字节所有权通过 transferable 交接；
- Worker 不可用的测试/兼容环境使用同一纯函数核心，检查规则不能出现两套实现。

## 2. 威胁模型

| 威胁 | 本轮防线 |
|---|---|
| `.png` 文件实际是脚本、压缩包或其他媒体 | 魔数/容器签名与声明 MIME 一致性检查 |
| 极小文件声明超大画布 | 宽、高、总像素预算，在任何预览解码前拒绝 |
| SVG 脚本、事件处理器、外链、外部 CSS、DOCTYPE/ENTITY | 静态拒绝并将所有通过的 SVG 标记为 `svg-quarantine` |
| WAV/FLAC/Ogg/MP3/MP4 伪造长度或持续时间 | 有界 chunk/page/frame/box 遍历与时长预算 |
| 字体表目录越界或表数量膨胀 | SFNT/WOFF 目录边界和最大表数量检查；WOFF2 头/负载预算 |
| 主线程处理大文件导致明显卡顿 | 模块 Worker + transferable ArrayBuffer；16 MiB 最坏线性样本性能门 |
| 取消后仍写入资源 | Abort 终止检查；既有原子导入事务继续承担最终回滚 |
| 旧资源被误标为安全 | 没有 schema 1 inspection report 的条目显示 `LEGACY · 未检查` |

非目标：检测恶意软件、验证每个编码数据块的像素/音频语义、替代成熟解码器漏洞修复、保证来源版权或判断内容是否适合发布。

## 3. 冻结支持矩阵

S0.18 只接受能够在当前纯函数检查器中确定结构与预算的格式：

| 类别 | 接受格式 | 必检元数据 |
|---|---|---|
| 图片 | PNG、JPEG、GIF、WebP | 签名、边界内帧头、宽、高、像素数 |
| 隔离矢量 | SVG UTF-8 | 根节点闭合、画布、元素数、活动内容/外链/CSS/控制字符 |
| 音频 | WAV、FLAC、Ogg Opus、Ogg Vorbis、MPEG-1 Layer III MP3 | 容器/帧边界、采样率、声道、时长 |
| 视频 | ISO BMFF MP4 | `ftyp`、有界 box、`moov/mvhd` timescale 与时长 |
| 字体 | TrueType、OpenType、WOFF、WOFF2 | 签名、总长度、表数量、可验证目录边界 |

AVIF、HEIF、WebM、AAC/ADTS、M4A-only、动画解码一致性和未知二进制在本切片默认拒绝。增加格式必须新增解析器、畸形样本、预算测试和真实浏览器证据，不能只扩展文件选择器的 `accept` 字符串。

## 4. 固定预算

| 预算 | S0.18 值 |
|---|---:|
| Web 单文件读取 | 64 MiB |
| 图片单边 | 16,384 px |
| 图片总像素 | 67,108,864 px（64 MiPixel） |
| 音频时长 | 4 小时 |
| 视频时长 | 8 小时 |
| SVG UTF-8 源文件 | 4 MiB |
| SVG 元素 | 100,000 |
| 字体表数量 | 128 |

这些是导入安全上限，不是推荐制作规格。后续 Source/Derivative 管线会有更严格的目标平台预算，例如纹理尺寸、音频码率、视频 profile 和 Android 内存峰值。

## 5. 检查与提交顺序

1. FileReader 检查 64 MiB 上限并读取准确字节；
2. 将 ArrayBuffer transfer 到媒体检查 Worker；
3. Worker 识别真实格式并有界解析元数据；
4. 核对声明 MIME、真实格式与 Asset Kind；
5. 核对像素/时长/SVG/字体预算；
6. Worker 将原 ArrayBuffer 与不可变检查报告 transfer 回 UI；
7. UI 将报告写入 `preservedFields.inspection`，使用检测 MIME 而不是浏览器声明；
8. 既有 repository 计算 SHA-256，并在 writer-fenced IndexedDB 事务中发布 Blob + Index；
9. transaction complete 后才显示成功。

检查失败发生在第 3–5 步，repository 尚未收到导入请求，因此不会创建孤儿 Blob，也不会推进 Asset Index revision。

## 6. SVG 隔离语义

通过静态规则不等于可以把 SVG 注入编辑器 DOM。S0.18 的规则是：

- 拒绝 `script`、事件属性、`foreignObject`、iframe/object/embed、DOCTYPE/ENTITY；
- 拒绝 `<style>`、`style=`、控制字符和非本地 fragment 的 href/xlink:href；
- 拒绝外部 URL 与活动协议；
- 必须有有限的 width/height 或 viewBox；
- 通过后仍记录 `isolation=svg-quarantine`；
- 当前 UI 只显示元数据，不生成 SVG 预览；
- 未来需要预览时只能使用隔离文档或经过独立 rasterization 的 derivative，不能 `innerHTML`。

## 7. Worker 与取消边界

生产路径由 `media-inspection.worker.ts` 承载：

- 输入只包含 request id、ArrayBuffer、声明 MIME 和 Asset Kind；
- ArrayBuffer 以 transferable 方式交接，避免在主线程额外复制完整媒体；
- 成功时返回相同 ArrayBuffer 和结构化报告；
- 已知错误序列化后在客户端重建为 `AssetBlobError`；
- AbortSignal 会 terminate Worker 并返回 `CANCELLED`；
- worker 启动失败、崩溃、传输或非法响应归一化为 `INSPECTION_UNAVAILABLE`，不得继续导入；
- 没有 Worker 的单元测试环境调用同一个 `inspectUntrustedMedia`，只作为兼容路径。

当前 FileReader 本身仍在主线程组装完整 ArrayBuffer；流式读取、分块哈希、Worker 池和 Android 后台恢复不在 S0.18 内。

## 8. 错误语义

| 错误码 | 含义 | 可恢复动作 |
|---|---|---|
| `UNSAFE_MEDIA` | 已识别格式但结构损坏或包含危险内容 | 修复/重新导出源文件 |
| `UNSUPPORTED_MEDIA_TYPE` | 签名未知或格式尚未进入冻结矩阵 | 转换为支持格式 |
| `MIME_MISMATCH` | 声明 MIME、真实格式或 Asset Kind 矛盾 | 选择正确文件/类型，不允许强行忽略 |
| `RESOURCE_LIMIT` | 文件、像素、时长、SVG 或字体预算超限 | 优化源文件后重试 |
| `CANCELLED` | 用户取消读取、检查或事务 | 保持旧 Blob/Index，允许重试 |
| `INSPECTION_UNAVAILABLE` | Worker 启动、崩溃、传输或响应边界失败 | 阻断导入并要求刷新/检查浏览器策略 |
| `IO_FAILURE` | 文件读取或存储边界失败 | 阻断本次导入并保留错误证据 |

前三类检查错误只让资源库回到 ready，可立即选择其他文件；writer lease、存储损坏和不可用仍由全局阻断逻辑处理。

## 9. UI 可审计表达

- 资源保险库卡显示 `S0.18 INSPECTION GATE`、签名验证、预算闸门与 SHA-256 去重；
- 导入进度新增 `inspecting` 阶段，区别读取、检查与原子提交；
- 成功详情明确“媒体检查通过”；
- 新资源显示 `PASS · FORMAT`，图片显示检测尺寸，SVG额外显示“隔离”；
- S0.17 遗留资源显示 `LEGACY · 未检查`；
- 错误标题区分结构不安全、格式不支持、MIME 冲突和预算超限；
- 不显示未验证的缩略图、时长波形、色彩空间或解码成功声明。

## 10. 自动化验收

专项测试必须覆盖：

- PNG/JPEG/GIF/WebP 尺寸识别与像素炸弹拒绝；
- 安全 SVG 隔离标记以及脚本、外链和活动内容拒绝；
- WAV/FLAC/Ogg/MP3/MP4 时长解析与预算；
- SFNT/WOFF/WOFF2 合法目录和越界/表数量拒绝；
- MIME confusion、Kind confusion、空/截断/未知文件默认拒绝；
- Worker 不可用 fallback 与预取消；
- React 真实 File 通过后原子导入、精确去重和 inspection report 展示；
- React MIME confusion 后保持 Index r0、0 Blob/0 entry；
- S0.17 IndexedDB 原子性、writer lease、reload 和 64 MiB 文件门全部回归。

## 11. 性能门

资源性能门扩展为：

- 约 16 MiB、40k MPEG-1 Layer III frame 的线性结构/时长检查；
- 16 MiB SHA-256；
- 2,000 条 Asset Index 严格序列化往返；
- 检查预算 3,000 ms，SHA-256 5,000 ms，Index 2,000 ms，总预算 10,000 ms。

性能门使用 Node 纯函数核心，真实浏览器还必须确认 Worker 被构建、UI 不冻结、取消可用和 console 0 error。

## 12. 明确未完成

- 完整 PNG CRC、JPEG entropy、WebP bitstream、音视频 codec decode 与字体 glyph 验证；
- AVIF/HEIF/WebM/AAC/M4A 和平台特有格式；
- Worker 流式读取、增量 SHA-256、低内存 Android 导入与 kill 恢复；
- Source/Derivative 谱系、转码、缩略图、波形、色彩空间和音量分析；
- 资源历史可达性、保留期、可恢复 GC、备份/导出联动；
- 相似图像候选、Lossless Dicing、Delta/Atlas 与逐像素重建证明；
- Runtime Loader 和 Web/Windows/Android 发布包资源验证。

因此 S0.18 只能声明“导入前的有限格式结构与预算闸门”，不能声明所有媒体安全、资源管线完成或自动切图压缩完成。

## 13. 下一步

S0.19 建议实现 Source/Derivative 谱系与可恢复资源生命周期：原始资源、检查报告、派生资源和构建目标之间使用不可变引用；冻结历史可达性、保留期、备份联动和两阶段 GC。完成后才能安全地接入缩略图/波形与相似图像候选，随后进入 Lossless Dicing。

## 14. 本地与远端证据

2026-08-11 本地最终门禁：

- `npm ci`：终止占用 Rolldown 原生模块的本项目 Vite 进程后，按锁文件干净安装 128 个包；
- TypeScript strict：通过；
- 常规测试：28 个测试文件、179/179 通过；
- 五工作区构建：通过；独立 Worker 14.24 kB，Editor JS 326.58 kB / gzip 100.67 kB，CSS 37.51 kB / gzip 7.89 kB；
- 架构审计：23 个 portable 文件与 3 个 Node adapter 文件通过；检查核心没有 DOM、Node、文件系统或第三方运行时依赖；
- 10k 剧情性能：parse 49.22 ms、projection 1.63 ms、末句 patch 95.56 ms、总计 146.41 ms / 12,000 ms；
- 资源性能：16,777,161 B MP3 线性检查 10.51 ms、16 MiB SHA-256 484.53 ms、2,000 条 Index 往返 23.21 ms、总计 518.25 ms / 10,000 ms；
- 官方 `registry.npmjs.org`：0 vulnerabilities；
- `git diff --check`：通过。

真实浏览器证据：

- 干净 origin 启动为 S0.18、0 项资源、Index r0，默认 Preview 为 `landscape-16-9`；
- 导入 118 B 安全 SVG：真实 Worker 检查路径完成，写入 `codex_s018_safe`，显示 `PASS · SVG · 1280×720 · 隔离`，Index 到 r1；
- 将 SVG 内容伪装为 `.png`/`image/png`：显示 `MIME_MISMATCH`，保持 1 项资源、Index r1，未产生第二条目；
- 首次 reload 回归审计发现 Navigation Timing 分类不稳定导致旧租约等待 TTL；修复为 pagehide 一次性 30 秒 handoff 票据，重新测试后刷新无等待恢复 1 项资源、Index r1 与检查报告；
- 复制/普通导航没有 handoff 票据，仍轮换 owner；票据一次消费、过期与 owner 不匹配均有专项测试，未放宽单写者 fencing；
- 1280×720：body/document 1280，无横向溢出；资源对话框 898/898 client/scroll width、490/490 client/scroll height；
- 当前干净开发服务器 console 0 error。旧 5173 热更新缓存错误在终止旧 Vite、干净安装后消除，不计入最终服务器结果；
- 本轮没有改变 S0.17 已通过的 393×852 响应式 CSS；新增检查文本位于已有 ellipsis/flex-wrap 容器。当前浏览器表面不提供视口仿真，因此没有伪造新的 393×852 几何测量。

本地测试文件已删除。独立 5174 测试 origin 保留一条 118 B S0.18 检查资源用于刷新恢复证据；常用 5173 origin 的两个 S0.17 条目不会被迁移冒充通过，而会显示 `LEGACY · 未检查`。

- 实现提交：`497ef276e9474463f889a24086cad07725f3903b`（`Add untrusted media inspection gate`）；
- 分支：`agent/visual-production-bar` 已推送到 `origin`；
- Draft PR：[#1 Add untrusted media inspection and atomic asset safety](https://github.com/Longyuyeee/WorLdGame/pull/1)；
- GitHub REST 回读：PR `open`、`draft=true`、head 精确等于实现提交；正文包含 S0.18、179/179、全局 M1 阻断项与 S0.19；
- 最终证据提交将在本节回填后再次推送，并执行 local/origin/PR 三方 SHA 回读。
