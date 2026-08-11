import { ProjectStoreError, assertProjectStorePath, type ProjectFileStore } from "./model";

export class InjectedStoreFailure extends Error {
  constructor(readonly operation: number) {
    super(`Injected storage failure at mutating operation ${operation}`);
    this.name = "InjectedStoreFailure";
  }
}

/** Test/reference adapter with deterministic crash injection. */
export class InMemoryProjectFileStore implements ProjectFileStore {
  readonly capabilities = {
    backend: "memory",
    atomicWrite: true,
    atomicReplace: true,
    durability: "volatile",
    workspaceScope: "memory",
    directoryMetadata: "not-applicable",
    writerCoordination: "none"
  } as const;
  readonly files = new Map<string, string>();
  private mutationCount = 0;

  constructor(
    initial?: Readonly<Record<string, string>>,
    private readonly failAtMutation?: number
  ) {
    for (const [path, content] of Object.entries(initial ?? {})) {
      this.files.set(path, content);
    }
  }

  get mutations(): number {
    return this.mutationCount;
  }

  read(path: string): Promise<string | null> {
    assertProjectStorePath(path, "read");
    return Promise.resolve(this.files.get(path) ?? null);
  }

  write(path: string, content: string): Promise<void> {
    assertProjectStorePath(path, "write");
    this.beforeMutation();
    this.files.set(path, content);
    return Promise.resolve();
  }

  replace(sourcePath: string, targetPath: string): Promise<void> {
    assertProjectStorePath(sourcePath, "replace");
    assertProjectStorePath(targetPath, "replace");
    if (sourcePath === targetPath) {
      throw new ProjectStoreError("INVALID_PATH", "replace", sourcePath, "Replacement paths must be distinct");
    }
    this.beforeMutation();
    const content = this.files.get(sourcePath);
    if (content === undefined) {
      throw new ProjectStoreError("NOT_FOUND", "replace", sourcePath, `Missing replacement source: ${sourcePath}`);
    }
    this.files.set(targetPath, content);
    this.files.delete(sourcePath);
    return Promise.resolve();
  }

  remove(path: string): Promise<void> {
    assertProjectStorePath(path, "remove");
    this.beforeMutation();
    this.files.delete(path);
    return Promise.resolve();
  }

  snapshot(): Readonly<Record<string, string>> {
    return Object.fromEntries(this.files);
  }

  private beforeMutation(): void {
    this.mutationCount += 1;
    if (this.mutationCount === this.failAtMutation) {
      throw new InjectedStoreFailure(this.mutationCount);
    }
  }
}
