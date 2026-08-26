import { describe, expect, it } from "vitest";
import { CROSS_VIEW_SYNC_BUDGET_MS, crossViewSyncAuditPasses, crossViewSyncAuditRequested } from "./cross-view-sync-audit";

describe("N43-E4 cross-view sync audit", () => {
  it("only enables explicit local instrumentation", () => {
    expect(crossViewSyncAuditRequested("?syncAudit=1")).toBe(true);
    expect(crossViewSyncAuditRequested("?syncAudit=0")).toBe(false);
    expect(crossViewSyncAuditRequested("")).toBe(false);
  });

  it("requires a newer projection inside the 500ms budget", () => {
    const passing = { status: "complete" as const, action: "patch-dialogue", statementId: "stmt", sourceRevision: 4, projectedRevision: 5, durationMilliseconds: CROSS_VIEW_SYNC_BUDGET_MS };
    expect(crossViewSyncAuditPasses(passing)).toBe(true);
    expect(crossViewSyncAuditPasses({ ...passing, projectedRevision: 4 })).toBe(false);
    expect(crossViewSyncAuditPasses({ ...passing, durationMilliseconds: CROSS_VIEW_SYNC_BUDGET_MS + 0.01 })).toBe(false);
  });
});
