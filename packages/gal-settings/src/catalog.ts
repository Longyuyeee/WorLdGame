import type { GalSettingPath } from "./settings";

export type GalSettingSection = "display" | "text" | "advance" | "audio" | "input" | "accessibility";
export type GalSettingLevel = "basic" | "advanced";
export type GalSettingsCatalogMode = "basic" | "advanced";

export type GalSettingControl =
  | { readonly kind: "boolean" }
  | { readonly kind: "number"; readonly minimum: number; readonly maximum: number; readonly step: number; readonly unit?: "px" | "ms" | "ratio" | "em" | "characters-per-second" }
  | { readonly kind: "select"; readonly options: readonly string[] };

export interface GalSettingDefinition {
  readonly path: GalSettingPath;
  readonly section: GalSettingSection;
  readonly level: GalSettingLevel;
  readonly label: { readonly zhHans: string; readonly en: string };
  readonly description: { readonly zhHans: string; readonly en: string };
  readonly keywords: readonly string[];
  readonly control: GalSettingControl;
}

const booleanControl = { kind: "boolean" } as const;
const volumeControl = { kind: "number", minimum: 0, maximum: 1, step: 0.01, unit: "ratio" } as const;

const RAW_GAL_SETTING_DEFINITIONS = [
  { path: "display.designWidth", section: "display", level: "advanced", label: { zhHans: "设计宽度", en: "Design width" }, description: { zhHans: "项目内容的逻辑设计宽度。", en: "Logical design width for project content." }, keywords: ["分辨率", "画布", "resolution", "canvas", "width"], control: { kind: "number", minimum: 320, maximum: 7680, step: 1, unit: "px" } },
  { path: "display.designHeight", section: "display", level: "advanced", label: { zhHans: "设计高度", en: "Design height" }, description: { zhHans: "项目内容的逻辑设计高度。", en: "Logical design height for project content." }, keywords: ["分辨率", "画布", "resolution", "canvas", "height"], control: { kind: "number", minimum: 320, maximum: 4320, step: 1, unit: "px" } },
  { path: "display.orientation", section: "display", level: "basic", label: { zhHans: "屏幕方向", en: "Orientation" }, description: { zhHans: "横屏、竖屏或自适应布局方向。", en: "Landscape, portrait, or adaptive layout orientation." }, keywords: ["横屏", "竖屏", "旋转", "landscape", "portrait", "rotation"], control: { kind: "select", options: ["landscape", "portrait", "adaptive"] } },
  { path: "display.safeArea", section: "display", level: "advanced", label: { zhHans: "安全区", en: "Safe area" }, description: { zhHans: "是否避让刘海、圆角和系统手势区域。", en: "Whether to respect cutouts, rounded corners, and system gestures." }, keywords: ["刘海", "圆角", "手势", "cutout", "notch", "inset"], control: { kind: "select", options: ["none", "system"] } },
  { path: "display.quality", section: "display", level: "basic", label: { zhHans: "画面质量", en: "Visual quality" }, description: { zhHans: "选择低、均衡或高质量渲染档位。", en: "Select low, balanced, or high rendering quality." }, keywords: ["画质", "性能", "quality", "performance", "graphics"], control: { kind: "select", options: ["low", "balanced", "high"] } },

  { path: "text.charactersPerSecond", section: "text", level: "basic", label: { zhHans: "文字速度", en: "Text speed" }, description: { zhHans: "每秒显示的字符数量。", en: "Number of characters revealed per second." }, keywords: ["打字", "对话", "文本", "typing", "dialogue", "cps"], control: { kind: "number", minimum: 1, maximum: 200, step: 1, unit: "characters-per-second" } },
  { path: "text.minimumDisplayMilliseconds", section: "text", level: "advanced", label: { zhHans: "最短显示时间", en: "Minimum display time" }, description: { zhHans: "一句文本允许推进前的最短显示时间。", en: "Minimum time before a presented line may advance." }, keywords: ["等待", "推进", "delay", "advance", "minimum"], control: { kind: "number", minimum: 0, maximum: 10000, step: 10, unit: "ms" } },
  { path: "text.punctuationDelayMilliseconds", section: "text", level: "advanced", label: { zhHans: "标点停顿", en: "Punctuation pause" }, description: { zhHans: "遇到标点时追加的阅读停顿。", en: "Additional reading pause applied at punctuation." }, keywords: ["逗号", "句号", "阅读", "comma", "period", "pause"], control: { kind: "number", minimum: 0, maximum: 2000, step: 10, unit: "ms" } },
  { path: "text.fontScale", section: "text", level: "basic", label: { zhHans: "字体缩放", en: "Font scale" }, description: { zhHans: "消息文字相对基础字号的缩放比例。", en: "Message text scale relative to the base font size." }, keywords: ["字号", "大小", "font", "size", "accessibility"], control: { kind: "number", minimum: 0.75, maximum: 2, step: 0.05, unit: "ratio" } },
  { path: "text.messageWindowOpacity", section: "text", level: "basic", label: { zhHans: "消息窗透明度", en: "Message window opacity" }, description: { zhHans: "对白消息窗口的背景不透明度。", en: "Background opacity of the dialogue message panel." }, keywords: ["对话框", "透明", "textbox", "window", "opacity"], control: { kind: "number", minimum: 0, maximum: 1, step: 0.01, unit: "ratio" } },
  { path: "text.revealMode", section: "text", level: "basic", label: { zhHans: "文字显示方式", en: "Text reveal mode" }, description: { zhHans: "选择逐字显示或立即显示整句文本。", en: "Reveal text progressively or show the complete line instantly." }, keywords: ["瞬显", "逐字", "打字", "instant", "typewriter", "reveal"], control: { kind: "select", options: ["typewriter", "instant"] } },
  { path: "text.lineHeight", section: "text", level: "advanced", label: { zhHans: "文字行高", en: "Text line height" }, description: { zhHans: "对白与旁白文字的行高比例。", en: "Line-height ratio for dialogue and narration text." }, keywords: ["字体", "行高", "行距", "font", "line", "spacing"], control: { kind: "number", minimum: 1.2, maximum: 2.5, step: 0.05, unit: "ratio" } },
  { path: "text.letterSpacingEm", section: "text", level: "advanced", label: { zhHans: "文字字距", en: "Text letter spacing" }, description: { zhHans: "对白与旁白字符间距，单位为 em。", en: "Letter spacing for dialogue and narration text in em." }, keywords: ["字体", "字距", "字符", "font", "letter", "spacing"], control: { kind: "number", minimum: 0, maximum: 0.2, step: 0.01, unit: "em" } },

  { path: "advance.allowHold", section: "advance", level: "basic", label: { zhHans: "允许长按推进", en: "Allow hold to advance" }, description: { zhHans: "允许持续按住输入来推进普通文本。", en: "Allow holding an input to advance normal text." }, keywords: ["长按", "连续", "hold", "advance", "input"], control: booleanControl },
  { path: "advance.waitForVoice", section: "advance", level: "basic", label: { zhHans: "等待语音结束", en: "Wait for voice" }, description: { zhHans: "推进前等待当前语音播放完成。", en: "Wait for the current voice line before advancing." }, keywords: ["语音", "自动推进", "voice", "speech", "advance"], control: booleanControl },

  { path: "audio.master", section: "audio", level: "basic", label: { zhHans: "主音量", en: "Master volume" }, description: { zhHans: "控制所有音频总输出。", en: "Controls the overall audio output." }, keywords: ["音量", "声音", "volume", "audio", "master"], control: volumeControl },
  { path: "audio.bgm", section: "audio", level: "basic", label: { zhHans: "背景音乐音量", en: "BGM volume" }, description: { zhHans: "控制背景音乐总线音量。", en: "Controls the background music bus." }, keywords: ["音量", "音乐", "bgm", "music", "volume"], control: volumeControl },
  { path: "audio.voice", section: "audio", level: "basic", label: { zhHans: "语音音量", en: "Voice volume" }, description: { zhHans: "控制角色语音总线音量。", en: "Controls the character voice bus." }, keywords: ["音量", "配音", "voice", "speech", "volume"], control: volumeControl },
  { path: "audio.sfx", section: "audio", level: "basic", label: { zhHans: "音效音量", en: "SFX volume" }, description: { zhHans: "控制场景音效总线音量。", en: "Controls the scene sound-effects bus." }, keywords: ["音量", "音效", "sfx", "effect", "volume"], control: volumeControl },
  { path: "audio.ambient", section: "audio", level: "basic", label: { zhHans: "环境声音量", en: "Ambient volume" }, description: { zhHans: "控制环境声总线音量。", en: "Controls the ambient sound bus." }, keywords: ["音量", "环境声", "ambient", "atmosphere", "volume"], control: volumeControl },
  { path: "audio.ui", section: "audio", level: "basic", label: { zhHans: "界面音量", en: "UI volume" }, description: { zhHans: "控制按钮与界面反馈声音量。", en: "Controls button and interface feedback sounds." }, keywords: ["音量", "按钮", "界面", "ui", "button", "volume"], control: volumeControl },
  { path: "audio.voiceDucking", section: "audio", level: "advanced", label: { zhHans: "语音压低背景音", en: "Voice ducking" }, description: { zhHans: "语音播放时降低其他音频的比例。", en: "Amount other audio is reduced while voice is playing." }, keywords: ["音量", "压低", "侧链", "ducking", "sidechain", "voice"], control: volumeControl },

  { path: "input.pointerAdvance", section: "input", level: "basic", label: { zhHans: "鼠标推进", en: "Pointer advance" }, description: { zhHans: "允许鼠标或指针点击推进。", en: "Allow mouse or pointer clicks to advance." }, keywords: ["鼠标", "点击", "pointer", "mouse", "click"], control: booleanControl },
  { path: "input.keyboardAdvance", section: "input", level: "basic", label: { zhHans: "键盘推进", en: "Keyboard advance" }, description: { zhHans: "允许键盘确认键推进。", en: "Allow keyboard confirm keys to advance." }, keywords: ["键盘", "空格", "回车", "keyboard", "space", "enter"], control: booleanControl },
  { path: "input.touchAdvance", section: "input", level: "basic", label: { zhHans: "触摸推进", en: "Touch advance" }, description: { zhHans: "允许触摸屏点击推进。", en: "Allow touchscreen taps to advance." }, keywords: ["手机", "触摸", "点击", "touch", "tap", "mobile"], control: booleanControl },
  { path: "input.gamepadAdvance", section: "input", level: "advanced", label: { zhHans: "手柄推进", en: "Gamepad advance" }, description: { zhHans: "允许手柄确认键推进。", en: "Allow gamepad confirm buttons to advance." }, keywords: ["手柄", "控制器", "gamepad", "controller", "button"], control: booleanControl },

  { path: "accessibility.highContrast", section: "accessibility", level: "basic", label: { zhHans: "高对比度", en: "High contrast" }, description: { zhHans: "增强文字、消息窗、选择与焦点边界的对比度。", en: "Increase contrast for text, message panels, choices, and focus boundaries." }, keywords: ["无障碍", "对比", "高对比", "accessibility", "high", "contrast"], control: booleanControl },
  { path: "accessibility.reduceMotion", section: "accessibility", level: "basic", label: { zhHans: "减少动效", en: "Reduce motion" }, description: { zhHans: "将非必要动画和转场缩短为最小呈现。", en: "Reduce non-essential animation and transition duration." }, keywords: ["无障碍", "减少", "动效", "动画", "accessibility", "reduce", "motion", "animation"], control: booleanControl },
  { path: "accessibility.reduceFlashing", section: "accessibility", level: "basic", label: { zhHans: "减少闪烁", en: "Reduce flashing" }, description: { zhHans: "将可能产生高频视觉变化的效果降级为平滑淡入。", en: "Replace potentially flashing visual effects with a steady fade." }, keywords: ["无障碍", "减少", "闪烁", "闪光", "accessibility", "reduce", "flashing", "flash"], control: booleanControl }
] as const satisfies readonly GalSettingDefinition[];

