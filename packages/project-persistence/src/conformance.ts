import {
  ProjectStoreError,
  type ProjectFileStore,
  type ProjectFileStoreCapabilities
} from "./model";

export interface ProjectFileStoreConformanceReport {
  readonly capabilities: ProjectFileStoreCapabilities;
  readonly checks: readonly string[];
}

function requireCondition(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`ProjectFileStore conformance failed: ${message}`);
}

async function requireStoreError(
  action: () => Promise<unknown>,
  expectedCode: ProjectStoreError["code"],
  message: string
): Promise<void> {
  try {
    await action();
  } catch (error) {
    requireCondition(
      error instanceof ProjectStoreError && error.code === expectedCode,
      message
    );
    return;
  }
  requireCondition(false, message);
}

/**
 * Verifies observable adapter semantics. Power-loss durability still requires
 * platform-specific process-kill and device tests; this suite does not infer it.
 */
export async function auditProjectFileStore(
  store: ProjectFileStore,
  namespace = "conformance"
): Promise<ProjectFileStoreConformanceReport> {
  const checks: string[] = [];
  requireCondition(store.capabilities.atomicWrite, "atomicWrite must be guaranteed");
  requireCondition(store.capabilities.atomicReplace, "atomicReplace must be guaranteed");
  checks.push("declared-capabilities");

  const missing = `${namespace}/missing.txt`;
  requireCondition(await store.read(missing) === null, "missing read must return null");
  checks.push("missing-read");

  const unicode = `${namespace}/unicode.txt`;
  await store.write(unicode, "黄昏广播\r\n🌆");
  requireCondition(await store.read(unicode) === "黄昏广播\r\n🌆", "UTF-8 text must round-trip");
  await store.write(unicode, "完整覆盖");
  requireCondition(await store.read(unicode) === "完整覆盖", "write must replace the complete value");
  checks.push("complete-write-and-unicode");

  const source = `${namespace}/replace-source.txt`;
  const target = `${namespace}/replace-target.txt`;
  await store.write(source, "new-target");
  await store.write(target, "old-target");
  await store.replace(source, target);
  requireCondition(await store.read(source) === null, "replace must remove source");
  requireCondition(await store.read(target) === "new-target", "replace must expose complete source at target");
  checks.push("atomic-replace-semantics");

  await requireStoreError(
    () => store.replace(`${namespace}/absent.txt`, `${namespace}/target.txt`),
    "NOT_FOUND",
    "replace with a missing source must return NOT_FOUND"
  );
  await requireStoreError(
    () => store.replace(target, target),
    "INVALID_PATH",
    "replace with identical paths must return INVALID_PATH"
  );
  checks.push("normalized-replace-errors");

  const concurrent = `${namespace}/concurrent.txt`;
  const left = "L".repeat(32_768);
  const right = "R".repeat(32_768);
  await Promise.all([store.write(concurrent, left), store.write(concurrent, right)]);
  const concurrentResult = await store.read(concurrent);
  requireCondition(concurrentResult === left || concurrentResult === right, "concurrent writes must not tear content");
  checks.push("concurrent-complete-value");

  await store.remove(target);
  await store.remove(target);
  requireCondition(await store.read(target) === null, "remove must be idempotent");
  checks.push("idempotent-remove");

  for (const unsafePath of ["../escape.txt", "/absolute.txt", "nested\\escape.txt", "a//b", "NUL.txt", "trailing."]) {
    let unsafeRejected = false;
    try {
      await store.write(unsafePath, "escape");
    } catch (error) {
      unsafeRejected = error instanceof ProjectStoreError && error.code === "INVALID_PATH";
    }
    requireCondition(unsafeRejected, `unsafe path must return INVALID_PATH: ${unsafePath}`);
  }
  checks.push("path-containment");

  return { capabilities: store.capabilities, checks };
}
