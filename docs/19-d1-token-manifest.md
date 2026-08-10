# D1 Token 冻结清单

> 状态：Phase 0 已批准的 Phase 1 Foundations 输入真相。
> 边界：这是 Figma 设计规范，不是产品实现文件；D1/S0 未通过且产品负责人未明确发出“开始开发”指令前，不生成产品 Token 代码。

## 1. 审计结论

逐项展开后，D1 应创建 3 个单模式集合、92 个 Variables、10 个 Text Styles 与 4 个 Effect Styles：

| 集合 | 模式 | 数量 | 当前 Figma 断点 |
|---|---|---:|---:|
| `Primitive` | `Default` | 32 | 32 已创建并验证 |
| `Semantic.Dark` | `Dark` | 28 | 0；等待 MCP 额度恢复 |
| `Scale` | `Default` | 32 | 16 已创建；等待补齐 16 |

原计划中的 30 个 Scale 是估算误差：尺寸清单已明确包含模式轨 `56` 与移动底栏 `64`，但初步计数未纳入。此次审计将 Scale 修正为 32，不增加新功能，也不改变批准的视觉方向。

## 2. 代码语法规则

- Primitive WEB：`var(--wg-primitive-{slash-to-kebab})`；
- Primitive Android：`wgPrimitive{SlashToPascal}`；
- Semantic/Scale WEB：`var(--wg-{slash-to-kebab})`；
- Semantic/Scale Android：`wg{SlashToPascal}`；
- WEB 必须包含完整 `var()`；Android 使用 Kotlin/Compose camelCase 名；
- M1 不包含 iOS，因此 D1 不写 iOS syntax；未来加入平台时走独立变更审计。

下表逐项列出展开后的精确 syntax，不允许在 Figma 中临时改名。

## 3. Primitive：32

全部 Primitive 均为 `COLOR`，模式为 `Default`，`scopes=[]`，只允许被 Semantic alias 引用。

