# N42-E6 基础镜头系统审计

> 日期：2026-08-25
> 分支：`codex/n42-e6-basic-camera`
> 直接基线：N42-E5 `9a56fca`
> 授权边界：`RA-N21-007` 仅允许 N42 Stage Engineering；N43、正式 Player、M1 Stable 与 Public Release 继续阻断

## 1. 目标与冻结契约

本切片只关闭基础 Camera 的最小纵向闭环：图形化编辑 → Canonical Story Language → Project Compiler → Runtime/portable Host → Editor Preview → 保存重开。

冻结指令为：

```text
@camera action=move x=<percent> y=<percent> zoom=<ratio> rotation=<degree> duration=<time> easing=<curve>
@camera action=reset duration=<time> easing=<curve>
```

- `x/y`：`-100..100`；`zoom`：`0.5..3`；`rotation`：`-30..30`；
- easing 只允许 `linear/ease-in/ease-out/ease-in-out`；
- `move` 至少提供一个几何量，`reset` 禁止携带陈旧几何量；
- Camera 与 Background/Character/Audio 共用 canonical Direction、Compiler Source Map、Runtime Effect 和 Host presentation channel；
- 不新增第二份 Camera Timeline、Runtime Save schema 或 Player 私有解释器。

明确不做：贝塞尔/任意曲线、震屏、景深、镜头轨独立时间写入、模板、正式 Player Adapter。

## 2. 实现结果

- Story Language、补全、结构化 patch、资源清单和持久化白名单均识别 `camera`；非法 action、范围、duration、easing 和空 move 均 fail closed；
- Compiler 将 Camera 降为正式 Direction IR，不产生伪资源依赖；Runtime 发出 `camera.move` presentation effect，Host 使用独立 `camera` channel；
- Sequence 增加 `＋ 镜头`、`Alt+4`、CAM lane、Move/Reset Inspector，以及 X/Y/倍率/旋转/时长/缓动图形字段；
- Preview 从 stable-ID canonical statements 累积/回退 Camera plan，Canvas 对背景和角色统一执行 translate/rotate/scale；DOM fallback 保持同一 Camera plane；
- 非单位镜头下，画布坐标直接写回角色位置会产生坐标系歧义，因此 Stage placement 明确锁定，避免静默写坏 Canonical 数据；
- 默认预览仍为 16:9，其他既有尺寸仍可切换。

## 3. 真实测试：预期、实际与修正

| 测试 | 预期 | 首次实际 | 修正与最终实际 |
|---|---|---|---|
| Story Language 反例 | 空 `action=move` 必须拒绝 | 3 项中 1 项失败，空 move 被接受 | 在结构化 patch、资源清单与 Compiler 三层补充结构约束；3/3 通过 |
| Canvas Camera | Canvas 支持镜头 scale | 目标回归 4 项失败 / 149 项通过，测试 Canvas mock 缺少 `scale()` | 补齐浏览器 Canvas mock；相关 App/Canvas 50/50 通过 |
| 跨层定向 | Canonical→Compiler→Runtime/Host→Preview/UI 全绿 | — | 8 files / 162 tests 全通过 |
| 真实浏览器插入 | 插入 X=18、Y=-10、Zoom=1.25、Rotation=2、600ms、ease-out | CAM cue、`@camera`、本地事务 r1 均出现，无插入/编译错误 | 与预期一致 |
| 正式运行 | 从 Camera 语句启动正式 Compiler/Runtime | Runtime 可见、Camera channel 可见，并继续到下一对白；无编译/运行错误 | 与预期一致 |
| 保存重开 | 刷新后按真实产品路径重开仍保留 Camera | 刷新按设计返回项目首页，而非直接返回编辑器 | 依次执行“最近工程→进入编辑器→进入内容编辑器→Script”；原 `@camera` 完整保留 |
| 标准全仓回归 | 满载并行仍稳定通过 | 第一次 Player 流程 5.792s 越过默认 5s；第二次资源 SHA-256 异步断言越过 Testing Library 默认 1s | 完整试玩显式预算改为 10s；测试环境异步 UI 预算统一为 5s，仍保留 4 workers；重跑 122 files / 764 tests 全通过 |

测试预算修正没有删除断言、缩小数据规模、降低性能门或跳过真实 SHA-256/媒体工作。

## 4. 完整审计证据

- `npm run typecheck`：PASS；
- `npm test`：普通 122 files / 764 tests；storage 1/1；VM conformance 5/5，全部 PASS；
- `npm run build`：13 workspaces PASS；Editor CSS `100.31 kB`（gzip `18.61 kB`），JS `886.54 kB`（gzip `248.73 kB`）；仍存在 >500 kB 拆包告警；
- `audit:architecture`：PASS，93 portable files / 4 Node adapters；
- `audit:requirements`：PASS，50 requirements / 27 acceptance criteria；
- `audit:risk-acceptances`：PASS，当前最大授权节点仍为 N42；
- `audit:script-performance`：12/12 PASS；10k cumulative Preview timeline `3.57ms`，10k Stage timeline `9.62ms`；
- `audit:route-performance`：9/9 PASS；
- `audit:asset-performance`：4/4 PASS，8×512² Dicing 总计 `3042.29ms < 5000ms`。

## 5. 需求对齐与出口判定

本切片直接推进 `REQ-STAGE`、`AC-03` 与 `AC-13`：Camera 不另存私有状态，Script/Sequence/Preview/Runtime/Host 使用同一 stable-ID Canonical 事实；因此没有发生架构或产品方向替换性偏移。

但 N42 Engineering 仍未整体关闭：任意/贝塞尔路径、镜头高级效果、独立时间编辑、模板和正式 Player 画面一致性仍缺。N21/N23 真人验收仍因无真人为 `pending-participant(s)`；M1 仍为 0/27 完整通过。禁止把本切片、自动化数量或浏览器 Editor Preview 冒充 Product Acceptance。

## 6. 下一步

下一步只允许在 N42 内重新做出口缺口审计，选择一个最小纵向切片；优先评估“基础转场/模板”与“时间尺写入”哪个能在不引入第二权威状态的前提下闭环。N43、正式 Player 和发布工作继续等待治理授权。
