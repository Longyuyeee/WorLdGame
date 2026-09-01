import { describe, expect, it } from "vitest";
import { createEmptyPlayerGamepadFrameV1, playerGamepadActionV1, type PlayerGamepadFrameV1 } from "./player-input";

function frame(buttons: readonly number[] = [], verticalAxis = 0): PlayerGamepadFrameV1 {
  return {
    buttons: Array.from({ length: 14 }, (_, index) => buttons.includes(index)),
    axes: [0, verticalAxis]
  };
}

describe("N50-E4 basic gamepad input contract", () => {
  it("maps A/B and D-pad edges without repeating a held control", () => {
    const empty = createEmptyPlayerGamepadFrameV1();
    expect(playerGamepadActionV1(empty, frame([0]))).toBe("primary");
    expect(playerGamepadActionV1(frame([0]), frame([0]))).toBeNull();
    expect(playerGamepadActionV1(empty, frame([1]))).toBe("cancel");
    expect(playerGamepadActionV1(empty, frame([12]))).toBe("previous-choice");
    expect(playerGamepadActionV1(empty, frame([13]))).toBe("next-choice");
  });

  it("maps left-stick threshold crossings once and requires release before repetition", () => {
    expect(playerGamepadActionV1(frame([], 0), frame([], 0.8))).toBe("next-choice");
    expect(playerGamepadActionV1(frame([], 0.8), frame([], 0.9))).toBeNull();
    expect(playerGamepadActionV1(frame([], 0.9), frame([], 0))).toBeNull();
    expect(playerGamepadActionV1(frame([], 0), frame([], -0.8))).toBe("previous-choice");
  });
});
