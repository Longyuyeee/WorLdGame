import { describe, expect, it } from "vitest";
import { createAssetIndex } from "@world-studio/project-persistence";
import { describeDirection } from "./direction-description";

const index = createAssetIndex();
const direction = (command: "background" | "show" | "audio" | "textbox", summary: string) => ({ kind: "direction" as const, id: "cue", command, summary });
describe("author-readable direction summaries", () => {
  it("marks unresolved media rather than displaying a technical asset id as its name", () => {
    expect(describeDirection(direction("background", "asset=missing_background transition=fade duration=300ms"), index)).toBe("切换背景 · 素材未找到 · 淡入淡出 300ms");
  });
  it("keeps the selected audio channel and volume understandable", () => {
    expect(describeDirection(direction("audio", "action=play bus=bgm volume=0.35"), index)).toBe("播放背景音乐 · 音量 35%");
  });
  it("does not summarize ambiguous or legacy arguments as a confirmed action", () => {
    for (const summary of ["action=hide action=show", "someone enters from left"]) expect(describeDirection(direction("show", summary), index)).toContain("待检查");
  });
  it("uses the actual textbox reset action", () => {
    expect(describeDirection(direction("textbox", "action=reset"), index)).toBe("恢复默认对白框");
  });
});
