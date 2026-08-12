# CL-01 目标设备矩阵与预算冻结

> 决策日期：2026-08-12
> 状态：有条件通过——支持档位、系统范围和预算已冻结；实体低档 Windows、低档 Android、主流 Android 尚未登记，不能作为真机通过
> 风险：CL-01
> 决策类型：S0 证据契约，不是产品功能

## 1. 结论

M1 以 Windows 11 和 Android 11+ 为编辑器支持基线，以 Web、Windows、Android 为玩家发布目标。设备型号会停产，性能承诺不能依赖商品名，因此采用“稳定能力档位 + 每次取证记录实体设备指纹”的双层矩阵。

- **能力档位**冻结最低 CPU/GPU、内存、系统、显示和存储条件，是不可静默降低的产品门槛；
- **实体设备**是满足该档位的一台具体机器，必须在证据中记录型号、SoC/CPU/GPU、RAM、系统 Build、WebView/浏览器、存储余量和电源/温控状态；
- 替换实体设备不需要改变产品范围，但新设备不得强于档位上限到失去代表性；
- 模拟器、浏览器窄屏和高性能开发机只能预检，不能替代实体低档证据。

当前开发机约 40 GB RAM、Ryzen 7 5800H、RTX 3060，且没有可用 ADB/Android SDK。它登记为开发/构建环境，不属于任何最低性能通过设备。

## 2. 支持与测试范围

### 2.1 Windows

Windows 10 Home/Pro 已于 2025-10-14 结束常规支持，因此 M1 正式支持基线为受 Microsoft 支持的 Windows 11 x64 版本。Windows 10 22H2 只做尽力兼容，不阻断 Stable，也不得出现在“正式支持”宣传中。

| ID | 用途 | 冻结能力档位 | 系统 | 实体设备状态 |
|---|---|---|---|---|
| WIN-L | 编辑器与玩家最低档 | 4 核 x64 CPU；8 GB RAM；Intel UHD 620 等级集显；1366×768/60 Hz；至少 20 GB 可用 SSD | 受支持的 Windows 11 x64，发布时安装最新安全更新 | 待登记 |
| WIN-R | 主流回归/构建 | 6 核以上 x64 CPU；16 GB RAM；现代集显或入门独显；1920×1080/60 Hz；至少 50 GB 可用 SSD | 受支持的 Windows 11 x64 | 待登记；当前开发机只能补充高档结果 |

WIN-L 是性能门，不能使用独显加速后仍声称通过集显门。测试时记录 Windows 电源模式、缩放、显示器刷新率、GPU 驱动和是否远程桌面。

### 2.2 Android

| ID | 用途 | 冻结能力档位 | 系统矩阵 | 实体设备状态 |
|---|---|---|---|---|
| AND-L | 最低档完整编辑与玩家 | 64 位 ARM；8 核入门 SoC；4 GB 物理 RAM；720p–1080p/60 Hz；64 GB 存储且测试前至少 8 GB 可用 | Android 11 或 12；系统 WebView 固定版本 | 待登记 |
| AND-R | 主流完整编辑与玩家 | 64 位 ARM；主流中端 SoC；8 GB RAM；1080p/60–120 Hz；128 GB 存储且至少 16 GB 可用 | Android 15 或 16；系统 WebView 固定版本 | 待登记 |

`AND-L` 是 WorLd Studio 的产品低档，不等同于 Android `isLowRamDevice()`。运行时仍必须读取 `isLowRamDevice()`、`getMemoryClass()`、可用内存和热状态；若系统报告 low-RAM，自动进入更保守的 Low Memory Profile，但 M1 不承诺在低于 4 GB 物理 RAM 的设备上提供完整编辑体验。

Android 发布构建在 M1 冻结前重新核对 Google Play 政策。按 2026-08-31 已公布要求，新应用/更新需要 target Android 16 / API 36；本文件先冻结 `targetSdk >= 36`，`minSdk = 30`，不得用降低 targetSdk 规避权限、后台或存储行为变化。

### 2.3 Web 玩家

| ID | 用途 | 环境 | 门禁 |
|---|---|---|---|
| WEB-W | Windows 玩家主矩阵 | WIN-L；Chrome、Edge、Firefox 最新稳定版与前一主版本 | 功能、性能、离线/刷新恢复与无障碍 |
| WEB-A | Android 玩家主矩阵 | AND-L 与 AND-R；Chrome 与系统 WebView 固定版本 | 触控、安全区、音频解锁、内存、前后台 |
| WEB-S | 扩展兼容 | Safari 最新稳定版，玩家 only | M1 发布前必须有兼容结果；不扩张为 iOS 编辑承诺 |

