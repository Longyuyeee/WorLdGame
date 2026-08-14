import { loadProject, migrateS0Project, type S0Project } from "@world-studio/project-domain";
import { describe, expect, it } from "vitest";
import { createStudioSessionFromCanonical } from "./studio-session";

const project: S0Project = { schemaVersion: 0, id: "project_arbitrary", title: "Arbitrary", entrySceneId: "scene_only", characters: [{ id: "character_author", displayName: "Author", color: "#123456" }], scenes: [{ id: "scene_only", title: "Only Scene", statements: [{ id: "statement_line", kind: "dialogue", speakerId: "character_author", textId: "text_line", text: "Editable from canonical files." }, { id: "statement_end", kind: "end", endingName: "Done" }] }] };

describe("Canonical project editor adapter", () => {
  it("creates an editable session without the campus sample identity or scene constants", () => {
    const canonical = loadProject(migrateS0Project(project).files);
    const session = createStudioSessionFromCanonical(canonical);
    expect(session.project.id).toBe("project_arbitrary");
    expect(session.project.scenes.map((scene) => scene.id)).toEqual(["scene_only"]);
    expect(session.sourceSessions.scene_only?.committedSource).toContain("Editable from canonical files.");
  });
});
