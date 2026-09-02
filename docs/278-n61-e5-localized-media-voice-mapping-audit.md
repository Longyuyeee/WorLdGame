# N61-E5 语言媒体与 Voice Asset 映射审计

> 日期：2026-09-02
> 分支：`codex/n60-e1-debugger-session`
> 结论：正式 Web Player 的语言媒体选择、Voice stable-text-ID 映射和缺失资源可见回退已完成
> 下一切片：N61-E6 在 Production 工作区提供语言媒体/配音绑定、状态与批量生产入口；N61 Engineering 与三端 Product Acceptance 尚未关闭

## 1. 用户场景与本次边界

目标用户首先是游玩多语言作品的玩家。玩家在播放中切换语言时，当前对白、背景/立绘/视频以及对应配音应在同一画面即时切换；目标语言资源缺失时，剧情不能推进、重置或损坏存档，而应继续使用工程源语言资源并说明回退数量。

本次只补 Player 表现层缺失链，不改 Story Language、Compiler IR、Runtime State、History 或 Save：

- `localeVariantOf + locale` 把语言图片/视频等资源绑定到剧情指令仍引用的基础 Asset ID；
- `voiceTextId + locale` 把配音绑定到稳定文本 ID，而不是对白数组位置或文件名顺序；
- Host 继续按实际 Asset ID 提供 URL；Player 在当前 locale 下解析资源族，并把选中的视觉资源别名回原基础 ID 供既有 Stage Adapter 消费；
- 只有已经声明语言变体或 Voice 家族的资源才参与缺失计数，普通通用素材不会被误报为缺翻译。

## 2. 预期、初始实际与修正后实际

| 用户动作 | 预期 | 初始实际 | 修正后实际 |
|---|---|---|---|
| 以工程源语言 `en` 开始当前对白 | 基础背景和 `voiceTextId=media_text, locale=en` 的 Voice 同时呈现 | 背景存在，但 Player 完全不查询 Voice 映射；产品红测在英文 Voice 节点处失败 | 基础 PNG 解码成功，`media_voice_en` 为真实 voice bus，媒体回退数 0 |
| 播放中切到 `zh-Hans` | 当前文本、语言场景资源和 Voice 同步切换，不推进剧情 | 只切换文本，背景和音频来源固定 | 文本切为简中，已解码 SVG 场景变体替换背景，Voice 切为 `media_voice_zh`，回退数 0 |
| 再切到没有媒体变体的 `ja` | 日文文本保留，背景与 Voice 回退 `en`，玩家看见原因 | 没有语言媒体模型，也没有媒体回退反馈 | 基础 PNG 和 `media_voice_en` 继续可用，状态显示“ja 缺少 2 个语言资源，已使用 en 资源”；剧情仍停在同一句 |

真实产品红测 `apps/player-shell/src/n61-localized-media-player-shell.test.tsx` 首次为 `0/1`，准确失败于英文 Voice 节点不存在；修正后为 `1/1`。测试启动正式 Player、经过 Compiler/Runtime 到达真实对白，再连续执行 `en → zh-Hans → ja`，核对显示文本、实际 `<img>/<audio>`、voice bus、回退数据和可见恢复，不是孤立函数快照。

## 3. 实现与必要验证

- `player-localized-media.ts`：按 Canonical 元数据和 Host source 解析视觉变体、稳定文本 Voice、源语言回退与不可用状态；
- `PlayerShell.tsx`：先解析语言媒体再复用既有 Stage Adapter；有 Voice mapping 时只替换 voice bus，不影响 BGM/SFX；语言切换重置 Voice timing 状态并公开可观察结果；
- `media-demo.ts` / `?demo=localized-media`：使用真实基础 PNG、真实 WAV 和可解码简中 SVG 建立可重复 production 场景；
- `player-shell.css`：缺失语言资源使用独立状态块，不挤压播放控制。

必要验证结果：

- 新产品路径：`1 file / 1 test`，实现前 `0/1`，修正后 `1/1`；
- 受影响 Player/Localization 回归：`5 files / 61 tests`；
- Player TypeScript / production build：PASS；
- 1280×720 真实浏览器：英文 PNG `naturalWidth=16`、Voice `readyState=4`；简中 SVG 已解码、Voice `readyState=4`；日语回退数 `2`、不可用数 `0`，回退提示可见且与播放控制不相交。

没有补做与本切片无关的全仓测试。N61-E4 的 390×844 实际断行证据仍受当前浏览器视口能力限制，继续诚实保留；它不是阻止独立 E5 玩家功能向前推进的理由。

## 4. 目标审计、需求对齐与接续点

本切片直接落实 PRD 3.9 的“每种语言独立语音/图片/视频”和 Delivery Plan 的 Voice Asset 映射，且坚持 stable text ID，不产生第二套剧情状态。功能语义没有偏向验证、安全或治理工作；测试数量只覆盖本次真实用户路径和原有 Player 媒体回归。

仍不能把 N61 登记为完成：当前创作者还不能在 Production UI 中为某个基础资源或稳定文本 ID 配置各语言文件、查看缺失/草稿/已审状态或批量处理配音。下一唯一开发点是 **N61-E6 Production 语言媒体与配音生产闭环**：

1. 在当前 Production 资源任务中选择稳定文本 ID 或基础媒体，查看各 locale 的绑定与缺失状态；
2. 绑定/替换语言文件后写回同一 Canonical Asset Catalog，保存重开不漂移；
3. 配音脚本、状态和文件继续以 stable text ID 自动匹配，并能从缺失状态直接恢复；
4. 用创作者真实连续路径比较预期、首次实际与修正后实际；只跑受影响测试和可执行的 production 页面验证；
5. E6 完成后再审计 N61 Engineering；Windows/Android 实体 Host 一致性、E4 390×844 复验和真人 Product Acceptance 继续保留为未完成。
