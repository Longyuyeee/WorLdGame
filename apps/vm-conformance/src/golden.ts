export const SPIKE10_NODE_GOLDEN_V0 = {
  corpusDigest: "6b0b6a12c890a7c2cda7966e3825df12b484ad4a1a5b651e5cdada7c74d6491f",
  traceDigest: "9a2e76dc518be215453fb43854ccc6e97bb47e70feaff1b2a87c86223b052738",
  recordDigests: [
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
  ]
} as const;

export const SPIKE11_NODE_GOLDEN_V0 = {
  suiteDigest: "39937239e2a6635ea7448f36f16297f71564323c6a97747b878a58a8e77894cc",
  recordDigests: [
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
  ]
} as const;

export const SPIKE12_NODE_GOLDEN_V0 = {
  schemaVersion: 0,
  corpusId: "corpus.generated.spike12.v0",
  seedCount: 10_000,
  replayExecutions: 20_000,
  chunkCount: 40,
  scenarioCounts: {
    "nested-condition": 1667,
    "call-return": 1667,
    random: 1667,
    "effect-cancellation": 1667,
    "save-load": 1666,
    "choice-back-forward": 1666
  },
  failedSeeds: [],
  outcomeDigest: "770920d96fdcb3388c3f7aead30ee45385ec9cd0c435960a6981b5cb6c92e048"
} as const;

export const SPIKE13_NODE_GOLDEN_V0 = {
  recordCount: 22,
  suiteDigest: "fdf3b8dcc83f57f29b45a27f275c48254dbe4e3c208d788d196eb4fb7c74fb26"
} as const;
import type { RuntimeConformanceResultV1, RuntimeGeneratedCorpusSummaryV1 } from "@world-studio/runtime";

export const RUNTIME_GENERATED_CORPUS_NODE_GOLDEN_V1: RuntimeGeneratedCorpusSummaryV1 = {
  schemaVersion: 1,
  corpusId: "corpus.generated.runtime.v1",
  seedCount: 10_000,
  replayExecutions: 20_000,
  chunkCount: 40,
  scenarioCounts: {
    "control-flow": 1429,
    random: 1429,
    "effect-cancellation": 1429,
    "save-load": 1429,
    "choice-history": 1428,
    "scheduler-equivalence": 1428,
    "diagnostic-rollback": 1428
  },
  failedSeeds: [],
  outcomeDigest: "e12b72f81c47339604540876d77eda0d0f5dc624462a20ec1dd35f8c9322a125"
};

export const RUNTIME_NODE_GOLDEN_V1: RuntimeConformanceResultV1 = {
  schemaVersion: 1,
  runtimeVersion: "0.6.0",
  initialStateHash: "78aacc0af3e9a6506e611d7b03a720b78974db44502d55fd67c0e1a5dee2655f",
  randomValue: 13,
  randomStateHash: "665d97b3e8252d2901fee615ebf39e21eb7465d27d10b2af5c24429b041b2978",
  endingStateHash: "36587b7f9e4f95a51575e1d5270c43f7b045347b0084ae2e1d8e35db76383700",
  reachedEndingIds: ["done"],
  effectIntentHash: "ae85cfea2908822b25f52c60fa4a602f2f36b7a204ae157023d91a7103268992",
  effectIssuedStateHash: "9b3637dfae72873e2ad30cdb17b7075883352c1d1b8a4ea98c276402b3f8ca61",
  effectCompletedStateHash: "6d67b6cc6dfc4dee3fd5387cf8a522491a06dd849d7d61ca1f0609208a6e2855",
  barrierRequestId: "barrier.62b95f219800e9bad704d050252bddea054d18c84cd27a5f41e84498d19d3eaf",
  barrierCommittedStateHash: "521c60c7cc0f1f33530fe95aac2617b4b520293af9ad198110296601fbdf85b7",
  saveArtifactHash: "16a362a9def60c478121d4195475876f0beddc0397bb9f0e8a838b1372d2a094",
  rehydratedEffectId: "effect.d79a3a9f688842936460611f2fd9a3505574511865833e165d05ca0e7337d577",
  rehydratedStateHash: "9b3637dfae72873e2ad30cdb17b7075883352c1d1b8a4ea98c276402b3f8ca61",
  historyBackStateHash: "b2a3ce524981f87eb687356bcddd18ad6a3c0276cad29b6975605e0229537aab",
  historyForwardStateHash: "4753549ffbaf6c03b97c55894b1731e4dc095603d7b30417e6cf5c7e09db4d58",
  historyForkStateHash: "90838d6d0a40948affd89dce40bd59940edcb81ea456fada9581a12850006b6b",
  historySessionHash: "2f98afc4db5ba330be896826219c3a63e6424186e4c265f66350fbc15c03db6c",
  historyTombstoneInputId: "input-history-left",
  historyBarrierCode: "RUNTIME_BARRIER_BLOCKED",
  schedulerFinalStateHash: "4817233c4c9113e2d35b1aae0d33600d1210d44e6accd1bccc2abc29d308f0e4",
  schedulerNormalHistoryHash: "93bd7599a52295678809ba508806d921e64d263ceb2013079d7f1e234f3d7407",
  schedulerInstantHistoryHash: "93bd7599a52295678809ba508806d921e64d263ceb2013079d7f1e234f3d7407",
  schedulerAutoDelayMilliseconds: 90,
  schedulerYieldAccumulatedInstructions: 1,
  schedulerBarrierStopReason: "barrier",
  sourceDiagnosticCode: "RUNTIME_VARIABLE_MISSING",
  sourceDiagnosticStatus: "instruction",
  sourceDiagnosticInstructionIndex: 0,
  sourceDiagnosticStatementId: "source_statement",
  sourceDiagnosticStatementIndex: 3
};
