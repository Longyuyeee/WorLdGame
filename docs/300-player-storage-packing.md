# 长历史持久化无损打包

## 实施边界（2026-10-11）

接续 #99：实际检查点通过独立 `readTextIds` 数组保留各时刻状态；常规推进新增数组，JSON 重复不是仅由共享引用造成。Runtime 每次 History 操作完整验证链，保存再次计算 History hash/规范字节，读取执行规范性、结构及 hash 校验。直接改这些数组或全局合并 metadata 会影响旧状态 hash、回退/分支语义；本包不做免校验缓存，也不修改 Runtime v1/v2 存档格式。

本包先治理持久化边界的重复数据：正式槽位与自动恢复统一采用可选 gzip 存储封装，保持调用者取得的 `serializedSessionSave` 字符串及所有旧 hash 逐字节不变。压缩不减少 Runtime 全链验证 CPU，不解决内存中的二次增长；两者继续独立待办，不能宣称整个长历史预算已解决。

## 契约与兼容

- IndexedDB 从版本 3 升到 4，仅增加新记录表示，不清空、不批量改写旧记录。旧 DB1/2/3 与未压缩记录继续读取。旧程序不能打开 DB4；这是明确的降级限制，不能宣传双向兼容。
- 新封装 `world.player-packed-record` v1 包含原记录 metadata（不含 `serializedSessionSave`）、gzip `Uint8Array`、原 UTF-8 字节数及 SHA-256。仅保存大于等于 64 KiB 且压缩确实节约空间的内容；缺少压缩/解压或 digest 能力时新写入维持旧明文表示。
- 压缩在开启读写事务前完成；解压在只读事务结束后完成。槽位与预览仍在同一 strict 事务提交，压缩失败不覆盖旧记录。没有把异步压缩塞进活跃事务。
- 解压前严格检查封装键、版本、长度及压缩数据类型；流式读取限制输出不超过声明长度和 64 MiB，并验证 UTF-8、长度及 SHA-256。拒绝损坏、截断、未来版本、未知字段和膨胀输入，不返回部分存档。不能读取压缩格式时明确失败，不能当成空档。
- 解封装后的记录仍经过原槽位/恢复记录验证，正式 load 仍执行 Runtime 所有校验；封装 digest 不替代剧情权威。
- 同一存储实例的写入按调用顺序串行，不能因压缩异步耗时让较旧位置覆盖较新位置；失败不阻断之后的写入。恢复 clear 与 write 同队列。

换电脑开发须拉取包含 DB4 读取器的代码；数据库是浏览器本机数据，Git 推送不包含玩家存档。不要用清空数据库来规避降级错误，也不要把旧播放器与新版共用测试 profile。需要程序降级时须先保留完整数据库/profile 备份并使用隔离环境；本包不提供 DB4 → DB3 逆迁移。gzip 能力缺失的新写入回退，不等于该环境能读另一环境已打包的记录。

## 验收

覆盖旧 DB 升级/旧记录、完整字符串与 hash、压缩 fallback、损坏与膨胀、写入顺序/失败保旧、槽位预览原子性，以及真实 IndexedDB 12/24 章长故事和冷进程恢复。新证据独立命名，不覆盖 #99 上轮候选。记录实际存储记录载荷和原规范字节，不把压缩率称作堆、主线程或设备预算改善。2026-10-12 完成当前代码 HTML/目录/Windows 三产物功能回归，详细数字见 #99；真实手机/原生通知/两小时和阶段门禁仍保留。

复现入口（浏览器必须串行，且不与宽回归并行做自然运行测量）：

```text
node tools/run-player-packed-budget.mjs
npm run build --workspace @world-studio/editor
npm run build --workspace @world-studio/player-shell
node tools/run-n80-web-export-browser.mjs --player-mixed --session-budget --storage-packed
node tools/run-n80-web-export-browser.mjs --player-mixed --session-extended --storage-packed
node tools/run-n80-web-export-browser.mjs --mixed-publication --packed-publication
npm run audit:goldens
```

浏览器位置通过 `WORLD_STUDIO_BROWSER_PATH` 指定。`player-packed-*` 与旧 `player-session-*`/`player-mixed-publication*` 分开保存，独立 ZIP digest 与正反例门禁防止混用。纯 Core 诊断明确统计不同数组对象及其槽位；它不测 GC 后保留堆，也不是不同实现的交替计时。
