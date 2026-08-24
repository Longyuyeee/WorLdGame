import { loadProject, migrateS0Project, saveProject, type S0Project } from "@world-studio/project-domain";
import { campusStoryProject } from "@world-studio/story-core";
import { createBlobDigest, type AssetIndex } from "@world-studio/project-persistence";
import { describe, expect, it } from "vitest";
import { createStudioSessionFromCanonical } from "./studio-session";
import { projectCanonicalForEditor, projectCanonicalFromStory, projectCanonicalWithAssetIndex, projectCanonicalWithStory } from "./canonical-project-adapter";

const project: S0Project = { schemaVersion: 0, id: "project_arbitrary", title: "Arbitrary", entrySceneId: "scene_only", characters: [{ id: "character_author", displayName: "Author", color: "#123456" }], scenes: [{ id: "scene_only", title: "Only Scene", statements: [{ id: "statement_line", kind: "dialogue", speakerId: "character_author", textId: "text_line", text: "Editable from canonical files." }, { id: "statement_end", kind: "end", endingName: "Done" }] }] };

describe("Canonical project editor adapter", () => {
  it("creates an editable session without the campus sample identity or scene constants", () => {
    const canonical = loadProject(migrateS0Project(project).files);
    const session = createStudioSessionFromCanonical(canonical);
    expect(session.project.id).toBe("project_arbitrary");
    expect(session.project.scenes.map((scene) => scene.id)).toEqual(["scene_only"]);
    expect(session.sourceSessions.scene_only?.committedSource).toContain("Editable from canonical files.");
  });

  it("materializes the playable sample as a lossless canonical project", () => {
    const canonical = loadProject(saveProject(projectCanonicalFromStory(campusStoryProject, "sample-entropy")));
    const session = createStudioSessionFromCanonical(canonical);
    expect(session.project.scenes).toHaveLength(3);
    expect(session.project.characters).toHaveLength(2);
    expect(session.project.scenes[0]?.statements.at(-1)).toMatchObject({ kind: "choice" });
    expect(session.project.scenes.slice(1).map((scene) => scene.statements.at(-1))).toMatchObject([
      { kind: "end", endingName: "留在电波里的名字" },
      { kind: "end", endingName: "晚风知道答案" }
    ]);
  });

  it("writes edited story content back without losing canonical variables or character metadata", () => {
    const canonical = projectCanonicalFromStory(campusStoryProject, "bridge-entropy");
    const withDomainData = {
      ...canonical,
      variables: { schemaVersion: 1 as const, variables: [{ id: "variable_route", name: "Route", type: "string", defaultValue: "", pluginMetadata: { owner: "test" } }] },
      characters: { schemaVersion: 1 as const, characters: canonical.characters.characters.map((item) => ({ ...item, portraitSlots: ["main"], defaultExpression: "neutral" })) }
    };
    const edited = {
      ...campusStoryProject,
      scenes: campusStoryProject.scenes.map((scene, index) => index === 0 ? {
        ...scene,
        title: "Renamed through canonical bridge",
        statements: [...scene.statements, { id: "statement_saved", kind: "set" as const, variable: "route", expression: '"radio"' }]
      } : scene)
    };
    const reopened = loadProject(saveProject(projectCanonicalWithStory(withDomainData, edited)));
    expect(reopened.variables.variables).toEqual(withDomainData.variables.variables);
    expect(reopened.characters.characters[0]).toMatchObject({ portraitSlots: ["main"], defaultExpression: "neutral" });
    expect(reopened.scenes[0]).toMatchObject({ id: "scn_school_gate", title: "Renamed through canonical bridge" });
    expect(projectCanonicalForEditor(reopened).project.scenes[0]?.statements.at(-1)).toMatchObject({ id: "statement_saved", kind: "set" });
    const projected = projectCanonicalForEditor(withDomainData).project;
    expect(projectCanonicalWithStory(withDomainData, projected).variables.variables[0]).toMatchObject({ pluginMetadata: { owner: "test" }, scope: "story" });
  });

  it("projects the authoritative Asset Index into canonical declarations without losing asset metadata", () => {
    const canonical = projectCanonicalFromStory(campusStoryProject, "asset-index-bridge");
    const withMetadata = {
      ...canonical,
      assets: {
        ...canonical.assets,
        preservedFields: { owner: "asset-domain" },
        assets: [
          { assetId: "hero", kind: "character", license: "CC0", pluginMetadata: { importer: "test" } },
          { assetId: "external_voice", kind: "audio", package: "portable-dlc" }
        ]
      }
    };
    const bytes = new Uint8Array([1, 2, 3]);
    const index: AssetIndex = {
      schemaVersion: 1,
      indexRevision: 7,
      assets: [{
        assetId: "hero",
        kind: "character",
        displayName: "Hero",
        source: { digest: createBlobDigest(bytes), byteLength: bytes.byteLength, mimeType: "image/png" },
        tags: ["lead"]
      }]
    };

    const projected = projectCanonicalWithAssetIndex(withMetadata, index);

    expect(projected.assets.preservedFields).toEqual({ owner: "asset-domain" });
    expect(projected.assets.assets).toEqual([
      { assetId: "external_voice", kind: "audio", package: "portable-dlc" },
      expect.objectContaining({
        assetId: "hero",
        kind: "character",
        displayName: "Hero",
        license: "CC0",
        pluginMetadata: { importer: "test" },
        source: { digest: createBlobDigest(bytes), byteLength: 3, mimeType: "image/png" },
        tags: ["lead"]
      })
    ]);
  });
});
