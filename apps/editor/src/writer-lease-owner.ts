const OWNER_KEY = "world-studio.writer-owner.v1";
const HANDOFF_KEY = "world-studio.writer-owner-handoff.v1";
const SAFE_OWNER = /^[A-Za-z0-9._-]{8,160}$/;
const HANDOFF_TTL_MS = 30_000;

export interface WriterOwnerStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

interface WriterOwnerHandoff {
  readonly ownerId: string;
  readonly expiresAt: number;
}

function readFreshHandoff(storage: WriterOwnerStorage | null, now: number): WriterOwnerHandoff | null {
  try {
    const source = storage?.getItem(HANDOFF_KEY);
    storage?.removeItem?.(HANDOFF_KEY);
    if (source === null || source === undefined) return null;
    const value = JSON.parse(source) as Partial<WriterOwnerHandoff>;
    if (typeof value.ownerId !== "string" || !SAFE_OWNER.test(value.ownerId) ||
        typeof value.expiresAt !== "number" || !Number.isSafeInteger(value.expiresAt) || value.expiresAt < now) return null;
    return { ownerId: value.ownerId, expiresAt: value.expiresAt };
  } catch { return null; }
}

export function markWriterLeaseOwnerHandoff(
  storage: WriterOwnerStorage | null,
  ownerId: string,
  now = Date.now()
): void {
  if (!SAFE_OWNER.test(ownerId)) return;
  try { storage?.setItem(HANDOFF_KEY, JSON.stringify({ ownerId, expiresAt: now + HANDOFF_TTL_MS })); } catch { /* Reload falls back to navigation detection. */ }
}

/**
 * A true reload reuses the tab's owner so it can renew before pagehide release finishes.
 * Normal navigation/duplicated tabs always rotate the owner even if sessionStorage was copied.
 */
export function resolveWriterLeaseOwnerId(
  storage: WriterOwnerStorage | null,
  navigationType: string | undefined,
  createId: () => string,
  now = Date.now()
): string {
  try {
    const stored = storage?.getItem(OWNER_KEY) ?? null;
    const handoff = readFreshHandoff(storage, now);
    if (stored !== null && SAFE_OWNER.test(stored) &&
        (navigationType === "reload" || handoff?.ownerId === stored)) return stored;
  } catch { /* Storage can be unavailable in sandboxed/private contexts. */ }
  const created = createId();
  if (!SAFE_OWNER.test(created)) throw new Error("Writer owner generator returned an unsafe ID");
  try { storage?.setItem(OWNER_KEY, created); } catch { /* The in-memory owner remains valid. */ }
  return created;
}

export function markBrowserWriterLeaseOwnerHandoff(ownerId: string): void {
  const storage = typeof globalThis.sessionStorage === "undefined" ? null : globalThis.sessionStorage;
  markWriterLeaseOwnerHandoff(storage, ownerId);
}

export function createBrowserWriterLeaseOwnerId(): string {
  const navigation = globalThis.performance?.getEntriesByType?.("navigation")[0] as PerformanceNavigationTiming | undefined;
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const storage = typeof globalThis.sessionStorage === "undefined" ? null : globalThis.sessionStorage;
  return resolveWriterLeaseOwnerId(storage, navigation?.type, () => `writer_${random}`);
}
