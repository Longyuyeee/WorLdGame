# 存档浏览与完整读档分离

## 实施前设计（2026-10-12）

接续 f52bb77 / #301，覆盖 #99 的存读档等待及 metadata-only 待办。实际 PlayerShell 在保存、自动保存、检查点保存后调用 list；IndexedDB list 解压全部工程存档才过滤，readPreview 也解压整个 Session Save。优先消除这段确定的重复工作，暂不改 Runtime 检查点格式或跨调用信任模型；单次全链验证、检查点数组增长仍未关闭。

- DB4 和存档 v1/v2/v3、gzip 包装不变，不新增数据库版本或迁移写入。
- 新增可选 listSummaries，返回不含 serializedSessionSave 的展示类型；Shell 使用新能力，旧适配器保留 list 回退但主动丢弃正文，避免 React 长期持有所有存档正文。
- 浏览验证 metadata 完整字段/版本/身份和包装结构，不解压、不验证正文 digest，不宣称该档已经通过读档验证。真正 read → Runtime load → artifact/state/identity 校验保持完整，损坏正文依然读档失败且不更改游戏状态。
- 只读取目标工程键对应记录，并核对键与记录身份；其他工程的坏档不能阻止当前工程列表。仍不隐藏当前工程坏 metadata。
- readPreview 验证同事务 metadata 与 Blob 类型/大小/digest，不以正文解码作为看截图的前提。预览可展示不等于正文有效。原子写、FIFO、失败保旧不变。
- DB4 没有独立 metadata store，IndexedDB 仍传回目标记录（包括压缩载荷）；不声称零载荷 IO。旧明文也仍从 IDB 传回正文，但摘要不编码/解压它、不保留在 Shell 状态。
- 缩略图切换清除旧图，失败准确提示，不无限显示“正在读取”。验证旧档、无 codec 浏览、坏正文/metadata/预览、跨工程隔离、旧适配器、用户实际读档及多槽长档成本。

## 实施中审计纠偏

最初 Shell 摘要路径测试发现仍有两次全量 list，追到自动保存/检查点保存协调器；两者纳入同一包。自动保存若要跳过新写而复用同场景候选，必须完整 read 那一个候选，坏正文失败、候选消失/变化则继续写；不能凭摘要阻止安全保存。旧适配器保留原完整 list 语义。新增四种候选状态回归，确保不为通过“零解压”指标删掉这项保护。

并发刷新加入代次/工程/store 检查，防止旧响应覆盖新列表或把旧工程错误显示到新工程。缩略图绑定摘要对象，切换立即隐藏旧图、撤销 URL，卸载后的迟到读图结果丢弃。Runtime 文件及 Session Save 格式没有修改。

## 复现与验收范围

先运行 `npm run test:parallel`，结束后设置 `WORLD_STUDIO_BROWSER_PATH` 为可用 Chromium 可执行文件；执行 `node tools/run-n80-web-export-browser.mjs --player-catalog`。固定 f52bb77 适配器对照，18 个实际长档、五轮交替样本、实际 Shell 读档/坏正文拒绝/正常退出后重开读档。证据写入独立 `player-catalog.json` 与截图，不覆盖历史包。

再串行执行 `node tools/run-n80-web-export-browser.mjs --player-mixed --storage-packed --session-extended --save-catalog`，保留独立 24 章混合媒体 `player-catalog-extended` 证据。浏览器任务占用固定端口，禁止并行；自然运行测量期间不并行宽回归。最后 `npm run audit:goldens` 验证目录证据、负向门禁及混合媒体完整性，并与上一包规范正文 digest 对照。

目录基线/当前中位：列表 205.30→3.70ms，18 图 228.20→12.60ms，正文解码 36→0；所有摘要一致。实际损坏读档不改状态，重开后完整 480 条历史。上述不代表实际手机、整体打开帧预算、单档加载、真实作品截图或两小时通过。完整结果与下一包见 #99。

最终 24 章自然混合媒体运行 303.09 秒，480 条历史、241 写/峰值 1，冷恢复与原正文 SHA/state hash 一致，异常为空。最大 rAF 616.6ms 仍是开放问题。宽回归 216 文件/1272 测试、goldens 83 测试/7 工程、Runtime 65 测试和 10,000 seeds/20,000 replays、类型/双构建/相关门禁通过。#99 记录内存和帧样本边界及后续计划；本包未重跑三发行产物或实际设备。
