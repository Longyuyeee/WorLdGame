import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { validateDeliveryBaselineRegistry } from "./delivery-baseline-policy.mjs";

const run = promisify(execFile);
const root = process.cwd();
const registry = JSON.parse(await readFile(join(root, "config", "delivery-baseline.json"), "utf8"));
const violations = validateDeliveryBaselineRegistry(registry);

for (const item of registry.requiredAncestors ?? []) {
  try {
    await readFile(join(root, item.evidence), "utf8");
  } catch {
    violations.push(`${item.node}: evidence file is not readable`);
  }
  try {
    await run("git", ["merge-base", "--is-ancestor", item.commit, "HEAD"], { cwd: root });
  } catch {
    violations.push(`${item.node}: required commit is not an ancestor of HEAD`);
  }
}

for (let index = 1; index < (registry.requiredAncestors?.length ?? 0); index += 1) {
  const previous = registry.requiredAncestors[index - 1];
  const current = registry.requiredAncestors[index];
  try {
    await run("git", ["merge-base", "--is-ancestor", previous.commit, current.commit], { cwd: root });
  } catch {
    violations.push(`${previous.node} is not an ancestor of ${current.node}`);
  }
}

try {
  const { stdout } = await run("git", ["rev-list", "--left-right", "--count", `${registry.baseRef}...HEAD`], { cwd: root, encoding: "utf8" });
  const [behind] = stdout.trim().split(/\s+/).map(Number);
  if (behind !== 0) violations.push(`integration HEAD is behind ${registry.baseRef} by ${behind} commit(s)`);
} catch {
  violations.push(`baseRef ${registry.baseRef} is not available for ancestry audit`);
}

if (violations.length > 0) {
  console.error(JSON.stringify({ status: "FAIL", violations }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    status: "PASS",
    authorityBranch: registry.authorityBranch,
    baselineStatus: registry.status,
    integratedThrough: registry.integratedThrough,
    pullRequest: registry.pullRequest,
    requiredAncestors: registry.requiredAncestors.map((item) => ({ node: item.node, commit: item.commit }))
  }, null, 2));
}
