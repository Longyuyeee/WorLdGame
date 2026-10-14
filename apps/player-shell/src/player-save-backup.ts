import { createPlayerCoreSnapshotV1, loadPlayerCoreSessionSaveV1, type PlayerCoreState } from "@world-studio/player-core";
import { canonicalRuntimeStringify } from "@world-studio/runtime";
import { DEFAULT_MEDIA_INSPECTION_POLICY, inspectUntrustedMedia } from "@world-studio/project-persistence";
import { createWorldPlayerSaveSlotV3, readWorldPlayerSaveSlotV3, worldPlayerSavePreviewSha256V1, type WorldPlayerSaveSlotV3 } from "./player-save-store";

export const PLAYER_SAVE_BACKUP_MAX_BYTES = 96 * 1024 * 1024;
const encoder = new TextEncoder();
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const keys = (value: Record<string, unknown>, names: string[]) => Object.keys(value).sort().join(",") === names.sort().join(",");
export interface PlayerSaveBackup { readonly slot: WorldPlayerSaveSlotV3; readonly preview?: Blob; readonly origin: "current" | "slot"; readonly compatibility: "current" | "verified-previous"; }

async function digest(value: unknown, subtle: SubtleCrypto): Promise<string> {
  const result = await subtle.digest("SHA-256", encoder.encode(canonicalRuntimeStringify(value)));
  return Array.from(new Uint8Array(result), byte => byte.toString(16).padStart(2, "0")).join("");
}
async function verifyPreview(slot: WorldPlayerSaveSlotV3, bytes: Uint8Array<ArrayBuffer> | null, subtle: SubtleCrypto): Promise<Blob | undefined> {
  if (slot.preview.status === "unavailable") { if (bytes !== null) throw Error("备份截图与存档不一致。"); return undefined; }
  if (bytes === null || bytes.length !== slot.preview.byteLength) throw Error("备份截图缺失或长度不符。");
  let inspection;
  try { inspection = inspectUntrustedMedia(bytes, slot.preview.mimeType, "background", { ...DEFAULT_MEDIA_INSPECTION_POLICY,
    maxImageWidth: 512, maxImageHeight: 512, maxImagePixels: 512 * 512 }); }
  catch { throw Error("备份截图无效或尺寸超过限制。"); }
  if (inspection.width !== slot.preview.width || inspection.height !== slot.preview.height) throw Error("备份截图尺寸与存档不一致。");
  const blob = new Blob([bytes], { type: slot.preview.mimeType });
  if (await worldPlayerSavePreviewSha256V1(blob, subtle) !== slot.preview.sha256) throw Error("备份截图校验失败。");
  return blob;
}

export async function createPlayerSaveBackup(slot: WorldPlayerSaveSlotV3, preview?: Blob, origin: "current" | "slot" = "slot", subtle: SubtleCrypto = crypto.subtle): Promise<Uint8Array<ArrayBuffer>> {
  readWorldPlayerSaveSlotV3(slot);
  const imageBytes = preview === undefined ? null : new Uint8Array(await preview.arrayBuffer());
  await verifyPreview(slot, imageBytes, subtle);
  let previewBase64: string | null = null;
  if (imageBytes !== null) { let binary = ""; for (let offset = 0; offset < imageBytes.length; offset += 8192) binary += String.fromCharCode(...imageBytes.subarray(offset, offset + 8192)); previewBase64 = btoa(binary); }
  const payload = { slot, previewBase64, origin };
  const bytes = encoder.encode(JSON.stringify({ schemaVersion: 1, format: "world.player-save-backup", payload, sha256: await digest(payload, subtle) }));
  if (bytes.length > PLAYER_SAVE_BACKUP_MAX_BYTES) throw Error("这份进度超过 96 MiB 备份上限，请使用较早的存档。");
  return bytes;
}

export async function readPlayerSaveBackup(bytes: Uint8Array<ArrayBuffer>, state: PlayerCoreState, subtle: SubtleCrypto = crypto.subtle): Promise<PlayerSaveBackup> {
  if (bytes.length > PLAYER_SAVE_BACKUP_MAX_BYTES) throw Error("备份文件超过 96 MiB 上限。");
  let value: unknown;
  try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw Error("无法读取备份文件，请选择从本游戏导出的 .worldsave 文件。"); }
  if (!record(value) || !keys(value, ["schemaVersion", "format", "payload", "sha256"]) || value.schemaVersion !== 1 || value.format !== "world.player-save-backup" ||
      typeof value.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(value.sha256) || !record(value.payload) || !keys(value.payload, ["slot", "previewBase64", "origin"]) ||
      (value.payload.origin !== "current" && value.payload.origin !== "slot")) throw Error("备份格式或版本不受支持。");
  if (await digest(value.payload, subtle) !== value.sha256) throw Error("备份文件校验失败，原存档保持不变。");
  let slot: WorldPlayerSaveSlotV3;
  try { slot = readWorldPlayerSaveSlotV3(value.payload.slot); } catch { throw Error("备份存档字段损坏或不受支持。"); }
  if (slot.projectId !== state.projectId) throw Error("这份备份属于其他作品，请在对应游戏中导入。");
  const loaded = loadPlayerCoreSessionSaveV1(state, slot.serializedSessionSave);
  if (!loaded.ok) throw Error(loaded.diagnostics[0]?.code === "RUNTIME_SAVE_BUILD_MISMATCH"
    ? "这份备份来自未核对的游戏版本，请使用对应版本，或由作者核对兼容后再导入。" : "备份中的完整进度校验失败，当前故事和原存档保持不变。");
  const snapshot = createPlayerCoreSnapshotV1(loaded.state);
  if (loaded.artifactHash !== slot.sessionArtifactHash || loaded.savedBuildId !== slot.buildId || loaded.savedRuntimeStateHash !== slot.runtimeStateHash ||
      loaded.savedSceneId !== slot.sceneId || snapshot.presentation.kind !== slot.presentationKind || snapshot.title !== slot.title) throw Error("备份信息与完整进度不一致，原存档保持不变。");
  let imageBytes: Uint8Array<ArrayBuffer> | null = null;
  const base64 = value.payload.previewBase64;
  if (base64 !== null) {
    if (typeof base64 !== "string" || base64.length > Math.ceil(512 * 1024 / 3) * 4) throw Error("备份截图超过限制或格式错误。");
    try { const binary = atob(base64); if (btoa(binary) !== base64) throw Error("base64"); imageBytes = Uint8Array.from(binary, character => character.charCodeAt(0)); }
    catch { throw Error("备份截图编码损坏。"); }
  }
  const preview = await verifyPreview(slot, imageBytes, subtle);
  return { slot, ...(preview === undefined ? {} : { preview }), origin: value.payload.origin, compatibility: loaded.compatibility };
}

export function playerBackupToManualSlot(backup: PlayerSaveBackup, slotId: string): WorldPlayerSaveSlotV3 {
  if (!/^manual-(?:[1-9]|1[0-2])$/u.test(slotId)) throw Error("请选择有效的手动槽位。");
  return createWorldPlayerSaveSlotV3({ ...backup.slot, slotId, kind: "manual", checkpointStepId: null });
}
