# N21 真人验收就绪预演审计

> 审计日期：2026-08-15
> 变更前基线：`83ccdd966a85874151c0d14a721093d194a62e34`
> 分支：`agent/n22-stage-media`
> 结论：N21 T02 就绪阻断已修复；N21 真人产品验收仍为 `pending-participant`

## 1. 为什么本轮不能直接登记通过

冻结协议要求参与者未参与实现、不了解 Story Script，并独立操作。AI、开发者或主持人代操作不能替代该证据。本轮因此只执行主持人预演，用于发现真人开始前的产品阻断；结构化记录明确标记 `notHumanAcceptanceEvidence: true`。

## 2. 预演发现

从项目首页新建 `N21 主持人预演`，经结构页进入只有默认结局的空工程 Writer。T01 可完成；T02 选择“对白”后，旧实现生成 `speakerId=character_missing`，权威模型以 `Dialogue references an unknown speaker ID` 拒绝。问题有两层：

1. 产品向模型提交了已知非法引用；
2. 冻结任务只要求“创建对白”，却遗漏数据模型要求的角色前置。

同类假阳性还存在于旧自动化：没有变量或资源时，测试使用 `flag`、`asset_missing` 占位并仍把卡片插入数量视作成功。这不能证明可落地工程。

## 3. 修复与需求对齐

- Writer 在缺角色时禁用对白插入，提示返回项目结构创建角色；
- 缺变量时禁用 `set` / `condition`，缺资源时禁用背景、角色演出和音频插入；
- Ctrl+Enter 与按钮共用同一前置门，不能绕过；
- T02 修订为“创建至少一名角色，并加入至少一条由该角色说出的对白”；
- 自动化只把合法提交计入 revision，并断言不再产生 `asset_missing` 或 `set flag`；
- 协议 Hash 更新为 `21dd1f8bc207545881b5d4ef1e4aae10eae3fb9634b2cf98ad0f6d9e2ef5e093`，pending 证据同步但不填写任何虚假参与者结果。

## 4. 浏览器复验

修复后重开同一空工程，Writer 显示中文前置提示且“＋ 插入”禁用。返回结构页创建角色“小岚”和字符串变量 `route`，保存后重新进入 Writer：

- 对白插入恢复可用；
- 新对白引用真实角色而不是占位 ID；
- 编辑提交到本地事务 revision 2；
- Preview 显示“小岚”和“角色与对白现在引用一致。”；
- 不再出现英文未知角色错误。

记录见 [`evidence/n21/facilitator-rehearsal-2026-08-15.json`](../evidence/n21/facilitator-rehearsal-2026-08-15.json)。

全仓 `npm run check` 通过：常规 94 文件 / 560 项、storage 1 项、VM 重型 5 项，10 workspace 构建、架构门和性能门均通过。Editor bundle 为 610.32 kB（gzip 174.22 kB），超过 500 kB 的既有体积警告仍未关闭。

## 5. 当前 Gate 与下一步

本轮没有合格独立参与者，T03–T08 也没有写入真人结果，因此：

- `evidence/n21/human-validation.json` 保持 `pending-participant`；
- `RA-N21-002` 保持 active；
- N21 Product Acceptance、N23 Acceptance、M1 Stable 与 Public Release 继续阻断；
- 下一步必须由一名合格非程序参与者按 [N21 真人产品验收执行包](114-n21-human-validation-execution-kit.md)完成 T01–T08；失败就登记缺陷并回到修复，不得转向平台功能。

## 6. 验证命令

```bash
npx vitest run apps/editor/src/n21-sequence-app.test.tsx --maxWorkers=1
npm run audit:n21-human-validation
npm run check
git diff --check
```
