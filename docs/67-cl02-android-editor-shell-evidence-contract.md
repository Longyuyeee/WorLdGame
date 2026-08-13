# CL-02 Android 编辑壳可靠性证据契约

> 状态：证据契约已冻结，CL-02 尚未开始。本文只批准可抛弃的 Android 壳对照 Spike，不代表 Capacitor、自研 WebView 壳、Android 编辑器或任何存储方案已经进入 M1。

## 1. 要证明的 Claim

在同一份编辑器前端、同一份固定工程和同一组真机任务下，至少一个 Android 壳候选能够在 AND-L 与 AND-R 上同时证明：

- 中文/英文软键盘、硬件键盘、组合输入、选区、光标、剪贴板和撤销/重做不破坏 Canonical 内容；
- 工程保存、WAL、备份、导入/导出和单写者语义在 Activity 重建、后台、进程死亡、低内存和存储异常后可恢复；
- WebView 只通过版本化窄桥接访问原生能力，没有任意文件、Shell、Intent、网络或通用插件权限；
- 核心写作、资源导入、舞台编辑和预览在 CL-01 的输入、帧时间、PSS 与容量预算内；
- 发生撤权、DocumentProvider 离线、WebView 更新、系统杀进程或任务中断时有可解释、可重试且不静默丢失数据的路径。

浏览器响应式视口、桌面触摸模拟、Android Emulator、单元测试和厂商宣传均不能单独证明本 Claim。最终结论必须来自[CL-01](62-cl01-target-device-budget.md)登记的 AND-L 与 AND-R 实体设备。

## 2. 候选、版本与公平性

| 代号 | 候选 | 目的 | 当前环境观察 |
|---|---|---|---|
| C | Capacitor Android 壳 | 验证成熟 Web-first 容器与定制窄插件能否满足完整编辑 | 2026-08-13 查询到 `@capacitor/cli` / `@capacitor/android` 8.5.0；Spike 必须锁定实际版本 |
| N | 最小 Kotlin + AndroidX WebView 壳 | 作为权限、生命周期、桥接和容量的最小对照 | 只允许实现相同 `AndroidHostV0`，不得另写原生编辑 UI |

两边必须使用相同前端 Release 产物 commit、Android SDK 档位、ABI、WebView 版本、素材集、功能切片、测试账号状态和任务顺序。候选 C 不得用通用插件扩大能力，候选 N 不得以少实现功能获得虚假体积/内存优势。

Spike 继承 CL-01 冻结的 `minSdk = 30`、`targetSdk >= 36`；若正式取证时平台政策或候选最低要求变化，先更新 CL-01 和适用范围，不能私自降低 SDK 规避存储、后台或权限行为。

当前开发机只有 Java 17，没有 `ANDROID_HOME`、PATH 中的 ADB、Android 工程、Capacitor 依赖或已连接设备，因此本轮只能冻结契约，不能开始取证或宣布选型。

## 3. Android 数据所有权

### 3.1 权威工作区

- 权威可编辑工程存放在应用私有内部存储，由 Android `ProjectFileStore` 实现既有 WAL、校验、备份、迁移和恢复协议；
- Saved State 只保存轻量恢复令牌，例如 project ID、scene ID、视图、稳定 selection ID、滚动锚点和未完成任务 ID；不得把工程正文、媒体或完整 Undo 栈塞入 Bundle；
- 每次 Canonical 事务持续落 WAL，不能只依赖 `onPause`、`onStop` 或 `onDestroy`；系统杀进程时 `onDestroy` 不保证发生；
- 缓存、缩略图和派生资产必须可重建，绝不成为唯一源；清缓存不能删除工程正文或备份。

### 3.2 SAF 导入与导出

- 使用系统 Storage Access Framework 由用户明确选择文件/目录；不得请求 `MANAGE_EXTERNAL_STORAGE` 或宽外部存储权限；
- SAF 默认是工程包导入、快照导出和资源选择边界，不把任意 DocumentProvider 目录直接假定为具有本地文件系统的原子重命名、锁和持久可用性；
- 导入先复制到隔离区，完成大小/类型/Hash/安全检查和空间预检后才原子发布到私有工作区；
- 导出先生成完整、校验通过的快照，再写目标；中断或 provider 失败不能修改权威工程；
- 若取得 persistable URI grant，必须记录 provider/URI 能力并在重启后复验；撤权、移动、provider 离线或只读时显示稳定错误和重新授权入口；
- “直接编辑外部目录”只可作为独立扩展实验，除非其 WAL、锁、权限失效和 provider 故障全部过门，否则不进入 M1 基线。

