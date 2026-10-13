import { expect, it } from "vitest";
import { normalizeAudioVolume } from "./audio-volume";
it("canonicalizes valid shorthand and rejects non-permille values before source submission", () => {
  for (const [input, output] of [[".3", "0.3"], [" 0.2000 ", "0.2"], ["1e-3", "0.001"], ["1", "1"], ["0", "0"]]) expect(normalizeAudioVolume(input!)).toBe(output);
  for (const input of ["", " ", "0.1234", "1.2", "-1", "NaN", "Infinity"]) expect(normalizeAudioVolume(input)).toBeNull();
});
