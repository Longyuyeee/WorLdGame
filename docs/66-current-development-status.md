# WorLd Studio 当前开发状态快照

> 快照日期：2026-08-13
>
> 产品代码基线：`f16f34dc67a72c6888fcb3fa330decde47bc8d86`（S0.41 Web 技术证据原型）
>
> 本轮输入基线：`e916f1590f8f50123a7685416b0b3a4ac70412ae`
>
> 当前阶段：S0 收口 / Wave A；D1、S0、M1 均未通过
>
> 发布状态：Draft PR #1；没有可对外发布的编辑器或玩家安装包

## 1. 一句话结论

项目已经完成了较完整的产品、竞品、交互、架构、质量与商业制作规格，并实现了一个覆盖脚本、存储、资源、无损 Dicing、舞台编排和搜索的 Web 技术证据原型；但开发顺序曾偏向持续扩展 Web 编辑器功能，关键的平台壳、确定性 Narrative VM、三端玩家/构建、真机性能、供应链和目标用户证据尚未建立，因此当前不能称为 Alpha、M1 或商业级产品。

当前方向没有改变：Windows 与 Android 完整创作，Windows 本地发布 Web/Windows/Android，无账户、无云依赖，现代多彩且专业，具备自动路线图、画廊、回放、逐句前后退、可调快进和自动资源优化。纠偏改变的是验证与开发顺序，不是产品目标。

## 2. 已完成的设计与治理

| 领域 | 当前成果 | 判定 |
|---|---|---|
| 竞品与产品定位 | 已研究 Naninovel、Utage、Yarn Spinner 等专业工具及移动/可视化创作产品，冻结差异化、P0 范围和非目标 | 设计基线已形成，仍需持续验证市场变化 |
| 产品需求 | 已定义 Gal 基础配置、路线/画廊/回放/音乐室、快进与历史、资源优化、Windows/Android 创作和三端发布 | M1 Claim，不是已实现功能 |
| UX 与视觉 | 已定义现代、极简、多彩、强动效、平滑过渡、专业密度、桌面/手机工作区和默认 16:9 可调预览 | 已有 Web 原型输入，D1 用户验证未完成 |
| 技术架构 | 已定义 Domain/Compiler/Runtime/Host 分层、工程格式、平台桥、存储、构建与安全边界 | 候选架构，须由 CL Spike 和 ADR 冻结 |
| 质量与审计 | 已定义风险等级、测试矩阵、发布门、供应链证据、Claim/Evidence 登记和纠偏纪律 | 治理有效，生产证据仍缺失 |
| 目标设备预算 | 已冻结 WIN-L、AND-L、AND-R 与 Web 的启动、内存、容量和帧时间预算 | CL-01 有条件通过；实体设备未登记 |
| Narrative VM 契约 | 已冻结 State、Step、Effect、Save、History、Barrier、State Hash 与 VM-01–VM-15 | CL-04 进行中；Spike 01–14 完成 10k、Node/Web Worker 对照及平台可执行 Bundle 协议，尚未通过 |
| Windows 壳契约 | Spike 01–04 已完成双壳 VM/WAL、grant/junction 和持久租约；Spike 05 完成原子目录 CAS 与双壳 48 PID 同步竞争探索 | CL-03 仍未选型；kill-during-CAS、handle-relative TOCTOU、系统 picker、WAL 强杀、更新、签名与 WIN-L 尚未证明 |

## 3. 已实现的 S0.41 Web 证据原型

以下内容可作为后续正式工程的候选证据，但“已实现”只指当前 Web/Node 原型范围。

### 3.1 脚本与共享语义

- `.world` 容错 CST、未知命令/注释保留与 parse/format/parse 往返；
- 稳定 scene/dialogue/statement ID，结构 Insert/Delete/Move 与局部无损 Patch；
- 草稿与已提交语义隔离、ChangeSet、幂等命令、Undo/Redo；
- Writer、Preview、Stage 和搜索从同一 Canonical 内容投影；
- IME 组合输入、键盘工作流和大文本性能测试。

### 3.2 本地存储与恢复

