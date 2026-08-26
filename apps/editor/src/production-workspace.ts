import type {
  AssetIndex,
  AssetIndexEntry,
  AssetLifecycleManifest,
  LosslessDicingDiscoveryReport
} from "@world-studio/project-persistence";

export type ProductionPhaseState = "blocked" | "current" | "ready" | "complete";

export interface ProductionPhase {
  readonly id: "intake" | "inspection" | "optimization" | "delivery";
  readonly label: string;
  readonly state: ProductionPhaseState;
  readonly detail: string;
}

export interface ProductionWorkspaceModel {
  readonly assetCount: number;
  readonly inspectedCount: number;
  readonly sourceCount: number;
  readonly derivativeCount: number;
  readonly dicingEligibleCount: number;
  readonly dicingGroupCount: number;
  readonly projectedSavingsBytes: number;
  readonly nextAction: string;
  readonly phases: readonly ProductionPhase[];
}

export function assetInspectionPassed(entry: AssetIndexEntry): boolean {
  const inspection = entry.preservedFields?.inspection;
  return typeof inspection === "object" && inspection !== null && !Array.isArray(inspection) &&
    (inspection as Record<string, unknown>).status === "pass";
}

export function assetCanEnterDicing(entry: AssetIndexEntry): boolean {
  return assetInspectionPassed(entry) && ["image/png", "image/jpeg", "image/webp"].includes(entry.source.mimeType);
}

export function createProductionWorkspaceModel(
  index: AssetIndex,
  lifecycle: AssetLifecycleManifest,
  dicingReport: LosslessDicingDiscoveryReport | null,
  storageReady: boolean
): ProductionWorkspaceModel {
  const assetCount = index.assets.length;
  const inspectedCount = index.assets.filter(assetInspectionPassed).length;
  const sourceCount = lifecycle.nodes.filter((node) => node.role === "source").length;
  const derivativeCount = lifecycle.nodes.length - sourceCount;
  const dicingEligibleCount = index.assets.filter(assetCanEnterDicing).length;
  const dicingGroupCount = dicingReport?.candidateGroups.length ?? 0;
  const projectedSavingsBytes = dicingReport?.candidateGroups.reduce(
    (total, group) => total + Math.max(0, group.report.netSavingsBytes),
    0
  ) ?? 0;

  const nextAction = !storageReady
    ? "恢复本地资源写入权"
    : assetCount === 0
      ? "导入第一项生产资源"
      : inspectedCount < assetCount
        ? "处理未通过媒体检查的资源"
        : dicingEligibleCount >= 2 && dicingReport === null
          ? "分析相似 CG 的无损切图收益"
          : dicingGroupCount > 0
            ? "审阅并发布可获益的 Atlas 候选"
            : "继续资源映射与交付审阅";

  return {
    assetCount,
    inspectedCount,
    sourceCount,
    derivativeCount,
    dicingEligibleCount,
    dicingGroupCount,
    projectedSavingsBytes,
    nextAction,
    phases: [
      {
        id: "intake",
        label: "原始资源入库",
        state: !storageReady ? "blocked" : assetCount > 0 ? "complete" : "current",
        detail: assetCount > 0 ? `${assetCount} 项资源已进入 Index r${index.indexRevision}` : "等待真实文件与稳定 Asset ID"
      },
      {
        id: "inspection",
        label: "安全检查与派生",
        state: !storageReady || assetCount === 0 ? "blocked" : inspectedCount === assetCount ? "complete" : "current",
        detail: `${inspectedCount}/${assetCount} 项签名与媒体预算通过 · ${derivativeCount} 项派生`
      },
      {
        id: "optimization",
        label: "相似 CG 无损优化",
        state: !storageReady || dicingEligibleCount < 2
          ? "blocked"
          : dicingReport === null
            ? "current"
            : dicingGroupCount > 0
              ? "ready"
              : "complete",
        detail: dicingReport === null
          ? `${dicingEligibleCount} 项可分析图片`
          : `${dicingReport.evaluatedImageCount} 项已评估 · ${dicingGroupCount} 个严格相似组`
      },
      {
        id: "delivery",
        label: "交付验证",
        state: !storageReady || assetCount === 0 ? "blocked" : "current",
        detail: "在生产流水线中执行 Loader、内存、剧情预测与资源编译门"
      }
    ]
  };
}
