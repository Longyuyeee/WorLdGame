import { invoke } from "@tauri-apps/api/core";
import {
  assertProjectStorePath,
  type ProjectFileStore,
  type ProjectWriterLease,
  type WriterLeaseAcquisition,
  type WriterLeaseRenewal
} from "@world-studio/project-persistence";

export interface WindowsHostV1 {
  readonly schemaVersion: 1;
  readonly hostId: string;
  projectRead(path: string): Promise<string | null>;
  projectWrite(path: string, content: string, lease: ProjectWriterLease): Promise<void>;
  projectReplace(sourcePath: string, targetPath: string, lease: ProjectWriterLease): Promise<void>;
  projectRemove(path: string, lease: ProjectWriterLease): Promise<void>;
  projectReset(): Promise<void>;
  leaseAcquire(ownerId: string, ttlMs: number): Promise<WriterLeaseAcquisition>;
  leaseRenew(lease: ProjectWriterLease, ttlMs: number): Promise<WriterLeaseRenewal>;
  leaseRelease(lease: ProjectWriterLease): Promise<boolean>;
  submitEvidence(payload: unknown): Promise<void>;
}

declare global {
  interface Window { windowsHostV1?: WindowsHostV1 }
}

function tauriHost(): WindowsHostV1 {
  return {
    schemaVersion: 1,
    hostId: "host.windows.tauri-webview2",
    projectRead: (path) => invoke("project_read", { path }),
    projectWrite: async (path, content, lease) => { await invoke("project_write", { path, content, lease }); },
    projectReplace: async (sourcePath, targetPath, lease) => { await invoke("project_replace", { sourcePath, targetPath, lease }); },
    projectRemove: async (path, lease) => { await invoke("project_remove", { path, lease }); },
    projectReset: async () => { await invoke("project_reset"); },
    leaseAcquire: (ownerId, ttlMs) => invoke("lease_acquire", { ownerId, ttlMs }),
    leaseRenew: (lease, ttlMs) => invoke("lease_renew", { lease, ttlMs }),
    leaseRelease: (lease) => invoke("lease_release", { lease }),
    submitEvidence: async (payload) => { await invoke("submit_evidence", { payload }); }
  };
}

export function windowsHost(): WindowsHostV1 {
  const bridge = window.windowsHostV1 ?? tauriHost();
  if (bridge.schemaVersion !== 1 || !/^host\.windows\./.test(bridge.hostId)) {
    throw new TypeError("WindowsHostV1 bridge is invalid");
  }
  return bridge;
}

export class WindowsHostProjectFileStore implements ProjectFileStore {
  readonly capabilities = {
    backend: "windows-host-v1",
    atomicWrite: true,
    atomicReplace: true,
    durability: "file-sync",
    workspaceScope: "app-private",
    directoryMetadata: "best-effort",
    writerCoordination: "fenced-lease"
  } as const;
  private activeLease: ProjectWriterLease | null = null;

  constructor(private readonly bridge: WindowsHostV1) {}

  activateWriterLease(lease: ProjectWriterLease | null): void {
    this.activeLease = lease;
  }

  read(path: string): Promise<string | null> {
    assertProjectStorePath(path, "read");
    return this.bridge.projectRead(path);
  }

  async write(path: string, content: string): Promise<void> {
    assertProjectStorePath(path, "write");
    await this.bridge.projectWrite(path, content, this.requireLease());
  }

  async replace(sourcePath: string, targetPath: string): Promise<void> {
    assertProjectStorePath(sourcePath, "replace");
    assertProjectStorePath(targetPath, "replace");
    await this.bridge.projectReplace(sourcePath, targetPath, this.requireLease());
  }

  async remove(path: string): Promise<void> {
    assertProjectStorePath(path, "remove");
    await this.bridge.projectRemove(path, this.requireLease());
  }

  private requireLease(): ProjectWriterLease {
    if (this.activeLease === null) throw new Error("LEASE_REQUIRED");
    return this.activeLease;
  }
}
