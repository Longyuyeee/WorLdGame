# 《雨停之前》演出素材

项目制作样例素材，2026-10-13。

## 当前 1.7.0 配音修订

2026-10-15，`voice-04-v1.7.wav` 替换当前工程的 `voice_04`，改为“出发的事明早确认，今晚的回信不用再等。”；不覆盖旧 `voice-04.wav`。其余 24 份媒体和所有图片不变。九段旁白及七组配音位置随实际剧情一起校订，详见 [editorial-review-v1.7.md](editorial-review-v1.7.md) / [editorial-v1.7.mjs](editorial-v1.7.mjs)。

台词/声线、生成方法及未验收边界在 [voice-revision-v1.7.json](voice-revision-v1.7.json)，技术指标及新旧摘要在 [source-manifest-v1.7.json](source-manifest-v1.7.json)。生成脚本 `tools/generate-rain-story-voice-v1.7.ps1` 本机使用 PowerShell 7.6.5 和 Microsoft Kangkang，UTF-8 读取台词 JSON；不同宿主需先确认对应声线可用。仍为系统合成语音，不是人工录音；自然听感与再分发许可保持待复核。当前工程与双游戏产物在 `evidence/web-story-beats`；下方为历史制作记录。

## 1.6.0 昼夜变体

2026-10-15 使用内置 imagegen 的光照/天气编辑生成三张背景，保留原图，未用 CLI、外部下载或代码调色替代。实际游戏仍使用工程等比画幅。生成式编辑保持地点和构图意图，不承诺逐像素几何一致；最终美术和发行许可仍待确认。

| 新素材 | 编辑参考 | 用途 |
| --- | --- | --- |
| [station-day.png](station-day.png) | `station-night-v2.png` | 白天到站、重逢 |
| [day-cafe.png](day-cafe.png) | `night-cafe.png` | 早餐和下午店内 |
| [night-studio.png](night-studio.png) | `morning-studio.png` | 晚间回房 |

三张均为 1672×941 PNG。完整最终提示词在 [image-prompts-v1.6.json](image-prompts-v1.6.json)，新旧文件的 SHA-256 和字节数在 [source-manifest-v1.6.json](source-manifest-v1.6.json)。演出绑定与剧情修订见 [editorial-review-v1.6.md](editorial-review-v1.6.md)。下方为历史素材来源。

- `xia-letter.png`：内置 imagegen 生成的小夏立绘，1024×1536；实际检查角落 alpha=0、895,591 个全透明像素，保留原输出透明度。
- `night-cafe.png`：内置 imagegen 生成的雨夜店内背景。
- `coastal-morning.png`：内置 imagegen 生成的雨后海边街道背景。
- `night-travel-theme.wav`：原始旋律和和弦的程序合成背景音乐，32 秒。
- `soft-rain.wav`：固定随机种子的滤波雨声，12 秒。
- `station-chime.wav`：合成提示音，1.5 秒。

音频源脚本：`tools/generate-rain-story-audio.mjs`。文件为单声道 PCM16 / 22,050 Hz。可重新生成；音乐不是录制配音，也不冒充真人演奏。图像未使用外部品牌、角色或其他人的参考图片。1.2.0 工程沿用了车站测试背景；1.3.0 通过资源替换更新为下述新站台图，保留其稳定资源 ID。本目录不对整个作品素材作统一授权承诺。

## 1.3.0 演出与展示素材

以下六图均通过 **内置 imagegen** 生成/编辑，未走 CLI 或外部下载；完整提示词、透明参数和参考路径见 [image-prompts-v1.3.json](image-prompts-v1.3.json)。保存原始输出，不做背景抠图或重绘后冒充原输出。

| 文件 | 用途 | 实际规格 |
| --- | --- | --- |
| `station-night-v2.png` | 雨夜站台、标题封面，替换测试背景 | 1672×941，不透明 |
| `waiting-room.png` | 候车室读信 | 1672×941，不透明 |
| `night-train.png` | 远行列车内部 | 1672×941，不透明 |
| `morning-studio.png` | 新住处/画室及结尾 | 1672×941，不透明 |
| `xia-thoughtful.png` | 小夏认真倾听，参考原 `xia-letter.png` | 1024×1536，角落 alpha=0、893,193 个全透明像素 |
| `xia-smile.png` | 小夏安心微笑，同一参考立绘 | 1024×1536，角落 alpha=0、897,932 个全透明像素 |

