# 401 完整路线矩阵与真实导航续读

2026-10-18，接续 [#400](400-web-progress-recovery.md)，补齐 [#304 Web 完整 Gal 交付](304-web-complete-gal-delivery.md)中完整游玩、保存和继续的验收缺口。本批新增可重复的完整作品验证工具与防误报测试，没有发现需要修改剧情或播放器逻辑的新问题。内容仍为 **1.11.0 候选**，技术 **S0.41**，不是新内容版本或最终发行通过。

## 玩家流程与结果

此前完整路线只交叉覆盖 HTML 留下线、离线网站远行线，不能据此判断另外两个组合。本轮在同一冻结游戏上完成四个独立组合，逐项核对原文对应的稳定 ID，而不只判断是否到达任意结局。

| 游戏形式 | 路线 | 正文顺序 | 原生语音结束 | 中断与续读 |
| --- | --- | --- | --- | --- |
| 本地 HTML | 留下 | 66 段 | 6 句 | 离开网页、浏览器后退、明确恢复与读档 |
| 本地 HTML | 远行 | 66 段 | 6 句 | 离开网页、浏览器后退、明确恢复与读档 |
| 网站 ZIP | 留下 | 66 段 | 6 句 | 下载离线内容、断网重载、明确恢复与读档 |
| 网站 ZIP | 远行 | 66 段 | 6 句 | 下载离线内容、断网重载、明确恢复与读档 |

[完整矩阵报告](../evidence/web-work-continuity-matrix/verified-matrix/matrix.json)使用桌面 Chromium、390×844 窗口和真实时钟。两条结局分别为“同行的约定”和“远行的约定”；每个组合的正文、语音关联与顺序均匹配当前工程。语音记录原生 ended 状态、播放终点和时长，第一句 Auto 还记录可信 ended 事件。没有伪造声音结束、修改播放速度或用 Auto 前进代替声音完成。输出静音，因此这些结果不是人工听感或自然阅读全文计时。

每个组合在后段快速保存后重开；HTML 使用真实网页离开／浏览器后退，网站使用实际 Service Worker 离线重载。恢复后重新开启 Auto，在存读档面板里明确选择“读取进度”和快速槽位，读取后 Auto 从 suspended 变为 off，剧情 hash 保持。实际 IndexedDB 只读查询核对原槽位元数据及保存载荷字节摘要不变，没有把恢复点当作正式档覆盖。

## 阅读位置和手机尺寸操作

[Chromium](../evidence/web-work-continuity-matrix/final/chromium-navigation.json)、[Firefox](../evidence/web-work-continuity-matrix/final/firefox-navigation.json)、[Windows WebKit](../evidence/web-work-continuity-matrix/final/webkit-navigation.json)分别对 HTML 和网站做真实离开／后退，共六个流程。玩家先在最大个人字号下滚到当前长段落中部，保存后离开；返回明确恢复，原段、正文、hash、阅读字符锚点和正式存档保持，Auto 不自行开始。

这六次返回均为**重新创建页面**，观察到可信 pageshow 且 persisted=false，再由玩家明确恢复；没有观察到 BFCache 保留原页，不能据此关闭该项验收。没有合成 pagehide／pageshow、正文或几何事件来代替真实导航。

恢复后检查 320×740、568×320、844×390、390×844 的布局切换与菜单返回。仍有未读内容时，原生触摸先翻本段，不误进下一段；已读到段尾时旋转保持段尾，不要求继续保持翻页前的旧锚点。菜单返回保持当前段内位置。已查看实际恢复截图；这些是桌面引擎的手机尺寸检查，不是物理手机的触摸、后台、锁屏或 Safari 验收。

## 测试工具与审计

新增 `tools/run-web-work-continuity-matrix.mjs` 和路线契约模块，区分完整矩阵与三引擎导航任务。工具只读取冻结游戏，校验 HTML／ZIP 长度与摘要、网站 37 文件及每文件摘要；遇到已有报告拒绝覆盖，不重新制作游戏。契约拒绝缺段、重复／错序、错结局、用语音数量冒充原生播放完成，或把重复组合冒充完整矩阵。

[相关功能复验](../evidence/web-work-continuity-matrix/related-tests.json)在浏览器全部关闭后以单 worker、默认限时通过 7 文件／68 项，覆盖正文、段内续读、声音接续、标题读档、存读档、Auto 和宿主暂停。[工具测试](../evidence/web-work-continuity-matrix/tool-tests.tap)64 项通过，其中新增 16 项，其余 48 项复验既有素材来源、内容约束和交付工具；重复运行不累计为新增测试。类型检查与架构审计通过，汇总见 [audit.json](../evidence/web-work-continuity-matrix/audit.json)。本批不宣称全仓 check、构建、精确提交 Windows CI 或长期 soak 重新通过。

首次检查保留了两个脚本问题，而不是改记为游戏问题：

- [首次 WebKit 报告](../evidence/web-work-continuity-matrix/webkit-navigation.json)在标题刚出现时过早判断恢复按钮是否可见，随后错误等待剧情自行恢复；[截图](../evidence/web-work-continuity-matrix/webkit-navigation-failure.png)显示真实恢复按钮仍等待玩家决定。脚本改为在标题态等待并明确点击实际恢复入口，三引擎重新验证通过。
- [首次矩阵报告](../evidence/web-work-continuity-matrix/final/matrix.json)进入默认保存面板后，没有先选择“读取进度”就寻找读取槽位动作；[截图](../evidence/web-work-continuity-matrix/final/chromium-matrix-failure.png)显示保存意图仍明确。修正实际操作顺序后，在新目录完整跑完四组合，未更改游戏意图规则、超时或剧情。

初步 Chromium／Firefox 导航报告保留在证据根目录；最终三引擎导航使用 final 目录，完整矩阵使用 verified-matrix 目录。汇总审计只引用最终成功报告，同时保留上述首次失败，避免将脚本修正说成产品修复。

## 交付与未完成范围

本批 `apps`／`packages` 相对 `be2a4f8` 无修改，实际游戏仍使用 #400 的 [HTML](../evidence/web-progress-recovery/before-rain-stops.html)／[网站 ZIP](../evidence/web-progress-recovery/before-rain-stops-website.zip)。HTML 46,790,046 字节，SHA-256 `d63fc9280774f6260ee4a85b6496e08c86666a655f28af7d1b0464015181c864`；ZIP 35,376,495 字节，SHA-256 `f4c11fc1fc754a904069008e3a88b6d988e356d49bf4edea650985ca72aeeaf1`。没有重导出、提升或清理历史游戏，作者保存／重开／双导出的证据仍沿 #400，不当作本批重新完成。

可编辑源和 25 条尚未获人工批准的校订沿 [#394](../evidence/web-story-plans-and-farewell)。九场景、两结局、9,772 字符、87 步演出和全部 26 媒体保持；26 项发行条件 pending、已确认 0，九句系统 TTS 的再分发条件没有因运行成功而获准。

下一批回到完整作品的内容、配音与演出衔接及实际使用障碍；本轮四组合不再作为新功能重复计数。继续跟踪 #400 底层存储／受控时钟等待、长篇成本和冷开设置偶发。Windows WebKit 声音、自然阅读全文／听感／计时、物理主流手机／Safari、真实后台／锁屏与 BFCache、发行依据、获准 HTTPS 部署仍待验，Windows／Android 原生产品化继续搁置。

## 重放

选择一个新的 `STUDIO_WORK_CONTINUITY_OUTPUT_DIRECTORY`，执行 `node tools/run-web-work-continuity-matrix.mjs`；分别增加 `--engine=firefox`／`--engine=webkit` 验证导航，增加 `--matrix` 执行 Chromium 四组合。默认只读 #400 游戏；可以用 `STUDIO_WORK_CONTINUITY_SOURCE_DIRECTORY` 指定含已验证 delivery.json 的游戏目录。网站测试仅绑定本机高位 loopback 端口，完成后关闭自己的监听，不改变现有编辑器服务。

`node tools/audit-web-work-continuity-matrix.mjs` 审计本批冻结证据；新工具契约与拒绝覆盖测试分别在 `tools/web-work-continuity-contract.test.mjs`、`tools/run-web-work-continuity-matrix.test.mjs`。工具不支持将 WebKit 的导航检查宣称为完整音频矩阵。
