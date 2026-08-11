import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm, unlink } from "node:fs/promises";
import { dirname, isAbsolute, parse, resolve, sep } from "node:path";
import {
  ProjectStoreError,
  assertProjectStorePath,
  type ProjectFileStore,
  type ProjectStoreOperation
} from "@world-studio/project-persistence";

export interface NodeProjectFileStoreOptions {
  readonly rootDirectory: string;
  readonly directorySync?: "best-effort" | "required";
}

export function normalizeNodeFileSystemError(
  error: unknown,
  operation: ProjectStoreOperation,
  path: string
): ProjectStoreError {
  if (error instanceof ProjectStoreError) return error;
  const systemCode = (error as NodeJS.ErrnoException | null)?.code;
  const code = systemCode === "ENOENT"
    ? "NOT_FOUND"
    : systemCode === "ENOSPC" || systemCode === "EDQUOT"
      ? "NO_SPACE"
      : systemCode === "EACCES" || systemCode === "EPERM" || systemCode === "EROFS"
        ? "PERMISSION_DENIED"
        : systemCode === "EBUSY" || systemCode === "EAGAIN" || systemCode === "ETXTBSY"
          ? "BUSY"
          : systemCode === "ENODEV" || systemCode === "ENXIO"
            ? "UNAVAILABLE"
            : "IO_FAILURE";
  return new ProjectStoreError(
    code,
    operation,
    path,
    `Node filesystem ${operation} failed (${systemCode ?? "unknown"})`
  );
}

/**
 * Reference adapter for an app-private local workspace. It fsyncs file content
 * before rename and can require directory fsync on platforms that support it.
 */
export class NodeProjectFileStore implements ProjectFileStore {
  readonly capabilities;
  private readonly rootDirectory: string;
  private readonly directorySync: "best-effort" | "required";
  private mutationTail: Promise<void> = Promise.resolve();

  constructor(options: NodeProjectFileStoreOptions) {
    if (!isAbsolute(options.rootDirectory)) {
      throw new ProjectStoreError(
        "INVALID_PATH",
        "read",
        options.rootDirectory,
        "Node project store rootDirectory must be absolute"
      );
    }
    this.rootDirectory = resolve(options.rootDirectory);
    if (parse(this.rootDirectory).root === this.rootDirectory) {
      throw new ProjectStoreError(
        "INVALID_PATH",
        "read",
        options.rootDirectory,
        "Node project store rootDirectory cannot be a filesystem volume root"
      );
    }
    this.directorySync = options.directorySync ?? "best-effort";
    this.capabilities = {
      backend: "node-filesystem",
      atomicWrite: true,
      atomicReplace: true,
      durability: this.directorySync === "required" ? "file-and-directory-sync" : "file-sync",
      workspaceScope: "app-private",
      directoryMetadata: this.directorySync === "required" ? "synced" : "best-effort"
    } as const;
  }

  async read(path: string): Promise<string | null> {
    const target = this.resolveStorePath(path, "read");
    try {
      return await readFile(target, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw normalizeNodeFileSystemError(error, "read", path);
    }
  }

  async write(path: string, content: string): Promise<void> {
    const target = this.resolveStorePath(path, "write");
    return this.serializeMutation(async () => {
      const parent = dirname(target);
      const temporary = `${target}.world-write-${randomUUID()}`;
      let handle: Awaited<ReturnType<typeof open>> | undefined;
      try {
        await mkdir(parent, { recursive: true });
        handle = await open(temporary, "wx", 0o600);
        await handle.writeFile(content, "utf8");
        await handle.sync();
        await handle.close();
        handle = undefined;
        await rename(temporary, target);
        await this.syncDirectory(parent, path);
      } catch (error) {
        if (handle !== undefined) await handle.close().catch(() => undefined);
        await rm(temporary, { force: true }).catch(() => undefined);
        throw normalizeNodeFileSystemError(error, "write", path);
      }
    });
  }

  async replace(sourcePath: string, targetPath: string): Promise<void> {
    const source = this.resolveStorePath(sourcePath, "replace");
    const target = this.resolveStorePath(targetPath, "replace");
    if (sourcePath === targetPath) {
      throw new ProjectStoreError("INVALID_PATH", "replace", sourcePath, "Replacement paths must be distinct");
    }
    return this.serializeMutation(async () => {
      try {
        await mkdir(dirname(target), { recursive: true });
        await rename(source, target);
        await this.syncDirectory(dirname(target), targetPath);
        if (dirname(source) !== dirname(target)) {
          await this.syncDirectory(dirname(source), sourcePath);
        }
      } catch (error) {
        throw normalizeNodeFileSystemError(error, "replace", sourcePath);
      }
    });
  }

  async remove(path: string): Promise<void> {
    const target = this.resolveStorePath(path, "remove");
    return this.serializeMutation(async () => {
      try {
        await unlink(target);
        await this.syncDirectory(dirname(target), path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
        throw normalizeNodeFileSystemError(error, "remove", path);
      }
    });
  }

  private resolveStorePath(path: string, operation: ProjectStoreOperation): string {
    assertProjectStorePath(path, operation);
    const target = resolve(this.rootDirectory, ...path.split("/"));
    if (!target.startsWith(`${this.rootDirectory}${sep}`)) {
      throw new ProjectStoreError("INVALID_PATH", operation, path, "Project path escaped the store root");
    }
    return target;
  }

  private async syncDirectory(directory: string, logicalPath: string): Promise<void> {
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      handle = await open(directory, "r");
      await handle.sync();
    } catch (error) {
      if (this.directorySync === "required") {
        throw normalizeNodeFileSystemError(error, "sync", logicalPath);
      }
    } finally {
      if (handle !== undefined) await handle.close().catch(() => undefined);
    }
  }

  private serializeMutation(action: () => Promise<void>): Promise<void> {
    const result = this.mutationTail.then(action, action);
    this.mutationTail = result.then(() => undefined, () => undefined);
    return result;
  }
}
