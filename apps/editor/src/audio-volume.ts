/** Canonical authoring syntax accepted by Compiler's permille audio contract. */
export function normalizeAudioVolume(value: string): string | null {
  if (!value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 1 && Number.isSafeInteger(number * 1000) ? String(number) : null;
}