| Token | 值 | WEB | Android |
|---|---|---|---|
| `neutral/000` | `#FFFFFF` | `var(--wg-primitive-neutral-000)` | `wgPrimitiveNeutral000` |
| `neutral/050` | `#F4F7FF` | `var(--wg-primitive-neutral-050)` | `wgPrimitiveNeutral050` |
| `neutral/100` | `#E6ECF7` | `var(--wg-primitive-neutral-100)` | `wgPrimitiveNeutral100` |
| `neutral/200` | `#D2DCEB` | `var(--wg-primitive-neutral-200)` | `wgPrimitiveNeutral200` |
| `neutral/300` | `#B2BDD0` | `var(--wg-primitive-neutral-300)` | `wgPrimitiveNeutral300` |
| `neutral/400` | `#96A4BA` | `var(--wg-primitive-neutral-400)` | `wgPrimitiveNeutral400` |
| `neutral/500` | `#78859D` | `var(--wg-primitive-neutral-500)` | `wgPrimitiveNeutral500` |
| `neutral/600` | `#5E6B82` | `var(--wg-primitive-neutral-600)` | `wgPrimitiveNeutral600` |
| `neutral/700` | `#3C4962` | `var(--wg-primitive-neutral-700)` | `wgPrimitiveNeutral700` |
| `neutral/750` | `#273247` | `var(--wg-primitive-neutral-750)` | `wgPrimitiveNeutral750` |
| `neutral/800` | `#202B3D` | `var(--wg-primitive-neutral-800)` | `wgPrimitiveNeutral800` |
| `neutral/850` | `#182131` | `var(--wg-primitive-neutral-850)` | `wgPrimitiveNeutral850` |
| `neutral/900` | `#121824` | `var(--wg-primitive-neutral-900)` | `wgPrimitiveNeutral900` |
| `neutral/950` | `#0D111A` | `var(--wg-primitive-neutral-950)` | `wgPrimitiveNeutral950` |
| `neutral/1000` | `#080A10` | `var(--wg-primitive-neutral-1000)` | `wgPrimitiveNeutral1000` |
| `black/1000` | `#000000` | `var(--wg-primitive-black-1000)` | `wgPrimitiveBlack1000` |
| `violet/500` | `#8B7CFF` | `var(--wg-primitive-violet-500)` | `wgPrimitiveViolet500` |
| `magenta/500` | `#FF62A5` | `var(--wg-primitive-magenta-500)` | `wgPrimitiveMagenta500` |
| `cyan/500` | `#3ED7FF` | `var(--wg-primitive-cyan-500)` | `wgPrimitiveCyan500` |
| `orange/500` | `#FF9B4A` | `var(--wg-primitive-orange-500)` | `wgPrimitiveOrange500` |
| `green/500` | `#55D98A` | `var(--wg-primitive-green-500)` | `wgPrimitiveGreen500` |
| `blue/500` | `#4D91FF` | `var(--wg-primitive-blue-500)` | `wgPrimitiveBlue500` |
| `yellow/500` | `#F0D45C` | `var(--wg-primitive-yellow-500)` | `wgPrimitiveYellow500` |
| `red/500` | `#FF5F72` | `var(--wg-primitive-red-500)` | `wgPrimitiveRed500` |
| `amber/500` | `#FFC557` | `var(--wg-primitive-amber-500)` | `wgPrimitiveAmber500` |
| `mint/500` | `#4ED6A0` | `var(--wg-primitive-mint-500)` | `wgPrimitiveMint500` |
| `violet/160` | `#8B7CFF29` | `var(--wg-primitive-violet-160)` | `wgPrimitiveViolet160` |
| `magenta/160` | `#FF62A529` | `var(--wg-primitive-magenta-160)` | `wgPrimitiveMagenta160` |
| `cyan/160` | `#3ED7FF29` | `var(--wg-primitive-cyan-160)` | `wgPrimitiveCyan160` |
| `black/320` | `#00000052` | `var(--wg-primitive-black-320)` | `wgPrimitiveBlack320` |
| `white/080` | `#FFFFFF14` | `var(--wg-primitive-white-080)` | `wgPrimitiveWhite080` |
| `white/120` | `#FFFFFF1F` | `var(--wg-primitive-white-120)` | `wgPrimitiveWhite120` |

## 4. Semantic.Dark：28

全部变量均为 `COLOR`、模式为 `Dark`，值必须使用 `VARIABLE_ALIAS`，不得复制 raw RGBA。