## 4. 同功能垂直切片

两个 Spike 只能通过版本化 `AndroidHostV0` 提供：

1. 创建、列出、打开和删除应用私有工程（删除必须有可恢复或二次确认策略）；
2. 事务读取/写入、WAL、备份、恢复、空间预检和单写者租约；
3. SAF 工程包导入/导出与素材选择；
4. 生命周期、配置变化、内存压力、WebView 终止和系统返回事件；
5. 可取消的导入/Hash/检查/派生任务及其持久恢复令牌；
6. 设备能力快照：API、ABI、WebView、PSS 档位、可用空间、low-RAM 和热状态；
7. 脱敏诊断包导出，不包含工程正文、content URI、剪贴板、输入内容、签名凭据或用户路径。

前端不得直接调用 Capacitor 原始插件、任意 Kotlin 方法或通用文件 API。Domain、Compiler、Runtime、工程格式和 `project-persistence` 不得依赖 Capacitor、Android SDK 或 WebView。

## 5. WebView 与桥接安全红线

- 只加载随安装包签名并固定 Hash 的可信前端产物；不执行远程代码、不加载明文 HTTP、不允许任意导航、popup、新窗口或 iframe 获得原生能力；
- 显式关闭 WebView file/content access、`file://` 跨域访问和 universal file access；本地资源使用受控应用 origin/asset loader；
- 不使用传统 `addJavascriptInterface` 作为默认桥；使用有明确 allowed origin、消息 Schema、请求 ID、大小/频率限制和生命周期撤销的消息通道；
- 每个 Host 请求再次校验 origin、top-level frame/通道身份、参数 Schema、project lease、相对逻辑路径、资源上限和当前 Activity 状态；
- Release 禁止 WebView debugging；CSP 默认拒绝，禁止 `eval`、内联可执行内容和外部脚本；
- 默认不申请 `INTERNET`、宽存储、通讯录、位置、相机、麦克风或通知权限；本地 M1 功能若新增权限必须单独 Threat Model 和 ADR；
- Activity、Service、Receiver、Provider 默认 `exported=false`；必须导出的入口只接受显式受控 Intent，导入内容仍经过 Inspection Gate；
- 剪贴板只由明确用户操作触发，不后台读取；诊断日志不得记录脚本正文、输入法 composing text、URI 或剪贴板；
- 任意桥接越权、外部内容执行、路径/URI 混淆、未授权 Intent、工程泄露或 Release 调试入口开放，立即判失败，性能不能补偿。

## 6. IME、编辑与窗口矩阵

每台真机至少测试系统/OEM 或 AOSP 键盘与 Gboard（可用时）两类输入法，覆盖中文拼音与英文；另接一套硬件键盘。若目标市场常用 OEM IME 不同，加入设备记录而不是用模拟事件替代。

| ID | 操作 | 通过条件 |
|---|---|---|
| AI-01 | 连续中文组合、候选翻页、确认、取消 | composing 内容不进入 Canonical；确认只产生一个语义事务 |
| AI-02 | 英文联想、自动更正、撤回更正 | 文本、光标和单步 Undo 符合最终提交边界 |
| AI-03 | 光标移动、拖拽选区、长按、全选、替换 | UTF-16/Unicode 边界正确，无错位或重复文本 |
| AI-04 | emoji、代理对、组合附加符、CJK 标点与换行 | 不拆字符，不产生无效序列，保存重开一致 |
| AI-05 | backspace/delete surrounding、快速连删 | 无漏删/重删；Canonical 与可见文本一致 |
| AI-06 | 剪切/复制/粘贴、多行大段粘贴 | 只响应用户动作；超限有渐进反馈且可取消 |
| AI-07 | 软件键盘显示/隐藏、resize/pan、系统返回 | 当前字段、选区和关键工具不被遮挡；返回语义明确 |
| AI-08 | 硬件方向键、快捷键、Tab/焦点与撤销重做 | 不与系统返回/IME 冲突；核心写作可完成 |
| AI-09 | 组合输入中旋转、分屏、后台再前台 | 不提交半成品、不重复提交；恢复时明确保留或取消组合 |
| AI-10 | Script、Inspector、资源搜索和重命名字段切换 | 每种字段的 input type、回车和焦点策略正确 |

