import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { validateRiskAcceptanceRegistry } from "./risk-acceptance-policy.mjs";

const root = process.cwd();
const registry = JSON.parse(await readFile(join(root, "config", "risk-acceptances.json"), "utf8"));
const traceability = await readFile(join(root, "docs", "90-m1-requirement-traceability.md"), "utf8");
const violations = validateRiskAcceptanceRegistry(registry);

for (const exception of registry.exceptions ?? []) {
  if (exception.status === "active" && !traceability.includes(exception.id)) {
    violations.push(`${exception.id}: active exception is missing from the M1 traceability authority`);
  }
  if (exception.status === "active") {
    try {
      await readFile(join(root, exception.evidencePath), "utf8");
    } catch {
      violations.push(`${exception.id}: evidencePath does not resolve to a readable file`);
    }
  }
}

if (violations.length > 0) {
  console.error(JSON.stringify({ status: "FAIL", violations }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    status: "PASS",
    currentDeliveryNode: registry.currentDeliveryNode,
    activeExceptions: registry.exceptions.filter((item) => item.status === "active").map((item) => ({
      id: item.id,
      maximumDeliveryNode: item.maximumDeliveryNode,
      expiresAt: item.expiresAt,
      blockedGates: item.blockedGates
    }))
  }, null, 2));
}
