# N22 Media Golden 运行链审计

> 日期：2026-08-14
>
> 分支：`agent/n22-stage-media`
>
> 节点状态：实现中；本文只验收 N22 第五切片，不宣称 N22、N21 或 M1 通过
>
> 前置切片：[N22 Render Host 边界审计](105-n22-render-host-boundary.md)

## 1. 需求对齐

本切片把原先只有文字占位指令的 `GP-MEDIA` 升级为可重复执行的真实媒体基线。目标是证明同一套冻结字节可以经过媒体安全检查、Blob/Asset Index 原子导入、项目保存、IndexedDB 重开、Stage 状态生成、Preview 装载与 Object URL 回收，而不是用 CSS 色块或测试伪文本冒充媒体资源。

本切片不覆盖像素截图比较、真实浏览器文件选择交互、音频设备听感或 Canvas/Pixi 高性能后端，因此这些项目仍然是 N22 后续验收边界。

## 2. 冻结产物

`fixtures/projects/media/media-golden.json` 固定以下三个真实负载：

| Asset ID | 类型 | 格式 | 尺寸/时长 | 字节数 |
|---|---|---|---|---:|
| `media_sunset` | CG/背景 | PNG | 16 × 9 | 422 |
| `media_actor_sprite` | 角色透明图 | PNG | 4 × 8 | 109 |
| `media_theme` | BGM | PCM WAV，8 kHz，单声道，0.1 秒 | 1,644 |

每个负载都登记精确字节数与 SHA-256。Golden 审计会重新解码 Base64、核对规范编码、字节数、负载哈希、Fixture 语义哈希，并验证脚本中每个类型化 `asset=` 引用都能在 Fixture 中找到。

`project.s0.json` 的背景、角色与音频指令已经改为 P0 类型化参数，不再接受 `Background: sunset city` 一类不可执行的旧式位置文本。

## 3. 自动化产品链

`apps/editor/src/media-golden.test.ts` 在同一个测试中执行并断言：

1. 由真实 Golden 字节重新计算 SHA-256；
2. PNG/WAV 通过共享的不可信媒体检查边界；
3. 在 writer lease 下原子写入 Blob、Asset Index 与生命周期记录；
4. 保存项目快照后创建新的 Project Store 与 Asset Repository 实例；
5. 重开项目并通过保存的脚本恢复 Studio Session；
6. 从重开的 Asset Index/Blob 生成背景、角色与 BGM Preview；
7. Preview 无诊断、无缺失资源、无类型不兼容；
8. 释放全部三个 Object URL，避免媒体切换后泄漏。

完整并行门禁扩展到 87 个常规测试文件后，既有 `autosave-app.test.tsx` 暴露出测试预算矛盾：内部最多允许两次 10 秒等待和一次 5 秒等待，外层却只允许 20 秒。单文件复核在 6.24 秒内通过；外层预算已校正为 30 秒，内部等待和业务断言均未放宽，以避免 Windows 并行资源竞争产生假阴性。

Golden 注册表只把上述范围登记为 `inspect-import-save-reopen-preview-release`。N30 IR Hash、N31 State Hash 与 N80 正式构建产物 Hash 继续保持显式 `pending`，没有被本切片越权填充。

## 4. 审计结论与剩余边界

- 旧 `GP-MEDIA` 只有 698 字节的 S0 描述文件，无法承担真实资源验收；该缺口现已由可哈希、可重建的 PNG/WAV Fixture 和单链自动化测试关闭。
- 本切片证明的是数据与 Preview Runtime 的确定性产品链，不是截图级视觉正确性。
- N22 仍缺真实浏览器导入/保存重开交互验收，以及 16:9、9:16 等目标尺寸下的像素视觉 Golden。
- Canvas/Pixi/WebGL、批处理、纹理图集和 GPU 预算仍归 N42/N71/N72，不应被当前 `dom-media-v1` 证据替代。
- `RA-N21-001` 仍只允许 N22 工程实现；N21 真人门、N23、M1 Stable 与 Public Release 继续阻断。

因此，本轮只能登记为“N22 第五切片完成，Media Golden 运行链已建立”，不得将 N22 整体状态改为通过。