- 两阶段 WAL、SHA-256、备份、恢复意图、schema 迁移和未来版本只读闸门；
- IndexedDB Web 持久化、自动保存、配额失败降级和双窗口单写者租约；
- 可移植 `project-persistence` 契约与隔离的 Node 文件系统参考适配器；
- 当前尚未证明 Windows 原生壳和 Android 沙箱/系统杀进程中的等价语义。

### 3.3 资源与容量优化

- 内容寻址 Blob、原子 Web 导入、类型/MIME/魔数检查、资源上限和 SVG 隔离；
- Source/Derivative DAG、备份保护根、隔离区、Trash、幂等派生任务与安全 GC；
- 缩略图 Worker、资源预测、优先级调度、取消、LRU 与低内存清理；
- 相似图分组、无损 Dicing、透明/重复块处理、多页 Atlas、无损 PNG、逐字节重建、实际字节收益复决策和 Original 回退；
- 当前尚未证明三端真实解码、显存、Draw Call、包体、画质和最低档 Android 收益。

### 3.4 预览、舞台与编辑操作

- 默认 16:9 预览，支持预设与自定义尺寸；
- 预览运输状态机支持逐步前进/后退、五档测试倍率、停止点和可取消计时器；
- 类型化背景、角色、语音、BGM、表情、位置和过渡指令；
- 累积舞台状态、多角色层级、媒体生命周期和安全占位；
- BG/CHAR/AUDIO/STORY 图形轨道，安全插入、删除、移动、复制、多选、批量预检、范围/整轨选择和单步 Undo；
- 64 步窗口化、场景搜索、稳定定位、跨场景项目搜索与跳转。

这些能力不是最终 Narrative VM。尤其是预览前后退和倍率控制不能替代剧情状态、随机种子、调用栈、异步 Effect、Save、Barrier 与三宿主 State Hash 证据。

### 3.5 当前工程规模

本快照统计到：

| 项目 | 数量 |
|---|---:|
| 应用/验证宿主 | 4（Editor Web 原型、VM Worker/CLI、Windows 双壳验证宿主） |
| 可移植/适配包 | 5（新增可抛弃 narrative-vm-spike；其余为 story-core、story-language、project-persistence、project-persistence-node） |
| TypeScript/TSX/MJS 源文件 | 166 |
| 测试文件 | 65（含独立性能审计文件） |
| 全仓常规测试 | 63 files / 420 tests；当前 419 passed / 1 timed out（既有 VM-14 10k 在 4 workers 下超过 5 秒；`13fb28b`） |
| `docs/*.md` | 88（新增 CL-03 Windows 壳探索 Spike 05 审计） |

数量只用于仓库盘点。正式进度只由需求映射、目标平台原始证据、ADR 和阶段门决定。

## 4. 尚未开发或尚未被证明的关键能力

| 能力 | 当前事实 | 进入 M1 前的必要结果 |
|---|---|---|
| Windows 完整编辑器 | Electron/Tauri 已完成同源 VM、app-private WAL、原生 grant/junction、持久租约与原子目录 CAS 探索；尚无最终系统 picker、CAS 强杀恢复且未选型 | 两个候选完成 handle-relative 系统工程、可恢复原生锁/CAS、真实 WAL 强杀恢复及安装更新，在 WIN-L 通过 CL-03 并形成 ADR |
| Android 完整编辑器 | 没有可安装 Android 编辑壳；浏览器窄屏不计 | AND-L/AND-R 真机完成 IME、文件、后台恢复、内存与核心任务 |
| Narrative VM | Spike 01–14 已实现 VM-01–15、10k、Node/Web Worker 对照及内容寻址 Bundle/差异报告/退出码；真实存储、迁移、Windows/Android 壳仍未实现 | VM-01–VM-15、10k 生成序列、三宿主 State/Effect/Save Hash 零差异 |
| Web/Windows/Android 玩家 | 没有三端最小可安装/运行产物 | 同一固定路线、Manifest、存档和 State Hash 贯通 |
| Windows 本地三端构建 | 尚无完整构建链和签名产物 | 可追溯生成 Web/Windows/Android，失败和回退可诊断 |
| Android 端直接打包 | 尚未验证，不能承诺 | 真机验证；失败则明确采用 Windows 本地 Android 构建基线 |
| 自动路线图/画廊目录 | 需求和编译架构已定义，未形成正式端到端产品能力 | Compiler Catalog + VM 解锁 + 编辑器/玩家/QA 一致性 |
| 商业级资源优化 | 算法原型证据较强，平台收益未证明 | 三端格式、包体、加载、内存、画质、Dicing 收益与回退矩阵 |
| 10k Route 图 | 当前 10k 证据主要是线性 Stage 窗口 | 真实分支图的局部加载、编辑、搜索、缩放和内存证据 |
| 长时稳定性 | 没有最低档 Android 2 小时 Soak | 0 崩溃/OOM/ANR，且内存/资源无持续增长 |
| D1 用户验证 | 内部原型和浏览器检查不能替代创作者测试 | 至少 5 名目标创作者，Severity 0/1 为 0 |
| 发布供应链 | 没有同 Revision 的正式三端产物证据 | SBOM、Provenance、Hash、签名、Manifest 和撤回流程 |

