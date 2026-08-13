import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const traceability = await readFile(join(root, "docs", "90-m1-requirement-traceability.md"), "utf8");
const owners = JSON.parse(await readFile(join(root, "config", "requirement-owners.json"), "utf8"));
const weeklyWorkflow = await readFile(join(root, ".github", "workflows", "weekly-demo.yml"), "utf8");
const statuses = new Set(["未开始", "设计冻结", "实现中", "集成中", "验收中", "通过"]);
const expected = [
  ...Array.from({ length: 10 }, (_, index) => `USP-${String(index + 1).padStart(2, "0")}`),
  "REQ-PRJ", "REQ-ROUTE", "REQ-SEQ", "REQ-SCRIPT", "REQ-STAGE", "REQ-UX", "REQ-ASSET",
  "REQ-RUNTIME", "REQ-L10N", "REQ-QA", "REQ-BUILD", "REQ-GAL", "REQ-OPT",
  ...Array.from({ length: 27 }, (_, index) => `AC-${String(index + 1).padStart(2, "0")}`)
].sort();
const violations = [];
const rows = new Map();

for (const line of traceability.split(/\r?\n/)) {
  const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
  const id = cells[0];
  if (!/^(USP-\d{2}|REQ-[A-Z0-9-]+|AC-\d{2})$/.test(id ?? "")) continue;
  if (rows.has(id)) violations.push(`${id} appears more than once in the traceability tables`);
  rows.set(id, cells);
  const status = cells.find((cell) => statuses.has(cell));
  if (status === undefined) violations.push(`${id} has no allowed status`);
  if (!cells.some((cell) => /N\d+/.test(cell))) violations.push(`${id} has no delivery node`);
  if (status === "通过" && !cells.some((cell) => /\[[^\]]+\]\([^)]+\)|`[^`/]+\/[^`]+`/.test(cell))) {
    violations.push(`${id} is marked passed without a linked evidence path`);
  }
}

const actual = [...rows.keys()].sort();
if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  violations.push(`traceability IDs differ: expected=${expected.join(",")} actual=${actual.join(",")}`);
}
if (owners.schemaVersion !== 1 || !Array.isArray(owners.groups)) violations.push("requirement owner registry must use schemaVersion 1 and groups[]");
if (owners.testEntry !== "npm run check" || owners.evidenceIndex !== "docs/90-m1-requirement-traceability.md") violations.push("every requirement must share the frozen test entry and evidence index");
const ownerByRequirement = new Map();
for (const group of owners.groups ?? []) {
  if (typeof group.owner !== "string" || group.owner.length === 0) violations.push("owner group has no owner");
  for (const id of group.requirements ?? []) {
    if (ownerByRequirement.has(id)) violations.push(`${id} has more than one owner`);
    ownerByRequirement.set(id, group.owner);
  }
}
if (JSON.stringify([...ownerByRequirement.keys()].sort()) !== JSON.stringify(expected)) {
  violations.push("requirement owner registry must cover exactly every M1 USP, REQ, and AC ID");
}
for (const token of ["schedule:", "workflow_dispatch:", "npm run audit:requirements", "npm run audit:goldens", "npm run demo:empty-to-web"]) {
  if (!weeklyWorkflow.includes(token)) violations.push(`weekly demo workflow is missing ${token}`);
}

if (violations.length > 0) {
  console.error(JSON.stringify({ status: "FAIL", violations }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ status: "PASS", requirements: expected.length, usp: 10, p0Modules: 13, acceptanceCriteria: 27, owners: owners.groups.length }, null, 2));
}
