import { readFile } from "node:fs/promises";
import process from "node:process";
import {
  CONFORMANCE_EXIT_INTERNAL,
  CONFORMANCE_EXIT_INVALID,
  compareConformanceObservationV0,
  createConformanceBundleV0,
  executeConformanceBundleV0
} from "@world-studio/narrative-vm-spike";

async function readStandardInput(): Promise<string> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of process.stdin) chunks.push(typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk);
  const size = chunks.reduce((total, chunk) => total + chunk.length, 0);
  if (size > 2_000_000) throw new RangeError("Observation exceeds the 2 MB CLI limit");
  const joined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder().decode(joined);
}

function output(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const bundle = createConformanceBundleV0();
  if (args.length === 1 && args[0] === "--bundle") {
    output(bundle);
    return;
  }
  if (args.length === 2 && args[0] === "--run") {
    const observation = executeConformanceBundleV0(String(args[1]));
    const report = compareConformanceObservationV0(bundle, observation);
    output({ observation, report });
    process.exitCode = report.exitCode;
    return;
  }
  if ((args.length === 1 && args[0] === "--compare-stdin") || (args.length === 2 && args[0] === "--compare")) {
    const text = args[0] === "--compare-stdin" ? await readStandardInput() : await readFile(String(args[1]), "utf8");
    let observed: unknown;
    try { observed = JSON.parse(text); } catch { observed = null; }
    const report = compareConformanceObservationV0(bundle, observed);
    output(report);
    process.exitCode = report.exitCode;
    return;
  }
  output({ schemaVersion: 0, status: "invalid", exitCode: CONFORMANCE_EXIT_INVALID,
    usage: ["--bundle", "--run <hostId>", "--compare <observation.json>", "--compare-stdin"] });
  process.exitCode = CONFORMANCE_EXIT_INVALID;
}

main().catch((error: unknown) => {
  output({ schemaVersion: 0, status: "internal", exitCode: CONFORMANCE_EXIT_INTERNAL,
    error: error instanceof Error ? error.message : String(error) });
  process.exitCode = CONFORMANCE_EXIT_INTERNAL;
});
