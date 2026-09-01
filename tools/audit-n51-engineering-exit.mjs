import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFile(join(root, path), "utf8");
const contract = JSON.parse(await read("config/n51-engineering-exit.json"));
const n52HistoryAuthority = JSON.parse(await read("config/n52-e5a-history-contract-authority.json"));
const violations = [];

if (contract.schemaVersion !== 1 || contract.node !== "N51") violations.push("N51 exit contract identity is invalid");
if (contract.engineeringStatus !== "complete" || contract.productAcceptance !== "blocked") {
  violations.push("N51 Engineering must be complete while Product Acceptance remains blocked");
}

const settingsSource = await read("packages/gal-settings/src/settings.ts");
const catalogSource = await read("packages/gal-settings/src/catalog.ts");
const applicationSource = await read("packages/gal-settings/src/application.ts");
const webHostSource = await read("apps/player-shell/src/player-host.tsx");
const mountSource = await read("apps/player-shell/src/mount-player.tsx");

const currentSchema = Number(/GAL_SETTINGS_SCHEMA_VERSION = (\d+) as const/u.exec(settingsSource)?.[1]);
const authorizedHistoryEvolution = n52HistoryAuthority.authority?.scope?.includes("gal-settings-v6-history-forward-policy-only")
  && n52HistoryAuthority.historyPolicyContract?.field === "history.allowForwardAfterBack";
const expectedCurrentSchema = authorizedHistoryEvolution ? contract.settings.schemaVersion + 1 : contract.settings.schemaVersion;
if (currentSchema !== expectedCurrentSchema) violations.push(`Gal Settings current schema must be authorized v${expectedCurrentSchema}, actual v${currentSchema}`);
if (!applicationSource.includes(`GAL_SETTINGS_APPLICATION_VERSION = ${contract.settings.applicationVersion} as const`)) {
  violations.push(`Gal Settings application must be v${contract.settings.applicationVersion}`);
}
const platformLiteral = JSON.stringify(contract.settings.platforms).replaceAll(",", ", ");
if (!settingsSource.includes(`GAL_SETTINGS_PLATFORMS = ${platformLiteral} as const`)) {
  violations.push(`Gal Settings platforms differ from ${platformLiteral}`);
}

const definitions = [...catalogSource.matchAll(/\{\s*path:\s*"([^"]+)"[\s\S]*?level:\s*"(basic|advanced)"/gu)]
  .map((match) => ({ path: match[1], level: match[2] }));
const uniquePaths = new Set(definitions.map((item) => item.path));
const basicFields = definitions.filter((item) => item.level === "basic").length;
const expectedAdvancedFields = contract.settings.advancedFields + (authorizedHistoryEvolution ? 1 : 0);
const expectedBasicFields = contract.settings.basicFields + (authorizedHistoryEvolution ? 1 : 0);
if (definitions.length !== expectedAdvancedFields || uniquePaths.size !== definitions.length) {
  violations.push(`catalog fields expected authorized ${expectedAdvancedFields} unique, actual ${definitions.length}/${uniquePaths.size}`);
}
if (basicFields !== expectedBasicFields) {
  violations.push(`basic catalog fields expected authorized ${expectedBasicFields}, actual ${basicFields}`);
}

for (const token of [
  'Omit<ComponentProps<typeof PlayerShell>, "hostActivity" | "platform">',
  'platform="web"'
]) {
  if (!webHostSource.includes(token)) violations.push(`Web Player Host is missing frozen ownership token: ${token}`);
}
if (!mountSource.includes('readonly settingsPlatform: "web"') || !mountSource.includes('settingsPlatform: "web"')) {
  violations.push("versioned Player observation does not expose the fixed Web settings platform");
}

const expectedDeferredOwners = ["N52", "N61", "N62", "N70-N72", "N80-N83"];
const actualDeferredOwners = (contract.deferredOwners ?? []).map((item) => item.node);
if (JSON.stringify(actualDeferredOwners) !== JSON.stringify(expectedDeferredOwners)
  || contract.deferredOwners.some((item) => typeof item.scope !== "string" || item.scope.length === 0)) {
  violations.push("N51 deferred owner registry is incomplete or reordered");
}
if (JSON.stringify(contract.settings.verifiedProductionHosts) !== JSON.stringify(["web"])
  || JSON.stringify(contract.settings.blockedProductHosts) !== JSON.stringify(["windows", "android"])) {
  violations.push("only Web may be registered as a verified N51 production Host");
}

for (const evidenceContract of contract.productionEvidence ?? []) {
  try {
    const evidence = JSON.parse(await read(evidenceContract.path));
    if (evidence.schemaVersion !== 1 || evidence.result !== "PASS" || evidence.node !== evidenceContract.minimumNode) {
      violations.push(`${evidenceContract.path} is not the frozen passing ${evidenceContract.minimumNode} evidence`);
    }
    if (evidenceContract.path.includes("runtime") && evidence.expectation?.host?.settingsPlatform !== "web") {
      violations.push(`${evidenceContract.path} does not freeze the Web Host identity`);
    }
  } catch (error) {
    violations.push(`${evidenceContract.path} cannot be read: ${error instanceof Error ? error.message : String(error)}`);
  }
}

for (const documentContract of contract.requiredDocuments ?? []) {
  try {
    const document = await read(documentContract.path);
    if (!document.includes(documentContract.token)) {
      violations.push(`${documentContract.path} is missing exit token: ${documentContract.token}`);
    }
  } catch (error) {
    violations.push(`${documentContract.path} cannot be read: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const result = {
  status: violations.length === 0 ? "PASS" : "FAIL",
  node: contract.node,
  engineeringStatus: contract.engineeringStatus,
  productAcceptance: contract.productAcceptance,
  settings: {
    historicalExitSchemaVersion: contract.settings.schemaVersion,
    currentSchemaVersion: currentSchema,
    applicationVersion: contract.settings.applicationVersion,
    advancedFields: definitions.length,
    basicFields,
    verifiedProductionHosts: contract.settings.verifiedProductionHosts,
    blockedProductHosts: contract.settings.blockedProductHosts
  },
  deferredOwners: actualDeferredOwners,
  violations
};

console[violations.length === 0 ? "log" : "error"](JSON.stringify(result, null, 2));
if (violations.length > 0) process.exitCode = 1;
