import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { validateN21HumanValidation } from "./n21-human-validation-policy.mjs";

const root = process.cwd();
const protocol = JSON.parse(await readFile(join(root, "config", "n21-human-validation-protocol.json"), "utf8"));
const record = JSON.parse(await readFile(join(root, "evidence", "n21", "human-validation.json"), "utf8"));
const riskRegistry = JSON.parse(await readFile(join(root, "config", "risk-acceptances.json"), "utf8"));

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

const protocolHash = createHash("sha256").update(JSON.stringify(canonical(protocol))).digest("hex");
const violations = validateN21HumanValidation(protocol, record, riskRegistry);
if (record.protocolHash !== protocolHash) violations.push(`N21 human protocol hash is stale; expected ${protocolHash}`);
if (record.status !== "pending-participant") {
  for (const [name, artifact] of Object.entries(record.artifacts ?? {})) {
    if (typeof artifact?.path !== "string" || typeof artifact?.sha256 !== "string") continue;
    try {
      const bytes = await readFile(join(root, artifact.path));
      const actualHash = createHash("sha256").update(bytes).digest("hex");
      if (actualHash !== artifact.sha256) violations.push(`N21 ${name} artifact hash is stale; expected ${actualHash}`);
    } catch {
      violations.push(`N21 ${name} artifact is missing: ${artifact.path}`);
    }
  }
}

if (violations.length > 0) {
  console.error(JSON.stringify({ status: "FAIL", recordStatus: record.status, violations }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    status: "PASS",
    recordStatus: record.status,
    protocolId: protocol.protocolId,
    protocolHash,
    blockedGates: riskRegistry.exceptions.find((entry) => entry.id === "RA-N21-001")?.blockedGates ?? []
  }, null, 2));
}
