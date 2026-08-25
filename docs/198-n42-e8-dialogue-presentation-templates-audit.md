# N42-E8 ADV / NVL / 气泡文本模板审计

> 日期：2026-08-25
> 分支：`codex/n42-e8-dialogue-templates`
> 直接基线：N42-E7 `66a3a8b`
> 授权边界：`RA-N21-007` 仅允许 N42 Stage Engineering；N43、正式 Player、M1 Stable 与 Public Release 继续阻断

## 1. 目标与冻结契约

本切片关闭文本呈现模板的最小纵向闭环：图形化编辑 → Canonical Story Language → Project Compiler → Runtime/portable Host → TEXT lane → Editor Preview → 保存重开。

冻结语法为 `@textbox action=set template=adv|nvl|bubble` 与 `@textbox action=reset`。ADV 是底部单条对白，NVL 从最近一次 Textbox 边界累计对白/旁白并最多保留 8 行，Bubble 是当前单条紧凑气泡。模板只改变呈现，不创建第二份剧情、时间线或 Speaker→角色槽位绑定；Reset 必须回到 ADV，未知模板和 Reset 残留 template 必须逐层 fail closed。

## 2. 实现结果

- Story Language、结构化 patch、补全、资源清单、持久化 tombstone 与 P0 Sequence 插入均识别 `textbox`；
- Compiler 只降低冻结词表；Runtime 对被篡改 IR 再次拒绝，并输出独立 `textbox` presentation channel；portable Host 可确定消费该通道；
- Preview Stage plan 从 canonical Direction 派生 `dialogueTemplate`，模板变化不触发无意义媒体 Blob 重载；
- Sequence 增加“＋文本框”、Alt+5、类型化 Inspector、批量模板、TEXT lane 与通用 P0 插入；
- Preview 增加现代 ADV/NVL/Bubble 表达和移动端响应式布局；NVL 是实际累积内容，不是 CSS 换皮，并以 8 行上限控制长场景渲染；
- 保存重开精确保留 set/reset 源码，删除的 textbox 指令也可通过 tombstone 往返。

## 3. 真实测试：预期、实际与修正

| 测试 | 预期 | 首次实际 | 修正与最终实际 |
|---|---|---|---|
| 红测 | 三种模板可插入，未知模板拒绝，Parser 不降为 opaque，UI 有“＋文本框” | 5 失败 / 42 通过：语言层不识别，UI 无入口 | 建立统一 Schema 和完整链路；定向 9 files / 170 tests 全过 |
| NVL 语义 | 从最近 Textbox 边界累积，而非只改样式 | 初始实现前无累积模型 | 新增 canonical 派生器；实际累积两行，ADV/Bubble 只显示当前行，超过 8 行只保留最新 8 行 |
| Preview reset | `action=reset` 后恢复 ADV 且不残留旧 NVL 行 | 新 App 集成测试首次直接通过 | 完整 App 实际点击“下一步”，DOM 从 `data-dialogue-template=nvl` 两行切换为 `adv` 单行 |
| 保存重开 | set/reset 源码与 textbox tombstone 精确往返 | Runtime 测试通过，但完整门 TypeScript 首次拒绝可能为 null 的重开结果 | 增加空工程显式失败分支；持久化 15 tests 与全量通过 |
| 本地浏览器 | 在 localhost 真实页面检查交互与视觉 | 内置浏览器被 URL 安全策略在页面加载前阻断 | 未绕过策略；以完整 App jsdom 实际交互、production build 和跨层 Runtime/Host 证据替代，本轮不登记 production browser 视觉验收 |
| 冻结性能门 | 既有 Route 预算不回退 | 完整链首轮 P95 `563.72ms`、Lazy Index `608.65ms`，均高于 500ms；本切片未改 Route | 关闭本轮开发服务器后隔离复测 P95 `400.24ms`、Lazy Index `236.84ms`，9/9 通过；预算未修改 |

## 4. 本机审计证据

- 类型检查：PASS；
- 定向跨层：9 files / 170 tests PASS；App + persistence 2 files / 51 tests PASS；
- 常规全量：125 files / 790 tests；storage 1/1；VM 5/5，全部 PASS；
- Runtime corpus：10,000 seeds / 20,000 replay，digest `20e9a842…92ef2`，PASS；
- 13 workspace build：PASS；Editor CSS `102.29 kB`（gzip `19.02 kB`），JS `894.37 kB`（gzip `250.49 kB`）；>500 kB 拆包告警继续保留；
- Architecture：93 portable files / 4 Node adapters，PASS；
- Script 性能：12/12 PASS；10k Preview timeline `8.51ms`，10k Stage timeline `11.86ms`；
- Route 性能隔离复测：9/9 PASS；P95 `400.24ms`、Lazy page `229.11ms`、Lazy Index `236.84ms`；
- Asset 性能：4/4 PASS；Dicing 总计 `2466.20ms <5000ms`；
- Requirements 50 / AC 27 与风险授权审计：PASS；`git diff --check`：PASS。
- GitHub Actions：Draft PR #71，run `32814073460` / job `97698809843`，Windows / Node 22 / full check 用时 `5m47s`，全部 PASS；常规 125 files、Route P95 `139.75ms`、Lazy page `313.90ms`、Lazy Index `255.64ms`，Editor JS `894.48 kB`（gzip `250.49 kB`）。

## 5. 需求对齐与出口判定

本切片直接推进 `REQ-STAGE` 与 `AC-03`：文本模板在 Script、Sequence、Compiler、Runtime/Host、TEXT lane、Preview 和持久化中共享同一 stable-ID Canonical 事实。它没有提前进入 N43，也没有把 Editor Preview 宣称为正式 Player。现代、多彩、动效清晰的 UI 目标获得了可见增量，同时保留 Naninovel/Utage 类专业工具要求的类型化、可审计、可移植执行链。

本机 Engineering 候选与远端干净 Windows / Node 22 完整门均已通过，因此 E8 **Engineering 切片关闭**。production browser 因工具安全策略未形成视觉证据，N42 Product Acceptance、正式 Player、三端一致性、真人与 M1 均继续阻断。

## 6. 下一步

仍在 `RA-N21-007` 内重新审计 N42 的最小切片，优先处理任意/贝塞尔路径、镜头高级效果或独立时间写入之一。禁止把模板完成换算为完整 N42、正式 Player 或商业发布完成。
