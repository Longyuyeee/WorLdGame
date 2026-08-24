import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { validateN23ProductAcceptance } from "./n23-product-acceptance-policy.mjs";

const root = process.cwd();
const readJson = async (...segments) => JSON.parse(await readFile(join(root, ...segments), "utf8"));
const protocol = await readJson("config", "n23-product-acceptance-protocol.json");
const record = await readJson("evidence", "n23", "product-acceptance.json");
const riskRegistry = await readJson("config", "risk-acceptances.json");
const n21Record = await readJson("evidence", "n21", "human-validation.json");

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

const protocolHash = createHash("sha256").update(JSON.stringify(canonical(protocol))).digest("hex");
const violations = validateN23ProductAcceptance(protocol, record, riskRegistry, n21Record);
if (record.protocolHash !== protocolHash) violations.push(`N23 product acceptance protocol hash is stale; expected ${protocolHash}`);
const contentAudit = spawnSync(process.execPath, [join(root, "tools", "audit-n23-content.mjs")], {
  cwd: root, encoding: "utf8", windowsHide: true
});
if (contentAudit.status !== 0) violations.push("N23 product acceptance prerequisite content gate is not passing");
const launcherAudit = spawnSync(process.execPath, [join(root, "tools", "audit-n23-acceptance-launcher.mjs")], {
  cwd: root, encoding: "utf8", windowsHide: true
});
if (launcherAudit.status !== 0) violations.push("N23 product acceptance prerequisite launcher gate is not passing");
if (launcherAudit.status !== 0) {
  const detail = (launcherAudit.stderr || launcherAudit.stdout).trim().slice(-4_000);
  if (detail !== "") violations.push(`N23 launcher audit detail: ${detail}`);
}
const projectHomeSource = await readFile(join(root, "apps", "editor", "src", "project-home.tsx"), "utf8");
if (!projectHomeSource.includes(`>${protocol.prerequisite.productEntryLabel}</button>`)) {
  violations.push("N23 product acceptance entry label is not exposed by the project home UI");
}

if (record.status !== "pending-participants") {
  for (const participant of record.participants ?? []) {
    for (const [name, artifact] of Object.entries(participant.artifacts ?? {})) {
      if (typeof artifact?.path !== "string" || typeof artifact?.sha256 !== "string") continue;
      try {
        const bytes = await readFile(join(root, artifact.path));
        const actualHash = createHash("sha256").update(bytes).digest("hex");
        if (actualHash !== artifact.sha256) violations.push(`N23 ${participant.slotId} ${name} artifact hash is stale; expected ${actualHash}`);
      } catch {
        violations.push(`N23 ${participant.slotId} ${name} artifact is missing: ${artifact.path}`);
      }
    }
  }
}

if (violations.length > 0) {
  console.error(JSON.stringify({ status: "FAIL", recordStatus: record.status, violations }, null, 2));
  process.exitCode = 1;
} else {
  const completedParticipants = record.participants.filter((participant) => participant.tasks.every((task) => task.status !== "not-run")).length;
  console.log(JSON.stringify({
    status: "PASS",
    recordStatus: record.status,
    protocolId: protocol.protocolId,
    protocolHash,
    participants: `${completedParticipants}/${protocol.minimumParticipants}`,
    productEntryLabel: protocol.prerequisite.productEntryLabel,
    blockedGates: riskRegistry.exceptions.find((entry) => entry.status === "active" && entry.id.startsWith("RA-N21-"))?.blockedGates ?? []
  }, null, 2));
}
