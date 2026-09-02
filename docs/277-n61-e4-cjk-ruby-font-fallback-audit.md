# N61-E4 CJK、Ruby、禁则与字体回退实现审计

> 日期：2026-09-02
> 分支：`codex/n60-e1-debugger-session`
> 结论：功能实现已完成并通过真实 Player React 路径；桌面/390px production 实际断行视觉复验因本机未提供浏览器控制接口而保留为下一次接续首项
> 下一切片：先补同一 production demo 的双视口视觉证据，再进入 N61-E5 语言专属媒体与 Voice Asset 映射

## 1. 用户场景与范围

目标用户是播放中日韩作品的玩家。入口是正式 Web Player；玩家进入长文本对白或旁白后，应直接看到语义化 Ruby 注音，长句按当前语言进行严格 CJK 换行，项目指定字体不可加载时仍能继续阅读并知道已经回退。失败恢复不要求玩家重启、改设置或重新载入剧情。

本切片使用 Story Language 已经往返保存的 `｜基底《注音》` 写法，只在 Player 显示层解释为 `<ruby>/<rt>`；原文本、稳定 `textId`、Compiler IR、Runtime State、History 和 Session Save 均不改写。字体选择复用 Canonical Asset：`kind=font` 的条目可用 `locale`/`locales` 声明适用语言、用 `fontFamily` 声明展示名，并由 Host 提供同 ID 的字体 URL。无匹配字体直接使用语言字体栈；匹配字体加载失败则显示回退状态。

## 2. 预期、初始实际与修正后实际

| 场景 | 预期 | 初始实际 | 修正后实际 |
|---|---|---|---|
| 日文长旁白包含 `｜放送室《ほうそうしつ》` | 基底与注音是可访问的 Ruby 结构 | 整段作为普通字符串，Ruby 标记原样暴露 | `<ruby lang="ja">` 与 `<rt>` 正式渲染，畸形/非 Ruby 文本仍按原文显示 |
| 日文长文本在 Player 文本框阅读 | 使用语言标记和严格 CJK 行首/行尾禁则，紧急长串不得横向撑破 | 无 `lang`，仅通用 `overflow-wrap:anywhere` | 正文、Choice、Ending、History 使用 `lang`、`line-break: strict`、`word-break: normal`、Ruby 排版和语言字体栈 |
| 工程日文字体 URL 无效 | 自动回退，剧情不中断，玩家能理解当前状态 | 字体资源未被 Player 消费，也没有失败说明 | `FontFace.load()` 失败后继续使用日文字体栈，根节点为 `data-player-font=fallback`，播放控制显示“加载失败，已回退” |

产品红测 `apps/player-shell/src/n61-cjk-typography-player-shell.test.tsx` 首次为 `0/1`，准确失败于找不到 `放送室` Ruby 元素；修正后为 `1/1`。这不是字符串快照：测试启动正式 Player、推进到真实 Runtime 旁白，并核对 Ruby DOM、语言排版合同和字体失败后的可见恢复。

## 3. 实现与必要验证

- `player-typography.ts`：安全解析显式 Ruby、选择 zh-Hans/zh-Hant/ja/ko/通用字体栈，并按精确 locale、语言、无范围默认值的顺序解析项目字体；
- `PlayerShell.tsx`：在对白/旁白、Choice、Ending 和 History 复用同一富文本渲染；项目字体异步加载不阻塞剧情，切换语言时重新解析；
- `player-shell.css`：正式文本节点使用严格 CJK 换行、Ruby 对齐/字号和语言字体变量；
- `main.tsx?demo=cjk-typography`：提供真实日文长文本、Ruby 与故障字体的 production 演示入口。

已通过：

- 实现前产品红测：`0/1`；实现后：`1/1`；
- 受影响 Player 回归：`4 files / 60 tests`；
- 根 TypeScript：PASS；
- Player production build：PASS。

没有把当前环境做不到的视觉测量写成通过。production demo 已就绪，但桌面与 390px 浏览器中的实际行首/行尾、文本框高度、横向 overflow 和 Ruby 视觉位置仍需在下一台提供浏览器控制接口的机器上复验；若实际断行与预期不同，应以测得差异调整 CSS，而不是改测试期待。

## 4. 目标审计与需求对齐

本切片直接推进 PRD 3.9 P0 的“CJK 字体、Ruby 与禁则基础”，没有扩张 Runtime schema、没有引入任意 HTML，也没有用额外安全/覆盖率工作拖延玩家功能。`REQ-L10N` 仍为“实现中”：N61-E4 功能代码已落地，但双视口视觉证据未闭合；之后还缺 N61-E5 Voice Asset/语言专属媒体、Windows/Android 正式 Host 一致性和 Product Acceptance。

接续顺序固定为：

1. 打开 `?demo=cjk-typography`，在桌面与 390×844 production 页面测量实际断行、Ruby、文本框和 overflow；
2. 若实际与本文件预期有差异，只修正 Player 排版并回归本切片；
3. 视觉结果闭合后进入 N61-E5 语言专属字体/图像/视频/语音选择与 Voice Asset 映射；
4. 功能与整体 UI 完成前不拉真人计时验收；全部 Product Acceptance、N62、M1 与发布阻断不变。