function freezeDefinition(definition: GalSettingDefinition): GalSettingDefinition {
  const control = definition.control.kind === "select"
    ? Object.freeze({ ...definition.control, options: Object.freeze([...definition.control.options]) })
    : Object.freeze({ ...definition.control });
  return Object.freeze({
    ...definition,
    label: Object.freeze({ ...definition.label }),
    description: Object.freeze({ ...definition.description }),
    keywords: Object.freeze([...definition.keywords]),
    control
  });
}

export const GAL_SETTING_DEFINITIONS: readonly GalSettingDefinition[] = Object.freeze(
  RAW_GAL_SETTING_DEFINITIONS.map(freezeDefinition)
);

const definitionsByPath = new Map<GalSettingPath, GalSettingDefinition>(
  GAL_SETTING_DEFINITIONS.map((definition) => [definition.path, definition])
);

export function getGalSettingDefinition(path: GalSettingPath): GalSettingDefinition {
  const definition = definitionsByPath.get(path);
  if (definition === undefined) throw new TypeError(`Unknown Gal setting path: ${path}`);
  return definition;
}

export interface SearchGalSettingDefinitionsOptions {
  readonly mode?: GalSettingsCatalogMode;
  readonly section?: GalSettingSection;
}

function normalizedTerms(query: string): readonly string[] {
  return query.normalize("NFKC").toLocaleLowerCase("en-US").trim().split(/\s+/u).filter(Boolean);
}

