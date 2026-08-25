# N42-E5 两段角色运动路径审计

> 日期：2026-08-25
> 直接基线：`2a63831`（N42-E4 派生时间标尺与 Runtime 播放头）
> 分支：`codex/n42-e5-character-motion-path`
> 授权边界：`RA-N21-007` 只覆盖 N42 Engineering；未进入 N43、正式 Player、Android 或三端发布
> 判定：图形化两段角色运动路径已通过一次 Canonical 批处理写入、保存重开、Formal Runtime/Host 和真实 Preview 闭环；路径不是第二份持久模型。N42 完整镜头/时间线与 Product Acceptance 仍未关闭

## 1. 冻结目标与语义边界

本切片只实现一个可独立验证的角色路径结果：

- 从当前有效 Show/Move stable ID 与正式 Stage plan 派生角色起点；
- 图形界面只编辑一个路径点和一个终点，每段具有独立 duration 与既有四种 easing；
- 提交时一次事务生成两个连续、稳定 ID 的 canonical `@show action=move`，不保存独立 Path 文档；
- 任一节点越界、时长/缓动非法、第一段空或第二段空均失败关闭；
- 两段必须经过既有 Compiler、Formal Runtime、portable Host 与 Preview，并可由 Canonical Script 保存重开；
- 不新增 Camera opcode、任意曲线、贝塞尔控制点、绝对时间写入或 Player 私有解释器。

代码审计否决“基础镜头轨”作为本轮目标：当前语言、Compiler 与 Host 没有 Camera 语义，若同轮补齐会横跨过多信任边界。路径可复用已冻结 Move 契约，因此先选择更小且可取得真实纵向证据的切片。

## 2. 预期—首次实际—修正—当前实际

| 检查 | 冻结预期 | 首次实际 | 修正 | 当前实际 |
|---|---|---|---|---|
| 原子修订 | 起点建立后，两段路径只增加一次 revision | 测试错误预期创建后为 `r1`，实际为 `r2` | 确认起点 Script 提交已经产生 `r1`；不改产品事务，只修正测试预期 | 路径两段在同一 P0 batch 中从 r1→r2；一次 Undo 同时移除两段 |
| 图形路径可见性 | 0–100 舞台范围的起点、路径点和终点均不被 UI 遮挡 | Y=88 时底部浮动说明条覆盖起点/终点，只明显看到中间节点 | 将说明条移出 SVG 绘图层，改为独立静态信息带 | Canvas bottom 与 Legend top 同为 357.5px，重叠 0px；三点和两段连线均清晰可见 |
| 真实写回 | 当前 7 步工程写入 2 个连续 Move 并保存 | 符合预期 | 无需修正 | 起点 72/84；路径点 86/60、420ms、ease-in；终点 40/88、700ms、ease-in-out；9 步、r2、自动保存 s2 |
| 时间线投影 | 两段沿 E4 标尺顺序累计，不写绝对 start | 符合预期 | 无需修正 | 路径点起点 2.150s，终点起点 2.570s；总时长由 5.200s 增为 6.320s |
| Runtime/Host | 从第一段启动，Continue 顺序进入第二段；Host receipt 累计 | 符合预期 | 无需修正 | `stmt_ui_2` / 1 active / 1 operation → `stmt_ui_3` / 1 active / 2 operations；播放头由 2.150s 移至 2.570s并锁定 scrub |
| 保存重开 | 刷新后只从 Canonical Script 恢复两段 | 符合预期，未发生 Writer Lease conflict | 无需修正 | 重开为 r2/s2、9 步、6.320s；86/60 与 40/88 两段均保留，初始选择回到首语句 |
| 桌面布局 | 1280×720 无整页横向溢出，路径面板可用 | 符合预期 | 无需修正 | Document 1280/1280，Track 623/623，Form 623/623，路径画布 593×180 |
| 手机布局 | 390×844 整页不横向溢出；两个节点改为单列 | 符合预期 | 无需修正 | Document/Body 375/375，Form 349/349，Canvas 319×150，节点单列 321px；轨道仅内部 310/650 auto 横滚 |
| 图形点击与错误 | 手机触控尺寸下点击画布会改变当前节点；console 0 error | 符合预期 | 无需修正 | 路径点由 55/78 实际变为 50.0/50.0；console errors `[]` |

## 3. 自动化、性能与构建证据

- `stage-motion-path.test.ts`：两段 canonical 参数、确定性序列化、非法节点、两种空段和舞台边缘默认值；
- `App.test.tsx`：真实 UI 输入一次批处理生成两条相邻 stable-ID Move，revision 只增加一次，Undo 同时移除；
- 定向复核：3 files / 45 tests 全绿；TypeScript build graph 通过；
- 10,000 条两段路径 / 20,000 canonical Move 规划为 43.14ms < 500ms；Script 性能门 12/12 全绿；
- `npm run check` 中治理、Workspace、需求/风险/真人门、Golden、Runtime corpus、N41 scale/lazy、TypeScript、普通全仓与真实 IndexedDB 均通过：Sequence exit 10 files / 88 tests，普通全仓 121 files / 755 tests，storage 1/1（测试 4.06s）；Runtime 10k seeds / 20k replays 为 18.483s，digest 未变；
- 同一次完整门的冻结 VM 在本机 Node 25.2.1 首次为 113.493s > 90s，随后两次隔离复测为 92.285s 与 108.753s，均未恢复到预算内。测试规模、digest 与 90s 门均未修改，因此本机完整门如实保持红灯，等待推送后的干净 Windows / Node 22 CI 裁决；
- 全 workspace production build 独立复核通过：Editor CSS 100.14 kB / gzip 18.57 kB，JS 875.39 kB / gzip 246.60 kB；>500 kB 拆包债继续保留；
- Architecture PASS（93 portable / 4 Node adapter）；Route 性能 9/9、Asset 性能 4/4 全绿。Route P95 164ms <500ms；Dicing 1439.27/1873.11/3312.37ms，仍在 3000/3000/5000ms 冻结预算内。

## 4. 需求与偏移判定

本切片推进 `REQ-STAGE`、`AC-03` 与 `AC-13`：路径 UI 最终只生成已有 canonical Move，E4 时间尺从同一 Script 重建，Formal Runtime 通过 Source Map 逐段定位，portable Host 收到同一 Effect 序列。没有引入 UI 私有路径状态、平行 Runtime 或 Player 假实现。

产品方向未被替换，但完成度不能虚高：当前只是固定两段折线路径，不是贝塞尔/任意关键帧路径；基础 Camera 语义、独立轨道时间编辑、模板与正式 Player 仍缺；N21/N23 真人仍为 0/1 和 0/2；N42 Product Acceptance、N43、M1 Stable 与 Public Release 继续 fail closed。

## 5. 下一步

下一切片先做基础 Camera 语义的跨层差距审计，只有能冻结最小 canonical→Compiler→Runtime/Host→Preview→保存重开契约时才进入实现；否则继续选择 N42 内更小的转场或模板纵向结果。不得把本轮两段折线路径宣称为完整专业运动曲线。