AI-01–AI-10 每个“设备 × IME”组合至少重复 3 次；失败必须保留录屏、事件时间线、前后文本/selection 和事务日志。

## 7. 生命周期、文件与故障矩阵

| ID | 场景 | 必要证据 |
|---|---|---|
| AS-01 | 冷启动、打开固定工程、到可编辑 | Perfetto/时间戳、PSS、WebView/API/构建指纹 |
| AS-02 | 正常保存、退出、重开 | WAL 阶段、文件 Hash、恢复令牌与 UI 锚点 |
| AS-03 | 每个 WAL 故障点杀 WebView renderer | 已确认提交不丢失；旧/新状态可解释 |
| AS-04 | 后台后由系统/ADB 杀进程再启动 | 不依赖 `onDestroy`；工程、视图和脏状态正确恢复 |
| AS-05 | 旋转、字体缩放、深色模式、分屏重建 Activity | 无重复 Host 请求、事务或资源泄漏 |
| AS-06 | 快速前后台、锁屏、来电/系统面板中断 | checkpoint 有界完成；恢复无静默覆盖 |
| AS-07 | 私有存储空间不足、只读/IO 异常 | 写前预检、稳定错误、旧工程仍可读 |
| AS-08 | SAF 导入中断、取消、恶意/超大/损坏包 | 隔离区可清理；权威工程不变 |
| AS-09 | SAF 导出中断、provider 离线/只读 | 权威工程不变；目标不冒充完整快照 |
| AS-10 | URI grant 撤销、provider/文件移动、设备重启 | 重新授权路径明确；不泄露或猜测替代 URI |
| AS-11 | 两个 Activity/窗口或恢复实例争夺写租约 | 单写者成立；旧 fencing token 不能提交 |
| AS-12 | 导入/Hash/派生任务切后台及进程死亡 | 明确完成、取消或按 journal 续作；无孤儿源 |
| AS-13 | WebView renderer crash/更新后重建 | 重新握手 Host 版本；工程和权限不静默漂移 |
| AS-14 | bridge 错 origin/frame、错误 Schema、重放、超大消息 | 全部拒绝；应用稳定并留下脱敏安全记录 |
| AS-15 | 外部 URL、Intent、popup、`file://`/`content://` 注入 | 不在编辑 WebView 执行；无原生能力泄露 |
| AS-16 | trim-memory/low-memory 与缓存回收 | 先清可重建资源；当前事务和恢复点保留 |
| AS-17 | 30 分钟固定创作任务 | 输入、热更新、帧时间、PSS、温度和电量原始 trace |
| AS-18 | 清缓存、升级安装、卸载/重装边界 | 清缓存不删工程；卸载数据语义在确认前明确展示 |
| AS-19 | 诊断包脱敏 | 无工程正文、composing text、content URI、剪贴板、token 或凭据 |

AS-02–AS-19 每个候选在 AND-L/AND-R 至少重复 3 次；性能任务至少重复 10 次。`force-stop`、后台进程终止、WebView renderer 终止、Activity 重建和设备重启是不同故障，必须分别记录，不能用一种命令替代全部。

## 8. 后台任务与恢复规则

- 进入后台前只做有界 checkpoint，不在生命周期回调里同步处理大文件；
- 用户可见的长导入/导出显示进度、取消和结果，不假定应用进入后台后可无限执行；
- 可延迟、需跨进程续作的派生任务使用持久 journal，并在 Spike 中比较 WorkManager/平台调度是否符合约束；
- 任务输入只引用私有工作区内已校验的不可变 Blob ID，不把临时 content URI 当永久源；
- 系统禁止后台启动或任务约束不满足时进入“已暂停、可恢复”，不能显示虚假完成；
- 任一任务恢复必须幂等，旧 generation/fencing token 不能发布到新工程 revision。

## 9. AND-L / AND-R 硬门

