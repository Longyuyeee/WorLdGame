const OWNER_KEY = "world-studio.writer-owner.v1";
const SAFE_OWNER = /^[A-Za-z0-9._-]{8,160}$/;

export interface WriterOwnerStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * A true reload reuses the tab's owner so it can renew before pagehide release finishes.
 * Normal navigation/duplicated tabs always rotate the owner even if sessionStorage was copied.
 */
export function resolveWriterLeaseOwnerId(
  storage: WriterOwnerStorage | null,
  navigationType: string | undefined,
  createId: () => string
): string {
  try {
    const stored = storage?.getItem(OWNER_KEY) ?? null;
    if (navigationType === "reload" && stored !== null && SAFE_OWNER.test(stored)) return stored;
  } catch { /* Storage can be unavailable in sandboxed/private contexts. */ }
  const created = createId();
  if (!SAFE_OWNER.test(created)) throw new Error("Writer owner generator returned an unsafe ID");
  try { storage?.setItem(OWNER_KEY, created); } catch { /* The in-memory owner remains valid. */ }
  return created;
}

export function createBrowserWriterLeaseOwnerId(): string {
  const navigation = globalThis.performance?.getEntriesByType?.("navigation")[0] as PerformanceNavigationTiming | undefined;
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const storage = typeof globalThis.sessionStorage === "undefined" ? null : globalThis.sessionStorage;
  return resolveWriterLeaseOwnerId(storage, navigation?.type, () => `writer_${random}`);
}
