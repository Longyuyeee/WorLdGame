import { expect, it } from "vitest";
import { createProjectTemplate } from "@world-studio/project-domain";
import { projectCanonicalWithStory } from "./canonical-project-adapter";
import { createStudioSessionFromCanonical, reduceStudioSession, activeSourceSession } from "./studio-session";
import { resumeStudioSession } from "./studio-continuity";
import { textReplaceFixture } from "./text-replace-fixture";
import { createTextReplacePlan, findTextReplacements } from "./project-text-replace";
function fixture() {
  const canonical = createProjectTemplate("Continuous story", "018f08d8-71a1-7bc2-a627-2f4a843ee150");
  const original = createStudioSessionFromCanonical(canonical);
  const edited = reduceStudioSession(original, { type: "edit-script", commandId: "cmd_ui_1", source: activeSourceSession(original).committedSource.replace('end "Ending"', 'end "New ending"') });
  return { original, edited, canonical: projectCanonicalWithStory(canonical, edited.project) };
}
it("preserves scene source history, comments and selection across unrelated structure changes", () => {
  const { original, edited, canonical } = fixture();
  const changed = { ...canonical, chapters: canonical.chapters.map(c => ({ ...c, title: "New chapter" })) };
  const resumed = resumeStudioSession(changed, { session: edited, commandSerial: 1, entitySerial: 0 });
  expect(activeSourceSession(resumed)).toBe(activeSourceSession(edited));
  const undone = reduceStudioSession(resumed, { type: "undo" });
  expect(activeSourceSession(undone).committedSource).toBe(activeSourceSession(original).committedSource);
  expect(activeSourceSession(reduceStudioSession(undone, { type: "redo" })).committedSource).toBe(activeSourceSession(edited).committedSource);
});
it("drops affected scene history rather than undoing structural reference changes", () => {
  const { edited, canonical } = fixture();
  const changed = { ...canonical, scenes: canonical.scenes.map(s => ({ ...s, title: "Renamed" })) };
  const resumed = resumeStudioSession(changed, { session: edited, commandSerial: 1, entitySerial: 0 });
  expect(activeSourceSession(resumed).history).toHaveLength(0);
  expect(resumed.project.scenes[0]!.title).toBe("Renamed");
  expect(reduceStudioSession(resumed, { type: "undo" }).project.scenes[0]!.title).toBe("Renamed");
});
it("rejects a handoff from another project", () => {
  const { edited, canonical } = fixture();
  expect(() => resumeStudioSession({ ...canonical, manifest: { ...canonical.manifest, projectId: "other" } }, { session: edited, commandSerial: 1, entitySerial: 0 })).toThrow("其他工程");
});
it("does not allow an old undo to revive a removed reference", () => {
  const { edited, canonical } = fixture();
  const previous = { ...edited, project: { ...edited.project, characters: [{ id: "removed", displayName: "Old role", color: "#abcdef" }] } };
  const resumed = resumeStudioSession(canonical, { session: previous, commandSerial: 1, entitySerial: 0 });
  expect(activeSourceSession(resumed).history).toHaveLength(0);
  expect(resumed.notice.detail).toContain("失效引用");
});
it("invalidates every member of a cross-scene replacement when structure rewrites one member", () => {
  const canonical = textReplaceFixture(), original = createStudioSessionFromCanonical(canonical);
  const matches = findTextReplacements(original.project, { find: "小雨", replacement: "小晴", caseSensitive: true, sceneId: "", kind: "all" }).matches;
  const edited = reduceStudioSession(original, { type: "replace-project-text", commandId: "batch", plan: createTextReplacePlan(original, matches) });
  const saved = projectCanonicalWithStory(canonical, edited.project);
  const changed = { ...saved, scenes: saved.scenes.map((scene, index) => index === 1 ? { ...scene, title: "Renamed" } : scene) };
  const resumed = resumeStudioSession(changed, { session: edited, commandSerial: 1, entitySerial: 0 });
  expect(resumed.textReplaceGroups).toEqual([]);
  expect(resumed.historyBoundary?.resetSceneNames.length).toBeGreaterThan(1);
  for (const id of edited.textReplaceGroups![0]!.sceneIds) expect(resumed.sourceSessions[id]!.history).toHaveLength(0);
  expect(reduceStudioSession(resumed, { type: "undo" }).project).toEqual(resumed.project);
});
it("retains redo across chapter moves and reports a previous boundary after later navigation", () => {
  const { edited, canonical } = fixture();
  const undone = reduceStudioSession(edited, { type: "undo" });
  const saved = projectCanonicalWithStory(canonical, undone.project);
  const resumed = resumeStudioSession(saved, { session: undone, commandSerial: 1, entitySerial: 0 });
  expect(activeSourceSession(resumed).future).toEqual(activeSourceSession(undone).future);
  expect(reduceStudioSession(resumed, { type: "redo" }).project).toEqual(edited.project);
  const reset = resumeStudioSession({ ...saved, scenes: saved.scenes.map(scene => ({ ...scene, title: "Changed" })) }, { session: resumed, commandSerial: 1, entitySerial: 0 });
  expect(reset.historyBoundary?.resetSceneNames).toHaveLength(1);
  expect(resumeStudioSession(projectCanonicalWithStory(saved, reset.project), { session: reset, commandSerial: 1, entitySerial: 0 }).historyBoundary).toEqual(reset.historyBoundary);
});
