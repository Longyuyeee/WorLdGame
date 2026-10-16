import { expect, it } from "vitest";
import { readStoryMotion, storyMotionError } from "./story-motion";
it("keeps legacy directions unchanged and decodes bounded visual-only defaults", () => {
  expect(readStoryMotion("show", "show", { asset: "actor" })).toBeUndefined();
  expect(readStoryMotion("show", "show", { motion: "pulse" })).toEqual({ kind: "pulse", duration: 700, strength: 1, easing: "ease-in-out", repeat: 1 });
});
it.each([
  ["show", "show", { motion: "fade-out", asset: "actor" }], ["show", "hide", { motion: "breathe" }],
  ["show", "hide", { motion: "fade-out" }], ["textbox", "set", { motion: "pulse" }],
  ["show", "show", { motion: "text-rise" }], ["audio", "play", { motion: "none" }],
  ["show", "show", { motionDuration: "500ms" }], ["show", "show", { motion: "pulse", motionDuration: "0ms" }],
  ["show", "show", { motion: "pulse", motionDuration: "5001ms" }], ["show", "show", { motion: "pulse", motionStrength: "99" }],
  ["show", "show", { motion: "pulse", motionRepeat: "infinite" }], ["show", "show", { motion: "pulse", motionRepeat: "9" }],
  ["show", "show", { motion: "pulse", motionEasing: ["linear"] }], ["show", "show", { motion: "none", motionRepeat: "1" }],
  ["show", "show", { motion: "fade-in", motionRepeat: "2" }]
] as const)("rejects invalid cue %s %s %j without a playable motion", (command, action, params) => {
  expect(storyMotionError(command, action, params)).toBeTruthy();
  expect(readStoryMotion(command, action, params)).toBeUndefined();
});
