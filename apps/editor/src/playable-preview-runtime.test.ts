import { describe, expect, it } from "vitest";
import { campusStoryProject, type StoryProject } from "@world-studio/story-core";
import {
  advancePlayablePreview,
  selectPlayableChoice,
  startPlayablePreview
} from "./playable-preview-runtime";

function runUntilChoice(project: StoryProject) {
  let state = startPlayablePreview(project);
  while (state.status === "presenting") state = advancePlayablePreview(project, state);
  return state;
}

describe("playable preview runtime", () => {
  it("runs the sample project through a real choice into either ending", () => {
    const waiting = runUntilChoice(campusStoryProject);
    expect(waiting.status).toBe("waiting-choice");

    let radio = selectPlayableChoice(campusStoryProject, waiting, "opt_broadcast");
    while (radio.status === "presenting") radio = advancePlayablePreview(campusStoryProject, radio);
    expect(radio).toMatchObject({ status: "ended", endingName: "留在电波里的名字" });
    expect(radio.visitedSceneIds).toEqual(["scn_school_gate", "scn_broadcast_room"]);

    let rooftop = selectPlayableChoice(campusStoryProject, waiting, "opt_rooftop");
    while (rooftop.status === "presenting") rooftop = advancePlayablePreview(campusStoryProject, rooftop);
    expect(rooftop).toMatchObject({ status: "ended", endingName: "晚风知道答案" });
  });

  it("executes set and condition before presenting the selected route", () => {
    const project: StoryProject = {
      schemaVersion: 0, id: "conditional", title: "Conditional", characters: [], entrySceneId: "start",
      scenes: [{ id: "start", title: "Start", statements: [
        { id: "set", kind: "set", variable: "flag", expression: "true" },
        { id: "if", kind: "condition", expression: "flag", targetLabel: "yes" },
        { id: "wrong", kind: "end", endingName: "Wrong" },
        { id: "label", kind: "label", name: "yes" },
        { id: "right", kind: "end", endingName: "Right" }
      ] }]
    };
    expect(startPlayablePreview(project)).toMatchObject({ status: "ended", endingName: "Right", variables: { flag: true } });
  });

  it("executes call and return without losing the continuation", () => {
    const project: StoryProject = {
      schemaVersion: 0, id: "call", title: "Call", characters: [], entrySceneId: "start",
      scenes: [{ id: "start", title: "Start", statements: [
        { id: "call", kind: "call", targetLabel: "sub" },
        { id: "end", kind: "end", endingName: "Returned" },
        { id: "sub", kind: "label", name: "sub" },
        { id: "set", kind: "set", variable: "visited", expression: "true" },
        { id: "return", kind: "return" }
      ] }]
    };
    expect(startPlayablePreview(project)).toMatchObject({ status: "ended", endingName: "Returned", variables: { visited: true } });
  });

  it("fails closed for unknown variables and missing labels", () => {
    const unknown: StoryProject = {
      schemaVersion: 0, id: "unknown", title: "Unknown", characters: [], entrySceneId: "start",
      scenes: [{ id: "start", title: "Start", statements: [
        { id: "if", kind: "condition", expression: "missing", targetLabel: "nowhere" },
        { id: "end", kind: "end", endingName: "Never" }
      ] }]
    };
    expect(startPlayablePreview(unknown)).toMatchObject({ status: "error" });
    expect(startPlayablePreview(unknown).error).toContain("Unknown variable");
  });

  it("stops deterministic control-flow loops at the execution budget", () => {
    const looping: StoryProject = {
      schemaVersion: 0, id: "loop", title: "Loop", characters: [], entrySceneId: "start",
      scenes: [{ id: "start", title: "Start", statements: [
        { id: "label", kind: "label", name: "again" },
        { id: "jump", kind: "jump", targetLabel: "again" }
      ] }]
    };
    expect(startPlayablePreview(looping)).toMatchObject({ status: "error", error: "控制流超过 1000 步，可能存在无限循环" });
  });
});
