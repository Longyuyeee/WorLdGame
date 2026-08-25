# N42-E9 三次贝塞尔角色运动路径审计

> 日期：2026-08-25
> 分支：`codex/n42-e9-bezier-character-path`
> 直接基线：N42-E8 `449de01`
> 授权边界：`RA-N21-007` 仅允许 N42 Stage Engineering；N43、正式 Player、M1 Stable 与 Public Release 继续阻断

## 1. 目标与冻结契约

本切片关闭“任意/贝塞尔角色路径”的最小纵向闭环：图形化控制点 → 单一 stable-ID Canonical Move → Story Language → Project Compiler → Runtime/portable Host → Canvas/DOM Preview → 保存重开。路径不创建第二份时间线或私有模型。

冻结语法为：

```world
@show action=move slot=hero x=80 y=80 curve=bezier control1X=30 control1Y=20 control2X=70 control2Y=20 duration=650ms easing=ease-in-out @id(move_curve)
```

- `curve` 缺省时保持旧直线空间插值；指定时只接受 `bezier`；
- `curve=bezier` 必须同时提供终点 `x/y` 和四个控制坐标，六个坐标均是绝对 Stage 百分比且范围为 0–100；
- 控制点脱离 `curve`、控制点不完整、越界、未知 curve 均逐层 fail closed；
- 空间三次贝塞尔与时间 `easing` 独立：先求时间缓动进度，再代入空间曲线；缩放、旋转、锚点继续按同一时间进度线性插值；
- 一条路径只写入一条 canonical `@show action=move`，Undo/Redo、Inspector、Compiler、Runtime、Preview 与持久化共享同一事实。

## 2. 实现结果

- Story Language 增加冻结 curve 词表、控制参数组校验、结构补丁和 Resource Manifest 诊断；
- Sequence Stage 工具栏增加“＋贝塞尔”；现代图形面板显示起点、两条控制线、三次曲线、两个控制点和终点，节点可用表单或画布定位；
- 既有 Move 的类型化 Inspector 可在直线/三次贝塞尔间切换并再次编辑四个控制坐标；
- Compiler 保留六个 canonical 坐标；Runtime 对 IR 再验证并向 portable Host 输出数值化 effect payload；
- Preview plan 只在当前 Move 暴露路径元数据，settle 后清除，避免污染后续直线 Move；Canvas 2D 计算真实三次曲线，DOM 降级层使用同一绝对路径与时长；
- 项目快照保存重开精确保留源码；10,000 次规划使用单命令模型，无第二份路径数据库。

## 3. 真实测试：预期、首次实际、修正后实际

| 检查 | 预期 | 首次实际 | 修正与最终实际 |
|---|---|---|---|
| 红测 | 语言接受完整曲线、规划器输出单 Move、Canvas 中点为真实曲线 | 3 files failed：语言拒绝新参数；规划模块不存在；Canvas 函数不存在 | 建立统一契约和实现；对应 3 files / 16 tests PASS |
| 曲线数学 | P0=(20,80)、P1=(30,20)、P2=(70,20)、P3=(80,80)，线性时间 t=.5 得 (50,35) | 旧实现只能得到直线中点 (50,80) | Canvas 先应用 temporal easing 再计算 cubic；实际 (50,35) |
| 失败关闭 | 缺一点、控制点无 curve、坐标 101 均拒绝且不改变当前角色 | 实现前完整曲线也被当未知参数拒绝，无法区分错误组 | Structural/Manifest/Compiler/Runtime/Preview 分组校验；非法 Preview 保持原 Show 几何并产生明确诊断 |
| UI 创建 | 从当前角色状态画一条曲线，只新增一条 stable-ID Move | E5 只能创建两个折线 Move | App 实际点击“＋贝塞尔”、填写 6 个坐标并提交；Script 只新增一条完整 Move |
| 再次编辑 | 已有曲线可在 Inspector 修改或切回直线 | 首版新增面板完成后 Inspector 尚无 curve/控制点字段 | 补齐类型化 Inspector、成组有效性和清理逻辑；定向全链 8 files / 171 tests PASS |
| 保存/正式链 | 源码精确保存重开，Compiler→Runtime Host 数值 payload 一致 | 新集成测试首次通过 | `curve=bezier` 与 6 个数值坐标精确到达 `show.move` channel |
| 性能 | 10,000 条路径规划 <500ms | 实际 6.30ms | 通过，预算和样本均未放宽 |
| 本地浏览器 | 真实页面可加载并检查图形面板/16:9 布局 | 内置浏览器在应用加载前以 URL 策略阻断 localhost:5174 | 未绕过；本轮不登记 production browser 视觉验收，以 App jsdom、Canvas/DOM 数学、production build 和待运行 Windows CI 替代 |
| PR 追踪门 | 产品代码与 M1 唯一权威矩阵同 PR 更新 | 首次 run `32816908246` 在 38 秒时失败：`docs/90-m1-requirement-traceability.md` 未更新 | 不改门禁；补齐 USP-01、REQ-STAGE、AC-03、AC-13 的 E9 状态与证据后重新运行 |

## 4. 本机证据

- TypeScript project references：PASS；
- 定向跨层：8 files / 171 tests PASS；
- 生产构建：13 workspace PASS；Editor CSS `104.27 kB`（gzip `19.31 kB`），JS `905.85 kB`（gzip `252.78 kB`）；既有 >500 kB 拆包告警保留；
- 贝塞尔性能：10,000 条单命令路径 `6.30ms <500ms`；
- Requirements：50 / USP 10 / AC 27，PASS；Architecture：93 portable files / 4 Node adapters，PASS；
- 全仓 `npm run check`：退出码 0；普通回归 128 files / 799 tests；storage 1/1；重型 VM 5/5；Runtime corpus 10,000 seeds / 20,000 replay，digest `20e9a842…92ef2`；
- Script 性能 13/13 PASS（贝塞尔 10,000 条 `5.34ms`）；Route 9/9 PASS（20 样本 P95 `138.73ms`、Lazy page `269.73ms`、Lazy Index `260.53ms`）；Asset 4/4 PASS（Dicing 总计 `2635.43ms <5000ms`）；
- 远端 Windows / Node 22：首次 run `32816908246` / job `97706938825` 被 PR traceability 门正确拒绝；修正提交后的完整门等待回填；
- `git diff --check`：PASS。

## 5. 需求对齐与出口判定

E9 直接推进最初需求中的现代图形化演出编辑、专业级角色调度、稳定运行与可维护生产链。它复用 canonical Move 和 portable presentation channel，没有扩张出 Editor 私有路径数据库，也没有提前进入正式 Player、N43 或三端发布，因此当前没有替换性方向偏移。

本机完整门已通过，当前判定 **E9 Engineering 候选**：待远端干净 Windows / Node 22 同门通过后才能关闭 E9。浏览器视觉实测仍缺，不能把数学/DOM 测试换算为 Product Acceptance；N42 完整专业时间线、正式 Player、Android/Windows/Web 发布和 M1 继续阻断。

## 6. 下一步

先完成本分支全仓和远端 CI 裁决并回填本审计。若全绿，再在 `RA-N21-007` 内重新选择 N42 最小切片，优先在高级 Camera 与独立轨道时间写入之间按需求价值和共享语义闭环排序；不得把 E9 完成宣称为完整 N42 或商业发布完成。
