# N61-E6 Production 语言媒体与配音生产闭环审计

> 日期：2026-09-02
> 分支：`codex/n60-e1-debugger-session`
> 结论：创作者已可在正式 Production 工作区按稳定文本 ID 和基础 Asset ID 绑定、审阅并保存各语言配音与图片/视频资源
> 下一切片：N61-E7 贯通“Production 保存的 Canonical → Compiler catalog → 正式 Player”并完成 N61 Engineering 出口复审；不提前进入真人或三端 Product Acceptance

## 1. 用户场景与实现边界

目标用户是把同一作品交付为多语言版本的翻译负责人、配音负责人和资源制作人员。实际入口是项目内容编辑器的 **Production → 语言媒体与配音**：先通过既有资源生产流水线导入真实文件，再选择语言，把音频绑定到稳定文本 ID、把图片或视频绑定到基础 Asset ID，并维护草稿/已审阅/已锁定状态。文件暂缺或旧绑定已经不在 Asset Index 时，页面必须显示缺失并允许替换或解除，不能让失效绑定伪装成已审阅。

本切片复用既有 Blob 存储、媒体检查、Asset Index 和 Canonical Project，没有新建第二套上传器、资源表或剧情状态。绑定写回既有 Asset Catalog 元数据：

- 配音：`voiceTextId + locale + localizationStatus`；
- 图片/视频变体：`localeVariantOf + locale + localizationStatus`；
- 只有真实进入 Asset Index 且媒体检查为 PASS 的同类型资源可作为候选；
- 保存继续走现有 Project Service/Canonical 保存链，重开后从同一 Canonical 恢复。

## 2. 预期、初始实际与修正后实际

| 用户动作 | 预期 | 初始实际 | 修正后实际 |
|---|---|---|---|
| 导入中英文 PNG 与 WAV 后进入 Production | 有面向语言媒体和配音的正式入口 | 四个真实文件均成功写入 Blob、完成媒体检查并进入 Asset Index，但页面找不到“语言媒体与配音”；产品红测 `0/1` | 同页出现独立生产区，按语言显示配音/媒体完成数和可用候选 |
| 为 `text_hello` 绑定英文和简中配音 | 以稳定文本 ID 匹配文件，不依赖数组位置或文件名顺序 | 只能在通用资源表查看文件，不能建立 Voice 映射 | `voice_english`/`voice_chinese` 分别写入 `en`/`zh-Hans`，简中状态可改为已审阅 |
| 为 `base_scene` 绑定简中视觉变体 | 选择同类型真实资源并保存 | Production 没有基础资源到 locale 变体的操作 | `chinese_scene` 写入 `localeVariantOf=base_scene, locale=zh-Hans` |
| 保存、释放工程并重开 | 所有绑定和审阅状态仍存在 | 无可保存的绑定 | Canonical 保存回调收到完整元数据；重开后文件选择和已审阅状态恢复 |
| 已绑定文件不再位于 Asset Index | 明确显示缺失，并可替换/解除 | 旧元数据可能仍看似有效 | 状态强制投影为缺失，状态编辑禁用，替换/解除路径保留 |

真实产品测试 `apps/editor/src/n61-localized-media-production-app.test.tsx` 启动完整 `App`，通过真实文件输入依次导入两张 PNG 和两段 WAV，经过 Blob 存储、媒体检查、Asset Index、Production 操作、Canonical 保存、组件卸载和工程重开。它不是只测纯函数或伪造表格状态。

## 3. 实现与最小必要验证

- `apps/editor/src/localization-media-production.ts`：从 Canonical + Asset Index 投影 Voice/视觉生产行，校验语言、稳定文本 ID、同类型资源和检查状态，并以不可变方式绑定、替换或解除元数据；
- `apps/editor/src/ProductionWorkspace.tsx`：增加语言选择、完成数、配音脚本/译文、文件选择、状态、绑定/替换/解除和缺失恢复；
- `apps/editor/src/styles/app.css`：桌面使用生产表格，手机把同一信息转成纵向状态卡，交互保持至少 44px；
- `apps/editor/src/n61-localized-media-production-app.test.tsx`：冻结上述真实用户任务和保存重开结果。

最终必要验证：

- 受影响范围：`5 files / 8 tests`，全部通过；
- Editor TypeScript：通过；
- Editor production build：通过；保留既有主包大于 500 kB 提示，不把本切片扩张为拆包工作；
- 1280×720 production 浏览器：从项目首页打开最近工程，进入内容编辑器和 Production，语言媒体区可见，页面横向 overflow `0`；
- 请求 390×844 后浏览器实际 `375×844`：语言媒体表转为卡片，页面横向 overflow `0`，可见交互最小高度 `44px`，console error/warning `0`。

首次精确 head CI 预期全绿，实际 run `33604602206` / job `100165624881` 在 N51 出口审计失败：状态文档把机器所需的独立 token `N51 Engineering 已关闭` 合并成了“`N51、N52、N60 Engineering 已关闭`”。功能回归在此前均已通过；本轮不改测试和门限，只恢复三个节点各自可机器追踪的明确状态，然后以新 head 重新裁决。

## 4. 开发目标审计与需求对齐

本切片直接补齐 N61-E5 留下的创作者入口，落实 Delivery Plan N61 的 Voice Asset 映射，并覆盖 PRD 3.9 P1 的“每语言语音、字体、图像和视频资源”及“配音台本、录音状态和文件自动匹配”中的当前 Web 创作链。这里的“自动匹配”以稳定文本 ID 建立确定关系；没有用文件名猜测覆盖用户选择，也没有创建第二份手工列表。

目标没有偏移到验证、安全或治理：主要改动是用户可操作的 Production 功能；测试只覆盖真实导入、绑定、保存重开与既有受影响链，安全校验只复用资源流水线现有结果。翻译记忆、术语表、伪本地化和配音供应链仍分别属于 PRD P1/P2 后续能力，不冒充本切片完成。

N61 Engineering **暂不登记关闭**。E1–E6 的两端能力已经具备，但还缺一个真实的跨产品交付证明：E6 创作出的同一 Canonical 映射是否未经手工重写即可被 E5 的 Compiler/Player 消费。三端状态一致属于 Product Acceptance，Windows/Android 正式 Host 尚未完成，不能由 Web 结果替代。

## 5. 唯一接续点：N61-E7

下一步只做一个纵向功能收口：

1. 用 Production 真实导入并保存一组文本、配音和视觉语言映射；
2. 把保存得到的同一 Canonical 直接交给正式 Compiler 和 Player，不手工构造第二份 fixture；
3. 在 Player 切换源语言、目标语言和缺失语言，比较预期与首次实际，修正跨层断点；
4. 同时用现已可调整的移动视口补齐 E4 的 390×844 CJK/Ruby/禁则证据；
5. 逐项复核 N61 Goal/Implementation 后决定 Engineering 是否关闭，再更新文档、提交、推送并核验精确 head CI。

真人测试、Windows/Android 实体 Host 和三端 Product Acceptance 继续等待功能及整体 UI 收束，不在 E7 中扩大范围。