function searchableText(definition: GalSettingDefinition): readonly string[] {
  return [
    definition.path,
    definition.section,
    definition.label.zhHans,
    definition.label.en,
    definition.description.zhHans,
    definition.description.en,
    ...definition.keywords
  ].map((value) => value.normalize("NFKC").toLocaleLowerCase("en-US"));
}

function termScore(term: string, fields: readonly string[]): number {
  if (fields.some((value) => value === term)) return 400;
  if (fields.some((value) => value.startsWith(term))) return 300;
  if (fields.some((value) => value.includes(term))) return 200;
  return 0;
}

export function searchGalSettingDefinitions(
  query: string,
  options: SearchGalSettingDefinitionsOptions = {}
): readonly GalSettingDefinition[] {
  if (typeof query !== "string") throw new TypeError("Gal settings search query must be a string");
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new TypeError("Gal settings search options must be an object");
  }
  const unknownOption = Object.keys(options).find((key) => key !== "mode" && key !== "section");
  if (unknownOption !== undefined) throw new TypeError(`Unknown Gal settings search option: ${unknownOption}`);
  const mode = options.mode ?? "advanced";
  if (mode !== "basic" && mode !== "advanced") throw new TypeError("Gal settings catalog mode must be basic or advanced");
  if (options.section !== undefined && !["display", "text", "advance", "audio", "input", "accessibility"].includes(options.section)) {
    throw new TypeError("Gal settings catalog section is invalid");
  }
  const terms = normalizedTerms(query);
  return GAL_SETTING_DEFINITIONS
    .map((definition, index) => ({
      definition,
      index,
      scores: terms.map((term) => termScore(term, searchableText(definition)))
    }))
    .filter(({ definition, scores }) =>
      (mode === "advanced" || definition.level === "basic") &&
      (options.section === undefined || definition.section === options.section) &&
      scores.every((score) => score > 0)
    )
    .sort((left, right) => {
      const scoreDifference = right.scores.reduce((sum, score) => sum + score, 0) - left.scores.reduce((sum, score) => sum + score, 0);
      return scoreDifference === 0 ? left.index - right.index : scoreDifference;
    })
    .map(({ definition }) => definition);
}
