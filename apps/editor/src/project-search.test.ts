import { describe, expect, it } from "vitest";
import type { StoryProject } from "@world-studio/story-core";
import { createProjectSearchIndex, searchProjectIndex } from "./project-search";

const project: StoryProject = { schemaVersion: 0, id: "project_test", title: "Test", entrySceneId: "scn_gate", characters: [], scenes: [
  { id: "scn_gate", title: "放学后的校门", statements: [
    { id: "stmt_gate", kind: "dialogue", speakerId: "char_xia", textId: "txt_gate", text: "广播站的灯还亮着" }
  ] },
  { id: "scn_roof", title: "风中的天台", statements: [
    { id: "stmt_roof_bg", kind: "direction", command: "background", summary: "雨后的天空" },
    { id: "stmt_roof_choice", kind: "choice", prompt: "是否说出约定？", options: [{ id: "opt_promise", label: "说出约定", targetSceneId: "scn_end" }] }
  ] }
] };

describe("project search", () => {
  const index = createProjectSearchIndex(project);

  it("indexes every committed scene and statement in source order", () => {
    expect(index.scenes.map((scene) => scene.sceneId)).toEqual(["scn_gate", "scn_roof"]);
    expect(index.statements.map((statement) => statement.statementId)).toEqual(["stmt_gate", "stmt_roof_bg", "stmt_roof_choice"]);
  });

  it("returns one scene opener instead of every statement for a scene title", () => {
    expect(searchProjectIndex(index, "风中的天台").matches).toEqual([
      expect.objectContaining({ sceneId: "scn_roof", statementId: "stmt_roof_bg", matchedBy: "scene" })
    ]);
  });

  it("ranks stable IDs and related IDs before content while preserving project order", () => {
    expect(searchProjectIndex(index, "STMT_ROOF_BG").matches[0]).toMatchObject({ sceneId: "scn_roof", statementIndex: 0, matchedBy: "statement-id" });
    expect(searchProjectIndex(index, "opt_promise").matches[0]).toMatchObject({ statementId: "stmt_roof_choice", matchedBy: "related-id" });
    expect(searchProjectIndex(index, "广播站").matches[0]).toMatchObject({ sceneId: "scn_gate", matchedBy: "text" });
  });

  it("caps mounted matches while reporting the complete total", () => {
    const large: StoryProject = { ...project, scenes: Array.from({ length: 120 }, (_, sceneIndex) => ({
      id: `scn_${sceneIndex}`, title: `章节 ${sceneIndex}`, statements: [{ id: `stmt_${sceneIndex}`, kind: "dialogue" as const,
        speakerId: "hero", textId: `txt_${sceneIndex}`, text: "共同关键词" }]
    })) };
    const result = searchProjectIndex(createProjectSearchIndex(large), "共同关键词", 25);
    expect(result.totalMatches).toBe(120);
    expect(result.matches).toHaveLength(25);
    expect(result.truncated).toBe(true);
  });
});
