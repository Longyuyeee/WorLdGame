# N51-E2 暂停、开发审计与后续步骤检查点

> 日期：2026-08-27
> 暂停分支：`codex/n51-e2-settings-catalog-editor`
> 功能实现提交：`e4fa4b5`
> 直接基线：N51-E1 最终绿色头 `c2257e4`
> Draft PR：[#92](https://github.com/Longyuyeee/WorLdGame/pull/92)
> 授权边界：`RA-N21-010` 只允许 N51 Engineering；N52、M1 Stable 与 Public Release 均未准入

## 1. 暂停结论

当前可以安全暂停和换电脑。N51-E1 typed settings core 与 N51-E2 catalog/editing service 已完成 Engineering 闭环；实现头 `e4fa4b5` 的本地完整门和 GitHub Windows / Node 22 完整门均绿色。代码、测试、需求矩阵和审计结论已经进入 Git，不依赖当前电脑上的未提交源码或私有构建产物。

开发方向没有替换性偏移：仍面向 Windows/Android 创作和 Windows/Web/Android 发布的商业级 Galgame 编辑器；现代、极简、多彩、强动效但表达清晰的 UI，图形化编辑、专业脚本/时间线、16:9 默认 Preview、路线图、Gallery、压缩与稳定性优化仍在权威计划中。本阶段有意先建立设置的 portable 领域边界，因此 **E2 没有产品 UI**，不能把后端能力误报为用户已经可见。

## 2. 当前已完成能力

### N51-E1

- dependency-free `@world-studio/gal-settings` typed core；
- 23 个首批设置字段；
- default → project → Windows/Web/Android platform 继承和逐字段来源；
- 当前层 reset、严格解析、非法组合拒绝和确定性序列化；
- E1 Draft PR #91 同头远端完整门绿色。

### N51-E2

- runtime-frozen 23 项双语 catalog，Basic `16`、Advanced `23`；
- NFKC、英文大小写、简中/英文、多词 AND、稳定排序搜索；
- parser 与 control 共用数值/枚举约束，减少 UI/校验漂移；
- project 或单 platform 的 typed set/reset 原子事务；
- 关联字段批量最终校验、重复/未知/越界/额外字段 fail closed；
- no-op 抑制，以及三个平台 before/after value/source 差分；
- 输入文档不可变。

本轮真实修正不是只补成功样例：

1. architecture 首跑把英文自然语言 `window.` 识别为 DOM global；文案改为 `message panel`，规则和门限未放宽；
2. 审计发现非类型宿主可传入多余字段并被静默忽略；为 search options、layer 和 edit command 增加 unknown-key 拒绝，专门门从 `23/23` 增至 `24/24`。

## 3. 可迁移证据

- 本机最终完整门：普通回归 `144 files / 832 tests`、N51 `24/24`；最终代码完整门执行到末项并退出；
- 本机证据复核：portable 架构 `99` files、Script `13/13`、Route `9/9` 且 P95 `223.74 ms < 500 ms`、Asset `4/4` 且 Dicing `3458.41 ms < 5000 ms`；
- GitHub 实现头 run `33058884556` / job `98472432704`：Windows / Node 22 用时 `11m28s`，普通回归 `144/832`、N51 `24/24`、VM corpus `66.876 s < 90 s`、Route P95 `134.46 ms < 500 ms`、Asset Dicing `3374.89 ms < 5000 ms`；
- 详细证据：[N51-E1 审计](222-n51-e1-typed-gal-settings-core-audit.md)、[N51-E2 审计](223-n51-e2-settings-catalog-editor-audit.md)、[当前状态审计](99-current-development-status-audit.md)。

无需迁移 `node_modules`、workspace build 输出、临时目录或浏览器缓存。换电脑后只需从 GitHub 取得分支和锁文件并重新执行门禁。GitHub Actions 日志是跨电脑的主要物理证据；本机精确计时只作为补充，不覆盖远端同头数据。

## 4. 尚未完成，禁止误报

- settings 尚未接入 Canonical Project 文件与 Project Service 保存链；
- 尚无正式 settings undo/redo ChangeSet；
- 尚无 Settings 产品 UI、继承来源展示、恢复默认交互或 platform selector；
- 尚无 Preview/Player 热应用和桌面/390×844 production-browser 操作证据；
- 23 字段只是首批核心，不等于 REQ-GAL 全部 P0；Auto/Skip/Save/History/Back/Forward 的玩家行为仍唯一归属 N52；
- N51 Product Acceptance、真人测试、Android 实体设备、Windows/Android 正式包、M1 Stable 和公开发布均未完成；
- 当前仍是 `0.0.0-s0.41` 工程阶段，不是可发布第一版。

## 5. 后续冻结顺序

### N51-E3：Canonical Project settings 与正式撤销事务

目标：让 typed settings 成为 Canonical Project 的版本化正式文件，并通过现有 Project Service/ChangeSet 保存与撤销，而不是建立旁路存储。

实施边界：

1. 冻结文件路径、schema version、缺文件默认行为和 future schema fail-closed 策略；
2. Project Service 读取、写入和保存 round-trip 使用同一 parser/serializer；
3. settings edit 生成正式 ChangeSet，支持 undo/redo、revision 冲突拒绝和重新打开；
4. Web/Node workspace 使用真实临时工程或受管 workspace 验证，不使用内存假持久化代替保存证据；
5. 不在 E3 提前制作 UI、Preview 热应用或 N52 玩家行为。

真实测试必须先写预期，再记录实际并修正：

| 场景 | 冻结预期 | 必须记录的实际差异 |
|---|---|---|
| 无 settings 的旧工程 | 读为 v1 defaults，首次保存产生确定性正式文件 | 路径、文件字节、revision、读取次数 |
| project/platform 批量编辑 | 一次 ChangeSet 原子保存，关闭重开后 resolved value/source 不变 | 保存前后 Hash 与三个平台来源 |
| undo/redo | undo 恢复精确旧文件，redo 恢复精确新文件 | 文件字节、revision、ChangeSet ID |
| 并发 revision | 过期编辑 fail closed，不覆盖较新设置 | 错误 code、磁盘最终字节 |
| 损坏/future schema | 明确诊断且不静默重写 | 诊断 path/code、源文件保持不变 |

E3 退出条件：专门正反例、真实 workspace 保存/重开、类型/架构/需求门、全仓 `npm run check`、同头 GitHub Windows / Node 22 完整门、审计文档和推送全部完成。

### N51-E4：现代化 Settings UI

在 E3 持久化事务稳定后，使用现有代码内设计系统实现，不使用 Figma。UI 必须具备 Basic/Advanced、搜索/分区、Windows/Web/Android selector、继承来源、修改态、恢复默认、批量关联字段错误和清晰的保存/撤销反馈。保持现代、极简、多彩、平滑过渡，不继续“摊大饼”；优先任务分层和渐进披露。

真实测试必须通过冷 production build 操作桌面和 390×844 手机视口，记录预期与实际的尺寸、overflow、44/48px 触控、键盘路径、焦点、reduce-motion、console、保存重开和截图差异。右侧 Preview 默认保持 16:9，其他尺寸必须显式可调。

### N51-E5：Preview/Player 热应用

将已提交设置应用到正式 Preview/Player adapter；验证显示、文本、推进、六音量与输入设置的实际效果、恢复默认和平台差异。不能新建平行 Runtime。桌面/手机 production-browser 比较设置前后可观察值，并为无法在浏览器证明的 Windows/Android 宿主能力保留阻断。

### N51-E6：完整 P0 覆盖与出口审计

依据 REQ-GAL/AC-19 补齐仍属于 N51 的配置字段和模板，逐字段建立 catalog → parser → Project → UI → Preview/Player 追踪。N52 的 Save/History/Auto/Skip/Back/Forward 执行策略不得回流 N51。最后重新审计字段覆盖、三平台 Profile、性能、可访问性和产品验收阻断，只有全部 Engineering 证据满足时才关闭 N51 Engineering。

## 6. 换电脑恢复步骤

1. `git fetch origin --prune`；
2. `git switch codex/n51-e2-settings-catalog-editor`；
3. `git pull --ff-only`，确认工作树 clean，并确认本文件、#92 和最新远端提交一致；
4. 使用锁文件安装依赖；不要复制旧 `node_modules`；
5. 先跑 `npm run audit:n51-gal-settings`、`npm run typecheck`、`npm run audit:architecture`；
6. 开始 E3 前从当前最终头创建 `codex/n51-e3-project-settings-transaction`，其 PR 直接 base 到 E2 分支；
7. E3 每个实现切片继续执行：冻结预期 → 真实正反例 → 记录实际 → 修正差异 → 文档/矩阵 → 完整门 → 推送 → 远端同头门。

若 #92 最终文档头的 CI 尚在运行，先等待并记录结果；不得因为实现头已绿而把不同提交的状态混为同头。真人无法参与测试这一事实继续保持 `pending-participant`，自动化不得冒充真人通过。
