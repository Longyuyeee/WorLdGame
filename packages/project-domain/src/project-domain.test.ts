import { describe, expect, it } from "vitest";
import { createStableId, loadProject, migrateS0Project, probeProject, saveProject, semanticHash, type S0Project } from "./index";

const tiny: S0Project = { schemaVersion: 0, id: "project_tiny", title: "Tiny", entrySceneId: "scene_start", characters: [{ id: "character_guide", displayName: "Guide", color: "#fff" }], scenes: [{ id: "scene_start", title: "Start", statements: [{ id: "statement_line", kind: "dialogue", speakerId: "character_guide", textId: "text_line", text: "Hello" }, { id: "statement_end", kind: "end", endingName: "Done" }] }] };
const branching: S0Project = { schemaVersion: 0, id: "project_branching", title: "Branching", entrySceneId: "scene_fork", characters: [], scenes: [{ id: "scene_fork", title: "Fork", statements: [{ id: "statement_choice", kind: "choice", prompt: "Choose", options: [{ id: "option_left", label: "Left", targetSceneId: "scene_left" }, { id: "option_right", label: "Right", targetSceneId: "scene_right" }] }] }, { id: "scene_left", title: "Left", statements: [{ id: "statement_left_end", kind: "end", endingName: "Left" }] }, { id: "scene_right", title: "Right", statements: [{ id: "statement_right_end", kind: "end", endingName: "Right" }] }] };

describe("Canonical Project Schema", () => {
  it.each([tiny, branching])("round-trips a structurally distinct project with a stable semantic hash", (source) => {
    const migrated = migrateS0Project(source); const loaded = loadProject(migrated.files); const hash = semanticHash(loaded);
    const reloaded = loadProject(saveProject(loaded));
    expect(semanticHash(reloaded)).toBe(hash); expect(reloaded.manifest.projectId).toBe(source.id); expect(reloaded.scenes).toHaveLength(source.scenes.length);
  });
  it("preserves unknown JSON fields through load and save", () => {
    const files = { ...migrateS0Project(tiny).files }; const manifest = JSON.parse(files["world.project.json"] ?? "{}"); manifest.vendorExtension = { enabled: true }; files["world.project.json"] = JSON.stringify(manifest);
    const saved = saveProject(loadProject(files)); expect(JSON.parse(saved["world.project.json"] ?? "{}").vendorExtension).toEqual({ enabled: true });
  });
  it("probes a future version without loading it for edit", () => {
    const files = { ...migrateS0Project(tiny).files, "world.project.json": JSON.stringify({ schemaVersion: 9, projectId: "project_future", title: "Future" }) };
    expect(probeProject(files)).toEqual({ status: "future-read-only", schemaVersion: 9, projectId: "project_future", title: "Future" }); expect(() => loadProject(files)).toThrow(/read-only/);
  });
  it("rejects duplicate stable IDs", () => {
    const invalid = { ...tiny, scenes: [{ ...tiny.scenes[0]!, statements: [{ id: "character_guide", kind: "end", endingName: "Collision" }] }] };
    expect(() => migrateS0Project(invalid)).toThrow(/Duplicate stable ID/);
  });
  it("rejects broken speaker and choice-target references", () => {
    const broken = { ...tiny, scenes: [{ ...tiny.scenes[0]!, statements: [{ id: "statement_bad", kind: "dialogue", speakerId: "character_missing", textId: "text_bad", text: "Broken" }] }] };
    expect(() => migrateS0Project(broken)).toThrow(/references unknown ID/);
  });
  it("is idempotent after the S0 migration", () => {
    const first = migrateS0Project(tiny); const second = migrateS0Project(first.files); expect(second.status).toBe("already-current"); expect(second.files).toEqual(first.files);
  });
  it("generates a portable ID from durable entropy without coupling it to a display name", () => {
    expect(createStableId("scene", "018f08d8-71a1-7bc2-a627-2f4a843ee001")).toBe("scene_172ae3361b856872c8ad");
  });
  it("treats derived caches as disposable and excludes them from semantic round-trips", () => {
    const migrated = migrateS0Project(tiny); const withCache = { ...migrated.files, ".world-cache/index.json": "{\"stale\":true}" };
    const loaded = loadProject(withCache); expect(saveProject(loaded)[".world-cache/index.json"]).toBeUndefined(); expect(semanticHash(loaded)).toBe(semanticHash(loadProject(migrated.files)));
  });
});
