# N61-E1 本地化生产入口与状态闭环审计

> 日期：2026-09-02  
> 节点：N61-E1  
> 工程状态：完成  
> Product Acceptance：未开始  
> 下一切片：N61-E2 CSV/XLSX 翻译往返

## 1. 用户任务与边界

用户是需要把当前剧情交给译者或自行翻译的创作者。入口沿用现有七模式中的 `Production`，不新建第八模式。操作路径为：进入 Production → 设定源语言 → 添加目标语言 → 按稳定文本键填写译文 → 标记草稿/已审阅/已锁定 → 使用现有本地保存。可见反馈包括缺失、草稿、已审阅、已过期、已锁定，以及无效语言代码和重复目标语言提示；源文改变后旧译文显示“已过期”，不会静默冒充可交付译文。

本切片只建立可用的工程内生产闭环，不声称已经完成 CSV/XLSX、运行时切换、Ruby/禁则、字体回退或配音映射。

## 2. 真实代码审计

- Canonical Project 已有 `manifest.defaultLocale`、`localizationPath` 和 `localization.locales`，Project Domain 保存/读取会携带它们；
- N30 Compiler 已把 `project.localization.locales` 写入正式 `catalogs.json`，但此前 Editor 没有本地化产品入口；
- Story 的对白/旁白已有稳定 `textId`，Choice prompt、option 与 ending 已有稳定 statement/option ID；
- 七模式结构已经冻结，Production 负责资源映射和交付生产，故本地化入口落在这里并复用 `App.applyCanonicalProjectMutation` 的 dirty/autosave/manual-save 路径。

文本键规则：对白/旁白使用 `textId`；Choice prompt 和 ending 使用 statement ID；Choice option 使用 option ID。Localization 条目使用 `key` 引用这些现有 ID，不重复声明新的全局实体 ID。

## 3. 预期、首次实际与修正

| 项目 | 预期 | 首次实际 | 修正后实际 |
|---|---|---|---|
| 产品入口 | Production 内可开始本地化 | App 测试 `0/1`，找不到“本地化生产”区域 | Production 显示真实工程文本键和语言生产区 |
| 语言失败恢复 | 非法代码不能污染工程且有解释 | 原入口不存在 | 非法 BCP 47 保持原工程并显示可修正示例；重复语言切换到既有目标 |
| 状态 | 缺失→草稿→已审阅/锁定；源文变化过期 | 无状态产品路径 | 五种状态由当前源文、译文和审阅值共同投影 |
| 持久化 | 保存/关闭/重开保留译文与审阅 | 无产品路径 | Canonical `localization.json` 保留；App 重建后译文仍在 |
| 响应式 | 桌面无溢出；390×844 可操作 | 未知 | 1280 宽 `scrollWidth/clientWidth=1280/1280`；390×844 为 `375/375`，区域 351 px，顶部控件均 44 px |

## 4. 实现结果

- `localization-production.ts` 从真实 Canonical 脚本确定性抽取显示文本并投影目标语言状态；
- Production 支持源语言、目标语言、翻译、审阅、锁定和过期提示；
- 翻译变更通过现有 Canonical mutation 标脏，由相同自动保存/手动保存回路持久化；
- 未建立 React 私有工程、第二份文本 ID 或第二套保存格式；Compiler 继续消费同一 localization 文档。

## 5. 最小必要验证

- 新真实 App 路径：首次 `0/1`，实现后 `1/1`；覆盖 5 个真实文本键、非法语言恢复、目标语言、缺失→已审阅、Canonical 重开、源文变化→已过期；
- 受影响回归：`3 files / 4 tests` 通过，包含既有 Production 真实 PNG 导入、保存、关闭和重开；
- `npm run typecheck`：通过；
- Editor production build：通过，CSS `151.89 kB / gzip 26.64 kB`，JS `1016.17 kB / gzip 283.70 kB`；既有大 chunk 警告未伪装成新通过项；
- production browser：真实示例工程抽取 9 个文本键，非法语言提示、添加 `en`、翻译 `opt_broadcast`、标记已审阅并自动保存；桌面和 390×844 无横向溢出，console error/warning 为 0；
- 风险登记与历史边界审计通过：RA-N21-011 只扩展至 N61 Engineering，N61 Product Acceptance、N62 Engineering、M1 与发布仍阻断。

## 6. 需求对齐与下一接续点

本切片直接推进 PRD 3.9 的源/目标语言、稳定文本 ID 和五种翻译状态，没有把治理或测试数量当作功能完成。尚未完成的 P0 按用户任务排序继续：下一步 N61-E2 做 CSV/XLSX 导出→译者编辑→导入→差异预览/拒绝未知 ID→Canonical 保存的真实往返；随后才做运行时语言切换，再做 CJK/Ruby/禁则与字体回退。配音脚本和语言专属媒体不抢在这些 P0 前面。
