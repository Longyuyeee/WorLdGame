# N52-E3a v2 Save 元数据、截图与手动分页审计

> 日期：2026-08-28  
> 分支：`codex/n52-e3a-save-metadata-preview`  
> 直接基线：N52-E3 入口最终绿色头 `f2cf780` / Draft PR #100  
> 授权：`RA-N21-011`，最大节点 N52  
> 当前判定：N52-E3a Engineering 关闭；实现、本地完整门与实现头 Windows / Node 22 CI 同时绿色。Product Acceptance 持续阻断。

## 1. 开发前实际代码复核

[Gal 基础 2.4](11-gal-foundation-and-automation.md)要求槽位数量、分页、截图、时间、章节、路线、自定义元数据与迁移；[稳定性 7.2](12-size-performance-stability.md)要求迁移失败保留旧存档、原子替换并隔离崩溃恢复区。实现前重新读取 E2 Store、PlayerShell、WebPlayerHost、mount API、Canonical Project 与 N31 Session Save，确认入口审计 #240 的纠偏仍成立：

- E2 是 exact-key `WorldPlayerSaveSlotV1`，只能严格兼容，不能原地扩字段；
- Canonical chapter/scene 是当前唯一正式结构来源；`testRoutes` 不是玩家命名路线，`preservedFields` 不是自定义存档 API；
- Player Stage 是 DOM/媒体组合，Web 层没有可证明完整合成的截图器；截图必须由 Host compositor 提供，不能用开发者截图或占位图冒充；
- Runtime History checkpoint 仍不是永久玩家检查点，crash recovery 仍必须与正式槽位隔离。

## 2. 本切片实现

机器合同位于 `config/n52-e3a-save-metadata-preview.json`，根级 `audit:n52-e3a-save-metadata-preview` 与入口审计共同约束：

1. Save Store 升至 `2.0.0`、IndexedDB version 2，保留 `save-slots`，新增独立 `save-previews` Blob Store；
2. v1 parser 继续 exact-key 严格读取，只在内存归一化为 v2；读操作不改数据库，下一次成功写入才以同事务 copy-on-write 替换旧记录；
3. v2 固定 chapter ID/title、scene ID/title、时间、Build/Runtime/Session Hash，route 固定 `null`、custom metadata 固定空对象；
4. 手动槽从 3 个扩到 12 个，每页 6 个；已有槽首次点击只进入覆盖确认，第二次明确点击才写入；
5. `WorldPlayerPreviewCaptureV1` 把截图所有权交给 `player-host-compositor`，只接受 PNG/WebP、最大 512×512、最大 512 KiB；
6. 合规 Blob 与元数据在同一 strict IndexedDB 事务提交；写入前和读取时均校验 SHA-256，Hash/MIME/尺寸/字节不一致会被拒绝，不能留下或返回半份存档；
7. 捕获未提供、返回空、抛错或不合规时仍提交可加载 v2 Session，并分别记录 unavailable/failed/invalid 原因；
8. `list()` 只读元数据 Store；存档面板打开后，仅对当前可见且声明有截图的槽位按需读取 Blob 并释放 object URL。

WebPlayerHost 默认使用 v2 Store；公开 mount API 可注入同一 Preview Capture 合同。Web Host 当前不自行伪造 compositor，因此默认保存会明确显示“预览不可用”；具备正式合成器的 Windows/Android/Web Build Host 后续可注入真实实现。

## 3. 测试先行与纠偏记录

Store 测试先改为 v2 接口，首次 `vitest` 为 `5/5` FAIL，原因均为 v2 constructor/creator 尚不存在，证明测试确实先于实现。实现后先暴露 fake-indexeddb/jsdom Blob realm 差异，测试改用 Node 标准 Blob 验证真实 structured clone，而未降低产品校验。

Player 测试首次扩展后 `28/30`：一项旧断言仍查 scene ID，但新 UI 按原始需求展示正式 chapter/scene 标题；另一项在 6 个同名保存按钮中使用单元素查询。两处均只纠正测试到新产品语义，随后 Store、PlayerShell 与 mount 定向 `34/34` 通过。覆盖包含：v1 无写读取、成功 copy-on-write、Blob/元数据原子性、超限与不匹配拒绝、12 槽分页、二次覆盖确认、Host 截图成功和捕获失败仍保留有效存档。

## 4. 审计与证据状态

E3a 机器审计首次运行因审计脚本正则中的未转义 `}` 发生语法错误；改成边界切片后，真实代码事实全部通过，只剩本文及 89/90/99 四项预期文档缺口。E3 入口审计也准确指出旧门仍硬编码 Store 1.0/DB1/三个槽位；已纠正为验证历史 v1 parser 仍存在、当前分页符合被冻结的 12/6 策略，而不是要求产品永远停在 E2。

补 SHA-256 前的首次完整 `npm run check` 已单次通过，但提交前需求复审发现入口 #240 明确要求 Blob Hash 篡改拒绝，因此没有使用该绿色结果收口。增加写前/读取时 SHA-256 校验及篡改反例后，定向 Store/PlayerShell/mount 为 `3 files / 35 tests`，最终本地完整门再次从头单次通过：普通回归 `150 files / 905 tests`，N50 `49/49`、N51 `100/100`、N52 `58/58`；Runtime corpus digest 保持 `20e9a842…92ef2`，墙钟 `7.410s`；冻结 VM `24.48s <90s`；17 workspace build、portable architecture `100 / 4` 通过；Route rename P95 `53.92ms <500ms`，lazy structure `246.70ms <500ms`，Asset dicing 总计 `1624.46ms <5000ms`。Player production JS 为 `352.00 kB / gzip 107.20 kB`；Editor 既有 `982.10 kB` chunk warning 未隐藏或放宽。

实现提交 `2f3e7b2` 已推送至 Draft PR #101。同头 Windows / Node 22 `product-baseline` run `33188226007` / job `98906671499` 用时 `13m51s` 绿色，head SHA 精确为 `2f3e7b27e1ad84fbb16be104db431304a07c8e6b`。远端普通回归 `150 files / 905 tests`、N51 `100/100`、N52 `58/58`，E3 入口与 E3a 机器审计 PASS；Runtime corpus `30.995s` 且 digest 未变；Route rename P95 `159.77ms <500ms`；Asset dicing `1479.23 + 1798.70 = 3277.93ms <5000ms`；17 workspace build 与 architecture 均通过。Player production JS `352.01 kB / gzip 107.21 kB`。

以上证据关闭 E3a Engineering，不能外推为真实 Windows/Android compositor、完整 E3 或 N52 Product Acceptance。

## 5. 剩余边界与下一接续点

本切片不实现 auto/quick 执行、永久 checkpoint、crash recovery Store、Migration Museum、云同步、Windows/Android compositor 或 N52 Product Acceptance。E3a 同头 CI 绿色后，下一唯一代码切片为 **N52-E3b**：实现 auto 5 槽环形与 quick 1 槽、写入串行化、同场景合并、失败保留最后有效副本及正式玩家控件；checkpoint/recovery 仍留在 E3c。
