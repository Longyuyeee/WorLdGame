import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const windowsLauncher = (await readFile(join(root, "start-n23-acceptance.cmd"), "utf8")).replaceAll("\r\n", "\n");
const violations = [];

if (packageJson.scripts?.["acceptance:n23"] !== "node tools/start-n23-acceptance.mjs") {
  violations.push("root acceptance:n23 script is stale");
}
if (!windowsLauncher.includes('cd /d "%~dp0"') || !windowsLauncher.includes('if not exist "node_modules\\vite\\package.json"') ||
    !windowsLauncher.includes("process.versions.node") || !windowsLauncher.includes("call npm.cmd ci") ||
    !windowsLauncher.includes("call npm.cmd run acceptance:n23 -- %*")) {
  violations.push("Windows N23 acceptance launcher no longer guarantees repository root, locked install, and frozen npm entry");
}

if (violations.length === 0) {
  const smokeCommand = process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : process.execPath;
  const smokeArguments = process.platform === "win32"
    ? ["/d", "/c", "call start-n23-acceptance.cmd --smoke"]
    : [join(root, "tools", "start-n23-acceptance.mjs"), "--smoke"];
  const smoke = spawnSync(smokeCommand, smokeArguments, {
    cwd: root, encoding: "utf8", windowsHide: true
  });
  if (smoke.status !== 0) {
    violations.push(`N23 acceptance launcher smoke failed: ${(smoke.stderr || smoke.stdout).trim()}`);
  } else {
    const marker = smoke.stdout.lastIndexOf('{\n  "status": "PASS"');
    const result = marker >= 0 ? JSON.parse(smoke.stdout.slice(marker)) : null;
    if (result?.status !== "PASS" || result?.mode !== "production-preview-smoke" || result?.url !== "http://127.0.0.1:43123/") {
      violations.push("N23 acceptance launcher smoke output is invalid");
    } else {
      console.log(JSON.stringify({ ...result, launcher: "start-n23-acceptance.cmd" }, null, 2));
    }
  }
}

if (violations.length > 0) {
  console.error(JSON.stringify({ status: "FAIL", violations }, null, 2));
  process.exitCode = 1;
}