| 维度 | AND-L | AND-R | 硬阻断 |
|---|---:|---:|---|
| 冷启动到可编辑 | P95 ≤ 6 s | P95 ≤ 4 s | > 10 s 或恢复状态错误 |
| 输入到可见反馈 | P95 ≤ 100 ms | P95 ≤ 100 ms | 任一核心输入 P95 > 150 ms |
| 动效帧时间 | 简化档 P95 ≤ 33.3 ms，直接输入优先 60 FPS | P95 ≤ 16.7 ms | 任一帧 ≥ 700 ms；动效锁住输入/保存/撤销 |
| 编辑器 PSS | 5 分钟稳态 P95 ≤ 300 MB；峰值 < 450 MB | 稳态 P95 ≤ 450 MB；峰值 < 650 MB | 超峰值或 OOM/ANR |
| 下载/安装容量 | 下载 ≤ 120 MB soft / 180 MB hard；安装后 ≤ 300/450 MB | 同左 | 超 hard 且无经批准拆分 |
| IME/Undo | AI-01–AI-10 全通过 | AI-01–AI-10 全通过 | 任一 Canonical 损坏、选区不可恢复或重复提交 |
| 数据恢复 | AS-02–AS-13 全通过 | AS-02–AS-13 全通过 | 静默丢失、不可恢复损坏、旧 token 越权提交 |
| 安全 | AS-14、AS-15、AS-19 零越权/泄露 | 同左 | 任一成功利用或敏感数据进入日志 |

CL-02 的 30 分钟任务用于壳准入；完整 2 小时 Soak、0 OOM/ANR 和重复操作增长门仍由 CL-10 收口。Soft 门超出必须有不降低编辑能力、文本清晰度或保存安全的降级方案；Hard、安全和数据红线不可豁免。

## 10. 选择规则与停止条件

先过硬门，再比较；没有通过全部硬门的候选不进入评分。

| 评分维度 | 权重 |
|---|---:|
| IME、选区、焦点、系统返回与窗口适配 | 25 |
| 数据正确性、生命周期与任务恢复 | 25 |
| WebView/桥接/权限攻击面可审计性 | 20 |
| AND-L 性能、PSS、容量、温度与电量 | 15 |
| 自动化、诊断、升级与维护成本 | 10 |
| 与共享前端/Host 契约的长期漂移风险 | 5 |

- 仅一个候选通过：选择该候选并形成 ADR；
- 两个都通过：按原始证据评分；差值小于 5 分时增加能区分 IME、恢复或安全风险的定向测试，不凭框架偏好决策；
- 两个都失败：每个候选只允许一次针对根因的受限复测；仍失败则 CL-02 阻断 M1，不把 Android 降级为只读预览端；
- 需要宽存储权限、任意 JS bridge、远程代码、后台常驻或关闭 WAL 才能完成切片时立即停止；
- 若共享 Web 文本编辑组件无法可靠通过 AI 矩阵，先比较 CodeMirror 配置/版本；仍失败可为 Script 输入使用窄原生文本 surface，但必须保持同一 Canonical Command/Undo 语义并单独 ADR，不能复制工程模型；
- ADR 必须附原始证据、设备记录、WebView/IME/依赖版本、拒绝方案、已知厂商差异和回退触发条件。

## 11. 证据包结构

```text
evidence/cl-02/<batch-id>/
  manifest.json
  devices/
    and-l.json
    and-r.json
  capacitor/
    security-profile.json
    raw/
    results.json
  native-webview/
    security-profile.json
    raw/
    results.json
  comparison.json
  adr-input.md
```

`manifest.json` 至少记录仓库 commit、依赖锁 Hash、APK Hash、签名类型、API/ABI、设备/内存/存储、系统 WebView、IME/语言、显示/字体/导航模式、电量/热状态、权限清单、测试工具版本和全部原始文件 Hash。测试证书可用于 Spike，私钥和口令不得进入仓库或证据包。

## 12. 当前结论

本轮只冻结 Android 壳候选、数据所有权、SAF 边界、窄 Host、WebView 安全 Profile、IME 与生命周期矩阵、AND-L/AND-R 硬门和选择规则。CL-02 仍为“未开始；证据契约已冻结”。下一步是安装可复现 Android 工具链、登记两台实体设备并准备同前端的两个可抛弃 Spike；在此之前不得宣布 Android 完整编辑已支持。
