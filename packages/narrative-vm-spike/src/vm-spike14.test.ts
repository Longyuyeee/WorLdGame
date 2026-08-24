import { describe, expect, it } from "vitest";
import { compareConformanceObservationV0, createConformanceBundleV0, type ConformanceObservationV0 } from "./index";

function expectedObservation(): ConformanceObservationV0 {
  const bundle = createConformanceBundleV0();
  return { schemaVersion: 0, bundleId: bundle.bundleId, hostId: "host.test", result: bundle.golden };
}

describe("CL-04 narrative VM conformance bundle spike 14", () => {
  it("freezes the content-addressed bundle and matches a conforming host", () => {
    const bundle = createConformanceBundleV0();
    expect(bundle.bundleDigest).toBe("d67631d6aaf36157501c7328b2d6486fd70c0dfc98493c3844c61dfbecc16f21");
    expect(compareConformanceObservationV0(bundle, expectedObservation())).toEqual({
      schemaVersion: 0, bundleId: bundle.bundleId, hostId: "host.test", status: "match", exitCode: 0, differences: []
    });
  });

  it("reports deterministic paths and exit code 2 for host differences", () => {
    const bundle = createConformanceBundleV0();
    const observed = expectedObservation();
    const report = compareConformanceObservationV0(bundle, {
      ...observed,
      result: { ...observed.result, spike13: { ...observed.result.spike13, suiteDigest: "0".repeat(64) } }
    });
    expect(report.status).toBe("difference");
    expect(report.exitCode).toBe(2);
    expect(report.differences).toEqual([{
      path: "result.spike13.suiteDigest", kind: "value",
      expected: "fdf3b8dcc83f57f29b45a27f275c48254dbe4e3c208d788d196eb4fb7c74fb26", actual: "0".repeat(64)
    }]);
  });

  it("returns exit code 64 for malformed observations or a forged bundle", () => {
    const bundle = createConformanceBundleV0();
    expect(compareConformanceObservationV0(bundle, { schemaVersion: 0 }).exitCode).toBe(64);
    expect(compareConformanceObservationV0({ ...bundle, bundleDigest: "0".repeat(64) }, expectedObservation()).exitCode).toBe(64);
  });
});
