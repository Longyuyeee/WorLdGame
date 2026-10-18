import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createProjectTemplate, type CanonicalProject } from "@world-studio/project-domain";
import { createPlayerCore, createPlayerCoreSnapshotV1, dispatchPlayerCoreIntentV1 } from "@world-studio/player-core";
import { withProjectSettings } from "@world-studio/gal-settings";
import { PlayerShell } from "./PlayerShell";
import { derivePlayerStagePresentationV1 } from "./player-presentation-adapter";
import { storyMotionStyle } from "./story-motion-style";
afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });
const media = [{ assetId: "actor", displayName: "林晚", mimeType: "image/png", url: "data:image/png;base64,AA==" }];
function project(): CanonicalProject {
  const base = createProjectTemplate("动效", "018f08d8-71a1-7bc2-a627-2f4a843ee150"), sceneId = base.manifest.entrySceneId;
  return { ...base, settings: withProjectSettings(base.settings, { text: { revealMode: "instant" } }), assets: { ...base.assets, assets: [{ assetId: "actor", kind: "character" }] }, scripts: { ...base.scripts, [sceneId]: { schemaVersion: 1, sceneId, statements: [
    { id: "actor_in", kind: "direction", command: "show", summary: "action=show asset=actor slot=main x=32 y=90 scale=0.8 rotation=3 anchorX=0.4 anchorY=0.9 motion=rise-in motionDuration=1200ms motionStrength=1.5" },
    { id: "text_motion", kind: "direction", command: "textbox", summary: "action=set template=nvl motion=text-rise motionRepeat=2" },
    { id: "line", kind: "narration", textId: "words", text: "给明天的回信" },
    { id: "text_reset", kind: "direction", command: "textbox", summary: "action=reset" },
    { id: "actor_exit", kind: "direction", command: "show", summary: "action=hide asset=actor slot=main x=32 y=90 scale=0.8 rotation=3 anchorX=0.4 anchorY=0.9 motion=fade-out motionDuration=900ms" },
    { id: "next", kind: "narration", textId: "next_words", text: "下一句仍可阅读" }, { id: "end", kind: "end", endingName: "完成" }
  ] } } };
}
it("carries authored geometry and exit art through real Compiler → Core → Host snapshots", () => {
  const p = project(); let core = dispatchPlayerCoreIntentV1(createPlayerCore(p), p, { kind: "primary" });
  let stage = derivePlayerStagePresentationV1(createPlayerCoreSnapshotV1(core), media);
  expect(stage.characters[0]).toMatchObject({ x: 32, y: 90, scale: .8, rotation: 3, anchorX: .4, anchorY: .9, motion: { kind: "rise-in", duration: 1200, strength: 1.5 } });
  expect(stage.textMotion?.kind).toBe("text-rise");
  core = dispatchPlayerCoreIntentV1(core, p, { kind: "primary" });
  stage = derivePlayerStagePresentationV1(createPlayerCoreSnapshotV1(core), media);
  expect(stage.textMotion).toBeUndefined(); expect(stage.textboxTemplate).toBe("adv");
  expect(stage.characters[0]).toMatchObject({ assetId: "actor", x: 32, scale: .8, motion: { kind: "fade-out", duration: 900 } });
});
it("renders motion separately from stage transforms and preserves readable text under reduced motion", async () => {
  const p = project(), reduced = { ...p, settings: withProjectSettings(p.settings, { accessibility: { reduceMotion: true } }) };
  const view = render(<PlayerShell project={reduced} mediaAssets={media} editorPreview={{ autoStart: true }} />);
  await act(async () => {});
  const actor = view.container.querySelector('[data-stage-slot="main"]') as HTMLElement;
  expect(actor.dataset.storyMotion).toBe("rise-in"); expect(actor.style.transform).toBe("translate(-40%, -90%) scale(0.8) rotate(3deg)");
  expect(actor.style.animationName).toBe("story-rise-in");
  expect(view.container.querySelector("main")).toHaveAttribute("data-settings-reduce-motion", "true");
  expect(view.container.querySelector("main")).toHaveAttribute("data-player-muted", "true");
  expect(view.container.querySelector('.player-story-text-motion')).toHaveTextContent("给明天的回信");
  fireEvent.click(screen.getByRole("button", { name: "继续下一句" })); await act(async () => {});
  expect(view.container.querySelector('.player-story-text-motion')).not.toHaveAttribute("data-story-motion");
  expect(view.container.querySelector('[data-story-motion="fade-out"]')).toHaveAttribute("aria-hidden", "true");
});
it("does not introduce geometry transforms or unbounded repeats through the style adapter", () => {
  const style = storyMotionStyle({ kind: "breathe", duration: 2400, strength: 1, repeat: 3, easing: "ease-in-out" });
  expect(style.transform).toBeUndefined(); expect(style.animationIterationCount).toBe(3);
  expect(storyMotionStyle(undefined)).toEqual({});
});
it("an explicit stop preset suppresses a legacy entrance transition too", async () => {
  const original = project(), sceneId = original.manifest.entrySceneId, script = original.scripts[sceneId]!;
  const p = { ...original, scripts: { [sceneId]: { ...script, statements: [{ ...script.statements[0]!, summary: "action=show asset=actor slot=main x=32 transition=slide duration=600ms motion=none" }, ...script.statements.slice(1)] } } };
  const view = render(<PlayerShell project={p} mediaAssets={media} editorPreview={{ autoStart: true }} />);
  await act(async () => {});
  const actor = view.container.querySelector('[data-stage-slot="main"]');
  expect(actor).toHaveClass("player-transition--none"); expect(actor).not.toHaveClass("player-transition--slide");
});
it("isolates scoped text motion from an inherited NVL textbox and resets only its own channel", () => {
  const original = project(), sceneId = original.manifest.entrySceneId;
  const p = { ...original, scripts: { [sceneId]: { schemaVersion: 1 as const, sceneId, statements: [
    { id: "nvl", kind: "direction", command: "textbox", summary: "action=set template=nvl" },
    { id: "emphasis", kind: "direction", command: "textbox", summary: "action=motion motion=text-ink motionDuration=1100ms" },
    { id: "line", kind: "narration", textId: "words", text: "有强调的一句" },
    { id: "restore", kind: "direction", command: "textbox", summary: "action=motion motion=none" },
    { id: "next", kind: "narration", textId: "next_words", text: "恢复后的下一句" }, { id: "end", kind: "end", endingName: "完成" }
  ] } } };
  let core = dispatchPlayerCoreIntentV1(createPlayerCore(p), p, { kind: "primary" });
  const first = createPlayerCoreSnapshotV1(core);
  expect(first.effects.active.map(e => e.channel).sort()).toEqual(["textbox", "textbox.motion"]);
  expect(derivePlayerStagePresentationV1(first)).toMatchObject({ textboxTemplate: "nvl", textMotion: { kind: "text-ink", duration: 1100 } });
  core = dispatchPlayerCoreIntentV1(core, p, { kind: "primary" });
  expect(derivePlayerStagePresentationV1(createPlayerCoreSnapshotV1(core))).toMatchObject({ textboxTemplate: "nvl", textMotion: { kind: "none" } });
});
