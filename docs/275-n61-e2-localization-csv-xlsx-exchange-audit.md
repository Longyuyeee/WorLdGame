# N61-E2 CSV/XLSX 翻译交换审计

> 日期：2026-09-02
> 节点：N61-E2
> 工程状态：完成
> Product Acceptance：未开始
> 下一切片：N61-E3 Runtime 语言选择与切换

## 1. 用户场景与完成边界

翻译人员或创作者在 `Production → 本地化生产` 选择目标语言后，导出带稳定文本键和当前源文的 CSV/XLSX，在外部表格工具中编辑译文，再导入同一目标语言。系统先显示更新/不变/错误差异，不在选中文件时立即覆盖工程；只有零错误且确有变化时才能确认写入。重复键、未知键、目标语言不符、源文已变化、错误表头和非法状态都会阻止整批写入，用户可重新导出后修正。

本切片不声明 Runtime 已可切换语言，也不提前实现 Ruby/禁则、字体回退、配音或 Product Acceptance。

## 2. 真实实现

- CSV 使用固定九列表头：`key, source_locale, target_locale, source_text, translation, status, scene_id, statement_id, kind`；编码支持 BOM、逗号、双引号和单元格换行；
- XLSX 使用真实工作簿读写，不把伪 CSV 改扩展名；库通过动态 import 形成独立按需块；
- 导出直接取当前 Canonical localization 与脚本源文；导入差异也与当前 Canonical 投影比较；
- `missing` 空白模板可原样往返；已有译文、审阅/锁定状态按差异更新；源文快照不一致时 fail closed；
- 确认写入复用 `updateLocalizationTranslation`，继续进入既有 dirty/autosave/manual-save 路径，不建立第二份翻译存储。

## 3. 预期—首次实际—修正后实际

| 场景 | 预期 | 首次实际 | 修正后实际 |
|---|---|---|---|
| 文件交换入口 | 可导出 CSV/XLSX，并能选择两种文件导入 | 新 App 场景 `1/2`，明确失败于找不到“导入 CSV 或 XLSX” | Production 出现三个真实入口，两种导出均有完成反馈 |
| 导入前保护 | 重复稳定键整批阻断，合法 XLSX 先预览后确认 | 无导入产品路径 | 重复 CSV 显示错误且“确认写入 0 项”禁用；真实 XLSX 显示 `1 更新 / 0 不变 / 0 错误` |
| 文件读取兼容 | 同一浏览器 API 可被产品和测试使用 | 首次实现后测试环境实际报 `file.text is not a function` | 改用标准 `FileReader` 后同一真实文件路径通过 |
| 内容完整性 | 逗号、引号、换行和稳定键往返不变 | 未知 | CSV 与真实 XLSX 双格式 round-trip 精确相等；确认后换行译文重开仍在 |
| 窄屏操作 | 390px 可完成交换且无页面横向溢出 | 未知 | production browser 实测 body `375 ≤ 390`、本地化区域 `349/349`，三个交换控件均 44px |

## 4. 最小必要验证

- App 真实路径：`2 tests`，覆盖重复 CSV 阻断、真实 XLSX 文件导入、差异预览、显式确认、Canonical 重开；
- 格式 round-trip：`1 test`，CSV/XLSX 均保留逗号、引号和单元格换行；
- 定向合计：`2 files / 3 tests` 通过；
- `npm run typecheck` 通过；Editor production build 通过；XLSX 独立 lazy chunk `420.94 kB / gzip 140.54 kB`，主 JS `1023.46 kB / gzip 286.27 kB`；既有主 chunk 警告未伪装为新通过项；
- production browser：真实示例工程创建 `en` 后可见三入口；CSV/XLSX 导出反馈均成功；390×844 无横向溢出且新增控件均 44px。

## 5. 开发目标审计与下一接续点

N61-E2 完整交付了“交给译者—外部编辑—安全预览—写回工程”的用户纵向任务，没有用覆盖率、安全扩张或真人计时代替功能。REQ-L10N 仍为“实现中”：下一步 N61-E3 从正式 Player/Runtime 消费 Compiler 已生成的 localization catalog，提供项目默认语言和运行时语言选择、缺失译文回退及保存重开；随后才处理 CJK/Ruby/禁则和字体回退。N61 Product Acceptance、N62 Engineering、M1 与发布继续阻断。
