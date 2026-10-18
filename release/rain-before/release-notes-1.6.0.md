# 《雨停之前》1.6.0 时间线与昼夜演出候选

2026-10-15。基于 1.5.4，实际修改完整作品并重新生成可编辑工程、HTML 和 Web 目录包；仍不是 Stable、已公开发行或授权完成声明。

## 本版变化

- 校订 5 段旁白，统一两周试合作、远程安排、退票和之后的见面日期。
- 新增白天站台、白天面馆和夜归画室；修正 5 处白天/夜间仍用错背景的演出，增加下午雨声与回房停止，共 73 步演出/25 项素材。
- 当前编辑器补未保存、草稿和写入中的浏览器离开提醒，成功保存后解除；不会在退出时承诺异步保存完成。
- 原有分支、两结局、全部稳定 ID、22 份原媒体和九句合成语音不变。共 9 场景、90 段旁白+9 句对白、9,662 字符。

## 当前交付

| 资料 | 位置 |
| --- | --- |
| 可编辑工程 | `evidence/web-story-refinement/before-rain-stops-project.zip` |
| 单文件试玩 | `evidence/web-story-refinement/before-rain-stops.html` |
| Web 部署目录 | `evidence/web-story-refinement/before-rain-stops-web.zip` |
| 待人工复核的 8 条校订任务 | `evidence/web-story-refinement/before-rain-stops.worldreview` |
| 三产物及媒体摘要 | `evidence/web-story-refinement/artifact-audit.json` |
| 本批开发记录 | `docs/334-web-story-refinement-and-leave-protection.md` |

工程由真实编辑器保存重开后导出，HTML/目录的 Canonical 剧情一致，全部媒体字节与源工程核对。Chromium 151 本地 HTML/HTTP 子目录分别走完两条路线，每条 6 场景、60 段旁白、6 句语音自然结束；快速保存刷新读取、回想恢复和结局音轨清理通过，5 处新背景均在实际 Player 断言和截图核对。

## 存档与回退

**本版更改正文、素材和演出，未核对为 1.5.x 存档兼容更新。** 实际从原 1.5.4 游戏导出的 `.worldsave` 在 1.6.0 被拒绝，未改动当前标题状态。保留旧版游戏和存档，旧进度使用原版本继续；不把文件备份当成剧情变化迁移。新候选内部的保存刷新读取已经验证。

原 1.5.4 三产物仍在 `evidence/web-save-backup`，1.5.4 的已核对旧档记录只属于其自身，不能转写成 1.6.0 的兼容承诺。生成器/导出器的完整离线升级链本批未重新验收。

## 发行前仍需处理

8 条记录只标记已修改、待复核；人工全文阅读、演出/TTS 听感、实际计时和美术定稿仍未完成。三张新背景使用内置 imagegen，同目录保留提示词、参考图与摘要；生成来源不等于发行授权。Microsoft 系统合成语音及其余素材的对外使用许可仍需确认。

本批没有公网部署、物理手机或其他引擎验收，长篇历史长帧/长期运行/完整全仓检查仍开放。当前手机截图只是 Chromium 390 px 视口，不代表 iPhone Safari 或主流手机普遍兼容。继续优先 Web 作品，不恢复原生平台开发。
