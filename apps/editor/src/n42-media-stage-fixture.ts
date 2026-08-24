import {
  loadProject,
  migrateS0Project,
  type CanonicalProject,
  type S0Project
} from "@world-studio/project-domain";
import {
  createBlobDigest,
  type AssetIndex,
  type AssetKind
} from "@world-studio/project-persistence";
import { IndexedDbAssetRepository } from "./indexeddb-asset-repository";
import { IndexedDbProjectFileStore } from "./indexeddb-project-store";
import { inspectAssetBytes, mediaInspectionToJson } from "./media-inspection-client";
import { projectCanonicalWithAssetIndex } from "./canonical-project-adapter";
import mediaGoldenSource from "../../../fixtures/projects/media/media-golden.json?raw";
import mediaProjectSource from "../../../fixtures/projects/media/project.s0.json?raw";

interface N42MediaAsset {
  readonly assetId: string;
  readonly kind: AssetKind;
  readonly displayName: string;
  readonly mimeType: string;
  readonly byteLength: number;
  readonly sha256: string;
  readonly base64: string;
}

interface N42MediaFixtureSource {
  readonly schemaVersion: 1;
  readonly assets: readonly N42MediaAsset[];
}

export interface PreparedN42MediaStageFixture {
  readonly project: CanonicalProject;
  readonly index: AssetIndex;
}

function decodeBase64(source: string): Uint8Array {
  return Uint8Array.from(atob(source), (character) => character.charCodeAt(0));
}

function fixtureProject(projectId: string): CanonicalProject {
  const source = JSON.parse(mediaProjectSource) as S0Project;
  const project = loadProject(migrateS0Project(source).files);
  const mediaScript = project.scripts.media_stage;
  if (mediaScript === undefined) throw new Error("N42 Stage 媒体夹具缺少 media_stage 脚本");
  return {
    ...project,
    manifest: {
      ...project.manifest,
      projectId,
      title: "N42 Stage 媒体验收工程"
    },
    scripts: {
      ...project.scripts,
      media_stage: {
        ...mediaScript,
        statements: mediaScript.statements.flatMap((statement) => String(statement.id) === "media_show" ? [
          statement,
          {
            id: "media_move",
            kind: "direction",
            command: "show",
            summary: "action=move slot=actor x=25 y=80 scale=0.9 anchorX=0.5 anchorY=1 z=10 transition=slide duration=800ms easing=ease-in-out"
          }
        ] : [statement])
      }
    }
  };
}

export async function prepareN42MediaStageFixture(
  indexedDb: IDBFactory,
  projectId: string,
  nowMs = Date.now()
): Promise<PreparedN42MediaStageFixture> {
  const fixture = JSON.parse(mediaGoldenSource) as N42MediaFixtureSource;
  const files = new IndexedDbProjectFileStore(indexedDb, projectId, { now: () => nowMs });
  const ownerId = `n42-media-fixture-${projectId}`;
  const acquisition = await files.acquire(ownerId, nowMs, 30_000);
  if (acquisition.status !== "acquired") throw new Error("N42 Stage 媒体验收工程无法取得资源写入权");
  const assets = new IndexedDbAssetRepository(indexedDb, projectId, { now: () => nowMs });
  files.activateWriterLease(acquisition.lease);
  assets.activateWriterLease(acquisition.lease);
  try {
    let expectedIndexRevision = (await assets.loadIndex()).indexRevision;
    let index = await assets.loadIndex();
    for (const asset of fixture.assets) {
      const bytes = decodeBase64(asset.base64);
      if (bytes.byteLength !== asset.byteLength || createBlobDigest(bytes) !== `sha256:${asset.sha256}`) {
        throw new Error(`N42 Stage 媒体夹具 ${asset.assetId} 与冻结 Hash 不一致`);
      }
      const inspected = await inspectAssetBytes(bytes, asset.mimeType, asset.kind);
      const imported = await assets.importAsset({
        assetId: asset.assetId,
        kind: asset.kind,
        displayName: asset.displayName,
        mimeType: inspected.report.detectedMimeType,
        bytes: inspected.bytes,
        preservedFields: { inspection: mediaInspectionToJson(inspected.report) }
      }, { expectedIndexRevision, maxBytes: 4_096 });
      index = imported.index;
      expectedIndexRevision = index.indexRevision;
    }
    return { project: projectCanonicalWithAssetIndex(fixtureProject(projectId), index), index };
  } finally {
    assets.activateWriterLease(null);
    files.activateWriterLease(null);
    await files.release(acquisition.lease).catch(() => false);
  }
}
