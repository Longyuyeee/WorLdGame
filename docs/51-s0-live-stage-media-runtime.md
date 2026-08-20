# S0.32 实时舞台媒体执行与生命周期审计

## 需求对齐与阶段边界

S0.31 已允许创作者用图形 Inspector 把背景、角色和音频写成类型化 Directive，但 Preview 仍只显示摘要文字。S0.32 打通第一条真实演出链路：权威脚本投影 → 累积舞台计划 → Asset Index 类型门禁 → SHA-256 复验 Blob 读取 → 受控 Object URL → 16:9 背景/角色/音频层。

本阶段不新增脚本命令，不实现多角色槽位、角色退场、音轨停止、语音与对白自动绑定、音频淡变曲线、自定义 transitionAsset Shader、Atlas 直接纹理上传、GPU 合成或正式玩家 Runtime。它们必须建立在本阶段的所有权和取消语义上，不能通过界面副作用临时拼接。

## 累积舞台计划

`derivePreviewStagePlan` 从场景开始扫描到当前步骤，确定性重建：

- 最近一次有效 `@background`；
- 最近一次有效 `@show` 及 expression/position/transition/duration；
- 每个 voice/bgm/sfx/ambient 总线最近一次有效 `@audio`；
- 旧式位置描述、重复参数、缺少 asset、非法 bus/volume 只产生诊断，不进入执行计划；
- 计划 key 只由有效舞台状态与诊断组成，因此背景进入后跨多句对白不会重复读取或重建 Object URL；
- 后退不依赖可变播放历史，而是从权威语句重新推导旧状态，避免反向执行不完整。

## 媒体加载与所有权

`loadPreviewMedia` 只接收明确计划、当前 Asset Index、验证型 Blob Reader、URL Factory 和 AbortSignal：

- background 只接受 background/cg，character 只接受 character，audio 只接受 audio；
- Asset ID 缺失、kind 不匹配、Blob 缺失或读取失败均返回局部错误，其他有效层仍可显示；
- IndexedDB Reader 每次读取继续执行既有 SHA-256 校验；不从文件名、摘要或 MIME 猜资源；
- 切步、切场、Undo、资源索引变化或组件卸载会取消旧 epoch；陈旧读取不得发布；
- 已创建但未发布的 URL 在取消/失败路径立即回收；已发布 URL 由当前 React effect 独占，并在 effect 结束时统一 revoke；
- 相同 Asset 被多个音轨引用时只读取一次 Blob、创建一个共享 URL；音频元素按 bus 显示状态，卸载时显式 pause 并移除 src；自动播放策略阻止时提供明确的“点击启用”按钮，不伪装为播放成功。

## 舞台表现与失败恢复

- 已加载背景使用 cover 填充当前 Preview Profile，角色按 left/center/right 底部对齐；
- fade/dissolve/slide 使用受控 CSS 动画，duration 直接来自已验证带单位参数；
- 加载中显示轻量验证状态，不阻塞 Writer；
- 无可执行旧脚本、类型冲突或缺 Blob 时保留现有舞台插画并显示“安全占位”，不崩溃、不修改脚本；
- 资源错误不改变 Preview Transport、稳定 ID、revision、autosave 或 16:9 尺寸语义。

## 自动化覆盖

- 背景跨对白保持、角色和四总线音频累积、后退确定性重建；
- 旧式描述、重复参数、非法 audio bus/volume 拒绝执行；
- Index kind 门禁、缺 Blob、部分成功和错误归档；
- 异步读取期间取消不创建 URL；
- 成功媒体的所有 Object URL 完整释放；
- 多音轨复用同一 Asset 时 Blob 读取与 Object URL 去重；
- App 在旧脚本上显示安全占位且不创建背景元素；
- 原有 Preview Transport、前后退、尺寸 Profile、Writer/Script 事务继续通过。

## 审计证据

- 最终 `npm run check` 通过：43 个测试文件、273 项测试、TypeScript、五包生产构建、架构和全部性能门禁；
- 架构审计通过 33 个可移植文件与 3 个 Node 适配器；新增媒体运行时留在 Web editor，未污染 story-core、story-language 或 project-persistence；
- 10,000 句解析/投影/末句 Patch 合计 190.66 ms（预算 12,000 ms）；10,000 场景预测 38.22 ms、Manifest 编译 96.05 ms（预算各 2,000 ms）；
- 新增 10,000 步累积 Preview 时间线门禁为 3.52 ms（预算 2,000 ms），对白步骤复用相同不可变计划，避免逐步回放形成 O(n²)；
- 16 MiB 媒体检查、SHA-256 与 2,000 项 Index 合计 605.93 ms；Dicing 分组/Atlas 合计 2,984.67 ms；2,000 项调度压力清理 19.51 ms，全部在预算内；
- 真实浏览器从持久化 Index r2 选择 `audit_atlas_a`，迁移为 `asset=audit_atlas_a transition=fade duration=400ms` 后生成受控 `blob:` URL，并出现真实 `preview-background` 图层；
- 前进到对白后背景继续使用同一个 URL，没有重复读取；Undo 后真实图层移除并恢复安全占位，Redo 可用、自动保存完成、控制台无 error；
- 默认舞台实测 334 × 187.875，比例 1.778（16:9）。

## 下一阶段

S0.33 应冻结完整舞台状态命令：多角色槽位与 z-order、角色退场、背景/角色显隐、音轨 stop/pause/resume 和 bus mixer。命令必须可前后重放、可由 Inspector 编辑，并继续复用 S0.32 的取消与资源所有权契约。
