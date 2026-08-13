import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type ProjectWriterLease,
  type WriterLeaseAcquisition,
  type WriterLeaseRenewal
} from "@world-studio/project-persistence";
import { NodeProjectFileStore } from "@world-studio/project-persistence-node";

const OWNER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function leaseMatches(left: ProjectWriterLease, right: ProjectWriterLease): boolean {
  return left.ownerId === right.ownerId &&
    left.fencingToken === right.fencingToken &&
    left.expiresAtMs === right.expiresAtMs;
}

function assertTtl(ttlMs: number): void {
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 1_000 || ttlMs > 120_000) throw new Error("INVALID_TTL");
}

function parseLease(value: unknown): ProjectWriterLease {
  if (typeof value !== "object" || value === null) throw new Error("LEASE_REQUIRED");
  const lease = value as Partial<ProjectWriterLease>;
  if (typeof lease.ownerId !== "string" || !OWNER.test(lease.ownerId) ||
      !Number.isSafeInteger(lease.fencingToken) || !Number.isSafeInteger(lease.expiresAtMs)) {
    throw new Error("LEASE_REQUIRED");
  }
  return lease as ProjectWriterLease;
}

export class ElectronStorageHost {
  private readonly rootDirectory: string;
  private store: NodeProjectFileStore;
  private activeLease: ProjectWriterLease | null = null;
  private nextFencingToken = 1;
  private operationTail: Promise<void> = Promise.resolve();

  private constructor(rootDirectory: string) {
    this.rootDirectory = rootDirectory;
    this.store = new NodeProjectFileStore({ rootDirectory });
  }

  static async create(): Promise<ElectronStorageHost> {
    const root = await mkdtemp(join(tmpdir(), "world-cl03-electron-"));
    return new ElectronStorageHost(root);
  }

  read(path: string): Promise<string | null> {
    return this.operationTail.then(() => this.store.read(path));
  }

  write(path: string, content: string, lease: unknown): Promise<void> {
    if (content.length > 2_000_000) return Promise.reject(new Error("PAYLOAD_TOO_LARGE"));
    return this.queue(async () => {
      this.assertActiveLease(parseLease(lease));
      await this.store.write(path, content);
    });
  }

  replace(sourcePath: string, targetPath: string, lease: unknown): Promise<void> {
    return this.queue(async () => {
      this.assertActiveLease(parseLease(lease));
      await this.store.replace(sourcePath, targetPath);
    });
  }

  remove(path: string, lease: unknown): Promise<void> {
    return this.queue(async () => {
      this.assertActiveLease(parseLease(lease));
      await this.store.remove(path);
    });
  }

  reset(): Promise<void> {
    return this.queue(async () => {
      await rm(this.rootDirectory, { recursive: true, force: true });
      await mkdir(this.rootDirectory, { recursive: true });
      this.store = new NodeProjectFileStore({ rootDirectory: this.rootDirectory });
      this.activeLease = null;
    });
  }

  acquire(ownerId: string, ttlMs: number): Promise<WriterLeaseAcquisition> {
    return this.queueResult(() => {
      if (!OWNER.test(ownerId)) throw new Error("INVALID_OWNER");
      assertTtl(ttlMs);
      const now = Date.now();
      if (this.activeLease !== null && this.activeLease.expiresAtMs > now && this.activeLease.ownerId !== ownerId) {
        return { status: "held", holderExpiresAtMs: this.activeLease.expiresAtMs };
      }
      const lease = this.activeLease !== null && this.activeLease.ownerId === ownerId && this.activeLease.expiresAtMs > now
        ? { ...this.activeLease, expiresAtMs: now + ttlMs }
        : { ownerId, fencingToken: this.nextFencingToken++, expiresAtMs: now + ttlMs };
      this.activeLease = lease;
      return { status: "acquired", lease };
    });
  }

  renew(value: unknown, ttlMs: number): Promise<WriterLeaseRenewal> {
    return this.queueResult(() => {
      assertTtl(ttlMs);
      const lease = parseLease(value);
      const now = Date.now();
      if (this.activeLease === null || this.activeLease.expiresAtMs <= now || !leaseMatches(this.activeLease, lease)) {
        return { status: "lost" };
      }
      const renewed = { ...lease, expiresAtMs: now + ttlMs };
      this.activeLease = renewed;
      return { status: "renewed", lease: renewed };
    });
  }

  release(value: unknown): Promise<boolean> {
    return this.queueResult(() => {
      const lease = parseLease(value);
      if (this.activeLease === null || !leaseMatches(this.activeLease, lease)) return false;
      this.activeLease = null;
      return true;
    });
  }

  async cleanup(): Promise<void> {
    await this.operationTail.catch(() => undefined);
    await rm(this.rootDirectory, { recursive: true, force: true });
  }

  private assertActiveLease(lease: ProjectWriterLease): void {
    if (this.activeLease === null || this.activeLease.expiresAtMs <= Date.now() || !leaseMatches(this.activeLease, lease)) {
      throw new Error("LEASE_LOST");
    }
  }

  private queue(action: () => Promise<void>): Promise<void> {
    const result = this.operationTail.then(action, action);
    this.operationTail = result.then(() => undefined, () => undefined);
    return result;
  }

  private queueResult<T>(action: () => T): Promise<T> {
    let result!: T;
    return this.queue(async () => { result = action(); }).then(() => result);
  }
}
