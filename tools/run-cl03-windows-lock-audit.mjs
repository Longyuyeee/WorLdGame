import { spawn } from "node:child_process";
import { access, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
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

function acquisition(result, host) {
  return host === "electron" ? result : (result.result ?? result);
}

async function auditSimultaneousTakeover(host, executable, prefix) {
  const rounds = [];
  for (let round = 0; round < 3; round += 1) {
    const root = await mkdtemp(join(tmpdir(), `world-cl03-${host}-cas-${round}-`));
    try {
      const startAt = Date.now() + 1500;
      const contenders = Array.from({ length: 8 }, (_, index) => launch(executable, [
        ...prefix,
        `--project-root=${root}`,
        `--audit-lock-acquire=cas-${round}-${index}`,
        "--audit-lock-ttl=60000",
        `--audit-start-at=${startAt}`
      ]));
      const outputs = await Promise.all(contenders.map((contender) => contender.exited));
      const results = outputs.map((output) => {
        const parsed = parseLine(output.stdout);
        if (parsed === null) throw new Error(`LOCK_AUDIT_CAS_OUTPUT:${output.stderr}`);
        return acquisition(parsed, host);
      });
      const winners = results.filter((result) => result.status === "acquired");
      const held = results.filter((result) => result.status === "held");
      const statusCounts = Object.fromEntries([...new Set(results.map((result) => result.status))].map((status) => [status, results.filter((result) => result.status === status).length]));
      const errorKinds = results.filter((result) => result.status === "internal").map((result) => String(result.error ?? "unknown").replace(/[^A-Z0-9_:-]/gi, "").slice(0, 120));
      const nextToken = Number(await readFile(join(root, ".world-lock", "next-token.txt"), "utf8"));
      const guardRemoved = await access(join(root, ".world-lock", "cas.guard")).then(() => false, () => true);
      rounds.push({
        exactlyOneWinner: winners.length === 1,
        allOthersHeld: held.length === 7,
        tokenAdvancedOnce: winners.length === 1 && nextToken === winners[0].lease.fencingToken + 1,
        guardRemoved,
        statusCounts,
        errorKinds
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
  return {
    rounds: rounds.length,
    exactlyOneWinnerEveryRound: rounds.every((round) => round.exactlyOneWinner),
    allOthersHeldEveryRound: rounds.every((round) => round.allOthersHeld),
    tokenAdvancedOnceEveryRound: rounds.every((round) => round.tokenAdvancedOnce),
    guardRemovedEveryRound: rounds.every((round) => round.guardRemoved),
    statusCounts: rounds.map((round) => round.statusCounts),
    errorKinds: rounds.map((round) => round.errorKinds)
  };
}

async function auditKilledGuardRecovery(host, executable, prefix) {
  const root = await mkdtemp(join(tmpdir(), `world-cl03-${host}-guard-kill-`));
  try {
    const holder = launch(executable, [...prefix, `--project-root=${root}`, "--audit-hold-cas"]);
    const held = await waitForLine(holder);
    const marker = JSON.parse(await readFile(join(root, ".world-lock", "cas.guard", "owner.json"), "utf8"));
    const liveProbe = launch(executable, [...prefix, `--project-root=${root}`, "--audit-lock-acquire=live-probe", "--audit-lock-ttl=60000"]);
    const liveOutput = await liveProbe.exited;
    const liveResult = parseLine(liveOutput.stdout);
    if (liveResult === null) throw new Error(`LOCK_AUDIT_LIVE_GUARD_OUTPUT:${liveOutput.stderr}`);
    const markerAfterProbe = JSON.parse(await readFile(join(root, ".world-lock", "cas.guard", "owner.json"), "utf8"));
    holder.child.kill();
    await holder.exited;
    await new Promise((resolveWait) => setTimeout(resolveWait, 350));

    const startAt = Date.now() + 1500;
    const contenders = Array.from({ length: 8 }, (_, index) => launch(executable, [
      ...prefix,
      `--project-root=${root}`,
      `--audit-lock-acquire=recovery-${index}`,
      "--audit-lock-ttl=60000",
      `--audit-start-at=${startAt}`
    ]));
    const outputs = await Promise.all(contenders.map((contender) => contender.exited));
    const results = outputs.map((output) => {
      const parsed = parseLine(output.stdout);
      if (parsed === null) throw new Error(`LOCK_AUDIT_RECOVERY_OUTPUT:${output.stderr}`);
      return acquisition(parsed, host);
    });
    const entries = await readdir(join(root, ".world-lock"));
    const acquiredCount = results.filter((result) => result.status === "acquired").length;
    const heldCount = results.filter((result) => result.status === "held").length;
    const busyCount = results.filter((result) => result.status === "cas-busy").length;
    const statusCounts = Object.fromEntries([...new Set(results.map((result) => result.status))].map((status) => [status, results.filter((result) => result.status === status).length]));
    const errorKinds = results.filter((result) => result.status === "internal").map((result) => String(result.error ?? "unknown").replace(/[^A-Z0-9_:-]/gi, "").slice(0, 120));
    return {
      holderConfirmed: held.status === "cas-held" && marker.pid === holder.child.pid,
      liveOwnerProtected: liveResult.status === "cas-busy" && markerAfterProbe.nonce === marker.nonce,
      acquiredCount,
      heldCount,
      busyCount,
      statusCounts,
      errorKinds,
      exactlyOneRecoveryWinner: acquiredCount === 1,
      allOtherRecoveryContendersHeld: heldCount === 7,
      staleGuardRemoved: !entries.includes("cas.guard"),
      noRecoveryResidue: entries.every((entry) => !entry.startsWith("candidate-") && !entry.startsWith("quarantine-") && !entry.startsWith("release-"))
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
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

const electronResult = { ...(await auditHost("electron", electron, [electronMain])), simultaneous: await auditSimultaneousTakeover("electron", electron, [electronMain]), killedGuard: await auditKilledGuardRecovery("electron", electron, [electronMain]) };
const tauriResult = { ...(await auditHost("tauri", tauri, [])), simultaneous: await auditSimultaneousTakeover("tauri", tauri, []), killedGuard: await auditKilledGuardRecovery("tauri", tauri, []) };
const hostPassed = (result) => Object.entries(result).every(([key, value]) => key === "simultaneous" ? Object.entries(value).every(([field, fieldValue]) => field === "rounds" ? fieldValue === 3 : ["statusCounts", "errorKinds"].includes(field) ? true : fieldValue === true) : key === "killedGuard" ? value.holderConfirmed && value.liveOwnerProtected && value.acquiredCount === 1 && value.heldCount === 7 && value.busyCount === 0 && value.staleGuardRemoved && value.noRecoveryResidue : value === true);
const passed = hostPassed(electronResult) && hostPassed(tauriResult);
process.stdout.write(`${JSON.stringify({ schemaVersion: 0, electron: electronResult, tauri: tauriResult, status: passed ? "PASS" : "FAIL" })}\n`);
if (!passed) process.exitCode = 1;
