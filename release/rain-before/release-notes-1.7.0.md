# 《雨停之前》1.7.0 对白节拍与配音演出候选

2026-10-16（接续 10 月 15 日的内容校订）。基于 1.6.0 的完整九场景工程，通过编辑器制作、保存重开及双格式导出。仍不是 Stable、已公开上线或许可完成声明。

## 本版变化

- 九段旁白改为可见动作和对应回应，减少旁白先说一遍、对白再重复一遍的情况。
- 七组“配音播放—角色对白—停止”整体移动到实际说话时机，另外两组保留合理原位。登车前、看画时的对白不再在睡下或夜归之后出现。
- “留下”台词和实际语音一起修正为“出发的事明早确认，今晚的回信不用再等。”，与退掉次晨车票、之后远程合作的安排一致。系统 TTS 原音保留，新文件单独生成。
- 明确未来到岗行程，叮嘱后小夏退场，不在跨日蒙太奇中持续站立。
- 修复纸色主题说话人漏挂样式标记的问题，恢复已有深色人名规则；不更改作者主题、画幅或人物构图。

九场景、90 段旁白+9 句对白、两个结局、9,672 字符、74 步演出、25 项素材。全部既有稳定 ID 和 24 份未改媒体保持；仅新增一步退场和替换一份配音，不是全篇配音或新路线扩写。

## 交付

| 资料 | 位置 |
| --- | --- |
| 可编辑工程 | `evidence/web-story-beats/before-rain-stops-project.zip` |
| 单文件游戏 | `evidence/web-story-beats/before-rain-stops.html` |
| Web 部署目录 ZIP | `evidence/web-story-beats/before-rain-stops-web.zip` |
| 待人工复核的 11 条任务 | `evidence/web-story-beats/before-rain-stops.worldreview` |
| 三产物、媒体与新语音指标 | `evidence/web-story-beats/artifact-audit.json` |
| 制作/玩家实际检查 | `evidence/web-story-beats/authoring-checks.json`、`browser-checks.json` |
| 内容、演出与来源 | `assets/rain-story/editorial-review-v1.7.md`、`source-manifest-v1.7.json` |
| 开发记录与接续 | `docs/337-web-story-dialogue-beats.md` |

HTML 和 HTTP 子目录分别完整到达两结局，每条 60 段旁白/6 句配音；在移位后的对白保存、刷新读取、回想退出恢复及结局清理均检查。390 px 触屏模拟与桌面检查不替代真机或其他浏览器；语音自然结束及 PCM 指标不替代人工听感和全文计时。

## 存档和发布边界

**正文及执行顺序已变，不宣称兼容 1.6.0 或更早旧档。** 从实际 1.6.0 游戏导出的备份在新候选被明确拒绝，标题状态未改变。旧玩家继续使用 `evidence/web-story-refinement` 原版及备份；1.5.4 仍在 `evidence/web-save-backup`。不要覆盖玩家唯一的旧版入口。本版本内保存恢复已验证，不等于旧剧情迁移或完整离线升级链已验。

保留原八条 fixed 任务，新增三条后仍只标记已修改、待人工复核；没有把任何一条转为 verified。自然阅读/TTS 听感、实际计时、最终美术、物理手机/其他引擎、素材许可与实际托管 URL 尚未完成。Microsoft 系统语音的再分发条件待确认；新音频可追溯，不代表自动获得发行许可。未上传公网，不恢复原生平台开发。
