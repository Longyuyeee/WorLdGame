import { deriveRouteGraph, findScene, type EntityId, type StoryProject } from "./model";

export interface SceneResourceManifestEntry {
  readonly sceneId: EntityId;
  readonly assetIds: readonly EntityId[];
}

export interface SceneResourceManifest {
  readonly schemaVersion: 1;
  readonly scenes: readonly SceneResourceManifestEntry[];
}

export type StoryResourceRole = "current" | "rollback" | "gallery" | "prefetch";
export type StoryResourceReason = "current-scene" | "rollback-window" | "gallery-open" |
  "unconditional-successor" | "branch-common" | "branch-speculation";

export interface StoryResourcePredictionItem {
  readonly assetId: EntityId;
  readonly role: StoryResourceRole;
  readonly reason: StoryResourceReason;
  readonly sceneIds: readonly EntityId[];
}

export interface StoryResourcePredictionPlan {
  readonly currentSceneId: EntityId;
  readonly outgoingSceneIds: readonly EntityId[];
  readonly resources: readonly StoryResourcePredictionItem[];
}

export interface StoryResourcePredictionOptions {
  readonly rollbackSceneIds?: readonly EntityId[];
  readonly galleryAssetIds?: readonly EntityId[];
  readonly speculativeTargetSceneIds?: readonly EntityId[];
}

const SAFE_ID = /^[A-Za-z][A-Za-z0-9._-]{0,127}$/;
const ROLE_ORDER: Record<StoryResourceRole, number> = { current: 0, rollback: 1, gallery: 2, prefetch: 3 };

function validateManifest(project: StoryProject, manifest: SceneResourceManifest): Map<EntityId, readonly EntityId[]> {
  if (manifest.schemaVersion !== 1) throw new Error("Unsupported Scene Resource Manifest schema");
  const sceneIds = new Set(project.scenes.map((scene) => scene.id));
  const byScene = new Map<EntityId, readonly EntityId[]>();
  for (const entry of manifest.scenes) {
    if (!sceneIds.has(entry.sceneId)) throw new Error(`Scene Resource Manifest references an unknown scene: ${entry.sceneId}`);
    if (byScene.has(entry.sceneId)) throw new Error(`Scene Resource Manifest duplicates a scene: ${entry.sceneId}`);
    const unique = new Set<EntityId>();
    for (const assetId of entry.assetIds) {
      if (!SAFE_ID.test(assetId)) throw new Error(`Scene Resource Manifest contains an invalid asset ID: ${assetId}`);
      if (unique.has(assetId)) throw new Error(`Scene Resource Manifest duplicates ${assetId} in ${entry.sceneId}`);
      unique.add(assetId);
    }
    byScene.set(entry.sceneId, [...unique]);
  }
  return byScene;
}

export function predictStoryResources(
  project: StoryProject,
  manifest: SceneResourceManifest,
  currentSceneId: EntityId,
  options: StoryResourcePredictionOptions = {}
): StoryResourcePredictionPlan {
  findScene(project, currentSceneId);
  const byScene = validateManifest(project, manifest);
  const graph = deriveRouteGraph(project);
  const outgoingSceneIds = [...new Set(graph.edges.filter((edge) => edge.sourceSceneId === currentSceneId)
    .map((edge) => edge.targetSceneId))];
  const outgoingSet = new Set(outgoingSceneIds);
  const resources = new Map<EntityId, StoryResourcePredictionItem>();
  const add = (assetId: EntityId, role: StoryResourceRole, reason: StoryResourceReason, sceneIds: readonly EntityId[]) => {
    const existing = resources.get(assetId);
    if (existing !== undefined && ROLE_ORDER[existing.role] <= ROLE_ORDER[role]) return;
    resources.set(assetId, { assetId, role, reason, sceneIds: [...sceneIds] });
  };

  for (const assetId of byScene.get(currentSceneId) ?? []) add(assetId, "current", "current-scene", [currentSceneId]);
  const rollbackSceneIds = [...new Set(options.rollbackSceneIds ?? [])];
  for (const sceneId of rollbackSceneIds) {
    findScene(project, sceneId);
    if (sceneId === currentSceneId) continue;
    for (const assetId of byScene.get(sceneId) ?? []) add(assetId, "rollback", "rollback-window", [sceneId]);
  }
  for (const assetId of [...new Set(options.galleryAssetIds ?? [])]) {
    if (!SAFE_ID.test(assetId)) throw new Error(`Gallery contains an invalid asset ID: ${assetId}`);
    add(assetId, "gallery", "gallery-open", []);
  }

  if (outgoingSceneIds.length > 0) {
    const targetAssets = outgoingSceneIds.map((sceneId) => new Set(byScene.get(sceneId) ?? []));
    const common = [...(targetAssets[0] ?? new Set<EntityId>())].filter((assetId) => targetAssets.every((assets) => assets.has(assetId)));
    for (const assetId of common) add(assetId, "prefetch", outgoingSceneIds.length === 1 ? "unconditional-successor" : "branch-common", outgoingSceneIds);
    for (const sceneId of [...new Set(options.speculativeTargetSceneIds ?? [])]) {
      if (!outgoingSet.has(sceneId)) throw new Error(`Speculative target is not an outgoing scene: ${sceneId}`);
      for (const assetId of byScene.get(sceneId) ?? []) {
        if (!common.includes(assetId)) add(assetId, "prefetch", "branch-speculation", [sceneId]);
      }
    }
  } else if ((options.speculativeTargetSceneIds?.length ?? 0) > 0) {
    throw new Error(`Scene ${currentSceneId} has no outgoing targets to speculate`);
  }

  return {
    currentSceneId,
    outgoingSceneIds,
    resources: [...resources.values()].sort((left, right) => ROLE_ORDER[left.role] - ROLE_ORDER[right.role] || left.assetId.localeCompare(right.assetId))
  };
}
