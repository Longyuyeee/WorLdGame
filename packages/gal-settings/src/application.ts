import {
  resolveGalSettings,
  type GalSettingsDocument,
  type GalSettingsPlatform,
  type ResolvedGalSettings
} from "./settings";

export const GAL_SETTINGS_APPLICATION_VERSION = 1 as const;

export type GalAudioBusV1 = "bgm" | "voice" | "sfx" | "ambient" | "ui";
export type GalAdvanceInputV1 = "pointer" | "keyboard" | "touch" | "gamepad";
export type GalStageEasingV1 = "linear" | "ease-in" | "ease-out" | "ease-in-out";

export interface GalSettingsApplicationV1 {
  readonly version: typeof GAL_SETTINGS_APPLICATION_VERSION;
  readonly resolved: ResolvedGalSettings;
  readonly display: {
    readonly designWidth: number;
    readonly designHeight: number;
    readonly aspectRatio: string;
    readonly orientation: "landscape" | "portrait" | "adaptive";
    readonly safeArea: "none" | "system";
    readonly quality: "low" | "balanced" | "high";
    readonly maximumDevicePixelRatio: number;
  };
  readonly text: {
    readonly charactersPerSecond: number;
    readonly minimumDisplayMilliseconds: number;
    readonly punctuationDelayMilliseconds: number;
    readonly fontScale: number;
    readonly messageWindowOpacity: number;
    readonly revealMode: "typewriter" | "instant";
    readonly lineHeight: number;
    readonly letterSpacingEm: number;
  };
  readonly advance: {
    readonly allowHold: boolean;
    readonly waitForVoice: boolean;
  };
  readonly input: Readonly<Record<GalAdvanceInputV1, boolean>>;
  readonly accessibility: {
    readonly highContrast: boolean;
    readonly reduceMotion: boolean;
    readonly reduceFlashing: boolean;
  };
  readonly stage: {
    readonly defaultDurationMilliseconds: number;
    readonly defaultEasing: GalStageEasingV1;
  };
  readonly choice: {
    readonly showOptionNumbers: boolean;
    readonly layout: "vertical" | "responsive-grid";
  };
  readonly ui: {
    readonly defaultTextboxTemplate: "adv" | "nvl" | "bubble";
    readonly showInputHints: boolean;
  };
  readonly audio: {
    readonly resumeAfterInterruption: boolean;
  };
}

const PUNCTUATION = /[,.!?;:\u3001\u3002\uff01\uff1f\uff0c\uff1b\uff1a\u2026]/gu;

export function createGalSettingsApplicationV1(
  settings: GalSettingsDocument,
  platform: GalSettingsPlatform
): GalSettingsApplicationV1 {
  const resolved = resolveGalSettings(settings, platform);
  const { display, text, advance, stage, choice, ui, audio, input, accessibility } = resolved.values;
  return {
    version: GAL_SETTINGS_APPLICATION_VERSION,
    resolved,
    display: {
      ...display,
      aspectRatio: `${display.designWidth} / ${display.designHeight}`,
      maximumDevicePixelRatio: display.quality === "low" ? 1 : display.quality === "balanced" ? 1.5 : 4
    },
    text,
    advance,
    stage,
    choice,
    ui,
    audio: { resumeAfterInterruption: audio.resumeAfterInterruption },
    accessibility,
    input: {
      pointer: input.pointerAdvance,
      keyboard: input.keyboardAdvance,
      touch: input.touchAdvance,
      gamepad: input.gamepadAdvance
    }
  };
}

export function galStageDurationMillisecondsV1(
  application: GalSettingsApplicationV1,
  source?: string
): number {
  if (source === undefined) return application.stage.defaultDurationMilliseconds;
  const matched = /^(\d+(?:\.\d+)?)(ms|s)$/u.exec(source);
  if (matched === null) return application.stage.defaultDurationMilliseconds;
  const value = Number(matched[1]) * (matched[2] === "s" ? 1000 : 1);
  return Math.max(1, Math.min(10_000, value));
}

export function galStageEasingV1(
  application: GalSettingsApplicationV1,
  source?: string
): GalStageEasingV1 {
  return source === "linear" || source === "ease-in" || source === "ease-out" || source === "ease-in-out"
    ? source
    : application.stage.defaultEasing;
}

export function galTextRevealDurationMillisecondsV1(application: GalSettingsApplicationV1, text: string): number {
  if (application.text.revealMode === "instant" || application.accessibility.reduceMotion) return 0;
  const characters = Array.from(text).length;
  const punctuation = text.match(PUNCTUATION)?.length ?? 0;
  const reveal = Math.ceil(characters / application.text.charactersPerSecond * 1000)
    + punctuation * application.text.punctuationDelayMilliseconds;
  return Math.max(application.text.minimumDisplayMilliseconds, reveal);
}

export function galAudioGainV1(
  application: GalSettingsApplicationV1,
  bus: GalAudioBusV1,
  sourceVolume = 1,
  voiceActive = false
): number {
  const audio = application.resolved.values.audio;
  const ducking = voiceActive && bus !== "voice" && bus !== "ui" ? 1 - audio.voiceDucking : 1;
  return Math.max(0, Math.min(1, sourceVolume * audio.master * audio[bus] * ducking));
}

export function galAdvanceInputEnabledV1(application: GalSettingsApplicationV1, input: GalAdvanceInputV1): boolean {
  return application.input[input];
}
