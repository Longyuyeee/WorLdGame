import type { CSSProperties } from "react";
import type { StoryMotion } from "@world-studio/story-core";
export function storyMotionStyle(motion: StoryMotion | undefined): CSSProperties {
  return !motion || motion.kind === "none" ? {} : {
    animationName: `story-${motion.kind}`, animationDuration: `${motion.duration}ms`, animationTimingFunction: motion.easing,
    animationIterationCount: motion.repeat, animationFillMode: "both", "--story-motion-strength": motion.strength
  } as CSSProperties;
}
