// jsdom is the locked Vitest environment dependency; this repository intentionally does not ship its optional declaration package.
// @ts-expect-error -- runtime import is covered by the executed artifact tests below.
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import type { StoryProject } from "@world-studio/story-core";
import { buildPlayableWebArtifact, PlayableWebBuildError } from "./playable-web-export";

const project: StoryProject = {
  schemaVersion: 0,
  id: "web_closed_loop",
  title: "离线闭环",
  entrySceneId: "entry",
  characters: [{ id: "guide", displayName: "引路人", color: "#8de7ff" }],
  scenes: [
    { id: "entry", title: "入口", statements: [
      { id: "set_ready", kind: "set", variable: "ready", expression: "true" },
      { id: "if_ready", kind: "condition", expression: "ready", targetLabel: "choose" },
      { id: "wrong", kind: "end", endingName: "错误路线" },
      { id: "choose", kind: "label", name: "choose" },
      { id: "prompt", kind: "choice", prompt: "选择路线", options: [
        { id: "left", label: "晨光", targetSceneId: "morning" },
        { id: "right", label: "星空", targetSceneId: "stars" }
      ] }
    ] },
    { id: "morning", title: "晨光路线", statements: [
      { id: "morning_line", kind: "dialogue", speakerId: "guide", textId: "morning_text", text: "单文件也能运行。" },
      { id: "morning_end", kind: "end", endingName: "晨光抵达" }
    ] },
    { id: "stars", title: "星空路线", statements: [
      { id: "stars_end", kind: "end", endingName: "星空抵达" }
    ] }
  ]
};

interface ScriptDom { readonly window: Window & typeof globalThis; }

function runArtifact(html: string): ScriptDom {
  return new JSDOM(html, { runScripts: "dangerously", url: "https://offline.world.invalid/" }) as ScriptDom;
}

describe("N23 independent playable Web artifact", () => {
  it("builds deterministically and embeds a project digest", () => {
    const first = buildPlayableWebArtifact(project);
    const second = buildPlayableWebArtifact(structuredClone(project));
    expect(second).toEqual(first);
    expect(first.filename).toBe("离线闭环-playable.html");
    expect(first.projectDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(first.byteLength).toBe(new TextEncoder().encode(first.html).byteLength);
    expect(first.html).toContain(`name="world-project-sha256" content="${first.projectDigest}"`);
  });

  it.each([
    ["left", "晨光抵达"],
    ["right", "星空抵达"]
  ])("runs the exported file through option %s to ending %s", (optionId, ending) => {
    const dom = runArtifact(buildPlayableWebArtifact(project).html);
    const document = dom.window.document;
    expect(document.querySelector<HTMLElement>("#status")?.dataset.state).toBe("waiting-choice");
    document.querySelector<HTMLButtonElement>(`[data-option-id="${optionId}"]`)?.click();
    while (document.querySelector<HTMLElement>("#status")?.dataset.state === "presenting") {
      document.querySelector<HTMLButtonElement>("#next")?.click();
    }
    expect(document.querySelector("#status")?.textContent).toBe(`流程完成：${ending}`);
    expect(document.querySelector<HTMLElement>("#status")?.dataset.state).toBe("ended");
    dom.window.close();
  });

  it("escapes project text out of executable markup", () => {
    const hostile = { ...project, title: "</script><script>globalThis.pwned=true</script>" };
    const artifact = buildPlayableWebArtifact(hostile);
    const dom = runArtifact(artifact.html);
    expect((dom.window as unknown as { pwned?: boolean }).pwned).not.toBe(true);
    expect(dom.window.document.querySelector("#title")?.textContent).toBe(hostile.title);
    dom.window.close();
  });

  it("fails closed when control-flow targets are invalid", () => {
    const broken: StoryProject = {
      ...project,
      scenes: [{ id: "entry", title: "入口", statements: [
        { id: "jump", kind: "jump", targetLabel: "missing" }
      ] }]
    };
    expect(() => buildPlayableWebArtifact(broken)).toThrow(PlayableWebBuildError);
    try { buildPlayableWebArtifact(broken); }
    catch (error) { expect((error as PlayableWebBuildError).diagnostics).toEqual(expect.arrayContaining([expect.stringContaining("目标标签不存在"), expect.stringContaining("至少需要一个结局")])); }
  });
});
