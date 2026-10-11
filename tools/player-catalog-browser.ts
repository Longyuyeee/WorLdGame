import { IndexedDbWorldPlayerSaveStoreV3, createWorldPlayerSaveSlotV3, worldPlayerSavePreviewSha256V1 } from "../apps/player-shell/src/player-save-store";
import { createPlayerCoreSessionSaveV1 } from "../packages/player-core/src/player-core";
import { prepare } from "./player-session-budget";
const projectId = "session_budget";
export async function populate() {
  const state = prepare(480), saved = createPlayerCoreSessionSaveV1(state);
  if (!saved.ok) throw Error(JSON.stringify(saved.diagnostics));
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 32;
  canvas.getContext("2d")!.fillRect(0, 0, 32, 32);
  const blob = await new Promise<Blob>(resolve => canvas.toBlob(blob => resolve(blob!), "image/png"));
  const digest = await worldPlayerSavePreviewSha256V1(blob), store = new IndexedDbWorldPlayerSaveStoreV3();
  const specs = [...Array.from({ length: 12 }, (_, i) => ({ kind: "manual" as const, slotId: `manual-${i + 1}` })),
    ...Array.from({ length: 5 }, (_, i) => ({ kind: "auto" as const, slotId: `auto-${i + 1}` })), { kind: "quick" as const, slotId: "quick-1" }];
  for (const spec of specs) await store.write(createWorldPlayerSaveSlotV3({ ...spec, projectId, buildId: state.runtimeState!.buildId,
    savedAtEpochMilliseconds: 1, title: state.title, sceneId: state.runtimeState!.cursor.sceneId, sceneTitle: "Long story",
    presentationKind: "narration", runtimeStateHash: state.historySession!.checkpoints[480]!.stateHash, sessionArtifactHash: saved.artifactHash,
    serializedSessionSave: saved.serialized, chapterId: null, chapterTitle: null, checkpointStepId: null, route: null, customMetadata: {},
    preview: { status: "available", mimeType: "image/png", width: 32, height: 32, byteLength: blob.size, sha256: digest }
  }), blob);
  return { slots: specs.length, history: 480, bytesPerSave: new TextEncoder().encode(saved.serialized).length, artifactHash: saved.artifactHash,
    stateHash: state.historySession!.checkpoints[480]!.stateHash };
}
export async function sample() {
  const store = new IndexedDbWorldPlayerSaveStoreV3(), started = performance.now();
  const slots = store.listSummaries ? await store.listSummaries(projectId) : await store.list(projectId);
  const listMilliseconds = performance.now() - started;
  const previewStarted = performance.now();
  for (const slot of slots) if (await store.readPreview(projectId, slot.slotId) === null) throw Error("Missing preview");
  return { listMilliseconds, previewMilliseconds: performance.now() - previewStarted,
    headers: slots.map(slot => { const { serializedSessionSave: _body, ...header } = slot as typeof slot & { serializedSessionSave?: string }; return header; }),
    retainedPayloadCharacters: slots.reduce((sum, slot) => sum + ((slot as { serializedSessionSave?: string }).serializedSessionSave?.length ?? 0), 0) };
}
