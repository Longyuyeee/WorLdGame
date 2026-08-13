import { spawn } from "node:child_process";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";

const repoRoot = resolve(import.meta.dirname, "..");
const electron = join(repoRoot, "node_modules", "electron", "dist", "electron.exe");
const electronMain = join(repoRoot, "apps", "windows-shell-conformance", "dist", "electron", "main.mjs");
const tauri = join(repoRoot, "apps", "windows-shell-conformance", "src-tauri", "target", "release", "world-windows-shell-conformance.exe");

function run(executable, args) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(executable, args, { cwd: repoRoot, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("exit", (code) => resolveRun({ code, stdout, stderr }));
  });
}

const root = await mkdtemp(join(tmpdir(), "world-cl03-grant-root-"));
const outside = await mkdtemp(join(tmpdir(), "world-cl03-grant-outside-"));
try {
  await writeFile(join(outside, "secret.txt"), "must-not-be-read", "utf8");
  await symlink(outside, join(root, "linked"), "junction");
  const logical = "linked/secret.txt";
  const [electronResult, tauriResult] = await Promise.all([
    run(electron, [electronMain, `--project-root=${root}`, `--audit-read=${logical}`]),
    run(tauri, [`--project-root=${root}`, `--audit-read=${logical}`])
  ]);
  const result = {
    schemaVersion: 0,
    electron: { exitCode: electronResult.code, rejected: electronResult.stdout.includes('"status":"reparse-rejected"') },
    tauri: { exitCode: tauriResult.code, rejected: tauriResult.stdout.includes('"status":"reparse-rejected"') }
  };
  const passed = result.electron.exitCode === 0 && result.electron.rejected &&
    result.tauri.exitCode === 0 && result.tauri.rejected;
  process.stdout.write(`${JSON.stringify({ ...result, status: passed ? "PASS" : "FAIL" })}\n`);
  if (!passed) process.exitCode = 1;
} finally {
  await rm(root, { recursive: true, force: true });
  await rm(outside, { recursive: true, force: true });
}
