# N42-E7 作用域舞台转场审计

> 日期：2026-08-25
> 分支：`codex/n42-e7-scoped-transitions`
> 直接基线：N42-E6 `d564347`
> 授权边界：`RA-N21-007` 仅允许 N42 Stage Engineering；N43、正式 Player、M1 Stable 与 Public Release 继续阻断

## 1. 目标与冻结契约

本切片只关闭基础舞台转场的最小纵向闭环：图形化编辑 → Canonical Story Language → Project Compiler → Runtime/portable Host → Editor Preview → 资源窗口 → 保存重开。

冻结词表为 `fade | dissolve | slide`。`@background action=set/clear` 均可携带 `transition` 与 `duration`；未知转场必须在语言、Compiler、Runtime 与 Preview 各层 fail closed。背景替换或清除时只保留上一背景一个过渡帧，资源预测必须同时保留新旧背景；转场只能影响背景层，不能让 Character、Camera 或整个 Canvas 一起淡出。

明确不做：自定义 shader、任意转场参数、独立转场时间线、正式 Player Adapter、N43 七模式与产品验收。

## 2. 实现结果

- Story Language 统一导出 `STAGE_TRANSITIONS`、`StageTransition` 与校验函数；结构化 patch 和资源清单拒绝未知值；
- Compiler 在生成 IR 前拒绝非法转场；Runtime 对被篡改 IR 再次拒绝，Preview 在任何状态变更前拒绝；
- Preview plan 增加一次性的 `previousBackground`，下一语句自动结算；替换和清除都能表达离场背景；
- 资源窗口在背景替换/清除转场期间同时预测当前与上一背景，结算后释放上一 Blob；
- Canvas 在背景绘制阶段实现 fade（经暗场）、dissolve（交叉溶解）和 slide；角色随后以 alpha=1 绘制，不再给整个 Canvas 添加背景转场 CSS；DOM fallback 保持同一层级语义；
- Sequence Inspector 与“＋背景”面板均从统一词表编辑转场；清除背景也可图形化设置转场和时长；默认预览仍为 16:9，其他尺寸不受影响。

## 3. 真实测试：预期、实际与修正

| 测试 | 预期 | 首次实际 | 修正与最终实际 |
|---|---|---|---|
| 跨层红测 | `spin` 在语言/Compiler/Runtime/Preview 全部拒绝，Canvas 只转场背景 | 6 失败 / 111 通过：四层接受路径不完整，Preview 没有上一背景，Canvas 没画离场背景 | 建立统一枚举、逐层 fail closed、一次性 previous background 与分层 Canvas；定向 8 files / 174 tests 通过 |
| 资源窗口红测 | 替换转场期间精确保留 `bg_old + bg_new` | 实际仅 `bg_new` | Compiler manifest 增加 transient outgoing dependency；精确数组断言通过 |
| Runtime 诊断 | 被篡改 IR 返回结构化非法指令诊断 | 实际沿既有总入口返回 `RUNTIME_INVALID_IR`，不是测试假设的 `RUNTIME_INVALID_INSTRUCTION` | 对齐正式 Runtime 既有诊断契约，不新增平行错误码；测试通过 |
| 真实图形化插入 | 可插入 `action=clear transition=dissolve duration=700ms` | r3、s3、10 步，Canvas 标记 `data-background-transition=dissolve`，没有编译/媒体错误 | 与预期一致 |
| 正式运行 | 从当前转场语句经 Compiler→Runtime 执行 | Runtime 定位 `direction · stmt_ui_4`，History 1/1，Host 1 active / 1 operation，结构化诊断 0 | 与预期一致 |
| 保存重开 | 冷启动后保留脚本、媒体与验证状态 | 第二编辑窗口先触发 writer lease conflict；关闭旧窗口并等待租约到期后自动恢复 s3 | 单写者保护按设计工作；脚本、3 项真实媒体和 0 个阻断问题均保持 |
| Route 性能门 | 9 项均在冻结预算内 | 并发首测惰性页 970.86ms >500ms；隔离重测曾出现 3 项超限；释放浏览器/开发服务器后惰性页 279.89ms、索引 280.34ms 恢复，但单场景编辑同步 P95 883.38ms >500ms | 未修改 Route 代码或预算，不以重复刷绿掩盖；登记为当前主机性能差异，等待干净 Windows CI 裁决 |

## 4. 完整审计证据

- `npm run typecheck`：PASS；
- `npm test`：普通 123 files / 777 tests；storage 1/1；VM conformance 5/5，共 783 项全部 PASS；
- `npm run build`：13 workspaces PASS；Editor CSS `100.88 kB`（gzip `18.69 kB`），JS `890.33 kB`（gzip `249.58 kB`）；仍有 >500 kB 拆包告警；
- `audit:architecture`：PASS，93 portable files / 4 Node adapters；
- `audit:requirements`：PASS，50 requirements / 27 acceptance criteria；
- `audit:risk-acceptances`：PASS，最大授权节点仍为 N42；
- `audit:script-performance`：12/12 PASS；10k Preview timeline `7.31ms`，10k Stage timeline `10.48ms`；
- `audit:asset-performance`：4/4 PASS；8×512² Dicing 总计 `2928.66ms < 5000ms`；
- `audit:route-performance`：功能和 8/9 性能项通过，但单场景编辑同步 P95 `883.38ms > 500ms`，本机完整性能门未关闭。

## 5. 需求对齐与出口判定

本切片直接推进 `REQ-STAGE`、`AC-03` 与 `AC-13`：转场词表、资源窗口、Script、Sequence、Compiler、Runtime/Host 和 Preview 使用同一 stable-ID Canonical 事实，没有引入第二份时间线或 Player 私有解释器，方向未发生替换性偏移。

功能实现、真实浏览器闭环和全量回归已经完成；但本机 Route 性能门仍有一项红灯，因此 E7 只能登记为 **Engineering 实现候选，等待干净 CI 性能裁决**，不能宣称节点完整关闭。N42 整体还缺模板、任意/贝塞尔路径、镜头高级效果、独立时间写入与正式 Player 画面一致性；N21/N23 真人仍为 pending，M1 仍为 0/27 完整通过。

## 6. 下一步

先由远端干净 Windows / Node 环境重跑冻结完整门；若同一 Route P95 仍超预算，必须单独开性能纠偏切片并定位增量 Compiler 抖动，不能放宽 500ms 门。只有远端门绿色后，才可在 N42 授权内重新选择模板或其他最小纵向切片。
