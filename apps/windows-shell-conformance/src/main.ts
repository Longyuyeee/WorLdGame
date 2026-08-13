import { invoke } from "@tauri-apps/api/core";
import { compareConformanceObservationV0, createConformanceBundleV0, executeConformanceBundleV0 } from "@world-studio/narrative-vm-spike";

interface WindowsHostV0 {
  readonly schemaVersion: 0;
  readonly hostId: string;
  submitConformance(payload: unknown): Promise<void>;
}

declare global {
  interface Window { windowsHostV0?: WindowsHostV0 }
}

function host(): WindowsHostV0 {
  if (window.windowsHostV0 !== undefined) return window.windowsHostV0;
  return {
    schemaVersion: 0,
    hostId: "host.windows.tauri-webview2",
    submitConformance: async (payload) => { await invoke("submit_conformance", { payload }); }
  };
}

async function run(): Promise<void> {
  const bridge = host();
  if (bridge.schemaVersion !== 0 || !/^host\.windows\./.test(bridge.hostId)) throw new TypeError("WindowsHostV0 bridge is invalid");
  if (new URLSearchParams(window.location.search).get("inject") === "invalid-payload") {
    await bridge.submitConformance({ schemaVersion: 0 });
    return;
  }
  const bundle = createConformanceBundleV0();
  const observation = executeConformanceBundleV0(bridge.hostId);
  const report = compareConformanceObservationV0(bundle, observation);
  document.querySelector("#status")!.textContent = report.status.toUpperCase();
  await bridge.submitConformance({ schemaVersion: 0, observation, report });
}

run().catch(async (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  document.querySelector("#status")!.textContent = "INTERNAL";
  await host().submitConformance({ schemaVersion: 0, internalError: message });
});
