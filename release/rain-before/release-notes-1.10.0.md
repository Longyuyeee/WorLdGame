# 《雨停之前》1.10.0 内容与演出候选

2026-10-18 当前运行候选见 [#390](../../docs/390-web-voice-reading-continuity.md)：同句读档重新播放当前语音，后台暂停返回保留原播放位置，迟到播放不得突破暂停；可重听或主动选择本次无声阅读，恢复提示避开正文和操作面板。当前 [HTML](../../evidence/web-voice-reading-continuity/before-rain-stops.html)与[网站 ZIP](../../evidence/web-voice-reading-continuity/before-rain-stops-website.zip)已包含最新实现。内容仍 1.10.0／技术 S0.41，不改正式存档或备份格式；源、26 媒体、23 条人工记录及发行条件保持。Windows WebKit 在线 HTTP 网站语音与内嵌 HTML 无声回退分开验证，内嵌音频仍未通过，不宣称 Safari 或离线音频已通过。

保留 [#389](../../docs/389-web-reading-resume.md)的本机段内续读、[#388](../../docs/388-web-long-playback-advance.md)的可取消 Auto／Skip 调度和 [#387](../../docs/387-web-session-input-transport.md)的完整输入传输。段内位置不随备份换机；完整历史、逐次校验、真实时钟和媒体等待保持。各批性能数字只适用于原报告，不宣布所有等待提速。

原 [#386 HTML](../../evidence/web-auto-reading-pages/before-rain-stops.html)与[网站 ZIP](../../evidence/web-auto-reading-pages/before-rain-stops-website.zip)原样保留。其本段翻屏不退出 Auto、手机保存反馈和可选截图不兼容时保护完整进度等修复继续保留，最新实际回归范围见 #390。

保留 [#385](../../docs/385-web-auto-voice-continuity.md) 的语音修复：播放请求直接失败时 Auto 不再卡住，重试／从本次无声阅读恢复后等待新语音自然结束，旧音轨与迟到结果不提前翻句。菜单／后台／主动停止保护保持，不改 Core 或存档协议。#385 [HTML](../../evidence/web-auto-voice-continuity/before-rain-stops.html) 与 [网站 ZIP](../../evidence/web-auto-voice-continuity/before-rain-stops-website.zip) 原样保留。原 #384 的同内容 1.10.0 备份接续不扩大到 1.9.0 剧情迁移；下方为本篇内容校订说明。

2026-10-17。仍为 Web 制作候选，未公开上线或完成发行确认。

- 小夏到来前不再提前显示她的立绘，实际出场与正文对齐。
- “见面前夜”使用现有夜间工作室，次日仍回到白天车站。
- 明确结尾新照片拍的是小夏修好的第一本书，保留共享旧照片的题字与分支记忆。
- 最后选项改为“今晚留下，把回信写完／今晚出发，在路上继续”，路线与结局不变。

九场景、90 段旁白、九句角色对白、两结局；现为 9,753 字符、86 演出、26 项媒体。原 ID／分支目标、配音、全部媒体及来源台账保持。原 19 条与新增 4 条记录共 23 条仍待人工复核，不把已修改标成已验收。

[可编辑工程](../../evidence/web-story-arrival-and-night/before-rain-stops-project.zip)与[校订记录](../../evidence/web-story-arrival-and-night/before-rain-stops.worldreview)仍为 #384 的 1.10.0。内容校订当时的 [HTML](../../evidence/web-story-arrival-and-night/before-rain-stops.html)和[网站 ZIP](../../evidence/web-story-arrival-and-night/before-rain-stops-website.zip)原样保留，当前运行文件见顶部 #390。只有网站包的公开文件用于部署，内部工程／来源／记录不上传。

**不兼容 1.9.0 或更早剧情存档。** 旧玩家保留 [1.9.0 原 HTML](../../evidence/web-version-retention/before-rain-stops.html) 或 [原网站](../../evidence/web-cache-management/before-rain-stops-website.zip) 及进度备份接续。更新后的旧入口依赖同浏览器缓存，不能替代完整原版和换机备份；新旧共用槽位，先备份再继续。保留原版与严格拒绝旧档已在本机 Chromium 实际升级检查，不等于公网或全部设备通过。

81 项相关回归、25 项工具测试、类型／双构建／架构以及作者两路线、独立双格式各一路检查通过，精确范围见 [#384](../../docs/384-web-story-arrival-and-night.md)。26 项素材发行条件、人工定稿／自然听感／阅读计时、物理手机／Safari、长期运行和获准公网仍待验，不宣布 Stable。
