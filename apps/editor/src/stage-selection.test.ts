import { describe, expect, it } from "vitest";
import { selectStageDirectionLane, selectStageDirectionRange } from "./stage-selection";

const directions = [
  { id: "bg_1", command: "background" as const },
  { id: "show_1", command: "show" as const },
  { id: "bg_2", command: "background" as const },
  { id: "audio_1", command: "audio" as const },
  { id: "bg_3", command: "background" as const }
];

describe("stage direction selection", () => {
  it("selects an inclusive same-command range in source order", () => {
    expect(selectStageDirectionRange(directions, "bg_3", "bg_1", 256)).toEqual({
      ok: true,
      command: "background",
      statementIds: ["bg_1", "bg_2", "bg_3"]
    });
  });

  it("rejects mixed endpoints, stale IDs, and oversized ranges without partial IDs", () => {
    expect(selectStageDirectionRange(directions, "bg_1", "show_1", 256)).toEqual(expect.objectContaining({
      ok: false, error: expect.objectContaining({ code: "SELECTION_MIXED_COMMANDS" })
    }));
    expect(selectStageDirectionRange(directions, "missing", "bg_3", 256)).toEqual(expect.objectContaining({
      ok: false, error: expect.objectContaining({ code: "SELECTION_TARGET_NOT_FOUND" })
    }));
    expect(selectStageDirectionRange(directions, "bg_1", "bg_3", 2)).toEqual(expect.objectContaining({
      ok: false, error: expect.objectContaining({ code: "SELECTION_LIMIT" })
    }));
  });

  it("selects a complete lane or rejects it instead of truncating", () => {
    expect(selectStageDirectionLane(directions, "background", 256)).toEqual({
      ok: true,
      command: "background",
      statementIds: ["bg_1", "bg_2", "bg_3"]
    });
    expect(selectStageDirectionLane(directions, "background", 2)).toEqual(expect.objectContaining({
      ok: false, error: expect.objectContaining({ code: "SELECTION_LIMIT" })
    }));
  });
});