| Token | Alias | Scope | WEB | Android |
|---|---|---|---|---|
| `color/bg/canvas` | `neutral/1000` | `FRAME_FILL, SHAPE_FILL` | `var(--wg-color-bg-canvas)` | `wgColorBgCanvas` |
| `color/bg/base` | `neutral/950` | `FRAME_FILL, SHAPE_FILL` | `var(--wg-color-bg-base)` | `wgColorBgBase` |
| `color/bg/surface-1` | `neutral/900` | `FRAME_FILL, SHAPE_FILL` | `var(--wg-color-bg-surface-1)` | `wgColorBgSurface1` |
| `color/bg/surface-2` | `neutral/850` | `FRAME_FILL, SHAPE_FILL` | `var(--wg-color-bg-surface-2)` | `wgColorBgSurface2` |
| `color/bg/surface-3` | `neutral/800` | `FRAME_FILL, SHAPE_FILL` | `var(--wg-color-bg-surface-3)` | `wgColorBgSurface3` |
| `color/border/subtle` | `neutral/750` | `STROKE_COLOR` | `var(--wg-color-border-subtle)` | `wgColorBorderSubtle` |
| `color/border/strong` | `neutral/700` | `STROKE_COLOR` | `var(--wg-color-border-strong)` | `wgColorBorderStrong` |
| `color/border/focus` | `cyan/500` | `STROKE_COLOR` | `var(--wg-color-border-focus)` | `wgColorBorderFocus` |
| `color/text/primary` | `neutral/050` | `TEXT_FILL` | `var(--wg-color-text-primary)` | `wgColorTextPrimary` |
| `color/text/secondary` | `neutral/300` | `TEXT_FILL` | `var(--wg-color-text-secondary)` | `wgColorTextSecondary` |
| `color/text/muted` | `neutral/500` | `TEXT_FILL` | `var(--wg-color-text-muted)` | `wgColorTextMuted` |
| `color/text/inverse` | `neutral/1000` | `TEXT_FILL` | `var(--wg-color-text-inverse)` | `wgColorTextInverse` |
| `color/semantic/dialogue` | `violet/500` | `FRAME_FILL, SHAPE_FILL, TEXT_FILL, STROKE_COLOR` | `var(--wg-color-semantic-dialogue)` | `wgColorSemanticDialogue` |
| `color/semantic/character` | `magenta/500` | `FRAME_FILL, SHAPE_FILL, TEXT_FILL, STROKE_COLOR` | `var(--wg-color-semantic-character)` | `wgColorSemanticCharacter` |
| `color/semantic/visual` | `cyan/500` | `FRAME_FILL, SHAPE_FILL, TEXT_FILL, STROKE_COLOR` | `var(--wg-color-semantic-visual)` | `wgColorSemanticVisual` |
| `color/semantic/audio` | `orange/500` | `FRAME_FILL, SHAPE_FILL, TEXT_FILL, STROKE_COLOR` | `var(--wg-color-semantic-audio)` | `wgColorSemanticAudio` |
| `color/semantic/choice` | `green/500` | `FRAME_FILL, SHAPE_FILL, TEXT_FILL, STROKE_COLOR` | `var(--wg-color-semantic-choice)` | `wgColorSemanticChoice` |
| `color/semantic/logic` | `blue/500` | `FRAME_FILL, SHAPE_FILL, TEXT_FILL, STROKE_COLOR` | `var(--wg-color-semantic-logic)` | `wgColorSemanticLogic` |
| `color/semantic/condition` | `yellow/500` | `FRAME_FILL, SHAPE_FILL, TEXT_FILL, STROKE_COLOR` | `var(--wg-color-semantic-condition)` | `wgColorSemanticCondition` |
| `color/status/error` | `red/500` | `FRAME_FILL, SHAPE_FILL, TEXT_FILL, STROKE_COLOR` | `var(--wg-color-status-error)` | `wgColorStatusError` |
| `color/status/warning` | `amber/500` | `FRAME_FILL, SHAPE_FILL, TEXT_FILL, STROKE_COLOR` | `var(--wg-color-status-warning)` | `wgColorStatusWarning` |
| `color/status/success` | `mint/500` | `FRAME_FILL, SHAPE_FILL, TEXT_FILL, STROKE_COLOR` | `var(--wg-color-status-success)` | `wgColorStatusSuccess` |
| `color/context/selected-bg` | `violet/160` | `FRAME_FILL, SHAPE_FILL` | `var(--wg-color-context-selected-bg)` | `wgColorContextSelectedBg` |
| `color/context/hover-bg` | `white/080` | `FRAME_FILL, SHAPE_FILL` | `var(--wg-color-context-hover-bg)` | `wgColorContextHoverBg` |
| `color/context/scrim` | `black/320` | `FRAME_FILL, SHAPE_FILL` | `var(--wg-color-context-scrim)` | `wgColorContextScrim` |
| `color/icon/primary` | `neutral/050` | `SHAPE_FILL, STROKE_COLOR` | `var(--wg-color-icon-primary)` | `wgColorIconPrimary` |
| `color/icon/secondary` | `neutral/300` | `SHAPE_FILL, STROKE_COLOR` | `var(--wg-color-icon-secondary)` | `wgColorIconSecondary` |
| `color/icon/muted` | `neutral/500` | `SHAPE_FILL, STROKE_COLOR` | `var(--wg-color-icon-muted)` | `wgColorIconMuted` |

## 5. Scale：32

