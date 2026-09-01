# S0.29 Story Graph 资源预测与切场景生命周期审计

## 需求对齐与范围

S0.28 已冻结并发、驻留预算、引用计数、LRU 和低内存清理，但调度请求仍由人工验证入口逐项发起。S0.29 将 Story Graph 连接到调度器：当前场景立即资源受保护，回滚窗口保留独立引用，分支出现前只预取所有后继的公共资源，画廊使用临时引用，场景 epoch 切换取消旧异步任务。

当前 `Direction.summary` 是人类可读演出文字，不是稳定资源引用。运行时禁止从文字或文件名猜测 Asset ID；本阶段冻结显式 `SceneResourceManifest`。正式 Compiler 后续应从类型化演出命令生成该清单。

本阶段不实现概率分支模型、章节包下载、完整回滚 VM、正式画廊页面、GPU 上传/显存、Android 低内存回调或两小时真机 Soak。

## 预测不变量

1. Manifest schema 必须受支持，场景必须存在，scene entry 与单场景 Asset ID 不得重复；
2. 当前场景资源角色为 `current / current-scene`，优先级最高；
3. 回滚窗口只接受显式 scene IDs，当前场景不会重复成为 rollback；
4. 多分支默认只预取所有目标场景资源的交集，原因为 `branch-common`；
5. 单后继的全部资源可标记 `unconditional-successor`；
6. 分支专属资源只有显式选择 outgoing target 后才可 `branch-speculation`，不能推测非邻接场景；
7. 画廊资源只在打开期间持有 `gallery` 引用，不进入默认首屏预测；
8. 同 Asset 多角色时按 `current → rollback → gallery → prefetch` 保留最高保护级别；
9. 输出排序确定，不依赖 Map/异步完成顺序。

## 切场景与失败关闭

- 每次 transition 创建单调递增 epoch，并 Abort 上一个 epoch 的 queued/loading 请求；
- 新 current/rollback/gallery lease 全部取得后才提交保护集合；失败、取消或过期结果全部释放；
- 两阶段切换的旧 current 在新集合提交前继续受保护；
- 若旧驻留、在途预留与新场景保守预留之和超过硬预算，切换在发起 Loader 前返回 `RESOURCE_LIMIT`，旧场景保持可用；
- 已在缓存或已保护的 Asset 不重复加载，只调整角色或取得独立 lease；
- prefetch 取得后立即释放为可回收缓存，下一 epoch 会取消未完成预取；
- 内存压力取消预取、释放 rollback/gallery，保留 current；dispose 后释放所有 lease 并清空可回收驻留。

## 编辑器验证入口

严格 Dicing 组新增“验证剧情预测”。S0 验证 Profile 用组内两张真实图片建立显式场景资源清单：入口场景使用第一张，两个选择分支共享第二张。入口依次验证：

1. Story Graph 产生一个 `branch-common` 预取；
2. 画廊临时引用打开与关闭；
3. 切到后继场景后保留入口图作为 rollback；
4. 低内存释放 rollback、保住 current；
5. dispose 后驻留和任务归零。

该 Profile 是工程验收证据，不会写入项目，也不冒充正式 Compiler 资源清单。

## 自动化覆盖

- 分支公共交集、单后继、显式分支推测与角色优先级；
- 无效/重复 Manifest 与非邻接推测拒绝；
- current/rollback/gallery/prefetch 完整引用周期；
- 场景 epoch 抢占、迟到输出隔离与最终场景提交；
- 两阶段切换峰值超预算时旧场景保留；
- 10,000 场景 Story Graph 的预测性能门禁；
- UI 从持久化 Atlas、Runtime Loader、Scheduler 到 Story Predictor 的完整真实链路。

## 审计证据

- 单次完整 `npm run check` 通过：TypeScript、40 个测试文件 / 254 项测试、生产构建、架构审计和全部性能门禁；
- 架构审计通过 31 个可移植文件与 3 个 Node 适配器；Story Predictor 保持在无 DOM、文件系统和平台外壳依赖的 `story-core`；
- 10,000 句脚本解析/投影/末句 Patch 总计 211.80 ms，预算 12,000 ms；
- 10,000 场景 / 10,000 Manifest entry 的 Story Graph 资源预测 27.91 ms，预算 2,000 ms；
- 媒体检查、16 MiB SHA-256 与 2,000 项 Index 总计 722.42 ms，预算 10,000 ms；生命周期两项 132.45/86.52 ms，各预算 2,000 ms；
- 八张 512px Dicing 分组 1,742.14 ms、Atlas 2,132.16 ms、合计 3,874.30 ms，预算分别为 3,000/3,000/5,000 ms；
- 2,000 项调度与压力清理 25.78 ms，预算 2,000 ms；峰值计账 65,536 B，最终驻留 0 B、任务 0；
- 真实浏览器复用两张 256×256 Original、Delivery Manifest、PNG Page 与 Build Root，入口 Story Graph 产生 1 个分支公共预取；
- 切到 `scn_broadcast_room` 后 rollback 引用 1、画廊临时引用 1；低内存后 current 1 / rollback 0，dispose 后驻留 0 B、任务 0；
- 默认舞台实测 334×187.875，比例 1.778（16:9）；界面没有进入错误状态，测试标签页与本轮开发服务已清理。

## 下一阶段

S0.30 应冻结类型化演出命令到 Scene Resource Manifest 的 Compiler 契约，包括背景、立绘、语音、BGM、转场依赖和语句级下一步预取；不能长期依赖 S0 验证 Profile 手写映射。
