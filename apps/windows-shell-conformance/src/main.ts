import { compareConformanceObservationV0, createConformanceBundleV0, executeConformanceBundleV0 } from "@world-studio/narrative-vm-spike";
import { executeStorageConformanceV0 } from "./storage-conformance";
import { windowsHost } from "./windows-host";

async function run(): Promise<void> {
  const bridge = windowsHost();
  if (new URLSearchParams(window.location.search).get("inject") === "invalid-payload") {
    await bridge.submitEvidence({ schemaVersion: 1 });
    return;
  }
  const bundle = createConformanceBundleV0();
  const observation = executeConformanceBundleV0(bridge.hostId);
  const report = compareConformanceObservationV0(bundle, observation);
  const storage = await executeStorageConformanceV0(bridge);
  document.querySelector("#status")!.textContent = report.status.toUpperCase();
  await bridge.submitEvidence({ schemaVersion: 1, observation, report, storage });
}

run().catch(async (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  document.querySelector("#status")!.textContent = "INTERNAL";
  await windowsHost().submitEvidence({ schemaVersion: 1, internalError: message });
});
