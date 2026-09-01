import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFile(join(root, path), "utf8");
const contract = JSON.parse(await read("config/n52-e4f-mobile-cold-production-exit.json"));
const exitContract = JSON.parse(await read("config/n52-e4-engineering-exit-reaudit.json"));
const css = await read("apps/player-shell/src/player-shell.css");
const violations = [];

if (contract.schemaVersion !== 1 || contract.node !== "N52-E4f-mobile-cold-production-exit") violations.push("E4f contract identity is invalid");
if (contract.engineeringStatus !== "complete" || contract.productAcceptance !== "blocked") violations.push("E4f must close Engineering without claiming Product Acceptance");
if (contract.authority?.maximumDeliveryNode !== "N52") violations.push("E4f exceeded RA-N21-011 maximum node");

const expectedMatrix = ["schedulerAuthority", "autoRealClock", "skipModesActivationsAndSpeeds", "textStageCharacterAndAudioCleanup", "buildAuthoredStopPointSource", "formalVideoPolicyEvidence", "e4cMobileColdProduction"];
for (const key of expectedMatrix) if (contract.matrix?.[key] !== "complete") violations.push(`E4f matrix item is not complete: ${key}`);
if (contract.coldProduction?.viewport !== "390x844" || contract.coldProduction?.documentHorizontalOverflowPixels !== 0 || contract.coldProduction?.minimumInteractiveControlHeightPixels < 44 || contract.coldProduction?.consoleErrorsAndWarnings !== 0) violations.push("E4f mobile production evidence is incomplete");
for (const key of ["auto", "toggleSkipRead", "toggleSkipAll", "holdSkipRead", "holdSkipAll"]) if (!contract.coldProduction?.[key]) violations.push(`E4f mobile vector is missing: ${key}`);
if (contract.remoteImplementationEvidence?.commit !== "b5681a711f6ff8798a3320543e15481c89dd8f06" || contract.remoteImplementationEvidence?.workflowRun !== 33408391033 || contract.remoteImplementationEvidence?.workflowJob !== 99541585012 || contract.remoteImplementationEvidence?.conclusion !== "success") violations.push("E4f exact implementation head CI evidence is missing");
if (!/@media \(max-width: 640px\)[\s\S]*?\.player-playback-controls select \{ min-height: 48px; \}/u.test(css)) violations.push("mobile playback selects do not preserve the 48px touch target correction");
if (exitContract.engineeringStatus !== "complete" || exitContract.matrix?.e4cMobileColdProduction !== "complete") violations.push("aggregate E4 exit contract is not closed");
if (contract.continuation?.node !== "N52-engineering-exit-and-N60-governance-checkpoint") violations.push("post-E4 continuation is not governance-bounded");

for (const item of contract.requiredDocuments ?? []) {
  try {
    if (!(await read(item.path)).includes(item.token)) violations.push(`${item.path} missing token: ${item.token}`);
  } catch (error) {
    violations.push(`${item.path} cannot be read: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const result = { status: violations.length === 0 ? "PASS" : "FAIL", node: contract.node, engineeringStatus: contract.engineeringStatus, productAcceptance: contract.productAcceptance, matrix: contract.matrix, continuation: contract.continuation, violations };
console[violations.length === 0 ? "log" : "error"](JSON.stringify(result, null, 2));
if (violations.length > 0) process.exitCode = 1;