全部变量均为 `FLOAT`、模式为 `Default`。Motion 没有适合的 Figma property picker，因此显式使用 `scopes=[]`；这不等于漏设 Scope。

| Token | 值 | Scope | WEB | Android |
|---|---:|---|---|---|
| `spacing/2` | 2 | `GAP` | `var(--wg-spacing-2)` | `wgSpacing2` |
| `spacing/4` | 4 | `GAP` | `var(--wg-spacing-4)` | `wgSpacing4` |
| `spacing/6` | 6 | `GAP` | `var(--wg-spacing-6)` | `wgSpacing6` |
| `spacing/8` | 8 | `GAP` | `var(--wg-spacing-8)` | `wgSpacing8` |
| `spacing/12` | 12 | `GAP` | `var(--wg-spacing-12)` | `wgSpacing12` |
| `spacing/16` | 16 | `GAP` | `var(--wg-spacing-16)` | `wgSpacing16` |
| `spacing/20` | 20 | `GAP` | `var(--wg-spacing-20)` | `wgSpacing20` |
| `spacing/24` | 24 | `GAP` | `var(--wg-spacing-24)` | `wgSpacing24` |
| `spacing/32` | 32 | `GAP` | `var(--wg-spacing-32)` | `wgSpacing32` |
| `spacing/40` | 40 | `GAP` | `var(--wg-spacing-40)` | `wgSpacing40` |
| `radius/2` | 2 | `CORNER_RADIUS` | `var(--wg-radius-2)` | `wgRadius2` |
| `radius/4` | 4 | `CORNER_RADIUS` | `var(--wg-radius-4)` | `wgRadius4` |
| `radius/6` | 6 | `CORNER_RADIUS` | `var(--wg-radius-6)` | `wgRadius6` |
| `radius/8` | 8 | `CORNER_RADIUS` | `var(--wg-radius-8)` | `wgRadius8` |
| `radius/12` | 12 | `CORNER_RADIUS` | `var(--wg-radius-12)` | `wgRadius12` |
| `radius/16` | 16 | `CORNER_RADIUS` | `var(--wg-radius-16)` | `wgRadius16` |
| `radius/full` | 9999 | `CORNER_RADIUS` | `var(--wg-radius-full)` | `wgRadiusFull` |
| `size/control/compact` | 28 | `WIDTH_HEIGHT` | `var(--wg-size-control-compact)` | `wgSizeControlCompact` |
| `size/control/default` | 32 | `WIDTH_HEIGHT` | `var(--wg-size-control-default)` | `wgSizeControlDefault` |
| `size/control/comfortable` | 36 | `WIDTH_HEIGHT` | `var(--wg-size-control-comfortable)` | `wgSizeControlComfortable` |
| `size/touch/min` | 44 | `WIDTH_HEIGHT` | `var(--wg-size-touch-min)` | `wgSizeTouchMin` |
| `size/touch/primary` | 48 | `WIDTH_HEIGHT` | `var(--wg-size-touch-primary)` | `wgSizeTouchPrimary` |
| `size/navigation/mode-rail` | 56 | `WIDTH_HEIGHT` | `var(--wg-size-navigation-mode-rail)` | `wgSizeNavigationModeRail` |
| `size/navigation/mobile-bottom` | 64 | `WIDTH_HEIGHT` | `var(--wg-size-navigation-mobile-bottom)` | `wgSizeNavigationMobileBottom` |
| `stroke/default` | 1 | `STROKE_FLOAT` | `var(--wg-stroke-default)` | `wgStrokeDefault` |
| `stroke/focus` | 2 | `STROKE_FLOAT` | `var(--wg-stroke-focus)` | `wgStrokeFocus` |
| `motion/duration/instant` | 80 | `[]` | `var(--wg-motion-duration-instant)` | `wgMotionDurationInstant` |
| `motion/duration/fast` | 140 | `[]` | `var(--wg-motion-duration-fast)` | `wgMotionDurationFast` |
| `motion/duration/standard` | 200 | `[]` | `var(--wg-motion-duration-standard)` | `wgMotionDurationStandard` |
| `motion/duration/panel` | 260 | `[]` | `var(--wg-motion-duration-panel)` | `wgMotionDurationPanel` |
| `motion/duration/mode` | 340 | `[]` | `var(--wg-motion-duration-mode)` | `wgMotionDurationMode` |
| `motion/duration/trace` | 600 | `[]` | `var(--wg-motion-duration-trace)` | `wgMotionDurationTrace` |

