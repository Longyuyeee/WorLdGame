# 同步调度批次的历史校验边界

## 实施前约束（2026-10-12）

接续 #300 / `200080a`，对应 #89/#289 的长历史 CPU 治理。实际调用链是 PlayerCore → scheduleRuntimeBatchV1 → runRuntime → commitRuntimeHistoryStepV1。批次入口完整校验一次，原提交函数每个可观察步骤又扫描并哈希全部历史；快进 20 句会重复扫描 20 次增长中的链。

本包仅复用**同一个同步批次**已经成立的链完整性前提。每次公开调度调用仍完整验证输入历史，包括早期检查点、entry、归档和 tombstone。内部追加仍检查新状态、身份、指令计数、历史上限，并生成原样检查点和 entry hash。没有跨调用缓存、信任标志、持久化校验票据或异步窗口；不执行宿主回调。公开 commit API 保留完整校验。内部追加不从 Runtime 包入口导出，不允许其他包调用。

不改变 Runtime/Session Save 格式、规范字节、所有 hash、速度/停止点/未读边界、记录的未来、Back/Forward、Barrier 或 Effect 权威；不裁剪历史，不改变压缩协议，不使用强制 GC。输入遵循既有 Runtime 数据契约，不把可执行 JS getter/proxy 当成可跨信任边界的存档格式。

验收：公开 API 再次调用时篡改旧检查点/entry 必须拒绝；一次批次扫描量应为入口历史加新检查点，而非每句重扫。以固定 `200080a` 对照 120/240/480 历史下 20 句快进，交替采样且逐字节比对保存结果。另以独立文件记录 24 章自然混合媒体及冷恢复，保留不利样本。全链单次验证和已读数组二次增长仍是剩余问题，不能据此宣称手机流畅或 M1 完成。

## 实现和审计约束

- 原提交实现分成公开完整验证入口与包内追加函数，公开导出清单显式列出原有 10 个 History API，内部函数不进入包 API。架构门禁限制 portable 模块只有 history/scheduler 可以引用内部追加函数。
- 新测试用 spy 计数：60 条既有历史 + 20 句快进仅调用 81 次 checkpoint state hash，下一次调用仍扫描其全部 81 个旧检查点再追加 20 个。原路径则会在每次提交重扫；此计数不是 CPU/heap 测量。
- 独立参考路径逐句调用公开 run/commit，与批次路径完整 Session Save 逐字节比较；验证初始输入不变、Back/Forward、未读边界、显式停止点、记录未来拒绝和跨调用四类篡改。
- 审计发现 N52-E5b 旧源码门禁仍在 hash.ts 查已迁往 session-save-bytes.ts 的哈希域，并期待已替换的旧调用写法。修复其实际文件/规范原字节调用检查，未放宽兼容要求；这是此前拆分遗留的门禁漂移，不是哈希协议改变。历史合同中 DB3 描述只属于当时边界，当前运行数据库仍为 #300 的 DB4。

## 复现

独立串行重测结果（Node v22.12.0，两轮热身、七轮交替采样，不强制 GC）：

| 入口历史 | 同批推进 | 原调度中位 ms | 当前中位 ms | 输出历史 | 原规范字节 |
| --- | --- | --- | --- | --- | --- |
| 120 | 20 | 242.64 | 24.91 | 140 | 311,133 |
| 240 | 20 | 724.65 | 65.63 | 260 | 744,273 |
| 480 | 20 | 1,811.50 | 178.74 | 500 | 2,085,753 |

每次对照逐字节检查 Session Save 及 artifact hash，且完整载入后再次保存字节一致。计时仅包含实际 PlayerCore 调度，不包含后续保存/载入验证。新 fixture 在入口之后保留 25 句而非旧预算的 1 句，故不能与 player-session-budget 的 buildId、字节数直接比较；本包比较双方使用同一个输入。480 条下 178.74ms 仍不是单帧预算通过，更不证明媒体/React/手机速度。

24 章自然混合媒体另做跨包身份门禁：与 `player-packed-extended.json` 相比，完整存档原文均为 5,745,500 字节，SHA-256 均为 `9bbcfbad2b574923b8eb36377564b5e60466375e5fc4098c1a419462ecbf51d0`，最终状态 hash 均为 `1ada58f0ca70411b0303c42e273d09e725388b3478a32dbb542acf479cd14a20`。门禁含改动旧证据 digest 后必须失败的反例；不能只拿本轮自洽恢复当跨版本兼容证明。

先结束其他 CPU 重测试，再运行性能采样；首次与宽回归重叠的预算试跑不作为正式数字，使用串行重跑替换本轮预算文件。之前各包证据不覆盖。

```powershell
npx vitest run packages/runtime/src/scheduler-validation.test.ts --maxWorkers=1
npm run test:parallel
npm run audit:n31-runtime
node tools/run-player-scheduler-budget.mjs
$env:WORLD_STUDIO_BROWSER_PATH = 'C:\Users\Administrator\AppData\Local\ms-playwright\chromium_headless_shell-1234\chrome-headless-shell-win64\chrome-headless-shell.exe'
node tools/run-n80-web-export-browser.mjs --player-mixed --session-extended --storage-packed --scheduler-validation
node tools/run-n80-web-export-browser.mjs --mixed-publication --packed-publication --scheduler-publication
npm run audit:goldens
```

浏览器任务串行使用固定端口 5186/19236。Windows 发行测试为隐藏窗口功能回归，不冒充可见窗口帧性能。当前包结果、尚未完成的任务和接续优先级以 #99 最新节为准。

## 本轮遇到的验收失败

首次 24 章运行已输出最后一章 480 条历史，但冷恢复步骤报 `CDP request timed out: Browser.close`，没有产出完整 JSON，不计通过，也不拿该次未落盘的帧数据作结论。原 runner 先等待关闭命令响应，再等进程退出；浏览器关闭调试连接时可能没有返回命令响应，此顺序会误报。

修正 runner 为先监听本轮自建子进程，再发出关闭请求，以**实际正常退出（code 0、无 signal）**作为继续重启的门槛，清理关闭连接的 pending timers；不强杀后冒充正常退出。新增三个测试验证：无响应但真实正常退出可继续；只有响应/只有断连而未退出必须超时失败；提前退出或异常终止不能通过。随后完整重跑，不复用首次未完成的冷恢复证据。
