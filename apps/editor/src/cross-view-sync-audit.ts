import { useCallback, useLayoutEffect, useRef, useState } from "react";

export const CROSS_VIEW_SYNC_BUDGET_MS = 500;

export interface CrossViewSyncAuditResult {
  readonly status: "idle" | "pending" | "complete";
  readonly action: string;
  readonly statementId: string;
  readonly sourceRevision: number;
  readonly projectedRevision: number;
  readonly durationMilliseconds: number | null;
}

const IDLE: CrossViewSyncAuditResult = {
  status: "idle",
  action: "",
  statementId: "",
  sourceRevision: 0,
  projectedRevision: 0,
  durationMilliseconds: null
};

function monotonicNow(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

export function crossViewSyncAuditRequested(search: string): boolean {
  return new URLSearchParams(search).get("syncAudit") === "1";
}

export function crossViewSyncAuditPasses(result: CrossViewSyncAuditResult): boolean {
  return result.status === "complete" && result.durationMilliseconds !== null &&
    result.projectedRevision > result.sourceRevision && result.durationMilliseconds <= CROSS_VIEW_SYNC_BUDGET_MS;
}

export function useCrossViewSyncAudit(enabled: boolean, projectedRevision: number) {
  const pending = useRef<Readonly<{ action: string; statementId: string; sourceRevision: number; startedAt: number }> | null>(null);
  const [result, setResult] = useState<CrossViewSyncAuditResult>(IDLE);

  const begin = useCallback((action: string, statementId: string, sourceRevision: number) => {
    if (!enabled) return;
    pending.current = { action, statementId, sourceRevision, startedAt: monotonicNow() };
    setResult({ status: "pending", action, statementId, sourceRevision, projectedRevision: sourceRevision, durationMilliseconds: null });
  }, [enabled]);

  useLayoutEffect(() => {
    const current = pending.current;
    if (!enabled || current === null || projectedRevision <= current.sourceRevision) return;
    pending.current = null;
    setResult({
      status: "complete",
      action: current.action,
      statementId: current.statementId,
      sourceRevision: current.sourceRevision,
      projectedRevision,
      durationMilliseconds: Math.max(0, monotonicNow() - current.startedAt)
    });
  }, [enabled, projectedRevision]);

  return { begin, result } as const;
}
