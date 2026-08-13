import { describe, expect, it } from "vitest";
import { canonicalStringify } from "./canonical";
import {
  createSpike10ConformanceCorpusV0,
  executeConformanceCorpusV0,
  type ConformanceCorpusV0
} from "./conformance";

describe("CL-04 narrative VM host conformance spike 10", () => {
  it("produces one fixed per-action trace from the portable corpus", () => {
    const result = executeConformanceCorpusV0(createSpike10ConformanceCorpusV0());
    expect(result.records).toHaveLength(12);
    expect(result.records.every((record) => record.diagnosticCodes.length === 0)).toBe(true);
    expect(result.records[8]?.effectIntentHashes).toHaveLength(1);
    expect(result.records[10]?.checkpointHash).toBe(result.records[10]?.stateHash);
    expect(result.records[11]?.stepId).toBe("ending.host.complete");
    expect(result.corpusDigest).toBe("6b0b6a12c890a7c2cda7966e3825df12b484ad4a1a5b651e5cdada7c74d6491f");
    expect(result.recordDigests).toEqual([
      "662fd5fdcaa6142beb78b81dc1dda7c26dec944f7304a643241ab8296e9827bf",
      "2ed91e06aa5ce646900dbbbb1417a7fca4118e668925eb26a8befadb41cef105",
      "6b73470cfa951bb4d46ec1368cc1d85a55bb2dd45b30690f1b59cc47debe2d3c",
      "3c2ea6e296d5d9266acd32eb34167883bb1f3d652fe68e9a9abcb811c00c141b",
      "5d8cc73b8fcc8ed54035ccc9bfb482ace04116b4bc3db2b8b6ee60304b080106",
      "c02184a91623c26ed17a67e67b4c3e1b75c4c71b2fb7b20212978998c9079923",
      "a897b33b35c4a00ac49c5d480998fcbf413cabdd0bdff42506978a6cc6d6bc44",
      "c683fdc0abd4518d41aec5b9233985a74f283eed7f170881cda1dd84eacdcb0b",
      "be9ff290d72fe4dd7a70d13dd95bc2600e7e8de4634cb2d24fe657a448d85dc4",
      "a18bc27038fcb1166a35acb226d4f14da93afb661cf441da755d795611eb405a",
      "8f2c8a66a99204836ddba178709382f9ecdbd514f537a70e9def5bc90e75b95c",
      "1d0fda7ca5fc9684cc7d923f99cdb30fe812680427751f7351868830572a2f60"
    ]);
    expect(result.traceDigest).toBe("9a2e76dc518be215453fb43854ccc6e97bb47e70feaff1b2a87c86223b052738");
  });

  it("survives a canonical JSON transport boundary without changing any record", () => {
    const corpus = createSpike10ConformanceCorpusV0();
    const transported = JSON.parse(canonicalStringify(corpus)) as ConformanceCorpusV0;
    expect(executeConformanceCorpusV0(transported)).toEqual(executeConformanceCorpusV0(corpus));
  });

  it("fails closed when a host input action is out of order", () => {
    const corpus = createSpike10ConformanceCorpusV0();
    const malformed: ConformanceCorpusV0 = {
      ...corpus,
      actions: [{ kind: "completeEffect", inputId: "input.host.too-early" }]
    };
    expect(() => executeConformanceCorpusV0(malformed)).toThrow("no pending Effect");
  });
});
