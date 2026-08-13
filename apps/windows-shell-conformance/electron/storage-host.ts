import { lstat, mkdtemp, mkdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, parse, resolve } from "node:path";
import {
  assertProjectStorePath,
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
  private readonly ownsRoot: boolean;
  private store: NodeProjectFileStore;
  private activeLease: ProjectWriterLease | null = null;
  private nextFencingToken = 1;
  private operationTail: Promise<void> = Promise.resolve();

  private constructor(rootDirectory: string, ownsRoot: boolean) {
    this.rootDirectory = rootDirectory;
    this.ownsRoot = ownsRoot;
    this.store = new NodeProjectFileStore({ rootDirectory });
  }

  static async create(): Promise<ElectronStorageHost> {
    const root = await mkdtemp(join(tmpdir(), "world-cl03-electron-"));
    return new ElectronStorageHost(await realpath(root), true);
  }

  static async createGranted(rootDirectory: string): Promise<ElectronStorageHost> {
    if (!isAbsolute(rootDirectory)) throw new Error("GRANT_ROOT_NOT_ABSOLUTE");
    const resolved = resolve(rootDirectory);
    if (parse(resolved).root === resolved) throw new Error("GRANT_VOLUME_ROOT_REJECTED");
    const metadata = await stat(resolved).catch(() => null);
    if (metadata === null) throw new Error("GRANT_ROOT_NOT_FOUND");
    if (!metadata.isDirectory()) throw new Error("GRANT_ROOT_NOT_DIRECTORY");
    const canonical = await realpath(resolved);
    if (canonical.toLocaleLowerCase() !== resolved.toLocaleLowerCase()) {
      throw new Error("GRANT_ROOT_REPARSE_REJECTED");
    }
    return new ElectronStorageHost(canonical, false);
  }

  read(path: string): Promise<string | null> {
    return this.operationTail.then(async () => {
      this.assertPublicPath(path);
      await this.assertNoReparsePoint(path);
      return this.store.read(path);
    });
  }

  write(path: string, content: string, lease: unknown): Promise<void> {
    if (content.length > 2_000_000) return Promise.reject(new Error("PAYLOAD_TOO_LARGE"));
    return this.queue(async () => {
      this.assertPublicPath(path);
      await this.refreshLeaseFromDisk();
      this.assertActiveLease(parseLease(lease));
      await this.assertNoReparsePoint(path);
      await this.store.write(path, content);
    });
  }

  replace(sourcePath: string, targetPath: string, lease: unknown): Promise<void> {
    return this.queue(async () => {
      this.assertPublicPath(sourcePath);
      this.assertPublicPath(targetPath);
      await this.refreshLeaseFromDisk();
      this.assertActiveLease(parseLease(lease));
      await this.assertNoReparsePoint(sourcePath);
      await this.assertNoReparsePoint(targetPath);
      await this.store.replace(sourcePath, targetPath);
    });
  }

  remove(path: string, lease: unknown): Promise<void> {
    return this.queue(async () => {
      this.assertPublicPath(path);
      await this.refreshLeaseFromDisk();
      this.assertActiveLease(parseLease(lease));
      await this.assertNoReparsePoint(path);
      await this.store.remove(path);
    });
  }

  reset(): Promise<void> {
    return this.queue(async () => {
      if (!this.ownsRoot) throw new Error("GRANT_RESET_REJECTED");
      await rm(this.rootDirectory, { recursive: true, force: true });
      await mkdir(this.rootDirectory, { recursive: true });
      this.store = new NodeProjectFileStore({ rootDirectory: this.rootDirectory });
      this.activeLease = null;
    });
  }

  acquire(ownerId: string, ttlMs: number): Promise<WriterLeaseAcquisition> {
    return this.queueResult(async () => {
      if (!OWNER.test(ownerId)) throw new Error("INVALID_OWNER");
      assertTtl(ttlMs);
      const now = Date.now();
      await this.refreshLeaseFromDisk();
      if (this.activeLease !== null && this.activeLease.expiresAtMs > now && this.activeLease.ownerId !== ownerId) {
        return { status: "held", holderExpiresAtMs: this.activeLease.expiresAtMs };
      }
      const nextToken = await this.readNextFencingToken();
      const lease = this.activeLease !== null && this.activeLease.ownerId === ownerId && this.activeLease.expiresAtMs > now
        ? { ...this.activeLease, expiresAtMs: now + ttlMs }
        : { ownerId, fencingToken: nextToken, expiresAtMs: now + ttlMs };
      this.activeLease = lease;
      if (lease.fencingToken === nextToken) await this.persistNextFencingToken(nextToken + 1);
      await this.persistLease(lease);
      return { status: "acquired", lease };
    });
  }

  renew(value: unknown, ttlMs: number): Promise<WriterLeaseRenewal> {
    return this.queueResult(async () => {
      assertTtl(ttlMs);
      const lease = parseLease(value);
      const now = Date.now();
      await this.refreshLeaseFromDisk();
      if (this.activeLease === null || this.activeLease.expiresAtMs <= now || !leaseMatches(this.activeLease, lease)) {
        return { status: "lost" };
      }
      const renewed = { ...lease, expiresAtMs: now + ttlMs };
      this.activeLease = renewed;
      await this.persistLease(renewed);
      return { status: "renewed", lease: renewed };
    });
  }

  release(value: unknown): Promise<boolean> {
    return this.queueResult(async () => {
      const lease = parseLease(value);
      await this.refreshLeaseFromDisk();
      if (this.activeLease === null || !leaseMatches(this.activeLease, lease)) return false;
      this.activeLease = null;
      await rm(this.leasePath, { force: true });
      return true;
    });
  }

  async cleanup(): Promise<void> {
    await this.operationTail.catch(() => undefined);
    if (this.ownsRoot) await rm(this.rootDirectory, { recursive: true, force: true });
  }

  private assertActiveLease(lease: ProjectWriterLease): void {
    if (this.activeLease === null || this.activeLease.expiresAtMs <= Date.now() || !leaseMatches(this.activeLease, lease)) {
      throw new Error("LEASE_LOST");
    }
  }

  private assertPublicPath(logicalPath: string): void {
    assertProjectStorePath(logicalPath, "read");
    if (logicalPath === ".world-lock" || logicalPath.startsWith(".world-lock/")) {
      throw new Error("RESERVED_PATH");
    }
  }

  private get lockDirectory(): string { return join(this.rootDirectory, ".world-lock"); }
  private get leasePath(): string { return join(this.lockDirectory, "lease.json"); }
  private get tokenPath(): string { return join(this.lockDirectory, "next-token.txt"); }

  private async refreshLeaseFromDisk(): Promise<void> {
    await this.assertNoReparsePoint(".world-lock/lease.json");
    const encoded = await readFile(this.leasePath, "utf8").catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    this.activeLease = encoded === null ? null : parseLease(JSON.parse(encoded));
  }

  private async readNextFencingToken(): Promise<number> {
    await this.assertNoReparsePoint(".world-lock/next-token.txt");
    const encoded = await readFile(this.tokenPath, "utf8").catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (encoded === null) return this.nextFencingToken;
    const token = Number(encoded);
    if (!Number.isSafeInteger(token) || token < 1) throw new Error("LOCK_STATE_CORRUPT");
    return token;
  }

  private async persistNextFencingToken(token: number): Promise<void> {
    await this.assertNoReparsePoint(".world-lock/next-token.txt");
    await mkdir(this.lockDirectory, { recursive: true });
    await this.atomicWrite(this.tokenPath, String(token));
    this.nextFencingToken = token;
  }

  private async persistLease(lease: ProjectWriterLease): Promise<void> {
    await this.assertNoReparsePoint(".world-lock/lease.json");
    await mkdir(this.lockDirectory, { recursive: true });
    await this.atomicWrite(this.leasePath, JSON.stringify(lease));
  }

  private async atomicWrite(target: string, content: string): Promise<void> {
    const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, content, { encoding: "utf8", flag: "wx" });
    await rename(temporary, target).catch(async (error) => {
      await rm(temporary, { force: true });
      throw error;
    });
  }

  private async assertNoReparsePoint(logicalPath: string): Promise<void> {
    assertProjectStorePath(logicalPath, "read");
    let current = this.rootDirectory;
    for (const segment of logicalPath.split("/")) {
      current = join(current, segment);
      const metadata = await lstat(current).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return null;
        throw error;
      });
      if (metadata === null) break;
      if (metadata.isSymbolicLink()) throw new Error("REPARSE_POINT_REJECTED");
    }
  }

  private queue(action: () => Promise<void>): Promise<void> {
    const result = this.operationTail.then(action, action);
    this.operationTail = result.then(() => undefined, () => undefined);
    return result;
  }

  private queueResult<T>(action: () => T | Promise<T>): Promise<T> {
    let result!: T;
    return this.queue(async () => { result = await action(); }).then(() => result);
  }
}
