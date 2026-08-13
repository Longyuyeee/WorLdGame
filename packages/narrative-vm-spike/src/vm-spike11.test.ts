import { describe, expect, it } from "vitest";
import { executeSpike11ConformanceSuiteV0 } from "./conformance";

describe("CL-04 narrative VM host conformance spike 11", () => {
  it("freezes Scheduler plus History/Save workflow records", () => {
    const result = executeSpike11ConformanceSuiteV0();
    expect(result.records).toHaveLength(16);
    expect(result.records.filter((record) => record.workflow === "scheduler")).toHaveLength(5);
    expect(result.records.filter((record) => record.workflow === "historySave")).toHaveLength(11);
    expect(result.records.find((record) => record.operation === "save.load.corrupt")?.diagnosticCodes)
      .toEqual(["VM_SAVE_INTEGRITY"]);
    expect(result.records.at(-1)?.historyCursor).toBe(2);
    expect(result.recordDigests).toEqual([
      "747b9dfb4028c84c5b55b1ed0d79eaee4494717dcba7c3b00099d60554b35661",
      "c897745d1bd15fa156bcfacce25f7597da26d1dc8730cb7d05a62fd2cc3e0f35",
      "082d35e9457cf8688fb6916e7140b2e53f0b682df669c8080fa4edcb1c80790a",
      "c610d7bc8e3dbe0cc84fdba2dae68fd58cbb4c09d8cc8c4b69ae300c4bf85c63",
      "f8a7a612088dc3a89ba222ff59a062caa38734d6e7e1a3a00ebaf7a98d9cf97f",
      "764522d270bcf0689bd734e324e734877322e60cb941e5bed905f91bbc7dfa79",
      "b194f94f8a5e983bfecca7c5f6b206281d8efd79eac56d866676ce51c78c2d73",
      "99594725eedad0544f78b263d8844f9cecc6a7cad3c098345619e4e4665e9abc",
      "fd1f58ee545c10ee2a0e2a2412ec0454361fc916b4b4f1304aaca3458df560f0",
      "67d7a43de131ffaab79a8550a6596a1e934cdd695803362c672a618e01d51a64",
      "0fdb31d7215541cc10df31d261d40b0ffc599374baed4c4bd58bbe3c49b6c8f8",
      "81cbea75cd33682cbc864089c589748bd8ca0457f05e80b1af5416b7a19fc01a",
      "eb12e3b328cb033ecbb7ab1db0c6b35f86a8a079c799ebfa9695360ce797acb2",
      "91def4efaf0a61f30a8327096cf08f699d1a99082f08b61496a1a54fef8869a0",
      "0b9bb9213d23514cd6f097584138eb06a687683f59936a521c39b5b2afc39c39",
      "12f2c4a732aec00a822b9157df33de6c9376a28f571ef7089c0ea2f6f0484312"
    ]);
    expect(result.suiteDigest).toBe("39937239e2a6635ea7448f36f16297f71564323c6a97747b878a58a8e77894cc");
  });

  it("repeats the complete suite without changing any portable record", () => {
    expect(executeSpike11ConformanceSuiteV0()).toEqual(executeSpike11ConformanceSuiteV0());
  });
});
