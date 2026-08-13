import {
  loadProject,
  loadProjectBackups,
  recoverProject,
  saveProject,
  saveProjectWithBackups,
  sha256,
  type ProjectFileStore,
  type ProjectSnapshot,
  type ProjectWriterLease
} from "@world-studio/project-persistence";
import { WindowsHostProjectFileStore, type WindowsHostV1 } from "./windows-host";

export interface StorageConformanceResultV0 {
  readonly schemaVersion: 0;
  readonly walBoundaryCount: number;
  readonly recoveryRuns: number;
  readonly oldSnapshotRecoveries: number;
  readonly newSnapshotRecoveries: number;
  readonly corruptRecoveries: number;
  readonly backupRevisions: readonly number[];
  readonly secondOwnerHeld: boolean;
  readonly staleWriterRejected: boolean;
  readonly fencingTokenAdvanced: boolean;
  readonly traversalRejected: boolean;
  readonly resultDigest: string;
}

function snapshot(revision: number): ProjectSnapshot {
  return {
    schemaVersion: 2,
    projectId: "cl03_windows_storage",
    title: `CL-03 Revision ${revision}`,
    entrySceneId: "campus_gate",
    storageRevision: revision,
    scenes: [{
      sceneId: "campus_gate",
      sourceRevision: revision,
      semanticRevision: revision,
      committedSource: `@scene campus_gate\nNarrator: revision ${revision}`,
      draftSource: `@scene campus_gate\nNarrator: revision ${revision}`,
      tombstones: []
    }]
  };
}

class FailingMutationStore implements ProjectFileStore {
  readonly capabilities;
  mutationCount = 0;

  constructor(
    private readonly delegate: ProjectFileStore,
    private readonly failBeforeMutation: number | null
  ) {
    this.capabilities = delegate.capabilities;
  }

  read(path: string): Promise<string | null> { return this.delegate.read(path); }
  write(path: string, content: string): Promise<void> { return this.mutate(() => this.delegate.write(path, content)); }
  replace(sourcePath: string, targetPath: string): Promise<void> { return this.mutate(() => this.delegate.replace(sourcePath, targetPath)); }
  remove(path: string): Promise<void> { return this.mutate(() => this.delegate.remove(path)); }

  private mutate(action: () => Promise<void>): Promise<void> {
    this.mutationCount += 1;
    if (this.failBeforeMutation === this.mutationCount) return Promise.reject(new Error(`INJECTED_MUTATION_${this.mutationCount}`));
    return action();
  }
}

async function acquire(bridge: WindowsHostV1, ownerId: string): Promise<ProjectWriterLease> {
  const result = await bridge.leaseAcquire(ownerId, 60_000);
  if (result.status !== "acquired") throw new Error(`Lease unexpectedly held for ${ownerId}`);
  return result.lease;
}

async function resetWithLease(bridge: WindowsHostV1, ownerId: string): Promise<{ store: WindowsHostProjectFileStore; lease: ProjectWriterLease }> {
  await bridge.projectReset();
  const lease = await acquire(bridge, ownerId);
  const store = new WindowsHostProjectFileStore(bridge);
  store.activateWriterLease(lease);
  return { store, lease };
}

export async function executeStorageConformanceV0(bridge: WindowsHostV1): Promise<StorageConformanceResultV0> {
  const probe = await resetWithLease(bridge, "boundary_probe");
  await saveProject(probe.store, snapshot(1), { transactionId: "probe_base", expectedStorageRevision: 0 });
  const counter = new FailingMutationStore(probe.store, null);
  await saveProject(counter, snapshot(2), { transactionId: "probe_next", expectedStorageRevision: 1 });
  const walBoundaryCount = counter.mutationCount;
  await bridge.leaseRelease(probe.lease);

  let oldSnapshotRecoveries = 0;
  let newSnapshotRecoveries = 0;
  let corruptRecoveries = 0;
  for (let boundary = 1; boundary <= walBoundaryCount; boundary += 1) {
    const scenario = await resetWithLease(bridge, `boundary_${boundary}`);
    await saveProject(scenario.store, snapshot(1), { transactionId: `base_${boundary}`, expectedStorageRevision: 0 });
    const failing = new FailingMutationStore(scenario.store, boundary);
    await saveProject(failing, snapshot(2), { transactionId: `next_${boundary}`, expectedStorageRevision: 1 }).catch(() => undefined);
    try {
      await recoverProject(scenario.store);
      const loaded = await loadProject(scenario.store);
      if (JSON.stringify(loaded) === JSON.stringify(snapshot(1))) oldSnapshotRecoveries += 1;
      else if (JSON.stringify(loaded) === JSON.stringify(snapshot(2))) newSnapshotRecoveries += 1;
      else corruptRecoveries += 1;
    } catch {
      corruptRecoveries += 1;
    }
    await bridge.leaseRelease(scenario.lease);
  }

  const backupScenario = await resetWithLease(bridge, "backup_owner");
  await saveProject(backupScenario.store, snapshot(1), { transactionId: "backup_base", expectedStorageRevision: 0 });
  await saveProjectWithBackups(backupScenario.store, snapshot(2), {
    transactionId: "backup_next",
    expectedStorageRevision: 1,
    backupPolicy: { retention: 2 },
    nowMs: 2_000
  });
  const backupRevisions = (await loadProjectBackups(backupScenario.store, { retention: 2 }))
    .map((backup) => backup.sourceStorageRevision);
  await bridge.leaseRelease(backupScenario.lease);

  await bridge.projectReset();
  const first = await acquire(bridge, "lease_owner_a");
  const held = await bridge.leaseAcquire("lease_owner_b", 60_000);
  const firstStore = new WindowsHostProjectFileStore(bridge);
  firstStore.activateWriterLease(first);
  await firstStore.write("lease-probe.txt", "owner-a");
  await bridge.leaseRelease(first);
  const second = await acquire(bridge, "lease_owner_b");
  const staleWriterRejected = await firstStore.write("stale-probe.txt", "stale")
    .then(() => false, () => true);
  const traversalRejected = await bridge.projectRead("../escape.txt").then(() => false, () => true);
  await bridge.leaseRelease(second);

  const withoutDigest = {
    schemaVersion: 0 as const,
    walBoundaryCount,
    recoveryRuns: walBoundaryCount,
    oldSnapshotRecoveries,
    newSnapshotRecoveries,
    corruptRecoveries,
    backupRevisions,
    secondOwnerHeld: held.status === "held",
    staleWriterRejected,
    fencingTokenAdvanced: second.fencingToken > first.fencingToken,
    traversalRejected
  };
  return { ...withoutDigest, resultDigest: sha256(JSON.stringify(withoutDigest)) };
}
