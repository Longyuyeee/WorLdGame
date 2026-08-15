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
import type { RuntimeConformanceResultV1 } from "@world-studio/runtime";

export const RUNTIME_NODE_GOLDEN_V1: RuntimeConformanceResultV1 = {
  schemaVersion: 1,
  runtimeVersion: "0.4.0",
  initialStateHash: "f8083d9d5464cfcd27cff37832c9fa83b1470c16577e17835f7eeb6cb2376fd3",
  randomValue: 13,
  randomStateHash: "a59b6ec18a772545bf7aca0f5e9ae97f8750179db81d3abf507cf85d52ca1eb1",
  endingStateHash: "16f6a395a646cf86fa19fdbc0b5c76b5d8ae15987bdff326b08dd20581c40288",
  reachedEndingIds: ["done"],
  effectIntentHash: "ae85cfea2908822b25f52c60fa4a602f2f36b7a204ae157023d91a7103268992",
  effectIssuedStateHash: "bceafdd28b3058ab515b3267c71ee8faf83b9a3c587483d15083861b21215a0d",
  effectCompletedStateHash: "53653863beb0714f6178925d3d3ccbe64e393bf1533aa0723da567ce20f921f3",
  barrierRequestId: "barrier.62b95f219800e9bad704d050252bddea054d18c84cd27a5f41e84498d19d3eaf",
  barrierCommittedStateHash: "a4589c26cb8e7812d94792b41cee08c8d6afe14cc33cb54e3e03d410d6bb27bb",
  saveArtifactHash: "de61426116b0cf29c17d8141597cd5aa21e03a8f31eafc70ae9da92036061576",
  rehydratedEffectId: "effect.d79a3a9f688842936460611f2fd9a3505574511865833e165d05ca0e7337d577",
  rehydratedStateHash: "bceafdd28b3058ab515b3267c71ee8faf83b9a3c587483d15083861b21215a0d"
};
