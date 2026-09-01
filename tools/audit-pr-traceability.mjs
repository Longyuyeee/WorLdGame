import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const baseSha = process.env.WORLD_PR_BASE_SHA?.trim();
if (process.env.GITHUB_EVENT_NAME !== "pull_request" || !baseSha) {
  console.log(JSON.stringify({ status: "PASS", mode: "local-or-push", rule: "PR product code changes must update docs/90-m1-requirement-traceability.md" }, null, 2));
  process.exit(0);
}

const { stdout } = await run("git", ["diff", "--name-only", `${baseSha}...HEAD`], { encoding: "utf8" });
const changed = stdout.split(/\r?\n/).filter(Boolean).map((path) => path.replaceAll("\\", "/"));
const productCodeChanged = changed.some((path) => /^(apps|packages)\/.*\.(ts|tsx|js|mjs|json)$/.test(path));
const traceabilityChanged = changed.includes("docs/90-m1-requirement-traceability.md");
if (productCodeChanged && !traceabilityChanged) {
  console.error(JSON.stringify({ status: "FAIL", violation: "Product code changed without updating the M1 traceability matrix", changed }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ status: "PASS", mode: "pull-request", productCodeChanged, traceabilityChanged, changedFiles: changed.length }, null, 2));
}