浏览器发布时必须重新锁定准确版本；“latest”只是维护策略，不是可复现证据。每份报告写完整版本号和 User Agent。

## 3. 交互与帧时间预算

以下均在关闭开发工具、热缓存与冷缓存分开、设备温度稳定后测量。P95 至少基于 30 次任务或 2 分钟连续交互；少于样本数只能记探索结果。

| 指标 | WIN-L / AND-R | AND-L | 硬阻断 |
|---|---:|---:|---:|
| 输入到可见反馈 | P95 ≤ 100 ms | P95 ≤ 100 ms | 任一核心输入 P95 > 150 ms |
| 完整/简化动效帧时间 | P95 ≤ 16.7 ms（60 FPS） | 简化档 P95 ≤ 33.3 ms（30 FPS）；静止写作和直接操控仍优先 60 FPS | 任一帧 ≥ 700 ms；动画锁住输入/保存/撤销 |
| Script/Sequence/Stage 热更新 | P95 ≤ 500 ms | P95 ≤ 750 ms | > 1 s 且无渐进反馈 |
| 10 万字全局搜索首屏 | P95 ≤ 300 ms | P95 ≤ 500 ms | > 1 s 或阻塞输入 |
| 已预载场景切换 | P95 ≤ 300 ms | P95 ≤ 500 ms | > 1 s 且无解释 |
| 冷资源场景切换 | P95 ≤ 2 s | P95 ≤ 3 s | > 5 s、无进度或状态错误 |
| 冷启动到可编辑 | P95 ≤ 4 s | P95 ≤ 6 s | > 10 s 或恢复状态错误 |
| Web 玩家 LCP | P75 ≤ 2.5 s | P75 ≤ 2.5 s | P75 > 4 s |
| Web 玩家 INP | P75 ≤ 200 ms | P75 ≤ 200 ms | P75 > 500 ms |
| Web 玩家 CLS | P75 ≤ 0.1 | P75 ≤ 0.1 | P75 > 0.25 |

Android 官方以约 16 ms 作为 60 FPS 帧预算，并把 ≥700 ms 视为 frozen frame；Web 指标采用公开 Core Web Vitals 的 good/poor 阈值。产品内部的 100 ms 输入反馈门比 Web 的 200 ms INP 门更严格，两者都必须报告，不能互相替代。

AND-L 默认使用“简化动效 + Low Memory”预设，但所有信息、编辑能力和可中断性必须与完整动效等价。允许降低装饰性模糊、阴影、粒子、预载深度和代理分辨率，不允许降低文本清晰度、剧情确定性、保存安全或隐藏功能。

## 4. 内存预算

内存同时报告进程 PSS/Working Set、JS Heap（可取时）、原生/图形内存、GPU 估算和系统可用内存。单一 DevTools Heap 数字不能证明通过。

| 产物/设备 | 稳态软预算 | 瞬时硬预算 | 处理 |
|---|---:|---:|---|
| Android 编辑器 AND-L | 300 MB PSS | 450 MB PSS | 软预算触发清理/降级；硬预算阻断继续预载并判失败 |
| Android 玩家 AND-L | 220 MB PSS | 320 MB PSS | 保住当前场景与保存点，缩短回滚资源窗口 |
| Android 编辑器 AND-R | 450 MB PSS | 650 MB PSS | 同上 |
| Android 玩家 AND-R | 320 MB PSS | 480 MB PSS | 同上 |
| Windows 编辑器 WIN-L | 900 MB Working Set | 1.5 GB | 超软预算清理派生缓存；超硬预算判失败 |
| Windows 玩家 WIN-L | 450 MB Working Set | 750 MB | 同上 |
| Web 玩家 WEB-W/WEB-A | 以对应玩家总进程预算为门；另报 JS Heap | 不单独用 JS Heap 设伪精确硬门 | 浏览器进程模型差异必须写入报告 |

软预算按稳定操作 5 分钟后的 P95，硬预算包含切场景、解码上传和画廊切换瞬时峰值。2 小时 Soak 要求 0 崩溃、0 OOM、0 ANR/未响应；完成两轮相同操作后的稳态 PSS/Working Set 增长不得同时超过 10% 和 50 MB，否则视为持续增长并阻断。

