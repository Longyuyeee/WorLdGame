import { projectCanonicalFromStory } from "./canonical-project-adapter";

export function branchAuthoringFixture() {
  const project = projectCanonicalFromStory({ schemaVersion: 0, id: "branch_authoring_story", title: "分支创作流程", entrySceneId: "entry", characters: [], scenes: [
    { id: "entry", title: "车站选择", statements: [
      { id: "set_count", kind: "set", variable: "count", expression: "0" },
      { id: "set_ready", kind: "set", variable: "ready", expression: "false" },
      { id: "set_note", kind: "set", variable: "note", expression: '"起点"' },
      { id: "condition", kind: "condition", expression: "ready && count >= 2", targetLabel: "choose" },
      { id: "intro", kind: "narration", textId: "intro_text", text: "雨声渐渐停下，你会走向哪里？" },
      { id: "choose_label", kind: "label", name: "choose" },
      { id: "choice", kind: "choice", prompt: "选择下一段故事", options: [
        { id: "option_a", label: "留在车站", targetSceneId: "scene_a" }, { id: "option_b", label: "乘车出发", targetSceneId: "scene_b" }
      ] }
    ] },
    ...["a", "b", "c"].map((route, index) => ({ id: `scene_${route}`, title: ["留下", "远行", "同行"][index]!, statements: [
      { id: `line_${route}`, kind: "narration" as const, textId: `text_${route}`, text: ["你留在了车站。", "你踏上远行的列车。", "你和朋友一起走出车站。"][index]! },
      { id: `end_${route}`, kind: "end" as const, endingName: ["留下的约定", "远行的约定", "同行的约定"][index]! }
    ] }))
  ] }, "branch_authoring_project");
  return { ...project, variables: { ...project.variables, variables: [
    { id: "count", name: "同行次数", type: "number", defaultValue: 0, scope: "story" },
    { id: "ready", name: "愿意同行", type: "boolean", defaultValue: false, scope: "story" },
    { id: "note", name: "约定内容", type: "string", defaultValue: "", scope: "story" }
  ] } };
}
