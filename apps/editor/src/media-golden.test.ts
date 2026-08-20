import { IDBFactory } from "fake-indexeddb";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadProject as loadCanonicalProject, migrateS0Project, type S0Project } from "@world-studio/project-domain";
import {
  createBlobDigest,
  loadProject as loadPersistedProject,
  saveProjectWithBackups,
  type AssetKind
} from "@world-studio/project-persistence";
import { IndexedDbAssetRepository } from "./indexeddb-asset-repository";
import { IndexedDbProjectFileStore } from "./indexeddb-project-store";
import { inspectAssetBytes, mediaInspectionToJson } from "./media-inspection-client";
import { derivePreviewStagePlan, loadPreviewMedia, releasePreviewMedia } from "./preview-media-runtime";
import { createProjectSnapshot, createStudioSessionFromCanonical, restoreStudioSession } from "./studio-session";
import mediaGoldenSource from "../../../fixtures/projects/media/media-golden.json?raw";
import mediaProjectSource from "../../../fixtures/projects/media/project.s0.json?raw";

interface GoldenAsset {
  readonly assetId: string;
  readonly kind: AssetKind;
  readonly displayName: string;
  readonly mimeType: string;
  readonly byteLength: number;
  readonly sha256: string;
  readonly base64: string;
}

interface MediaGoldenFixture {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly assets: readonly GoldenAsset[];
  readonly expectedStage: {
    readonly backgroundAssetId: string;
    readonly characterAssetIds: readonly string[];
    readonly audioAssetIds: readonly string[];
    readonly diagnosticCount: number;
  };
}

function fixtureJson<T>(source: string): T {
  return JSON.parse(source) as T;
}

function decodeBase64(source: string): Uint8Array {
  return Uint8Array.from(atob(source), (character) => character.charCodeAt(0));
}

afterEach(() => vi.unstubAllGlobals());

describe("N22 Media Golden product chain", () => {
  it("inspects, imports, saves, reopens, previews, and releases deterministic real media", async () => {
    vi.stubGlobal("Worker", undefined);
    const fixture = fixtureJson<MediaGoldenFixture>(mediaGoldenSource);
    const sourceProject = fixtureJson<S0Project>(mediaProjectSource);
    const canonical = loadCanonicalProject(migrateS0Project(sourceProject).files);
    const session = createStudioSessionFromCanonical(canonical);
    const indexedDb = new IDBFactory();
    const files = new IndexedDbProjectFileStore(indexedDb, fixture.projectId, { now: () => 10_000 });
    const acquisition = await files.acquire("media_golden_owner", 10_000, 60_000);
    expect(acquisition.status).toBe("acquired");
    if (acquisition.status !== "acquired") throw new Error("Media Golden writer lease was not acquired");
    files.activateWriterLease(acquisition.lease);
    const assets = new IndexedDbAssetRepository(indexedDb, fixture.projectId, { now: () => 10_000 });
    assets.activateWriterLease(acquisition.lease);

    await saveProjectWithBackups(files, createProjectSnapshot(session, 1), {
      transactionId: "tx_media_golden_1",
      expectedStorageRevision: 0,
      backupPolicy: { retention: 2 },
      nowMs: 10_000
    });

    let expectedIndexRevision = 0;
    for (const asset of fixture.assets) {
      const bytes = decodeBase64(asset.base64);
      expect(bytes.byteLength).toBe(asset.byteLength);
      expect(createBlobDigest(bytes)).toBe(`sha256:${asset.sha256}`);
      const inspected = await inspectAssetBytes(bytes, asset.mimeType, asset.kind);
      expect(inspected.report).toMatchObject({ status: "pass", detectedMimeType: asset.mimeType });
      const imported = await assets.importAsset({
        assetId: asset.assetId,
        kind: asset.kind,
        displayName: asset.displayName,
        mimeType: inspected.report.detectedMimeType,
        bytes: inspected.bytes,
        preservedFields: { inspection: mediaInspectionToJson(inspected.report) }
      }, { expectedIndexRevision, maxBytes: 4_096 });
      expectedIndexRevision = imported.index.indexRevision;
    }

    const reopenedFiles = new IndexedDbProjectFileStore(indexedDb, fixture.projectId);
    const reopenedSnapshot = await loadPersistedProject(reopenedFiles);
    expect(reopenedSnapshot).not.toBeNull();
    const reopenedSession = restoreStudioSession(reopenedSnapshot!, session.project);
    const reopenedAssets = new IndexedDbAssetRepository(indexedDb, fixture.projectId);
    const reopenedIndex = await reopenedAssets.loadIndex();
    await expect(reopenedAssets.audit()).resolves.toMatchObject({ status: "pass", assetCount: 3, uniqueBlobCount: 3 });

    const scene = reopenedSession.project.scenes.find((candidate) => candidate.id === reopenedSession.project.entrySceneId);
    if (scene === undefined) throw new Error("Media Golden entry scene is missing after reopen");
    const plan = derivePreviewStagePlan(scene.statements, scene.statements.length - 1);
    expect(plan.diagnostics).toHaveLength(fixture.expectedStage.diagnosticCount);
    expect(plan.background?.assetId).toBe(fixture.expectedStage.backgroundAssetId);
    expect(plan.characters.map((layer) => layer.assetId)).toEqual(fixture.expectedStage.characterAssetIds);
    expect(plan.audio.map((layer) => layer.assetId)).toEqual(fixture.expectedStage.audioAssetIds);

    const revoked: string[] = [];
    let serial = 0;
    const urls = {
      create: (bytes: Uint8Array, mimeType: string) => `golden:${++serial}:${mimeType}:${bytes.byteLength}`,
      revoke: (url: string) => revoked.push(url)
    };
    const media = await loadPreviewMedia(plan, reopenedIndex, reopenedAssets, urls, new AbortController().signal);
    expect(media.errors).toEqual([]);
    expect(media.background?.url).toContain("image/png");
    expect(media.characters.map((layer) => layer.url)).toEqual([expect.stringContaining("image/png")]);
    expect(media.audio.map((layer) => layer.url)).toEqual([expect.stringContaining("audio/wav")]);
    expect(media.objectUrls).toHaveLength(3);
    releasePreviewMedia(media, urls);
    expect(revoked).toEqual(media.objectUrls);
  });
});
