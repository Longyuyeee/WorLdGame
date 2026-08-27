export interface PlayerGamepadFrameV1 {
  readonly buttons: readonly boolean[];
  readonly axes: readonly number[];
}

export type PlayerGamepadActionV1 = "primary" | "cancel" | "previous-choice" | "next-choice";

function pressed(frame: PlayerGamepadFrameV1, index: number): boolean {
  return frame.buttons[index] === true;
}

function rising(previous: PlayerGamepadFrameV1, current: PlayerGamepadFrameV1, index: number): boolean {
  return pressed(current, index) && !pressed(previous, index);
}

export function createEmptyPlayerGamepadFrameV1(): PlayerGamepadFrameV1 {
  return { buttons: [], axes: [] };
}

export function playerGamepadActionV1(previous: PlayerGamepadFrameV1, current: PlayerGamepadFrameV1): PlayerGamepadActionV1 | null {
  const previousY = previous.axes[1] ?? 0;
  const currentY = current.axes[1] ?? 0;
  if (rising(previous, current, 12) || (currentY < -0.65 && previousY >= -0.65)) return "previous-choice";
  if (rising(previous, current, 13) || (currentY > 0.65 && previousY <= 0.65)) return "next-choice";
  if (rising(previous, current, 0)) return "primary";
  if (rising(previous, current, 1)) return "cancel";
  return null;
}

export function browserGamepadFrameV1(gamepad: Gamepad): PlayerGamepadFrameV1 {
  return {
    buttons: gamepad.buttons.map((button) => button.pressed),
    axes: [...gamepad.axes]
  };
}
