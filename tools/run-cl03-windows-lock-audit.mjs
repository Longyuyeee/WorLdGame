import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";

const repoRoot = resolve(import.meta.dirname, "..");
const electron = join(repoRoot, "node_modules", "electron", "dist", "electron.exe");
const electronMain = join(repoRoot, "apps", "windows-shell-conformance", "dist", "electron", "main.mjs");
const tauri = join(repoRoot, "apps", "windows-shell-conformance", "src-tauri", "target", "release", "world-windows-shell-conformance.exe");

function launch(executable, args) {
  const child = spawn(executable, args, { cwd: repoRoot, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const exited = new Promise((resolveExit, reject) => {
    child.on("error", reject);
    child.on("exit", (code) => resolveExit({ code, stdout, stderr }));
  });
  return { child, exited, output: () => stdout };
}

function parseLine(output) {
  const lines = output.trim().split(/\r?\n/).filter(Boolean);
  for (const line of lines.toReversed()) {
    try { return JSON.parse(line); } catch { /* wait for a machine-readable line */ }
  }
  return null;
}

async function waitForLine(running, timeoutMs = 5000) {
  const started = Date.now();
  let parsed = parseLine(running.output());
  while (parsed === null) {
    if (Date.now() - started > timeoutMs) throw new Error("LOCK_AUDIT_HOST_TIMEOUT");
    await new Promise((resolveWait) => setTimeout(resolveWait, 25));
    parsed = parseLine(running.output());
  }
  return parsed;
}

async function auditHost(host, executable, prefix) {
  const root = await mkdtemp(join(tmpdir(), `world-cl03-${host}-lock-`));
  try {
    const released = launch(executable, [...prefix, `--project-root=${root}`, "--audit-lock-acquire=owner-release-a", "--audit-lock-ttl=1500", "--audit-release"]);
    const releasedOutput = await released.exited;
    const releasedResult = parseLine(releasedOutput.stdout);
    if (releasedResult === null) throw new Error(`LOCK_AUDIT_RELEASE_OUTPUT:${releasedOutput.stderr}`);
    const afterRelease = launch(executable, [...prefix, `--project-root=${root}`, "--audit-lock-acquire=owner-release-b", "--audit-lock-ttl=1500", "--audit-release"]);
    const afterReleaseOutput = await afterRelease.exited;
    const afterReleaseResult = parseLine(afterReleaseOutput.stdout);
    if (afterReleaseResult === null) throw new Error(`LOCK_AUDIT_AFTER_RELEASE_OUTPUT:${afterReleaseOutput.stderr}`);
    const releasedLease = releasedResult.lease;
    const afterReleaseLease = afterReleaseResult.lease;

    const firstArgs = [...prefix, `--project-root=${root}`, "--audit-lock-acquire=owner-a", "--audit-lock-ttl=1500", "--audit-hold"];
    const first = launch(executable, firstArgs);
    const firstResult = await waitForLine(first);
    const firstLease = host === "electron" ? firstResult.lease : firstResult.result.lease;

    const held = launch(executable, [...prefix, `--project-root=${root}`, "--audit-lock-acquire=owner-b", "--audit-lock-ttl=1500"]);
    const heldOutput = await held.exited;
    const heldResult = parseLine(heldOutput.stdout);
    if (heldResult === null) throw new Error(`LOCK_AUDIT_HELD_OUTPUT:${heldOutput.stderr}`);
    first.child.kill();
    await first.exited;
    await new Promise((resolveWait) => setTimeout(resolveWait, 1700));

    const takeover = launch(executable, [...prefix, `--project-root=${root}`, "--audit-lock-acquire=owner-b", "--audit-lock-ttl=1500"]);
    const takeoverOutput = await takeover.exited;
    const takeoverResult = parseLine(takeoverOutput.stdout);
    if (takeoverResult === null) throw new Error(`LOCK_AUDIT_TAKEOVER_OUTPUT:${takeoverOutput.stderr}`);
    const takeoverLease = host === "electron" ? takeoverResult.lease : takeoverResult.result.lease;
    const staleEncoded = host === "electron"
      ? Buffer.from(JSON.stringify(firstLease), "utf8").toString("base64url")
      : JSON.stringify(firstLease);
    const stale = launch(executable, [...prefix, `--project-root=${root}`, `--audit-lock-write=${staleEncoded}`]);
    const staleOutput = await stale.exited;
    const staleResult = parseLine(staleOutput.stdout);
    if (staleResult === null) throw new Error(`LOCK_AUDIT_STALE_OUTPUT:${staleOutput.stderr}`);
    const tokenFile = Number(await readFile(join(root, ".world-lock", "next-token.txt"), "utf8"));
    return {
      normalReleaseTakenOver: releasedResult.status === "released" && afterReleaseResult.status === "released" && afterReleaseLease.fencingToken > releasedLease.fencingToken,
      held: heldResult.status === "held",
      killedOwnerTakenOver: takeoverResult.status === "acquired",
      fencingAdvanced: takeoverLease.fencingToken > firstLease.fencingToken && tokenFile > takeoverLease.fencingToken,
      staleRejected: staleResult.status === "stale-rejected"
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const electronResult = await auditHost("electron", electron, [electronMain]);
const tauriResult = await auditHost("tauri", tauri, []);
const passed = Object.values(electronResult).every(Boolean) && Object.values(tauriResult).every(Boolean);
process.stdout.write(`${JSON.stringify({ schemaVersion: 0, electron: electronResult, tauri: tauriResult, status: passed ? "PASS" : "FAIL" })}\n`);
if (!passed) process.exitCode = 1;
