import { describe, expect, it } from "vitest";
import {
  createGalSettingsDocument,
  withPlatformSettings,
  withProjectSettings
} from "./settings";
import {
  createGalSettingsApplicationV1,
  galAdvanceInputEnabledV1,
  galAudioGainV1,
  galStageDurationMillisecondsV1,
  galStageEasingV1,
  galTextRevealDurationMillisecondsV1
} from "./application";

describe("N51-E5 Gal settings runtime application", () => {
  it("projects the canonical platform resolution into one host-neutral contract", () => {
    const project = withProjectSettings(createGalSettingsDocument(), {
      text: { fontScale: 1.25 },
      input: { keyboardAdvance: false }
    });
    const settings = withPlatformSettings(project, "android", {
      display: { designWidth: 1080, designHeight: 1920, orientation: "portrait", quality: "balanced" }
    });
    const application = createGalSettingsApplicationV1(settings, "android");

    expect(application).toMatchObject({
      version: 1,
      display: { aspectRatio: "1080 / 1920", orientation: "portrait", maximumDevicePixelRatio: 1.5 },
      text: { fontScale: 1.25 },
      input: { keyboard: false }
    });
    expect(application.resolved.sources["display.designWidth"]).toBe("android");
    expect(galAdvanceInputEnabledV1(application, "keyboard")).toBe(false);
  });

  it("calculates text reveal time from Unicode characters, punctuation pauses, and the minimum", () => {
    const settings = withProjectSettings(createGalSettingsDocument(), {
      text: { charactersPerSecond: 10, minimumDisplayMilliseconds: 800, punctuationDelayMilliseconds: 200 }
    });
    const application = createGalSettingsApplicationV1(settings, "web");
    expect(galTextRevealDurationMillisecondsV1(application, "你好，世界！")).toBe(1_000);
    expect(galTextRevealDurationMillisecondsV1(application, "短")).toBe(800);
  });

  it("projects text layout and accessibility policies and disables reveal motion deterministically", () => {
    const instant = createGalSettingsApplicationV1(withProjectSettings(createGalSettingsDocument(), {
      text: { revealMode: "instant", lineHeight: 2, letterSpacingEm: 0.08 },
      accessibility: { highContrast: true, reduceMotion: false, reduceFlashing: true }
    }), "web");
    expect(instant).toMatchObject({
      text: { revealMode: "instant", lineHeight: 2, letterSpacingEm: 0.08 },
      accessibility: { highContrast: true, reduceMotion: false, reduceFlashing: true }
    });
    expect(galTextRevealDurationMillisecondsV1(instant, "仍然立即显示。" )).toBe(0);

    const reducedMotion = createGalSettingsApplicationV1(withProjectSettings(createGalSettingsDocument(), {
      accessibility: { reduceMotion: true }
    }), "web");
    expect(galTextRevealDurationMillisecondsV1(reducedMotion, "动画也必须关闭。" )).toBe(0);
  });

  it("combines source, master, bus and voice-ducking gains without exceeding browser bounds", () => {
    const settings = withProjectSettings(createGalSettingsDocument(), {
      audio: { master: 0.5, bgm: 0.8, voice: 0.9, voiceDucking: 0.25 }
    });
    const application = createGalSettingsApplicationV1(settings, "web");
    expect(galAudioGainV1(application, "bgm", 0.6)).toBeCloseTo(0.24);
    expect(galAudioGainV1(application, "bgm", 0.6, true)).toBeCloseTo(0.18);
    expect(galAudioGainV1(application, "voice", 0.6, true)).toBeCloseTo(0.27);
    expect(galAudioGainV1(application, "ui", 1)).toBe(0.45);
  });

  it("applies Stage defaults only when an Effect omits explicit timing and projects audio resume policy", () => {
    const application = createGalSettingsApplicationV1(withProjectSettings(createGalSettingsDocument(), {
      stage: { defaultDurationMilliseconds: 720, defaultEasing: "ease-out" },
      audio: { resumeAfterInterruption: false }
    }), "web");
    expect(application).toMatchObject({
      stage: { defaultDurationMilliseconds: 720, defaultEasing: "ease-out" },
      audio: { resumeAfterInterruption: false }
    });
    expect(galStageDurationMillisecondsV1(application)).toBe(720);
    expect(galStageDurationMillisecondsV1(application, "400ms")).toBe(400);
    expect(galStageDurationMillisecondsV1(application, "1.2s")).toBe(1_200);
    expect(galStageEasingV1(application)).toBe("ease-out");
    expect(galStageEasingV1(application, "ease-in-out")).toBe("ease-in-out");
  });
});
