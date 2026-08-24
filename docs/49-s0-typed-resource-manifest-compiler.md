# S0.30 类型化演出资源清单编译审计

## 需求对齐与范围

S0.29 使用显式 Scene Resource Manifest 驱动 Story Graph 预测，但验证 Profile 仍手写场景到 Asset ID 的映射。S0.30 增加可移植 Compiler，从 Canonical Script 的类型化演出参数生成场景资源清单和语句级资源窗口。

Compiler 不修改 CST、不重新格式化脚本、不删除未知参数，也不从人类可读描述、文件名或位置参数猜资源。旧脚本仍可解析、投影和编辑；进入构建资源清单时，未类型化演出会明确失败并要求迁移。

本阶段不实现正式构建按钮、批量迁移 UI、资源选择器补全、命令 Schema 插件、语音与对白自动绑定、GPU/平台格式或运行时语句执行器。

## 冻结语法

```text
@background asset=bg.rooftop transition=fade duration=800ms @id(stmt_bg)
@show asset=char.lin.smile expression=smile position=center transitionAsset=fx.fade @id(stmt_lin)
@audio asset=voice.lin.001 bus=voice loop=false volume=1 @id(stmt_voice)
@audio asset=bgm.snow.promise bus=bgm loop=true fade=800ms @id(stmt_bgm)
```

- `asset=`：所有三种演出命令必填，值必须是稳定 Asset ID；
- `transitionAsset=`：可选的显式转场资源依赖，与主资源一同进入该语句窗口；
- `bus=`：`@audio` 必填，只允许 `voice / bgm / sfx / ambient`；
- `loop=`：可选，只允许 `true / false`；
- `volume=`：可选，只允许 0 到 1；
- `duration/fade=`：可选，必须带 `ms` 或 `s` 单位；
- 未知 `key=value` 保留在 CST，并产生 warning；不参与资源依赖计算；
- 任意位置文本产生 `UNTYPED_RESOURCE_REFERENCE` error，Compiler 不猜测。

## 编译输出

每次成功编译同时输出：

1. `SceneResourceManifest`：按项目场景顺序列出场景使用的去重 Asset IDs；
2. `CompiledSceneResourceTimeline`：按稳定 statement ID 列出 `requiredAssetIds` 与紧邻下一语句的 `nextAssetIds`；
3. warnings：未知但已保留的参数，不阻断前向兼容；
4. 失败 diagnostics：带 scene、statement 与行号，不输出半可信 Manifest。

场景与资源的排序由项目和脚本顺序决定，不依赖对象枚举、异步完成或 Asset Index 顺序。

## 失败关闭与一致性

- 所有项目场景必须有且只有对应文档；额外、缺失或 scene ID 错配均失败；
- Parser 存在 error 时禁止编译；
- 文档 statement IDs 和顺序必须与当前投影场景完全一致；
- 相同 ID 的语句种类和 direction command 必须一致，防止旧 `background` 被偷换成 `audio`；
- Directive 必须有 `@id(...)`；重复/畸形参数失败；
- 所有依赖必须通过稳定 ID 语法；提供 Asset Index 时，未知资源失败；
- 任一 error 都返回 diagnostics 而不返回可发布 Manifest；warning 不改写源文本。

## 编辑器验证入口

严格 Dicing 组新增“验证资源编译”。验证使用当前已提交脚本的完整稳定 ID/语句结构，只把三条背景演出临时映射为组内两张真实 Asset：入口使用第一张，两个分支使用第二张并显式依赖第一张转场资源。编译结果必须满足：

- 3 个场景、10 个语句窗口；
- 3 条类型化演出、2 个已验证 Asset；
- 2 条转场依赖；
- Story Predictor 仍得到 1 个分支公共预取；
- Profile 不写回项目源文件。

## 自动化覆盖

- background/show/audio 的背景、立绘、语音、BGM 和转场资源；
- 语句 required/next 窗口与确定性场景清单；
- 未知参数 warning 与 Round-trip 保留；
- 位置文本、缺 Asset、重复参数、非法 bus/loop/volume/duration；
- Asset Index 未知资源、场景文档缺失/额外/错配；
- statement ID/顺序/语义种类/command 漂移；
- 10,000 场景类型化资源清单性能门禁；
- UI 从当前脚本、真实 Asset Index、Compiler 到 Story Predictor 的集成路径。

## 审计证据

- 首次完整门禁在架构审计拦截局部变量 `document`；实际无 DOM 使用，但仍改名为 `storyDocument`，没有放宽平台全局扫描规则；
- 修正后单次完整 `npm run check` 通过：TypeScript、41 个测试文件 / 257 项测试、生产构建、架构审计和全部性能门禁；
- 架构审计通过 32 个可移植文件与 3 个 Node 适配器；Compiler 保持无 DOM、文件系统、进程和平台外壳依赖；
- 10,000 句脚本解析/投影/末句 Patch 总计 192.77 ms，预算 12,000 ms；
- 10,000 场景 Story Graph 预测 29.70 ms，10,000 场景类型化 Manifest Compiler 61.21 ms，两者预算各 2,000 ms；
- 媒体检查、16 MiB SHA-256 与 2,000 项 Index 总计 564.76 ms，预算 10,000 ms；生命周期两项 72.33/67.55 ms，各预算 2,000 ms；
- 八张 512px Dicing 分组 1,078.68 ms、Atlas 1,698.76 ms、合计 2,777.44 ms，预算分别为 3,000/3,000/5,000 ms；
- 2,000 项调度与压力清理 31.88 ms，预算 2,000 ms；峰值计账 65,536 B，最终驻留 0 B、任务 0；
- 真实浏览器使用当前 3 个场景的完整稳定 ID/语句结构和两张已导入 256×256 Asset，编译 10 个语句窗口、3 条类型化演出、2 个 Asset 与 2 条转场依赖；
- Compiler 输出继续驱动 Story Predictor 得到 1 个分支公共预取，界面明确报告未从描述文字猜测资源；
- 默认舞台实测 334×187.875，比例 1.778（16:9）；界面没有进入错误状态，测试标签页与本轮开发服务已清理。

## 下一阶段

S0.31 应提供类型化演出 Inspector 与资源选择器：用图形界面选择 Asset、bus、角色表情、位置和转场，同时以稳定 ID Patch 修改单条 Directive，保持注释、未知参数与用户排版。