## 5. 当前阶段门

| Claim | 状态 | 已完成 | 下一动作 |
|---|---|---|---|
| CL-01 设备与预算 | 有条件通过 | 预算与降级原则已冻结 | 登记 WIN-L、AND-L、AND-R 并跑基础基线 |
| CL-02 Android 编辑壳 | 未开始；契约已冻结 | 候选、私有工作区/SAF、AI-01–AI-10、AS-01–AS-19 与真机硬门已冻结 | 安装工具链，登记 AND-L/AND-R 并准备两个可抛弃 Spike |
| CL-03 Windows 编辑壳 | 进行中；探索 Spike 01–05 部分通过 | 双壳 VM/WAL/grant/junction 成立；双壳各 3 轮 × 8 PID 同步 acquire 均唯一获胜，旧 token 拒绝保持成立 | 关闭 kill-during-CAS、时钟与锁损坏，再做 WAL 七阶段强杀、安装更新和 WIN-L；暂不选型 |
| CL-04 Narrative VM | 进行中；契约已冻结 | Spike 01–14 完成 10k、50 条 Node/Web Worker 记录及内容寻址 Bundle/差异报告/退出码 | 按 CL-03/CL-02 契约接入 Windows/Android 自执行 Observation |
| CL-05–CL-12 | 未开始 | Claim、Owner、阈值和依赖已登记 | 按 Wave B–E 顺序推进，不能用 Web 原型自动过门 |

状态的唯一权威明细仍是[《S0 Claim / Evidence 登记表》](63-s0-claim-evidence-register.md)。

## 6. 修正后的开发顺序

1. **补齐设备**：登记 WIN-L、AND-L、AND-R；在此之前目标机 Claim 只能准备环境，不能通过。
2. **关闭平台与发布风险**：CL-02、CL-03、CL-05、CL-06、CL-12。
3. **实现最小确定性 VM**：CL-04，并驱动同一 Web/Windows/Android 固定路线。
4. **验证规模与资源**：CL-07、CL-08、CL-09、CL-10。
5. **执行 D1**：CL-11 至少 5 名目标创作者，修复 Severity 0/1。
6. **S0 收口评审**：全部 Claim 为通过、替代或经审计批准的取消后，才由产品负责人决定是否进入 M1 正式产品编码。

CL-02、CL-03、CL-04 的证据契约均已冻结，CL-04 Spike 01–14 与 CL-03 探索 Spike 01–05 已形成可复现证据。当前代码工作只能继续已冻结契约下的可抛弃 Spike；目标设备未登记前，CL-02/03 只允许环境准备和探索测量，不能继续增加 Web 编辑器功能或宣布任一 Claim 通过。当前全仓 `check` 还受既有 VM-14 并发超时阻断，不得省略该红项。

## 7. 本快照审计范围

本文件根据 Git 历史、workspace 清单、源文件/测试文件静态统计、S0.1–S0.41 审计记录和 CL-01/03/04 契约编写。它明确区分“设计完成”“Web 原型实现”“目标平台已证明”和“正式发布能力”。

本快照提交只允许文档变更，不修改产品代码、依赖、版本号或 CL 状态；推送后 Draft PR #1 继续保持 Draft。
