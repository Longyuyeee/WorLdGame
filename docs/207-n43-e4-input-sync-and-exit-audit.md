# N43-E4 输入等价、跨视图同步与出口审计

> 日期：2026-08-26  
> 分支：`codex/n43-e4-input-sync`  
> 直接基线：N43-E3 `35646e1`，Draft PR #78 最终头 GitHub run `32927510219` 绿色  
> 授权：`RA-N21-008`，只覆盖 N43 Engineering  
> 判定：**E4 共同交互切片完成；N43 Engineering 总出口不通过（4/7 模式），Product Acceptance、N50+、M1 Stable 与发布继续阻断。**

## 1. 冻结目标

E4 不新增空面板，关闭三项可审计结果：

1. 冻结七类高频创作任务的键盘与指针/触屏替代路径，两条路径必须进入同一 canonical command；
2. 对真实文本提交建立只在 `?syncAudit=1` 启用的 Sequence→Script/Preview 投影计时，revision 必须前进且 layout commit `≤500ms`；
3. 重新逐项裁决 N43 出口，不得把禁用模式、自动化、浏览器或 CI 换算为真人和商业完成度。

## 2. 实现与边界

- `input-equivalence.ts` 冻结选择、提交、插入、语句排序、舞台提示排序、路线位移和舞台定位七类等价路径；路线键盘与触控按钮共用 `routeNodeNudge()` 的 24px Sidecar delta。
- Route node 新增 `aria-keyshortcuts`；390px 下四向触控按钮最小 `44×44px`，不增加新的工作区面板。
- `cross-view-sync-audit.ts` 只在显式查询启用；从 canonical edit dispatch 前记录 action/stable statement/revision，到 React layout projection 完成后输出实际 duration 和新 revision。正常产品入口保持 idle，不持续采样。
- `n43-input-sync-app.test.tsx` 实际走 Ctrl+S 提交，核对同一 stable statement 在 Script 与常驻 Preview 的内容，并比较键盘与按钮路线位移。

## 3. 预期—首次实际—修正后实际

| 检查 | 预期 | 首次实际 | 修正后实际 | 判定 |
|---|---|---|---|---|
| 三视图同步 | revision 前进且 `≤500ms` | 集成测试 `21.88ms`，真实浏览器 `26.20ms`，`r0→r1` | 无语义差异 | PASS |
| Script/Preview 内容 | 同一 stable ID 和文本 | Script 包含新文本；Preview 显示“林夏 / N43 E4 浏览器真实同步”；`stmt_gate_001` 不变 | 无差异 | PASS |
| 路线输入等价 | Alt+方向键与四向按钮进入同一 24px 命令 | 两条路径原已存在，但各自硬编码且 route node 未声明快捷键 | 共用 `routeNodeNudge()`；`aria-keyshortcuts` 明确 | PASS |
| 手机触控目标 | 四向按钮至少 `44×44px` | 390×844 请求下实际 client 375，按钮仅 `32×29px` | `44×44px`，X `648→624` | PASS |
| 手机布局 | 无文档横向溢出 | client/scroll `375/375` | 保持 `375/375`，overflow 0 | PASS |
| 完整纯键盘真人任务 | 不借助指针完成整条创作任务 | 浏览器真实完成键盘输入与 Ctrl+S；未聚焦剧情卡的 locator `press` 未激活 | 自动化覆盖按钮 Enter/Space 与快捷键；目标设备/真人仍未完成 | **Engineering 覆盖，Product 未通过** |
| Android 触摸/IME | 实体触摸、软键盘和生命周期可用 | 本切片只有真实窄视口与指针点击 | 不冒充 Android 实体设备 | **未通过** |

版本化浏览器数值见 `evidence/n43/input-sync-browser.json`。

## 4. 测试与工程门

- E4 单元/集成：输入契约 `2/2`、同步策略 `2/2`、App 输入/同步 `2/2`。
- N43 聚合门：`7 files / 19 tests` + context `1/1` + disclosure `1/1` + motion `2/2` + input/sync `2/2` + App `45/45`，合计 `12 files / 70 tests`，通过。
- `npm run typecheck` 通过。
- 真实浏览器使用产品首页→真实工程→项目结构→内容编辑器；同步 `26.20ms <500ms`，移动触控目标修正后 `44×44px`，横溢出 0。
- `npm run check` 本机单链退出 0：普通回归 `134 files / 774 tests`，Editor integration `1+1+2+2+45`，storage `1/1`，冻结 VM `5/5`（测试体 `54.33s <90s`），14 workspace build、架构与 Script/Route/Asset 性能门全部通过。
- Editor production build：CSS `111.08 kB / gzip 20.48 kB`，JS `918.23 kB / gzip 256.59 kB`；构建通过，既有 `>500 kB` 分包债未关闭。
- 本分支远端 Windows / Node 22 结果在提交后回填；未回填前不写成远端通过。

## 5. N43 Engineering 出口矩阵

| 出口项 | 当前证据 | 判定 |
|---|---|---|
| 统一 stable-ID context 与保存重开 | E1b 真实 Chrome 通过 | PASS |
| Beginner/Pro 可逆渐进披露 | E2 真实 Chrome 通过 | PASS |
| Motion/State、减少动效、帧预算 | E3 工程与真实页面通过；OS/设备待产品验收 | Engineering PASS |
| 键盘/触屏替代与 `≤500ms` 同步 | E4 共同契约、真实同步与移动触控修正通过 | Engineering PASS |
| 七模式均有真实创作任务 | Writer/Director/Flow/Quick Start 可用；Production/Debug & QA/Mobile Focus disabled，仍为 `4/7` | **FAIL** |
| AC-03/04/10/11/12 桌面产品验收 | 自动化和浏览器工程证据存在；无合格真人 | **FAIL** |
| main 集成与商业发布 | 堆叠 Draft PR，未合入 main；Player/Android/发布缺失 | **FAIL** |

因此 E4 不是 N43 总出口。此前“E4 后退出 N43”的文字与七模式 Goal 冲突，现纠正为：**不能用共同交互切片掩盖 3 个禁用模式。**

## 6. 需求对齐与下一步

- `AC-04`：当前对白真实浏览器 Sequence→Script/Preview `26.20ms`，关闭本任务的 Engineering 子门；不外推为任意视图、10k 工程或目标设备全部通过。
- `AC-10`：七类输入等价进入共同契约，移动按钮真实修至 44px；Android 实体触摸/IME 和真人完整任务仍缺。
- `AC-11`：仍为 `4/7`，不得提升状态。
- 没有改变 Canonical、Compiler、Runtime、无账户和 Android M1 范围，也没有新增 Figma 流程。

下一步仍在 N43 授权内，以**真实任务而非模式空壳**逐个关闭剩余模式，顺序冻结为：Production（资源/批量生产任务）→ Debug & QA（诊断/运行任务）→ Mobile Focus（手机专注创作任务），每个模式都必须有 canonical 写入或正式 Runtime 消费、负例、保存重开、真实浏览器和预期—实际差异记录。完成 7/7 后重新执行 N43 出口审计；未经新治理授权不进入 N50。