## 6. Style 冻结清单

### 6.1 Text Styles：10

| Style | Font | Size/Line | Weight |
|---|---|---:|---|
| `Display/Workspace` | Noto Sans SC | 24/32 | Bold |
| `Heading/Panel` | Noto Sans SC | 16/24 | Bold |
| `Heading/Section` | Noto Sans SC | 14/20 | Bold |
| `Body/Default` | Noto Sans SC | 14/21 | Regular |
| `Body/Compact` | Noto Sans SC | 13/18 | Regular |
| `Label/Default` | Noto Sans SC | 12/16 | Medium |
| `Caption/Muted` | Noto Sans SC | 11/16 | Regular |
| `Mono/Script` | IBM Plex Mono | 14/22 | Regular |
| `Mono/Compact` | IBM Plex Mono | 12/18 | Regular |
| `Mono/Numeric` | IBM Plex Mono | 12/16 | Medium |

Figma 中 Noto Sans SC 不提供 `SemiBold`，只有 `Medium` 与 `Bold`。为避免猜测字体名，D1 将两个原候选 `Semi Bold` 标题样式冻结为可用且层级清楚的 `Bold`；正文与标签不变。

### 6.2 Effect Styles：4

| Style | 精确效果 | 用途 |
|---|---|---|
| `Elevation/Panel` | `0 2 8 0 rgba(0,0,0,0.24)` | 停靠面板边界 |
| `Elevation/Popover` | `0 12 32 -6 rgba(0,0,0,0.40)` + `0 2 8 0 rgba(0,0,0,0.28)` | 菜单、Tooltip、浮层 |
| `Glow/Context` | `0 0 18 0 rgba(62,215,255,0.28)` | 当前上下文，低端档可关闭 |
| `Focus/HighContrast` | `0 0 0 2 rgba(62,215,255,0.92)` | 键盘与无障碍焦点 |

## 7. Phase 1 自动审计规则

Phase 1 退出前必须一次性满足：

1. 集合数量 `3`，模式数量分别为 `1/1/1`；
2. Variable 数量严格为 `32 + 28 + 32 = 92`；
3. Primitive 全部 `scopes=[]`；Semantic/Scale Scope 与本清单逐项相同；
4. `ALL_SCOPES` 数量为 `0`；
5. Semantic 的 28 个值全部是 `VARIABLE_ALIAS`，断链数为 `0`；
6. 92 个变量的 WEB 与 ANDROID syntax 缺失数均为 `0`，iOS syntax 数量为 `0`；
7. Token 名称、值、别名、Scope 与 syntax 无重复、无额外项；
8. Text Style 数量为 `10`，字体/样式名必须存在于 `listAvailableFontsAsync()`；
9. Effect Style 数量为 `4`，效果数组与本清单一致；
10. Phase 1 通过前不创建组件、页面文档或产品代码。

## 8. 恢复顺序

Figma MCP 额度恢复后严格执行：

1. 只读比对当前 48 个 Variables 与状态账本；
2. 创建 `radius/full`、7 个 Size、2 个 Stroke；
3. 创建 6 个 Motion；
4. 验证 Scale 为 32；
5. 每批最多 7 个，分四批创建 Semantic；
6. 执行 92 项完整审计；
7. 创建并验证 Text/Effect Styles；
8. 更新状态账本与阶段文档，提交并推送；
9. 仅在 Phase 1 全部通过后进入 Phase 2。
