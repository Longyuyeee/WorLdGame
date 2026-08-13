# S0.28 Runtime 资源调度与内存纪律审计

## 需求对齐与范围

S0.27 已能在隔离 Worker 中安全解析当前 Original 与 Dicing Atlas，但单次 Loader 不能约束一段剧情同时请求多张 CG 时的并发、驻留内存和生命周期。S0.28 增加可移植的 Runtime 资源调度器，并用真实持久化 Atlas 垂直验证加载、释放和内存压力回收。

本阶段不声称已完成 GPU 上传、显存计量、Draw Call 合批、KTX2/Basis、Android 低内存回调、场景图预测器或两小时真机 Soak。Web RGBA 预算不是 GPU/原生平台预算的替代品。

## 冻结不变量

1. `maxConcurrentLoads` 是硬上限；队列在空出槽位后按 `critical → scene → prefetch` 选择，同优先级保持 FIFO；
2. 每项任务在启动前必须预留正整数 decoded bytes，单项预留不得超过驻留硬预算；
3. 驻留字节与正在执行的预留字节之和不得越过 `maxResidentBytes`，峰值计账包含加载期间可能出现的双份内存；
4. Loader 实际输出不得超过预留字节；低估时拒绝结果，不能先放入缓存再补记账；
5. 相同 key 的并发请求只执行一次 Loader，每个调用者获得独立 lease；
6. lease 未释放时引用计数大于零，LRU 和内存压力处理都不得驱逐该资源；
7. 只有引用为零的资源可以按最后使用时间回收；释放操作幂等；
8. 调用者取消后立即收到 `CANCELLED`；最后一个调用者取消时中止底层任务，迟到输出不得进入缓存；
9. 低内存压力取消 queued/loading prefetch、清除全部未引用驻留资源，但保住当前 critical/scene 引用；
10. 所有失败都保持可解释：`CANCELLED / RESOURCE_LIMIT / LOAD_FAILED`，不把超预算或损坏资源伪装成命中。

## 编辑器验收入口

资源保险库的严格 Dicing 组新增“验证内存调度”。入口从受保护 Build Root 读取 Delivery Manifest，以目标 RGBA 尺寸建立硬预算，逐项通过现有 fail-closed Runtime Loader 获取 lease，释放后执行 LRU/压力回收，并报告：

- Atlas 与 Original 回退数量；
- 峰值计账与硬预算；
- LRU 回收数量；
- 压力清理后的驻留字节、active/queued 任务数。

该入口用于 S0 工程证据，不是正式玩家性能面板。

## 自动化覆盖

- 并发上限、优先级和同优先级顺序；
- 同 key 请求合并、缓存命中和独立 lease；
- 引用保护、幂等释放与 LRU 驱逐；
- 最后消费者取消、底层 Abort 和迟到输出隔离；
- 低内存下 prefetch 取消、未引用清理与引用保留；
- 实际输出超过预留时失败关闭；
- UI 从持久化 Atlas 发布到 Loader，再到 Scheduler 峰值/清理 PASS 的完整路径。

## 审计证据

- 单次完整 `npm run check` 通过：TypeScript、38 个测试文件 / 247 项测试、生产构建、架构审计和全部性能门禁；
- 生产构建继续独立输出 Dicing Runtime Worker；架构审计通过 30 个可移植文件与 3 个 Node 适配器文件；
- 脚本 10,000 句基线总计 163.41 ms，预算 12,000 ms；
- 媒体检查、16 MiB SHA-256 与 2,000 项 Index 总计 590.32 ms，预算 10,000 ms；生命周期两项 72.54/71.04 ms，各预算 2,000 ms；
- 八张 512px 图片的 Dicing 分组 1,085.29 ms、Atlas 1,497.20 ms、总计 2,582.49 ms，预算分别为 3,000/3,000/5,000 ms；
- 新增 2,000 项调度/压力清理基线为 19.77 ms，预算 2,000 ms；64 KiB 硬预算下峰值计账 65,536 B，回收 2,000 项，最终驻留 0 B、任务 0；
- 真实浏览器复用 S0.27 留存的两张 256×256 Original、Delivery Manifest、PNG Page 与 Build Root；重新分析后从 Atlas 加载 2 项、Original 回退 0 项；
- UI 报告峰值计账 256 KiB / 硬预算 256 KiB、LRU 回收 2，压力清理后驻留 0 B、任务 0；
- 默认舞台实测 334×187.875，比例 1.778（16:9）；测试标签页与本轮开发服务已清理。

## 下一阶段

S0.29 应把调度器接入 Story Graph 的当前场景/邻接场景预测，冻结场景切换取消、回滚窗口保留和画廊临时引用；随后才能建立 GPU Capability Matrix、平台纹理与 Android/Windows 真机内存基线。
