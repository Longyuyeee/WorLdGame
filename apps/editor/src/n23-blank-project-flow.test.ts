import {
  createProject,
  createProjectService,
  executeProjectBatch,
  exportLifecycleProject,
  importLifecycleProject,
  markProjectDirty,
  openProject,
  saveLifecycleProject,
  semanticHash,
  type ProjectCommand,
  type ProjectFiles,
  type ProjectReference,
  type ProjectWorkspace
} from "@world-studio/project-domain";
import type { StoryProject } from "@world-studio/story-core";
import { describe, expect, it } from "vitest";
import { projectCanonicalForEditor, projectCanonicalWithStory } from "./canonical-project-adapter";
import { advancePlayablePreview, selectPlayableChoice, startPlayablePreview } from "./playable-preview-runtime";

class MemoryWorkspace implements ProjectWorkspace {
  readonly reference: ProjectReference = { referenceId: "n23-e2", hostKind: "memory-test", displayLocation: "Memory/N23-E2", permissionKey: "n23-e2" };
  files: ProjectFiles = {};
  version = 0;
  async readFiles() { return { files: this.files, version: String(this.version) }; }
  async writeFiles(files: ProjectFiles, expectedVersion: string | null) {
    if (expectedVersion !== null && expectedVersion !== String(this.version)) throw new Error("stale workspace");
    this.files = structuredClone(files);
    this.version += 1;
    return { version: String(this.version) };
  }
}

function playToEnding(project: StoryProject, optionId: string) {
  let state = startPlayablePreview(project);
  while (state.status === "presenting") state = advancePlayablePreview(project, state);
  state = selectPlayableChoice(project, state, optionId);
  while (state.status === "presenting") state = advancePlayablePreview(project, state);
  return state;
}

describe("N23-E2 blank-project playable Golden", () => {
  it("creates domain entities, saves canonical content, reopens, exports and plays both routes without sample constants", async () => {
    const workspace = new MemoryWorkspace();
    const created = await createProject(workspace, "N23 E2 Golden", "n23-e2-empty-project");
    const entrySceneId = created.project!.manifest.entrySceneId;
    const chapterId = created.project!.chapters[0]!.id;
    const service = createProjectService(created.project!);
    const commands = [
      { kind: "scene.rename", sceneId: entrySceneId, title: "入口" },
      { kind: "scene.create", chapterId, sceneId: "scene_morning", title: "晨光路线" },
      { kind: "scene.create", chapterId, sceneId: "scene_stars", title: "星空路线" },
      { kind: "character.create", character: { id: "character_a", displayName: "阿澄", color: "#8b7cff", portraitSlots: ["main"], defaultExpression: "neutral" } },
      { kind: "character.create", character: { id: "character_b", displayName: "小夜", color: "#ff62a5", portraitSlots: ["main"], defaultExpression: "neutral" } },
      { kind: "variable.create", variable: { id: "variable_route", name: "route", type: "string", defaultValue: "none", scope: "story" } }
    ].map((value, index) => ({ commandId: `command_${index}`, expectedRevision: 0, ...value })) as ProjectCommand[];
    const structured = executeProjectBatch(service, commands);
    expect(structured.ok).toBe(true);
    if (!structured.ok) return;

    const story: StoryProject = {
      schemaVersion: 0,
      id: structured.state.project.manifest.projectId,
      title: "N23 E2 Golden",
      entrySceneId,
      characters: [
        { id: "character_a", displayName: "阿澄", color: "#8b7cff" },
        { id: "character_b", displayName: "小夜", color: "#ff62a5" }
      ],
      scenes: [
        { id: entrySceneId, title: "入口", statements: [
          { id: "statement_intro", kind: "dialogue", speakerId: "character_a", textId: "text_intro", text: "今天从哪一条路线出发？" },
          { id: "statement_set", kind: "set", variable: "variable_route", expression: '"start"' },
          { id: "statement_condition", kind: "condition", expression: 'variable_route == "start"', targetLabel: "ready" },
          { id: "statement_label", kind: "label", name: "ready" },
          { id: "statement_choice", kind: "choice", prompt: "选择你的路线", options: [
            { id: "option_morning", label: "迎接晨光", targetSceneId: "scene_morning" },
            { id: "option_stars", label: "仰望星空", targetSceneId: "scene_stars" }
          ] }
        ] },
        { id: "scene_morning", title: "晨光路线", statements: [
          { id: "statement_morning_line", kind: "dialogue", speakerId: "character_b", textId: "text_morning", text: "第一束光照亮了真正可运行的工程。" },
          { id: "statement_morning_end", kind: "end", endingName: "晨光抵达" }
        ] },
        { id: "scene_stars", title: "星空路线", statements: [
          { id: "statement_stars_line", kind: "dialogue", speakerId: "character_b", textId: "text_stars", text: "星光记录了保存、重开与再次运行。" },
          { id: "statement_stars_end", kind: "end", endingName: "星空抵达" }
        ] }
      ]
    };

    const dirty = markProjectDirty(created, projectCanonicalWithStory(structured.state.project, story));
    const saved = await saveLifecycleProject(workspace, dirty);
    const reopened = await openProject(workspace);
    const exported = importLifecycleProject(exportLifecycleProject(reopened));
    expect(semanticHash(exported)).toBe("56c361a9b16d1fd532e280f4f21ee5e131d9bdaef7765365c6d88d4f3d7cb0e1");
    expect(semanticHash(exported)).toBe(semanticHash(saved.project!));
    expect(exported.variables.variables).toMatchObject([{ id: "variable_route", name: "route" }]);

    const reopenedStory = projectCanonicalForEditor(exported).project;
    expect(reopenedStory.id).not.toBe("prj_twilight_broadcast");
    expect(playToEnding(reopenedStory, "option_morning")).toMatchObject({ status: "ended", endingName: "晨光抵达" });
    expect(playToEnding(reopenedStory, "option_stars")).toMatchObject({ status: "ended", endingName: "星空抵达" });
  });
});
