# N52-E5a History 跨层授权与入口合同审计

> 日期：2026-09-01
>
> 分支：`codex/n52-e5a-history-contract-authority`
>
> 直接基线：N52 总出口治理最终头 `ec5daa677472fe62292403b4e2e988fd9e44cc79` / Draft PR #116
>
> 当前判定：**E5a Engineering：完成；E5 功能未实现；N52 Product Acceptance 与 N60 继续阻断。**

## 1. 原始需求与实际代码

[Gal 5.2](11-gal-foundation-and-automation.md)要求改选分支后旧 Forward 分支仍保留在历史记录中供查看、History 可选择某句回退、不可逆原因可见，并由项目策略决定 History 回退后能否 Forward。[N52 总出口治理 #258](258-n52-engineering-exit-and-n60-governance-checkpoint.md)已证明实际代码不满足这些要求。

本步继续核对发现：Runtime History Session 与 Runtime Session Save 都是 strict schema v1，分支改变时只把旧输入写入 `inputTombstones`；Gal Settings strict schema v5 没有 History section；Player Save v3 则只校验 Runtime Session Save 字符串的长度、artifact hash 与加载结果，并不解释内部 schema。由此纠正三个可能偏移：

1. 不能只在 Shell 留一份旧分支数组，否则形成第二套 Runtime History；
2. 不能为了 Runtime Session Save v2 无理由升级 Player Save v3 或 IndexedDB v3；
3. 不能把 History Forward 项目策略塞进 E4d 的 Compiler Stop Point artifact，Shell 已从 Canonical Gal Settings 解析平台值。

## 2. 授权修订

原 RA-N21-011 只允许 N52 消费 N31 History，跨层修改此前仅覆盖 checkpoint 和 Stop Point。产品负责人在收到 #258 明确列出的 E5 Runtime→Core→Shell 范围后，于 2026-09-01 再次要求从该接续点继续，因此登记第三次窄修订：

- Gal Settings 只允许升级到 v6 并增加 `history.allowForwardAfterBack`；v1–v5 严格读取后归一到默认 `true`；
- N31 只允许 Runtime History Session v2 与 Runtime Session Save v2，为被截断 Forward 建立确定性、只读、受界限保护的分支摘要；
- v1 Session Save 必须先按 v1 hash domain 验证，再以内存迁移为 archives 为空的 v2；新写只发 v2；
- Runtime State schema/hash、IR 1.0/1.1、Scheduler、active Back/Forward/Barrier 语义保持不变；
- Player Save v3/DB3 保持不变；归档分支不可导航，只能查看；不得使用 wall clock 或数组位置作为 archive identity。

这份修订不允许 Story Language、Compiler IR、Gallery、N60 或任何 Product Acceptance 工作。

## 3. E5 分片顺序

1. **E5b Runtime branch archive**：History/Session Save v2、v1 dual-read、hash/tamper/bounds/branch 正反例；
2. **E5c Settings + Core**：Gal Settings v6 Forward 策略、只读主线/归档投影、定点回退、Barrier 原因与距离；
3. **E5d Shell**：History 页面、移动入口、选择某句、旧分支与不可逆边界、桌面和 390×844 production；
4. **E5e 总出口复审**：重新对齐 N52 原始 Goal/Implementation，仍缺即 fail closed。

## 4. 本地审计证据

2026-09-01 在本分支执行 `npm run check`，退出码为 0：新增 E5a 机器审计与全部既有治理审计通过；TypeScript、17 个 workspace production build、架构边界均通过；普通回归为 154 files / 967 tests，N50/N51/N52 专项分别为 78/123/90 tests，VM conformance 为 5/5；Script、Route、Asset 性能组分别为 13/13、9/9、4/4，均未放宽预算。首次全门曾因 #90/#99 更新时移除既有 E3c3 审计所需的历史锚点 `RA-N21-011 checkpoint 窄范围修订` 而失败；恢复兼容锚点后，E3c3 定向审计与第二轮完整门均通过。

实现头 `8d2c6d5271ee68ca365d7e13617eb19711727b99` 已推送至 Draft PR [#117](https://github.com/Longyuyeee/WorLdGame/pull/117)。Windows / Node 22 run `33418919492` 的首次 job `99576212493` 在普通回归得到 `153/154 files`、`966/967 tests`：唯一失败是既有 Node Directory cache 用例在累积 I/O 下耗时 `5.824s > 5s`，其余 8 个同文件用例通过；相同代码、命令和原预算本机隔离复跑为 `9/9`、测试体 `656ms`。未修改 Persistence 代码或 timeout，同一 SHA 的完整复跑 job `99579120717` 用时 `13m17s` 全绿：普通 `154/967`，该文件在 N51 聚合/普通回归分别为 `3.874s/2.035s`，Runtime corpus `27.995s` 且 digest 未变，VM `65.19s <90s`，Route P95 `150.15ms <500ms`，Asset dicing/atlas/总计 `1577.39/1939.91/3517.30ms`，build、100 portable / 4 adapters 与其余门全部通过。首轮红灯保留为环境差异审计记录，不被绿色复跑抹除。

证据头 `b153d51` 的 run `33421175931` 又在同一文件、另一条首用例得到 `5.373s >5s`，并在超时后产生 Windows `ENOTEMPTY` 清理竞争；该文件此前已在 #253 出现相同模式，故第二次独立重现后不再归类为单次偶发。本步仅把这个真实磁盘 suite 的局部测试 timeout 明确为 15 秒，并为测试临时目录清理启用 Node `rm` 的 5 次 Windows retry；业务实现、断言、数据规模、全仓默认 5 秒门限与所有性能预算均不变。

稳定性修正头 `f7483a7dcca5a032cfd36d55b2c52483ebfb59ae` 的 Windows / Node 22 run `33422870060` / job `99589275850` 用时 `13m41s` 并全绿。Node Directory suite 在 N51 聚合与普通回归两次均为 `9/9`，分别耗时 `1.859s/11.136s`，没有超时或清理错误；普通回归 `154/967`、Runtime corpus `30.632s` 且 digest 未变、VM `65.87s <90s`、Route P95 `204.28ms <500ms`、Asset dicing/atlas/总计 `1462.47/1778.02/3240.49ms`，17 workspace build、100 portable / 4 adapters 与全部其余门通过。较慢的普通回归执行证明原 5 秒单测默认值不能表达该真实磁盘 suite 的 Windows 全链上限，而 15 秒局部值仍能保留卡死检测。

下一唯一代码切片为 **N52-E5b Runtime branch archive and Session Save v2**。本步机器合同为 `config/n52-e5a-history-contract-authority.json`，审计命令为 `npm run audit:n52-e5a-history-contract-authority`。
