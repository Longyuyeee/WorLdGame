# 《雨停之前》演出素材

项目制作样例素材，2026-10-13。

- `xia-letter.png`：内置 imagegen 生成的小夏立绘，1024×1536；实际检查角落 alpha=0、895,591 个全透明像素，保留原输出透明度。
- `night-cafe.png`：内置 imagegen 生成的雨夜店内背景。
- `coastal-morning.png`：内置 imagegen 生成的雨后海边街道背景。
- `night-travel-theme.wav`：原始旋律和和弦的程序合成背景音乐，32 秒。
- `soft-rain.wav`：固定随机种子的滤波雨声，12 秒。
- `station-chime.wav`：合成提示音，1.5 秒。

音频源脚本：`tools/generate-rain-story-audio.mjs`。文件为单声道 PCM16 / 22,050 Hz。可重新生成；音乐不是录制配音，也不冒充真人演奏。图像未使用外部品牌、角色或其他人的参考图片。已有车站背景继续沿用上一包测试素材，其来源与发布确认另见对应工程说明；本目录不对整个作品素材作统一授权承诺。

## 内置 imagegen 提示词

立绘（transparent_background=true）：

> Use case: stylized-concept. Asset type: production visual-novel transparent character portrait. Create one original young adult woman, Xia, around 24 years old, soft short dark chestnut bob hair and warm brown eyes, cream cardigan over muted dusty-blue dress, holding a small closed letter at chest height. Gentle thoughtful smile, natural anatomy, facing viewer at slight three-quarter angle. High quality hand-painted anime visual novel illustration with clean delicate linework and softly shaded fabric. Tall portrait composition, head through mid-thigh fully visible, empty margins around hair and shoulders. Neutral soft illumination, suitable for rainy evening backgrounds. Actual transparent alpha background, no solid backdrop, no floor, no shadow outside silhouette. Exactly one person; no extra limbs, no lettering, no interface, no logos, no watermarks. This is a reusable in-game foreground standing portrait, not a poster.

背景（transparent_background=false）：

> Use case: stylized-concept. Asset type: visual-novel environment background, wide landscape 16:9. Original hand-painted anime illustration of a small cozy noodle cafe near a quiet railway station on a rainy night. Eye-level view from a booth toward a rain-streaked large window and warm wooden counter; two empty ceramic bowls and cups on a modest table in the foreground, soft amber pendant lights, wet blue street seen outside. Rich atmospheric depth, calm intimate mood for reading a letter, restrained teal-blue and amber palette, detailed but uncluttered. No people; leave visual breathing room in the central foreground for a character overlay and bottom third for a dialogue box. No legible text, no signs with writing, no logos, no watermarks, no interface. Deliver a single polished background illustration, not a collage.

海边背景（transparent_background=false）：

> Use case: stylized-concept. Asset type: visual-novel environment background, wide landscape 16:9. Original hand-painted anime illustration of a quiet coastal town in the morning after rain. Eye-level view from a sheltered street toward a calm silver-blue sea, a small rail-side road and modest pale buildings, wet paving reflecting soft early light, clouds opening gradually. Gentle hopeful mood, restrained blue-gray and warm cream palette, detailed but uncluttered. No people; leave breathing room in central foreground for a character overlay and bottom third for a dialogue box. No legible text, no logos, no watermarks, no interface. Single polished game background, not a collage.