表情变体保持主要身份、衣着和构图，但生成式编辑不承诺逐像素一致；细微姿态/边缘差异和立绘自然度仍需人工美术复核。图像没有指定外部人物、品牌或 IP 参考。生成来源明确不等于最终发行许可已审清。

`letter-icon.svg` 是原创代码绘制的雨滴/信封图标，`letter-icon.png` 是通过 `tools/create-rain-story-icon.mjs` 栅格化的 512×512 PNG。不是 AI 生成位图；可以从 SVG 重生成。

`voice-01.wav`–`voice-09.wav` 是 Windows **System.Speech 合成语音样片**：林远采用 Microsoft Kangkang，小夏采用 Microsoft Huihui，速率 -1，单声道 PCM16 / 22,050 Hz。准确台词/声线见 `voice-lines.json`；生成脚本 `tools/generate-rain-story-voice.ps1` 需要本机安装相同声线。只覆盖九句角色对白，不是九十段旁白配音、真人录音或全篇配音。音轨在对应台词前播放、台词后停止；推进遵循工程的“等待语音结束”设置，当前默认开启，不能将这里旧有的“不强制听完”表述作为实际行为承诺。

来源与发行状态：系统 TTS 声线/输出的再分发条件尚未确认；公网前应核实授权或换成有明确授权的录制/合成素材。全部图片、音乐、文本和图标也需由项目所有者完成最终来源确认与展示声明，不能因使用内部工具就统一标记授权通过。未提供真人演出者，也不声明任何真人声音授权。

机器检查入口：`node tools/audit-rain-story-assets.mjs`，可设置 `STUDIO_CHROME` 为已安装 Chromium。16 项新源素材的字节、SHA-256、尺寸/透明度及 WAV 时长/RMS 见 [source-manifest-v1.3.json](source-manifest-v1.3.json)。该报告只检查技术可用性，`legalReviewPassed` 和 `releasePermissionConfirmed` 保持 false；与正式工程素材 digest 的对应检查见 `evidence/web-story-direction`。

## 内置 imagegen 提示词

立绘（transparent_background=true）：

> Use case: stylized-concept. Asset type: production visual-novel transparent character portrait. Create one original young adult woman, Xia, around 24 years old, soft short dark chestnut bob hair and warm brown eyes, cream cardigan over muted dusty-blue dress, holding a small closed letter at chest height. Gentle thoughtful smile, natural anatomy, facing viewer at slight three-quarter angle. High quality hand-painted anime visual novel illustration with clean delicate linework and softly shaded fabric. Tall portrait composition, head through mid-thigh fully visible, empty margins around hair and shoulders. Neutral soft illumination, suitable for rainy evening backgrounds. Actual transparent alpha background, no solid backdrop, no floor, no shadow outside silhouette. Exactly one person; no extra limbs, no lettering, no interface, no logos, no watermarks. This is a reusable in-game foreground standing portrait, not a poster.

背景（transparent_background=false）：

> Use case: stylized-concept. Asset type: visual-novel environment background, wide landscape 16:9. Original hand-painted anime illustration of a small cozy noodle cafe near a quiet railway station on a rainy night. Eye-level view from a booth toward a rain-streaked large window and warm wooden counter; two empty ceramic bowls and cups on a modest table in the foreground, soft amber pendant lights, wet blue street seen outside. Rich atmospheric depth, calm intimate mood for reading a letter, restrained teal-blue and amber palette, detailed but uncluttered. No people; leave visual breathing room in the central foreground for a character overlay and bottom third for a dialogue box. No legible text, no signs with writing, no logos, no watermarks, no interface. Deliver a single polished background illustration, not a collage.

海边背景（transparent_background=false）：

> Use case: stylized-concept. Asset type: visual-novel environment background, wide landscape 16:9. Original hand-painted anime illustration of a quiet coastal town in the morning after rain. Eye-level view from a sheltered street toward a calm silver-blue sea, a small rail-side road and modest pale buildings, wet paving reflecting soft early light, clouds opening gradually. Gentle hopeful mood, restrained blue-gray and warm cream palette, detailed but uncluttered. No people; leave breathing room in central foreground for a character overlay and bottom third for a dialogue box. No legible text, no logos, no watermarks, no interface. Single polished game background, not a collage.
