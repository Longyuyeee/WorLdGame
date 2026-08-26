import { describe, expect, it } from "vitest";
import {
  createAssetIndex,
  createAssetLifecycleManifest,
  type AssetIndex,
  type LosslessDicingDiscoveryReport
} from "@world-studio/project-persistence";
import { createProductionWorkspaceModel } from "./production-workspace";

const DIGEST = `sha256:${"a".repeat(64)}` as const;

function inspectedIndex(count = 2): AssetIndex {
  return {
    schemaVersion: 1,
    indexRevision: count,
    assets: Array.from({ length: count }, (_, index) => ({
      assetId: `cg_${index + 1}`,
      kind: "cg" as const,
      displayName: `CG ${index + 1}`,
      source: { digest: DIGEST, byteLength: 4096, mimeType: "image/png" },
      tags: ["chapter-1"],
      preservedFields: { inspection: { status: "pass", format: "PNG" } }
    }))
  };
}

describe("N43 Production workspace projection", () => {
  it("fails closed when local production storage is unavailable", () => {
    const index = createAssetIndex();
    const model = createProductionWorkspaceModel(index, createAssetLifecycleManifest(index, 0), null, false);
    expect(model.nextAction).toBe("恢复本地资源写入权");
    expect(model.phases.map((phase) => phase.state)).toEqual(["blocked", "blocked", "blocked", "blocked"]);
  });

  it("derives intake, inspection and dicing work from the authoritative asset manifests", () => {
    const index = inspectedIndex();
    const lifecycle = createAssetLifecycleManifest(index, 0);
    const before = createProductionWorkspaceModel(index, lifecycle, null, true);
    expect(before).toMatchObject({
      assetCount: 2,
      inspectedCount: 2,
      sourceCount: 1,
      derivativeCount: 0,
      dicingEligibleCount: 2,
      dicingGroupCount: 0,
      nextAction: "分析相似 CG 的无损切图收益"
    });
    expect(before.phases.map((phase) => phase.state)).toEqual(["complete", "complete", "current", "current"]);

    const report = {
      schemaVersion: 1,
      algorithm: "lossless-rgba-dicing-discovery/v1",
      evaluatedImageCount: 2,
      minSharedTileRatio: 0.35,
      candidateGroups: [{
        groupId: "group_1",
        assetIds: ["cg_1", "cg_2"],
        minimumPairSimilarity: 1,
        report: { netSavingsBytes: 8192 }
      }],
      unassignedAssetIds: [],
      discoveryDigest: DIGEST
    } as unknown as LosslessDicingDiscoveryReport;
    const after = createProductionWorkspaceModel(index, lifecycle, report, true);
    expect(after.dicingGroupCount).toBe(1);
    expect(after.projectedSavingsBytes).toBe(8192);
    expect(after.nextAction).toBe("审阅并发布可获益的 Atlas 候选");
    expect(after.phases[2]?.state).toBe("ready");
  });
});
