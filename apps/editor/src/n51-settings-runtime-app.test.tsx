import { render, screen, waitFor } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, describe, expect, it, vi } from "vitest";
import { withPlatformSettings } from "@world-studio/gal-settings";
import { createProjectTemplate } from "@world-studio/project-domain";
import { App } from "./App";

afterEach(() => vi.unstubAllGlobals());

describe("N51-E5 Editor Preview settings application", () => {
  it("applies the resolved Web profile to the live Preview surface", async () => {
    vi.stubGlobal("indexedDB", new IDBFactory());
    vi.stubGlobal("devicePixelRatio", 3);
    const project = createProjectTemplate("N51 runtime settings", "018f08d8-71a1-7bc2-a627-2f4a843ee224");
    const configured = {
      ...project,
      settings: withPlatformSettings(project.settings, "web", {
        display: { designWidth: 1080, designHeight: 1920, orientation: "portrait", safeArea: "none", quality: "low" },
        text: { charactersPerSecond: 12, minimumDisplayMilliseconds: 900, punctuationDelayMilliseconds: 240, fontScale: 1.4, messageWindowOpacity: 0.45, revealMode: "instant", lineHeight: 2, letterSpacingEm: 0.08 },
        accessibility: { highContrast: true, reduceMotion: true, reduceFlashing: true },
        stage: { defaultDurationMilliseconds: 720, defaultEasing: "ease-out" },
        choice: { showOptionNumbers: false, layout: "responsive-grid" },
        ui: { defaultTextboxTemplate: "bubble", showInputHints: false },
        advance: { allowHold: false, waitForVoice: false },
        audio: { master: 0.6, bgm: 0.5, voice: 0.7, sfx: 0.4, ambient: 0.3, ui: 0.2, voiceDucking: 0.25, resumeAfterInterruption: false },
        input: { pointerAdvance: true, keyboardAdvance: false, touchAdvance: true, gamepadAdvance: false }
      })
    };
    const view = render(<App initialProject={configured} autosaveDebounceMs={60_000} />);
    const stage = await screen.findByTestId("preview-stage");

    await waitFor(() => expect(stage).toHaveAttribute("data-preview-profile", "custom"));
    expect(stage).toHaveAttribute("data-preview-width", "1080");
    expect(stage).toHaveAttribute("data-preview-height", "1920");
    expect(stage).toHaveAttribute("data-settings-platform", "web");
    expect(stage).toHaveAttribute("data-settings-quality", "low");
    expect(stage).toHaveAttribute("data-stage-dpr", "1");
    expect(stage).toHaveAttribute("data-settings-text-cps", "12");
    expect(stage).toHaveAttribute("data-settings-text-minimum", "900");
    expect(stage).toHaveAttribute("data-settings-audio-master", "0.6");
    expect(stage).toHaveAttribute("data-settings-input-keyboard", "false");
    expect(stage).toHaveAttribute("data-settings-wait-for-voice", "false");
    expect(stage).toHaveAttribute("data-settings-high-contrast", "true");
    expect(stage).toHaveAttribute("data-settings-reduce-motion", "true");
    expect(stage).toHaveAttribute("data-settings-reduce-flashing", "true");
    expect(stage).toHaveAttribute("data-settings-stage-duration", "720");
    expect(stage).toHaveAttribute("data-settings-stage-easing", "ease-out");
    expect(stage).toHaveAttribute("data-settings-choice-layout", "responsive-grid");
    expect(stage).toHaveAttribute("data-settings-choice-numbers", "false");
    expect(stage).toHaveAttribute("data-settings-textbox-default", "bubble");
    expect(stage).toHaveAttribute("data-settings-input-hints", "false");
    expect(stage).toHaveAttribute("data-settings-audio-resume", "false");
    expect(stage).toHaveAttribute("data-text-reveal-duration", "0");
    expect(stage).toHaveStyle({ "--gal-font-scale": "1.4", "--gal-message-opacity": "0.45", "--gal-line-height": "2", "--gal-letter-spacing": "0.08em" });
    expect(view.container.querySelector("[data-testid='preview-safe-area']")).not.toBeInTheDocument();
  });
});