## 5. Benchmark Episode 容量预算

这些数值约束 20–30 分钟校园 Benchmark，不是强迫所有商业项目使用同一容量。项目超出时必须显式选择 Custom Profile，并重新批准下载、安装、内存和画质预算。

| 产物 | Balanced 软预算 | 硬预算 | 说明 |
|---|---:|---:|---|
| Web 核心运行时（Brotli，不含作品资源） | 2 MB | 3 MB | 维持既有架构目标 |
| Web First Playable 传输 | 25 MB | 40 MB | 标题、首场景、当前语言最小字体与必要音频 |
| Web 完整单语言包 | 180 MB | 250 MB | 语音/高分辨率包允许后续加载 |
| Android 玩家基础 APK/AAB 下载 | 80 MB | 120 MB | 不含可选语音/高分辨率资产包 |
| Android 玩家安装后基础占用 | 180 MB | 280 MB | 另报缓存和可选包 |
| Windows 玩家下载 | 220 MB | 350 MB | 安装器/便携包分别报告 |
| Windows 玩家安装后占用 | 450 MB | 650 MB | 不含用户存档和可清理缓存 |
| Android 编辑器下载 | 120 MB | 180 MB | 不含 SDK、示例和用户工程 |
| Android 编辑器安装后占用 | 300 MB | 450 MB | 空工程冷启动基线 |
| Windows 编辑器下载 | 250 MB | 400 MB | Electron/Tauri Spike 用相同功能比较 |
| Windows 编辑器安装后占用 | 650 MB | 1 GB | 不含构建 SDK 与用户工程 |
| 单次增量补丁 | 完整对应包的 20% | 30% | 超出必须解释内容寻址/分包失效原因 |

硬预算不是“压到数字以下即可”。若更小的包导致内存、解码、画质或场景切换越过门槛，必须回退或拆包。

## 6. 设备取证协议

每台实体设备建立 `Device Record`：

```text
deviceId, owner, model, SoC/CPU, GPU, physicalRam,
osEdition, osBuild, browserOrWebView, display, refreshRate,
freeStorageBefore, powerMode, thermalState, driver,
acquiredAt, lastCalibratedAt, evidencePath
```

取证顺序：

1. 清洁启动并记录设备指纹、环境温度、电量/电源和剩余空间；
2. 运行 Tiny/State/Foundation，再运行 Benchmark Episode；
3. 分别记录冷启动、热路径、Full/Simplified/Reduced Motion；
4. 运行保存恢复、前后台、连续切场景和 2 小时 Soak；
5. 保存原始 trace、系统日志、采样命令、产物哈希与汇总，不只保存截图；
6. 结果绑定 Source Revision、构建工具链和工程快照哈希。

## 7. 当前证据与缺口

| Claim | 当前证据 | 判定 |
|---|---|---|
| 支持/测试档位已定义 | 本文件 | 通过 |
| 交互、帧时间、内存、容量门已定义 | 本文件 | 通过 |
| 当前开发机可代表最低 Windows | 40 GB RAM + RTX 3060 | 否 |
| Android 工具链和实体设备可取证 | 本机无可用 ADB/SDK；无 Device Record | 否 |
| WIN-L / AND-L / AND-R 已跑基线 | 无原始 trace | 否 |

所以 CL-01 只能标记“有条件通过”。转为“通过”必须登记至少 WIN-L、AND-L、AND-R 三台实体设备，并用当前原型或最小壳跑完冷启动、输入、内存和基础恢复基线；这不等于 CL-02、CL-03 或 CL-10 通过。

## 8. 来源与复评

- Android ActivityManager：使用 `isLowRamDevice()`、`getMemoryClass()` 和系统 MemoryInfo，而不是只按营销 RAM 分类；
- Android Slow Rendering：60 FPS 约 16 ms，≥700 ms 属于 frozen frame；
- Google Play Target API Policy：发布时按最新规则复核，当前 2026-08-31 节点为 API 36；
- Microsoft Lifecycle：Windows 10 Home/Pro 已于 2025-10-14 结束支持；
- Web Vitals：LCP/INP/CLS 采用 P75 阈值。

外部政策和浏览器/系统版本在每个 Release Candidate 重新核对；预算降低必须走产品变更审计，预算提高可以由性能 ADR 直接收紧。
