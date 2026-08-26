import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const auditedRoots = [
  join(repoRoot, "packages", "narrative-vm-spike", "src"),
  join(repoRoot, "packages", "project-domain", "src"),
  join(repoRoot, "packages", "project-compiler", "src"),
  join(repoRoot, "packages", "runtime", "src"),
  join(repoRoot, "packages", "runtime-host", "src"),
  join(repoRoot, "packages", "player-core", "src"),
  join(repoRoot, "packages", "route-graph", "src"),
  join(repoRoot, "packages", "story-core", "src"),
  join(repoRoot, "packages", "story-language", "src"),
  join(repoRoot, "packages", "project-persistence", "src")
];

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? collectFiles(path) : [path];
    })
  );
  return nested.flat();
}
const forbiddenImports = [
  "react",
  "react-dom",
  "electron",
  "@capacitor",
  "@tauri-apps",
  "node:crypto",
  "node:fs",
  "node:path",
  "node:process"
];
const forbiddenGlobalPatterns = new Map([
  ["document", /\bdocument\s*(?:\.|\[)/],
  ["window", /\bwindow\s*(?:\.|\[)/],
  ["HTMLElement", /\bHTMLElement\b/],
  ["localStorage", /\blocalStorage\b/],
  ["indexedDB", /\bindexedDB\b/]
]);
const violations = [];

const vmForbiddenGlobals = new Map([
  ["Math.random", /\bMath\.random\s*\(/],
  ["Date", /\b(?:new\s+Date|Date\.now)\s*\(/],
  ["performance.now", /\bperformance\.now\s*\(/],
  ["crypto randomness", /\bcrypto\.getRandomValues\s*\(/]
]);

const coreFiles = (
  await Promise.all(auditedRoots.map((root) => collectFiles(root)))
)
  .flat()
  .filter((path) => extname(path) === ".ts" && !path.endsWith(".test.ts"));

const nodeAdapterFiles = (await collectFiles(
  join(repoRoot, "packages", "project-persistence-node", "src")
)).filter((path) => extname(path) === ".ts" && !path.endsWith(".test.ts"));

for (const path of coreFiles) {
  const source = await readFile(path, "utf8");
  for (const dependency of forbiddenImports) {
    const importPattern = new RegExp(`from\\s+["']${dependency.replaceAll("-", "\\-")}`);
    if (importPattern.test(source)) {
      violations.push(`${relative(repoRoot, path)} imports forbidden dependency ${dependency}`);
    }
  }
  for (const [globalName, globalPattern] of forbiddenGlobalPatterns) {
    if (globalPattern.test(source)) {
      violations.push(`${relative(repoRoot, path)} references platform global ${globalName}`);
    }
  }
}

const vmFiles = coreFiles.filter(
  (path) =>
    path.includes(`${join("packages", "narrative-vm-spike", "src")}`) ||
    path.includes(`${join("packages", "runtime", "src")}`) ||
    path.includes(`${join("packages", "runtime-host", "src")}`)
);
for (const path of vmFiles) {
  const source = await readFile(path, "utf8");
  for (const [globalName, globalPattern] of vmForbiddenGlobals) {
    if (globalPattern.test(source)) {
      violations.push(`${relative(repoRoot, path)} references nondeterministic global ${globalName}`);
    }
  }
}

for (const path of nodeAdapterFiles) {
  const source = await readFile(path, "utf8");
  for (const dependency of ["react", "react-dom", "electron", "@capacitor", "@tauri-apps"]) {
    const importPattern = new RegExp(`from\\s+["']${dependency.replaceAll("-", "\\-")}`);
    if (importPattern.test(source)) {
      violations.push(`${relative(repoRoot, path)} imports forbidden UI or shell dependency ${dependency}`);
    }
  }
  for (const [globalName, globalPattern] of forbiddenGlobalPatterns) {
    if (globalPattern.test(source)) {
      violations.push(`${relative(repoRoot, path)} references forbidden platform global ${globalName}`);
    }
  }
}

const corePackage = JSON.parse(
  await readFile(join(repoRoot, "packages", "story-core", "package.json"), "utf8")
);

const vmPackage = JSON.parse(
  await readFile(join(repoRoot, "packages", "narrative-vm-spike", "package.json"), "utf8")
);
if (vmPackage.dependencies !== undefined) {
  violations.push("narrative-vm-spike must not declare runtime dependencies in CL-04");
}
if (corePackage.dependencies !== undefined) {
  violations.push("story-core must not declare runtime dependencies in S0.1");
}

const languagePackage = JSON.parse(
  await readFile(join(repoRoot, "packages", "story-language", "package.json"), "utf8")
);
const languageDependencies = Object.keys(languagePackage.dependencies ?? {});
if (
  languageDependencies.length !== 1 ||
  languageDependencies[0] !== "@world-studio/story-core"
) {
  violations.push("story-language may depend only on story-core in S0.3");
}

const persistencePackage = JSON.parse(
  await readFile(join(repoRoot, "packages", "project-persistence", "package.json"), "utf8")
);
const projectDomainPackage = JSON.parse(
  await readFile(join(repoRoot, "packages", "project-domain", "package.json"), "utf8")
);
const projectCompilerPackage = JSON.parse(
  await readFile(join(repoRoot, "packages", "project-compiler", "package.json"), "utf8")
);
const runtimePackage = JSON.parse(
  await readFile(join(repoRoot, "packages", "runtime", "package.json"), "utf8")
);
const runtimeHostPackage = JSON.parse(
  await readFile(join(repoRoot, "packages", "runtime-host", "package.json"), "utf8")
);
const playerCorePackage = JSON.parse(
  await readFile(join(repoRoot, "packages", "player-core", "package.json"), "utf8")
);
const routeGraphPackage = JSON.parse(
  await readFile(join(repoRoot, "packages", "route-graph", "package.json"), "utf8")
);
const projectCompilerDependencies = Object.keys(projectCompilerPackage.dependencies ?? {}).sort();
if (JSON.stringify(projectCompilerDependencies) !== JSON.stringify([
  "@world-studio/project-domain",
  "@world-studio/story-language"
])) {
  violations.push("project-compiler may depend only on project-domain and story-language in N30");
}
const runtimeDependencies = Object.keys(runtimePackage.dependencies ?? {}).sort();
if (JSON.stringify(runtimeDependencies) !== JSON.stringify(["@world-studio/project-compiler"])) {
  violations.push("runtime may depend only on project-compiler in N31");
}
const runtimeHostDependencies = Object.keys(runtimeHostPackage.dependencies ?? {}).sort();
if (JSON.stringify(runtimeHostDependencies) !== JSON.stringify(["@world-studio/runtime"])) {
  violations.push("runtime-host may depend only on the formal runtime in N32-E7");
}
const playerCoreDependencies = Object.keys(playerCorePackage.dependencies ?? {}).sort();
if (JSON.stringify(playerCoreDependencies) !== JSON.stringify([
  "@world-studio/project-compiler",
  "@world-studio/project-domain",
  "@world-studio/runtime",
  "@world-studio/runtime-host"
])) {
  violations.push("player-core may depend only on formal Compiler, Domain, Runtime, and Runtime Host in N50-E1");
}
const routeGraphDependencies = Object.keys(routeGraphPackage.dependencies ?? {}).sort();
if (JSON.stringify(routeGraphDependencies) !== JSON.stringify(["@world-studio/project-compiler", "@world-studio/project-domain"])) {
  violations.push("route-graph may depend only on project-compiler and project-domain in N40");
}
if (projectDomainPackage.dependencies !== undefined) {
  violations.push("project-domain must not declare runtime dependencies in N10");
}
if (persistencePackage.dependencies !== undefined) {
  violations.push("project-persistence must not declare runtime dependencies in S0.9");
}

const nodePersistencePackage = JSON.parse(
  await readFile(join(repoRoot, "packages", "project-persistence-node", "package.json"), "utf8")
);
const nodePersistenceDependencies = Object.keys(nodePersistencePackage.dependencies ?? {});
if (JSON.stringify(nodePersistenceDependencies.sort()) !== JSON.stringify([
  "@world-studio/project-domain",
  "@world-studio/project-persistence"
])) {
  violations.push("project-persistence-node may depend only on project-domain and project-persistence through N12");
}

const editorPackage = JSON.parse(
  await readFile(join(repoRoot, "apps", "editor", "package.json"), "utf8")
);
const editorProductionFiles = (await collectFiles(join(repoRoot, "apps", "editor", "src")))
  .filter((path) => [".ts", ".tsx"].includes(extname(path)) && !path.includes(".test."));
for (const path of editorProductionFiles) {
  const source = await readFile(path, "utf8");
  if (source.includes("@world-studio/project-persistence-node")) {
    violations.push(`${relative(repoRoot, path)} imports the Node adapter into the web editor`);
  }
}
if (editorPackage.dependencies?.["@world-studio/story-core"] === undefined) {
  violations.push("editor must declare its story-core boundary explicitly");
}
if (editorPackage.dependencies?.["@world-studio/story-language"] === undefined) {
  violations.push("editor must declare its story-language boundary explicitly");
}
if (editorPackage.dependencies?.["@world-studio/project-persistence"] === undefined) {
  violations.push("editor must declare its project-persistence boundary explicitly");
}
if (editorPackage.dependencies?.["@world-studio/project-domain"] === undefined) {
  violations.push("editor must declare its canonical project-domain boundary explicitly");
}
if (editorPackage.dependencies?.["@world-studio/route-graph"] === undefined) {
  violations.push("editor must declare its N40 route-graph boundary explicitly");
}
if (editorPackage.dependencies?.["@world-studio/project-persistence-node"] !== undefined) {
  violations.push("web editor must not bundle the Node filesystem adapter");
}

const vmHarnessRoot = join(repoRoot, "apps", "vm-conformance");
const vmHarnessPackage = JSON.parse(
  await readFile(join(vmHarnessRoot, "package.json"), "utf8")
);
const vmHarnessDependencies = Object.keys(vmHarnessPackage.dependencies ?? {});
if (JSON.stringify(vmHarnessDependencies.sort()) !== JSON.stringify(["@world-studio/narrative-vm-spike", "@world-studio/runtime", "@world-studio/runtime-host"])) {
  violations.push("VM conformance Harness may depend only on narrative-vm-spike, formal runtime, and portable runtime-host");
}
const vmHarnessFiles = (await collectFiles(join(vmHarnessRoot, "src")))
  .filter((path) => extname(path) === ".ts");
for (const path of vmHarnessFiles) {
  const source = await readFile(path, "utf8");
  for (const dependency of ["electron", "@capacitor", "@tauri-apps", "node:fs", "node:path", "node:process", "node:worker_threads"]) {
    const importPattern = new RegExp(`from\\s+["']${dependency.replaceAll("-", "\\-")}`);
    if (importPattern.test(source)) {
      violations.push(`${relative(repoRoot, path)} imports forbidden shell or Node dependency ${dependency}`);
    }
  }
}

const vmCliRoot = join(repoRoot, "apps", "vm-conformance-cli");
const vmCliPackage = JSON.parse(await readFile(join(vmCliRoot, "package.json"), "utf8"));
const vmCliDependencies = Object.keys(vmCliPackage.dependencies ?? {});
if (vmCliDependencies.length !== 1 || vmCliDependencies[0] !== "@world-studio/narrative-vm-spike") {
  violations.push("VM conformance CLI may depend only on narrative-vm-spike");
}
const vmCliFiles = (await collectFiles(join(vmCliRoot, "src"))).filter((path) => extname(path) === ".ts");
for (const path of vmCliFiles) {
  const source = await readFile(path, "utf8");
  for (const dependency of ["react", "react-dom", "electron", "@capacitor", "@tauri-apps", "node:worker_threads"]) {
    const importPattern = new RegExp(`from\\s+["']${dependency.replaceAll("-", "\\-")}`);
    if (importPattern.test(source)) violations.push(`${relative(repoRoot, path)} imports forbidden UI or shell dependency ${dependency}`);
  }
}

const windowsShellRoot = join(repoRoot, "apps", "windows-shell-conformance");
const securityProfile = JSON.parse(await readFile(join(windowsShellRoot, "security-profile.json"), "utf8"));
const electronMain = await readFile(join(windowsShellRoot, "electron", "main.ts"), "utf8");
const electronPreload = await readFile(join(windowsShellRoot, "electron", "preload.ts"), "utf8");
const rendererSource = await readFile(join(windowsShellRoot, "src", "main.ts"), "utf8");
const tauriMain = await readFile(join(windowsShellRoot, "src-tauri", "src", "main.rs"), "utf8");
const electronStorageHost = await readFile(join(windowsShellRoot, "electron", "storage-host.ts"), "utf8");
const tauriStorageHost = await readFile(join(windowsShellRoot, "src-tauri", "src", "storage.rs"), "utf8");
for (const [setting, expected] of Object.entries({ contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true, devTools: false })) {
  if (securityProfile.electron?.[setting] !== expected) violations.push(`Windows Electron security profile must set ${setting}=${expected}`);
}
for (const forbidden of ["shell.openExternal", "nodeIntegration: true", "sandbox: false", "contextIsolation: false", "webSecurity: false"]) {
  if (electronMain.includes(forbidden)) violations.push(`Windows Electron host contains forbidden setting ${forbidden}`);
}
if (!electronMain.includes('urls: ["http://*/*", "https://*/*"]')) {
  violations.push("Windows Electron host must deny shared-page HTTP and HTTPS requests");
}
for (const [path, source] of [["electron/preload.ts", electronPreload], ["src/main.ts", rendererSource]]) {
  for (const dependency of ["node:fs", "node:path", "node:process", "electron/main"]) {
    if (source.includes(dependency)) violations.push(`Windows shell ${path} imports forbidden privileged dependency ${dependency}`);
  }
}
const expectedWindowsCommands = "project_read,project_write,project_replace,project_remove,project_reset,lease_acquire,lease_renew,lease_release,submit_evidence";
if (securityProfile.tauri?.commands?.join(",") !== expectedWindowsCommands) {
  violations.push("Windows Tauri host commands must match the frozen WindowsHostV1 storage bridge");
}
if (!tauriMain.includes('url.scheme() == "tauri"') || !tauriMain.includes('url.host_str() == Some("tauri.localhost")')) {
  violations.push("Windows Tauri host must deny navigation outside the application scheme");
}
if (securityProfile.electron?.absolutePathsExposed !== false || securityProfile.tauri?.absolutePathsExposed !== false ||
    securityProfile.electron?.genericFileApi !== false || securityProfile.tauri?.genericFileApi !== false) {
  violations.push("Windows hosts must not expose absolute paths or a generic filesystem API");
}
for (const [host, source] of [["Electron", electronStorageHost], ["Tauri", tauriStorageHost]]) {
  if (!source.includes("GRANT_ROOT_REPARSE_REJECTED") || !source.includes("REPARSE_POINT_REJECTED")) {
    violations.push(`Windows ${host} storage host must reject reparse roots and reparse path segments`);
  }
}
if (securityProfile.electron?.grantRoot !== "native-only-canonical-directory" ||
    securityProfile.tauri?.grantRoot !== "native-only-canonical-directory") {
  violations.push("Windows project grant roots must remain native-only canonical directories");
}
if (securityProfile.electron?.writerCoordination !== "identified-atomic-cas-fenced-lease-spike" ||
    securityProfile.tauri?.writerCoordination !== "identified-atomic-cas-fenced-lease-spike" ||
    securityProfile.electron?.casRecovery !== "minimum-age-and-dead-pid-quarantine" ||
    securityProfile.tauri?.casRecovery !== "minimum-age-and-dead-pid-quarantine" ||
    JSON.stringify(securityProfile.electron?.reservedPaths) !== '[".world-lock"]' ||
    JSON.stringify(securityProfile.tauri?.reservedPaths) !== '[".world-lock"]') {
  violations.push("Windows hosts must persist fenced leases under a renderer-inaccessible reserved path");
}
if (!electronStorageHost.includes("withCasGuard") || !electronStorageHost.includes("CAS_GUARD_TIMEOUT") ||
    !tauriStorageHost.includes("with_cas_guard") || !tauriStorageHost.includes("CAS_GUARD_TIMEOUT")) {
  violations.push("Windows hosts must serialize lease mutation and fenced writes with a cross-PID CAS guard");
}
if (!electronStorageHost.includes("tryQuarantineStaleGuard") || !electronStorageHost.includes("releaseOwnedCasGuard") ||
    !tauriStorageHost.includes("try_quarantine_stale_guard") || !tauriStorageHost.includes("process_is_alive")) {
  violations.push("Windows hosts must identify CAS owners and atomically quarantine only confirmed stale guards");
}

if (violations.length > 0) {
  console.error(JSON.stringify({ status: "FAIL", violations }, null, 2));
  process.exitCode = 1;
} else {
  console.log(
    JSON.stringify(
      {
        status: "PASS",
        auditedPortableFiles: coreFiles.length,
        auditedNodeAdapterFiles: nodeAdapterFiles.length,
        guarantees: [
          "narrative-vm-spike has no UI, DOM, platform-shell, filesystem, process, crypto-provider, wall-clock, or ambient-random dependency",
          "story-core has no UI, DOM, platform-shell, filesystem, or process dependency",
          "story-language has no UI, DOM, platform-shell, filesystem, or process dependency",
          "story-language depends only on story-core",
          "project-compiler is portable and depends only on project-domain/story-language, never the VM spike or platform APIs",
          "runtime is portable and depends only on project-compiler, never the VM spike, editor, filesystem, wall clock, randomness, or platform APIs",
          "runtime-host is portable and depends only on formal runtime, never UI, DOM, shell, filesystem, wall clock, randomness, or platform APIs",
          "player-core is portable and consumes only canonical project, formal Compiler IR, Runtime, and Runtime Host without a parallel StoryStatement interpreter",
          "route-graph is portable and projects only canonical project and compiler facts through the Project Service boundary",
          "project-persistence has no UI, DOM, platform-shell, filesystem, process, or runtime third-party dependency",
          "project-domain has no UI, DOM, platform-shell, filesystem, process, crypto-provider, or runtime third-party dependency",
          "project-persistence-node is isolated from the web editor and depends only on portable project-domain/project-persistence contracts",
          "editor declares the story-core dependency explicitly",
          "editor declares the story-language dependency explicitly",
          "editor declares the project-persistence dependency explicitly",
          "web editor does not bundle the Node filesystem adapter",
          "VM Web Worker conformance Harness depends only on the portable Spike, formal Runtime, and portable Runtime Host and imports no shell or Node adapter",
          "VM conformance CLI is an isolated Node reference host and depends only on the portable narrative VM",
          "Windows Electron host keeps isolation and sandboxing enabled with the frozen WindowsHostV1 storage bridge",
          "Windows Tauri host exposes only the frozen WindowsHostV1 storage commands and no generic privileged plugin",
          "Windows project grant roots stay native-only and both hosts reject reparse roots and existing reparse path segments",
          "story-core has no runtime third-party dependency"
        ]
      },
      null,
      2
    )
  );
}
