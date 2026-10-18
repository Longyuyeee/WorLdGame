import { describe, expect, it } from "vitest";
import { createEmptyPlayerGamepadFrameV1, createPlayerGamepadTrackerV1, playerGamepadActionV1, type PlayerGamepadFrameV1 } from "./player-input";

function frame(buttons: readonly number[] = [], verticalAxis = 0): PlayerGamepadFrameV1 {
  return {
    buttons: Array.from({ length: 14 }, (_, index) => buttons.includes(index)),
    axes: [0, verticalAxis]
  };
}

describe("N50-E4 basic gamepad input contract", () => {
  it.each([0,1,12,13])("requires a neutral sample before accepting held button %s on connection or replacement",button=>{
    const track=createPlayerGamepadTrackerV1();
    for(const device of ['first','second']){
      for(let i=0;i<100;i++)expect(track({device,frame:frame([button])})).toBeNull();
      expect(track({device,frame:frame()})).toBeNull();
      expect(track({device,frame:frame([button])})).not.toBeNull();
      for(let i=0;i<100;i++)expect(track({device,frame:frame([button])})).toBeNull();
    }
    track(null);expect(track({device:'second',frame:frame([button])})).toBeNull();
  });
  it("rearms a stick only after returning to neutral and does not repeat held navigation",()=>{
    const track=createPlayerGamepadTrackerV1();
    expect(track({device:'pad',frame:frame([],0.8)})).toBeNull();
    expect(track({device:'pad',frame:frame([],0)})).toBeNull();
    expect(track({device:'pad',frame:frame([],0.8)})).toBe('next-choice');
    for(let i=0;i<100;i++)expect(track({device:'pad',frame:frame([],0.9)})).toBeNull();
  });
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
