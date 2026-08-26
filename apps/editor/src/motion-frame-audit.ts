import { useEffect, useState } from "react";

export const MOTION_FRAME_AUDIT_DURATION_MS = 1_200;
export const MOTION_FRAME_P95_BUDGET_MS = 16.7;
export const MOTION_FRAME_OVER_33_PERCENT_BUDGET = 0.02;
export const MOTION_FRAME_MINIMUM_SAMPLES = 60;

export interface MotionFrameAuditResult {
  readonly status: "idle" | "running" | "complete";
  readonly samples: number;
  readonly p95Milliseconds: number | null;
  readonly maxMilliseconds: number | null;
  readonly overBudgetFrames: number;
}

const IDLE_RESULT: MotionFrameAuditResult = {
  status: "idle",
  samples: 0,
  p95Milliseconds: null,
  maxMilliseconds: null,
  overBudgetFrames: 0
};

export function summarizeMotionFrames(deltas: readonly number[]): MotionFrameAuditResult {
  if (deltas.length === 0) return { ...IDLE_RESULT, status: "complete" };
  const ordered = [...deltas].sort((left, right) => left - right);
  const p95Index = Math.min(ordered.length - 1, Math.floor(ordered.length * 0.95));
  return {
    status: "complete",
    samples: ordered.length,
    p95Milliseconds: ordered[p95Index] ?? null,
    maxMilliseconds: ordered[ordered.length - 1] ?? null,
    overBudgetFrames: ordered.filter((duration) => duration > 33.34).length
  };
}

export function motionFrameAuditRequested(search: string): boolean {
  return new URLSearchParams(search).get("motionAudit") === "1";
}

export function motionFrameAuditPasses(result: MotionFrameAuditResult): boolean {
  return result.status === "complete" &&
    result.samples >= MOTION_FRAME_MINIMUM_SAMPLES &&
    result.p95Milliseconds !== null && result.p95Milliseconds <= MOTION_FRAME_P95_BUDGET_MS &&
    result.overBudgetFrames / result.samples <= MOTION_FRAME_OVER_33_PERCENT_BUDGET;
}

export function useMotionFrameAudit(enabled: boolean, trigger: string): MotionFrameAuditResult {
  const [result, setResult] = useState<MotionFrameAuditResult>(IDLE_RESULT);

  useEffect(() => {
    if (!enabled || typeof globalThis.requestAnimationFrame !== "function") {
      setResult(IDLE_RESULT);
      return;
    }
    let cancelled = false;
    let requestId = 0;
    let firstTimestamp: number | null = null;
    let previousTimestamp: number | null = null;
    const deltas: number[] = [];
    setResult({ ...IDLE_RESULT, status: "running" });

    const sample = (timestamp: number) => {
      if (cancelled) return;
      if (firstTimestamp === null) firstTimestamp = timestamp;
      if (previousTimestamp !== null) deltas.push(timestamp - previousTimestamp);
      previousTimestamp = timestamp;
      if (timestamp - firstTimestamp >= MOTION_FRAME_AUDIT_DURATION_MS) {
        setResult(summarizeMotionFrames(deltas));
        return;
      }
      requestId = globalThis.requestAnimationFrame(sample);
    };
    requestId = globalThis.requestAnimationFrame(sample);
    return () => {
      cancelled = true;
      globalThis.cancelAnimationFrame?.(requestId);
    };
  }, [enabled, trigger]);

  return result;
}
