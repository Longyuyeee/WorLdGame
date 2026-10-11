// Storage representation only. Runtime canonical bytes and authority are unchanged.
const FORMAT = "world.player-packed-record";
const MAX_BYTES = 64 * 1024 * 1024;
const MIN_BYTES = 64 * 1024;
const keys = ["byteLength", "data", "encoding", "format", "metadata", "schemaVersion", "sha256"];

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function stream(bytes: Uint8Array<ArrayBuffer>): ReadableStream<Uint8Array<ArrayBuffer>> {
  let offset = 0;
  return new ReadableStream({ pull(controller) {
    if (offset === bytes.length) { controller.close(); return; }
    const end = Math.min(offset + 64 * 1024, bytes.length);
    controller.enqueue(bytes.subarray(offset, end)); offset = end;
  } });
}

async function collect(source: ReadableStream<Uint8Array>, limit: number): Promise<Uint8Array<ArrayBuffer>> {
  const reader = source.getReader(), chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > limit) throw new TypeError("WORLD_PLAYER_STORAGE_SIZE_LIMIT");
      chunks.push(next.value);
    }
  } catch (error) {
    // Cancellation releases the decoder even for a small compressed expansion bomb.
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

async function digest(bytes: Uint8Array<ArrayBuffer>, subtle: SubtleCrypto): Promise<string> {
  const hash = new Uint8Array(await subtle.digest("SHA-256", bytes));
  return Array.from(hash, byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function packPlayerStorageRecord<T extends { readonly serializedSessionSave: string }>(value: T, subtle: SubtleCrypto | undefined = globalThis.crypto?.subtle): Promise<T | object> {
  if (value.serializedSessionSave.length < MIN_BYTES / 3 || typeof CompressionStream === "undefined" || typeof DecompressionStream === "undefined" || subtle === undefined) return value;
  const bytes = new TextEncoder().encode(value.serializedSessionSave);
  if (bytes.length < MIN_BYTES) return value;
  if (bytes.length > MAX_BYTES) throw new TypeError("WORLD_PLAYER_STORAGE_SIZE_LIMIT");
  // The storage API historically accepts arbitrary strings, including lone
  // surrogates. UTF-8 replacement must not silently change that legacy payload.
  if (new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes) !== value.serializedSessionSave) return value;
  // The codec is optional for new writes, but errors from a supported codec must
  // reach the caller; silently losing an in-flight save is never a fallback.
  const data = await collect(stream(bytes).pipeThrough(new CompressionStream("gzip")), MAX_BYTES + 64 * 1024);
  if (data.length + 256 >= bytes.length) return value;
  const { serializedSessionSave: _serialized, ...metadata } = value;
  return { format: FORMAT, schemaVersion: 1, encoding: "gzip", byteLength: bytes.length, sha256: await digest(bytes, subtle), metadata, data };
}

export async function unpackPlayerStorageRecord(value: unknown, subtle: SubtleCrypto | undefined = globalThis.crypto?.subtle): Promise<unknown> {
  if (!record(value) || value.format !== FORMAT) return value;
  const metadata = readPlayerStorageMetadata(value);
  if (typeof DecompressionStream === "undefined" || subtle === undefined) throw new Error("WORLD_PLAYER_STORAGE_CODEC_UNAVAILABLE");
  const bytes = await collect(stream(new Uint8Array(value.data as Uint8Array)).pipeThrough(new DecompressionStream("gzip")), Number(value.byteLength));
  if (bytes.length !== value.byteLength || await digest(bytes, subtle) !== value.sha256) throw new TypeError("WORLD_PLAYER_STORAGE_CORRUPT");
  const serializedSessionSave = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  return { ...metadata, serializedSessionSave };
}

/** Display only: validates the envelope, NOT payload integrity or Runtime authority. */
export function readPlayerStorageMetadata(value: unknown): Record<string, unknown> {
  if (!record(value)) throw new TypeError("WORLD_PLAYER_STORAGE_CORRUPT");
  if (value.format !== FORMAT) {
    if (typeof value.serializedSessionSave !== "string" || value.serializedSessionSave.length > MAX_BYTES) throw new TypeError("WORLD_PLAYER_STORAGE_CORRUPT");
    const { serializedSessionSave: _serialized, ...metadata } = value;
    return metadata;
  }
  if (Object.keys(value).sort().join("\0") !== keys.join("\0") || value.schemaVersion !== 1 || value.encoding !== "gzip" ||
    !Number.isSafeInteger(value.byteLength) || Number(value.byteLength) < MIN_BYTES || Number(value.byteLength) > MAX_BYTES ||
    typeof value.sha256 !== "string" || !/^[0-9a-f]{64}$/u.test(value.sha256) || !record(value.metadata) ||
    Object.hasOwn(value.metadata, "serializedSessionSave") || !ArrayBuffer.isView(value.data) || Object.prototype.toString.call(value.data) !== "[object Uint8Array]" ||
    value.data.byteLength === 0 || value.data.byteLength >= Number(value.byteLength)) {
    throw new TypeError("WORLD_PLAYER_STORAGE_CORRUPT");
  }
  return value.metadata;
}

/** Preserve invocation order across asynchronous encoding, without poisoning later writes. */
export class PlayerStorageWriteQueue {
  private tail: Promise<unknown> = Promise.resolve();
  run(operation: () => Promise<void>): Promise<void> {
    const pending = this.tail.then(operation);
    this.tail = pending.catch(() => undefined);
    return pending;
  }
}
