import { AssetBlobError, type AssetKind } from "./asset-blob";

export type InspectedMediaClass = "image" | "audio" | "video" | "font";

export interface MediaInspectionPolicy {
  readonly maxImageWidth: number;
  readonly maxImageHeight: number;
  readonly maxImagePixels: number;
  readonly maxAudioDurationSeconds: number;
  readonly maxVideoDurationSeconds: number;
  readonly maxSvgBytes: number;
  readonly maxSvgElements: number;
  readonly maxFontTables: number;
}

export interface MediaInspectionReport {
  readonly schemaVersion: 1;
  readonly status: "pass";
  readonly detectedMimeType: string;
  readonly mediaClass: InspectedMediaClass;
  readonly format: string;
  readonly byteLength: number;
  readonly isolation: "none" | "svg-quarantine";
  readonly width?: number;
  readonly height?: number;
  readonly pixelCount?: number;
  readonly durationSeconds?: number;
  readonly sampleRate?: number;
  readonly channels?: number;
  readonly fontTableCount?: number;
  readonly svgElementCount?: number;
}

export const DEFAULT_MEDIA_INSPECTION_POLICY: MediaInspectionPolicy = {
  maxImageWidth: 16_384,
  maxImageHeight: 16_384,
  maxImagePixels: 67_108_864,
  maxAudioDurationSeconds: 4 * 60 * 60,
  maxVideoDurationSeconds: 8 * 60 * 60,
  maxSvgBytes: 4 * 1024 * 1024,
  maxSvgElements: 100_000,
  maxFontTables: 128
};

interface Detection {
  readonly mime: string;
  readonly mediaClass: InspectedMediaClass;
  readonly format: string;
  readonly isolation?: "svg-quarantine";
  readonly width?: number;
  readonly height?: number;
  readonly durationSeconds?: number;
  readonly sampleRate?: number;
  readonly channels?: number;
  readonly fontTableCount?: number;
  readonly elementCount?: number;
}

function reject(code: "UNSAFE_MEDIA" | "UNSUPPORTED_MEDIA_TYPE" | "MIME_MISMATCH" | "RESOURCE_LIMIT", subject: string, detail: string): never {
  throw new AssetBlobError(code, "index", subject, detail);
}

function validatePolicy(policy: MediaInspectionPolicy): void {
  for (const [name, value] of Object.entries(policy)) {
    if (!Number.isSafeInteger(value) || value <= 0) reject("RESOURCE_LIMIT", "inspection-policy", `${name} must be a positive safe integer`);
  }
}

function hasBytes(bytes: Uint8Array, offset: number, expected: readonly number[]): boolean {
  return expected.every((value, index) => bytes[offset + index] === value);
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  if (offset < 0 || length < 0 || offset + length > bytes.byteLength) return "";
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function u16be(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}

function u16le(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

function u24le(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8) | ((bytes[offset + 2] ?? 0) << 16);
}

function u24be(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) << 16) | ((bytes[offset + 1] ?? 0) << 8) | (bytes[offset + 2] ?? 0);
}

function u32be(bytes: Uint8Array, offset: number): number {
  return (((bytes[offset] ?? 0) * 0x1000000) +
    ((bytes[offset + 1] ?? 0) << 16) + ((bytes[offset + 2] ?? 0) << 8) + (bytes[offset + 3] ?? 0)) >>> 0;
}

function u32le(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) + ((bytes[offset + 1] ?? 0) << 8) +
    ((bytes[offset + 2] ?? 0) << 16) + ((bytes[offset + 3] ?? 0) * 0x1000000)) >>> 0;
}

function u64be(bytes: Uint8Array, offset: number): bigint {
  return (BigInt(u32be(bytes, offset)) << 32n) | BigInt(u32be(bytes, offset + 4));
}

function u64le(bytes: Uint8Array, offset: number): bigint {
  return BigInt(u32le(bytes, offset)) | (BigInt(u32le(bytes, offset + 4)) << 32n);
}

function image(mime: string, format: string, width: number, height: number, isolation?: "svg-quarantine"): Detection {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    reject("UNSAFE_MEDIA", format, `${format} has invalid canvas dimensions`);
  }
  return { mime, mediaClass: "image", format, width, height, ...(isolation === undefined ? {} : { isolation }) };
}

function inspectPng(bytes: Uint8Array): Detection | null {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!hasBytes(bytes, 0, signature)) return null;
  if (bytes.byteLength < 33 || u32be(bytes, 8) !== 13 || ascii(bytes, 12, 4) !== "IHDR") {
    reject("UNSAFE_MEDIA", "PNG", "PNG is missing a complete leading IHDR chunk");
  }
  return image("image/png", "PNG", u32be(bytes, 16), u32be(bytes, 20));
}

function inspectJpeg(bytes: Uint8Array): Detection | null {
  if (!hasBytes(bytes, 0, [0xff, 0xd8, 0xff])) return null;
  const sofMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  for (let scans = 0; scans < 4096 && offset < bytes.byteLength; scans++) {
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === undefined || marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.byteLength) reject("UNSAFE_MEDIA", "JPEG", "JPEG marker length is truncated");
    const length = u16be(bytes, offset);
    if (length < 2 || offset + length > bytes.byteLength) reject("UNSAFE_MEDIA", "JPEG", "JPEG marker exceeds file bounds");
    if (sofMarkers.has(marker)) {
      if (length < 8) reject("UNSAFE_MEDIA", "JPEG", "JPEG frame header is truncated");
      return image("image/jpeg", "JPEG", u16be(bytes, offset + 5), u16be(bytes, offset + 3));
    }
    offset += length;
  }
  reject("UNSAFE_MEDIA", "JPEG", "JPEG has no bounded frame header before image data");
}

function inspectGif(bytes: Uint8Array): Detection | null {
  const header = ascii(bytes, 0, 6);
  if (header !== "GIF87a" && header !== "GIF89a") return null;
  if (bytes.byteLength < 13) reject("UNSAFE_MEDIA", "GIF", "GIF logical screen descriptor is truncated");
  return image("image/gif", "GIF", u16le(bytes, 6), u16le(bytes, 8));
}

function inspectWebp(bytes: Uint8Array): Detection | null {
  if (ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP") return null;
  if (bytes.byteLength < 20 || u32le(bytes, 4) + 8 !== bytes.byteLength) {
    reject("UNSAFE_MEDIA", "WebP", "WebP RIFF length does not match the file");
  }
  const chunk = ascii(bytes, 12, 4);
  const payload = 20;
  if (chunk === "VP8X" && bytes.byteLength >= 30) {
    return image("image/webp", "WebP", 1 + u24le(bytes, payload + 4), 1 + u24le(bytes, payload + 7));
  }
  if (chunk === "VP8L" && bytes.byteLength >= 25 && bytes[payload] === 0x2f) {
    const bits = u32le(bytes, payload + 1);
    return image("image/webp", "WebP", 1 + (bits & 0x3fff), 1 + ((bits >>> 14) & 0x3fff));
  }
  if (chunk === "VP8 " && bytes.byteLength >= 30 && hasBytes(bytes, payload + 3, [0x9d, 0x01, 0x2a])) {
    return image("image/webp", "WebP", u16le(bytes, payload + 6) & 0x3fff, u16le(bytes, payload + 8) & 0x3fff);
  }
  reject("UNSAFE_MEDIA", "WebP", "WebP has no supported bounded image header");
}

function svgDimension(source: string, attribute: string): number | null {
  const match = new RegExp(`\\b${attribute}\\s*=\\s*["']\\s*([0-9]+(?:\\.[0-9]+)?)\\s*(?:px)?\\s*["']`, "i").exec(source);
  return match?.[1] === undefined ? null : Number(match[1]);
}

function inspectSvg(bytes: Uint8Array): Detection | null {
  if (bytes.byteLength === 0) return null;
  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "").trimStart();
  } catch {
    return null;
  }
  const opening = source.slice(0, 1024).toLowerCase();
  if (!opening.startsWith("<svg") && !(opening.startsWith("<?xml") && opening.includes("<svg"))) return null;
  if (!/<svg\b/i.test(source) || !/<\/svg\s*>\s*$/i.test(source)) {
    reject("UNSAFE_MEDIA", "SVG", "SVG root is incomplete or not closed");
  }
  const unsafe = /<!doctype|<!entity|<script\b|<foreignobject\b|<iframe\b|<object\b|<embed\b|\son[a-z]+\s*=|javascript\s*:|data\s*:\s*text\/html|(?:href|xlink:href)\s*=\s*["']\s*(?:https?:|\/\/)|url\s*\(\s*["']?\s*(?:https?:|\/\/)/i;
  if (unsafe.test(source)) reject("UNSAFE_MEDIA", "SVG", "SVG contains active content or an external reference");
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(source) || /<style\b|\sstyle\s*=/i.test(source)) {
    reject("UNSAFE_MEDIA", "SVG", "SVG contains control characters or embedded CSS outside the quarantine policy");
  }
  for (const link of source.matchAll(/(?:href|xlink:href)\s*=\s*["']\s*([^"']*)["']/gi)) {
    if (!(link[1] ?? "").startsWith("#")) reject("UNSAFE_MEDIA", "SVG", "SVG links must be local fragment references");
  }
  const elements = source.match(/<[a-z][a-z0-9:.-]*(?:\s|\/?>)/gi)?.length ?? 0;
  const viewBox = /\bviewBox\s*=\s*["']\s*[-+0-9.eE]+[ ,]+[-+0-9.eE]+[ ,]+([-+0-9.eE]+)[ ,]+([-+0-9.eE]+)\s*["']/i.exec(source);
  const width = svgDimension(source, "width") ?? (viewBox?.[1] === undefined ? null : Number(viewBox[1]));
  const height = svgDimension(source, "height") ?? (viewBox?.[2] === undefined ? null : Number(viewBox[2]));
  if (width === null || height === null || !Number.isFinite(width) || !Number.isFinite(height)) {
    reject("UNSAFE_MEDIA", "SVG", "SVG requires finite pixel dimensions or a finite viewBox");
  }
  return { ...image("image/svg+xml", "SVG", Math.ceil(width), Math.ceil(height), "svg-quarantine"), elementCount: elements };
}

function inspectWav(bytes: Uint8Array): Detection | null {
  if (ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WAVE") return null;
  if (bytes.byteLength < 12 || u32le(bytes, 4) + 8 !== bytes.byteLength) reject("UNSAFE_MEDIA", "WAV", "WAV RIFF length does not match the file");
  let offset = 12;
  let byteRate = 0;
  let channels = 0;
  let sampleRate = 0;
  let dataBytes = 0;
  for (let chunks = 0; chunks < 65_536 && offset + 8 <= bytes.byteLength; chunks++) {
    const type = ascii(bytes, offset, 4);
    const length = u32le(bytes, offset + 4);
    const payload = offset + 8;
    if (payload + length > bytes.byteLength) reject("UNSAFE_MEDIA", "WAV", "WAV chunk exceeds file bounds");
    if (type === "fmt ") {
      if (length < 16) reject("UNSAFE_MEDIA", "WAV", "WAV fmt chunk is truncated");
      channels = u16le(bytes, payload + 2);
      sampleRate = u32le(bytes, payload + 4);
      byteRate = u32le(bytes, payload + 8);
    } else if (type === "data") dataBytes += length;
    offset = payload + length + (length & 1);
  }
  if (offset !== bytes.byteLength) reject("UNSAFE_MEDIA", "WAV", "WAV has truncated or trailing chunk bytes");
  if (byteRate <= 0 || channels <= 0 || channels > 8 || sampleRate <= 0 || sampleRate > 384_000 || dataBytes <= 0) {
    reject("UNSAFE_MEDIA", "WAV", "WAV metadata is missing or outside supported channel/sample-rate bounds");
  }
  return { mime: "audio/wav", mediaClass: "audio", format: "WAV", durationSeconds: dataBytes / byteRate, sampleRate, channels };
}

function inspectFlac(bytes: Uint8Array): Detection | null {
  if (ascii(bytes, 0, 4) !== "fLaC") return null;
  if (bytes.byteLength < 44 || (bytes[4] ?? 0) % 128 !== 0 || u24be(bytes, 5) !== 34) {
    reject("UNSAFE_MEDIA", "FLAC", "FLAC must begin with a complete STREAMINFO block");
  }
  const packed = u64be(bytes, 18);
  const sampleRate = Number((packed >> 44n) & 0xfffffn);
  const channels = Number((packed >> 41n) & 0x7n) + 1;
  const totalSamples = Number(packed & 0xfffffffffn);
  if (sampleRate <= 0 || sampleRate > 384_000 || totalSamples <= 0) reject("UNSAFE_MEDIA", "FLAC", "FLAC STREAMINFO has invalid sample metadata");
  let metadataOffset = 4;
  let foundLastMetadata = false;
  for (let blocks = 0; blocks < 128; blocks++) {
    if (metadataOffset + 4 > bytes.byteLength) reject("UNSAFE_MEDIA", "FLAC", "FLAC metadata block is truncated");
    const last = ((bytes[metadataOffset] ?? 0) & 0x80) !== 0;
    const length = u24be(bytes, metadataOffset + 1);
    if (metadataOffset + 4 + length > bytes.byteLength) reject("UNSAFE_MEDIA", "FLAC", "FLAC metadata block exceeds file bounds");
    metadataOffset += 4 + length;
    if (last) { foundLastMetadata = true; break; }
  }
  if (!foundLastMetadata || metadataOffset + 2 > bytes.byteLength || bytes[metadataOffset] !== 0xff || ((bytes[metadataOffset + 1] ?? 0) & 0xfc) !== 0xf8) {
    reject("UNSAFE_MEDIA", "FLAC", "FLAC has no frame after its metadata blocks");
  }
  return { mime: "audio/flac", mediaClass: "audio", format: "FLAC", durationSeconds: totalSamples / sampleRate, sampleRate, channels };
}

function inspectOgg(bytes: Uint8Array): Detection | null {
  if (ascii(bytes, 0, 4) !== "OggS") return null;
  let offset = 0;
  let sampleRate = 0;
  let channels = 0;
  let format = "Ogg";
  let lastGranule = 0n;
  for (let pages = 0; pages < 1_000_000 && offset < bytes.byteLength; pages++) {
    if (offset + 27 > bytes.byteLength || ascii(bytes, offset, 4) !== "OggS" || bytes[offset + 4] !== 0) {
      reject("UNSAFE_MEDIA", "Ogg", "Ogg page header is malformed");
    }
    const segmentCount = bytes[offset + 26] ?? 0;
    if (offset + 27 + segmentCount > bytes.byteLength) reject("UNSAFE_MEDIA", "Ogg", "Ogg lacing table is truncated");
    let payloadLength = 0;
    for (let i = 0; i < segmentCount; i++) payloadLength += bytes[offset + 27 + i] ?? 0;
    const payload = offset + 27 + segmentCount;
    if (payload + payloadLength > bytes.byteLength) reject("UNSAFE_MEDIA", "Ogg", "Ogg page payload exceeds file bounds");
    if (offset === 0) {
      if (ascii(bytes, payload, 8) === "OpusHead") {
        format = "Ogg Opus";
        sampleRate = 48_000;
        channels = bytes[payload + 9] ?? 0;
      } else if (bytes[payload] === 1 && ascii(bytes, payload + 1, 6) === "vorbis") {
        format = "Ogg Vorbis";
        channels = bytes[payload + 11] ?? 0;
        sampleRate = u32le(bytes, payload + 12);
      } else reject("UNSUPPORTED_MEDIA_TYPE", "Ogg", "Only Ogg Opus and Ogg Vorbis are accepted");
    }
    const granule = u64le(bytes, offset + 6);
    if (granule !== 0xffffffffffffffffn) lastGranule = granule;
    offset = payload + payloadLength;
  }
  if (offset !== bytes.byteLength || sampleRate <= 0 || channels <= 0 || channels > 8 || lastGranule <= 0n) {
    reject("UNSAFE_MEDIA", "Ogg", "Ogg duration or codec metadata is incomplete");
  }
  return { mime: "audio/ogg", mediaClass: "audio", format, durationSeconds: Number(lastGranule) / sampleRate, sampleRate, channels };
}

function inspectMp3(bytes: Uint8Array): Detection | null {
  let offset = 0;
  if (ascii(bytes, 0, 3) === "ID3") {
    if (bytes.byteLength < 10 || [...bytes.subarray(6, 10)].some((value) => value >= 128)) reject("UNSAFE_MEDIA", "MP3", "MP3 ID3 size is malformed");
    offset = 10 + ((bytes[6] ?? 0) << 21) + ((bytes[7] ?? 0) << 14) + ((bytes[8] ?? 0) << 7) + (bytes[9] ?? 0);
  }
  const bitrates = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
  const sampleRates = [44_100, 48_000, 32_000];
  if (offset + 4 > bytes.byteLength || bytes[offset] !== 0xff || ((bytes[offset + 1] ?? 0) & 0xfe) !== 0xfa) {
    return offset === 0 ? null : reject("UNSAFE_MEDIA", "MP3", "MP3 has no leading supported MPEG-1 Layer III frame");
  }
  let cursor = offset;
  let frames = 0;
  let sampleRate = 0;
  let channels = 0;
  while (cursor + 4 <= bytes.byteLength) {
    if (ascii(bytes, cursor, 3) === "TAG" && bytes.byteLength - cursor === 128) { cursor = bytes.byteLength; break; }
    if (bytes[cursor] !== 0xff || ((bytes[cursor + 1] ?? 0) & 0xfe) !== 0xfa) break;
    const bitrate = bitrates[((bytes[cursor + 2] ?? 0) >>> 4) & 0xf] ?? 0;
    const currentSampleRate = sampleRates[((bytes[cursor + 2] ?? 0) >>> 2) & 0x3] ?? 0;
    if (bitrate <= 0 || currentSampleRate <= 0 || (sampleRate !== 0 && sampleRate !== currentSampleRate)) {
      reject("UNSAFE_MEDIA", "MP3", "MP3 frame has unsupported or inconsistent bitrate/sample-rate metadata");
    }
    sampleRate = currentSampleRate;
    channels = (((bytes[cursor + 3] ?? 0) >>> 6) & 0x3) === 3 ? 1 : 2;
    const padding = ((bytes[cursor + 2] ?? 0) >>> 1) & 1;
    const frameLength = Math.floor((144_000 * bitrate) / sampleRate) + padding;
    if (frameLength < 24 || cursor + frameLength > bytes.byteLength) reject("UNSAFE_MEDIA", "MP3", "MP3 frame exceeds file bounds");
    cursor += frameLength;
    frames++;
  }
  while (cursor < bytes.byteLength && bytes[cursor] === 0 && bytes.byteLength - cursor <= 4096) cursor++;
  if (frames === 0 || cursor !== bytes.byteLength || sampleRate <= 0) reject("UNSAFE_MEDIA", "MP3", "MP3 contains malformed trailing data");
  return { mime: "audio/mpeg", mediaClass: "audio", format: "MP3", durationSeconds: (frames * 1152) / sampleRate, sampleRate, channels };
}

interface Box { readonly type: string; readonly payload: number; readonly end: number }

function readBox(bytes: Uint8Array, offset: number, limit: number): Box {
  if (offset + 8 > limit) reject("UNSAFE_MEDIA", "MP4", "MP4 box header is truncated");
  let size = BigInt(u32be(bytes, offset));
  const type = ascii(bytes, offset + 4, 4);
  let header = 8;
  if (size === 1n) { size = u64be(bytes, offset + 8); header = 16; }
  else if (size === 0n) size = BigInt(limit - offset);
  if (size < BigInt(header) || size > BigInt(limit - offset)) reject("UNSAFE_MEDIA", "MP4", `MP4 ${type || "unknown"} box exceeds file bounds`);
  return { type, payload: offset + header, end: offset + Number(size) };
}

function inspectMp4(bytes: Uint8Array): Detection | null {
  if (bytes.byteLength < 12 || ascii(bytes, 4, 4) !== "ftyp") return null;
  let offset = 0;
  let durationSeconds = 0;
  let foundFtyp = false;
  for (let boxes = 0; boxes < 65_536 && offset < bytes.byteLength; boxes++) {
    const box = readBox(bytes, offset, bytes.byteLength);
    if (box.type === "ftyp") {
      foundFtyp = true;
      const brand = ascii(bytes, box.payload, 4);
      if (brand === "avif" || brand === "avis") reject("UNSUPPORTED_MEDIA_TYPE", "AVIF", "AVIF inspection is not available in S0.18");
    }
    if (box.type === "moov") {
      let childOffset = box.payload;
      for (let children = 0; children < 65_536 && childOffset < box.end; children++) {
        const child = readBox(bytes, childOffset, box.end);
        if (child.type === "mvhd") {
          const version = bytes[child.payload];
          const timescaleOffset = child.payload + (version === 1 ? 20 : 12);
          const durationOffset = child.payload + (version === 1 ? 24 : 16);
          if (durationOffset + (version === 1 ? 8 : 4) > child.end) reject("UNSAFE_MEDIA", "MP4", "MP4 mvhd metadata is truncated");
          const timescale = u32be(bytes, timescaleOffset);
          const duration = version === 1 ? Number(u64be(bytes, durationOffset)) : u32be(bytes, durationOffset);
          if (timescale <= 0 || !Number.isSafeInteger(duration)) reject("UNSAFE_MEDIA", "MP4", "MP4 mvhd timescale or duration is invalid");
          durationSeconds = duration / timescale;
        }
        childOffset = child.end;
      }
    }
    offset = box.end;
  }
  if (!foundFtyp || offset !== bytes.byteLength || durationSeconds <= 0) reject("UNSAFE_MEDIA", "MP4", "MP4 requires bounded ftyp and movie duration metadata");
  return { mime: "video/mp4", mediaClass: "video", format: "MP4", durationSeconds };
}

function inspectFont(bytes: Uint8Array, policy: MediaInspectionPolicy): Detection | null {
  const signature = ascii(bytes, 0, 4);
  if (signature === "wOFF" || signature === "wOF2") {
    const headerBytes = signature === "wOFF" ? 44 : 48;
    if (bytes.byteLength < headerBytes || u32be(bytes, 8) !== bytes.byteLength) reject("UNSAFE_MEDIA", signature, `${signature} header length does not match the file`);
    const tableCount = u16be(bytes, 12);
    if (tableCount <= 0 || tableCount > policy.maxFontTables) reject("RESOURCE_LIMIT", signature, `${signature} table count exceeds the policy`);
    if (signature === "wOFF") {
      if (headerBytes + tableCount * 20 > bytes.byteLength) reject("UNSAFE_MEDIA", signature, "WOFF table directory is truncated");
      for (let table = 0; table < tableCount; table++) {
        const entry = headerBytes + table * 20;
        const offset = u32be(bytes, entry + 4);
        const compressedLength = u32be(bytes, entry + 8);
        const originalLength = u32be(bytes, entry + 12);
        if (compressedLength <= 0 || originalLength <= 0 || compressedLength > originalLength || offset > bytes.byteLength || compressedLength > bytes.byteLength - offset) {
          reject("UNSAFE_MEDIA", signature, "WOFF table entry is outside file bounds");
        }
      }
    } else {
      const totalSfntSize = u32be(bytes, 16);
      const totalCompressedSize = u32be(bytes, 20);
      if (u16be(bytes, 14) !== 0 || totalSfntSize <= 0 || totalCompressedSize <= 0 || totalCompressedSize > bytes.byteLength - headerBytes - 1) {
        reject("UNSAFE_MEDIA", signature, "WOFF2 header or compressed payload is invalid");
      }
    }
    return { mime: signature === "wOFF" ? "font/woff" : "font/woff2", mediaClass: "font", format: signature, fontTableCount: tableCount };
  }
  const sfnt = signature === "OTTO" || hasBytes(bytes, 0, [0, 1, 0, 0]);
  if (!sfnt) return null;
  if (bytes.byteLength < 12) reject("UNSAFE_MEDIA", "SFNT", "Font offset table is truncated");
  const tableCount = u16be(bytes, 4);
  if (tableCount <= 0 || tableCount > policy.maxFontTables) reject("RESOURCE_LIMIT", "SFNT", "Font table count exceeds the policy");
  if (12 + tableCount * 16 > bytes.byteLength) reject("UNSAFE_MEDIA", "SFNT", "Font table directory is truncated");
  for (let table = 0; table < tableCount; table++) {
    const entry = 12 + table * 16;
    const offset = u32be(bytes, entry + 8);
    const length = u32be(bytes, entry + 12);
    if (offset > bytes.byteLength || length > bytes.byteLength - offset) reject("UNSAFE_MEDIA", "SFNT", "Font table points outside the file");
  }
  return { mime: signature === "OTTO" ? "font/otf" : "font/ttf", mediaClass: "font", format: signature === "OTTO" ? "OpenType" : "TrueType", fontTableCount: tableCount };
}

function canonicalDeclaredMime(mime: string): string {
  const value = mime.trim().toLowerCase().split(";", 1)[0] ?? "";
  const aliases: Readonly<Record<string, string>> = {
    "image/jpg": "image/jpeg",
    "audio/x-wav": "audio/wav",
    "audio/wave": "audio/wav",
    "audio/x-flac": "audio/flac",
    "application/font-woff": "font/woff",
    "application/font-sfnt": "font/sfnt",
    "application/x-font-ttf": "font/ttf",
    "application/x-font-opentype": "font/otf"
  };
  return aliases[value] ?? value;
}

function mimeMatches(declared: string, detected: string): boolean {
  if (declared === "" || declared === "application/octet-stream") return true;
  const canonicalDetected = canonicalDeclaredMime(detected);
  if (declared === canonicalDetected) return true;
  if (declared === "font/sfnt" && (canonicalDetected === "font/ttf" || canonicalDetected === "font/otf")) return true;
  return declared === "audio/ogg" && canonicalDetected.startsWith("audio/ogg");
}

function kindMatches(kind: AssetKind, mediaClass: InspectedMediaClass): boolean {
  if (mediaClass === "image") return kind === "background" || kind === "character" || kind === "cg" || kind === "ui";
  return kind === mediaClass;
}

export function inspectUntrustedMedia(
  bytes: Uint8Array,
  declaredMimeType: string,
  kind: AssetKind,
  policy: MediaInspectionPolicy = DEFAULT_MEDIA_INSPECTION_POLICY
): MediaInspectionReport {
  validatePolicy(policy);
  if (bytes.byteLength === 0) reject("UNSAFE_MEDIA", "empty", "Empty files cannot be imported as media");
  const detection = inspectPng(bytes) ?? inspectJpeg(bytes) ?? inspectGif(bytes) ?? inspectWebp(bytes) ??
    inspectSvg(bytes) ?? inspectWav(bytes) ?? inspectFlac(bytes) ?? inspectOgg(bytes) ?? inspectMp3(bytes) ??
    inspectMp4(bytes) ?? inspectFont(bytes, policy);
  if (detection === null) reject("UNSUPPORTED_MEDIA_TYPE", declaredMimeType || "unknown", "File signature is not supported by the S0.18 inspection gate");
  const declared = canonicalDeclaredMime(declaredMimeType);
  if (!mimeMatches(declared, detection.mime)) {
    reject("MIME_MISMATCH", detection.format, `Browser declared ${declaredMimeType || "no MIME"}, but bytes are ${detection.mime}`);
  }
  if (!kindMatches(kind, detection.mediaClass)) {
    reject("MIME_MISMATCH", detection.format, `Asset kind ${kind} is incompatible with detected ${detection.mediaClass} content`);
  }
  if (detection.format === "SVG") {
    if (bytes.byteLength > policy.maxSvgBytes) reject("RESOURCE_LIMIT", "SVG", "SVG source exceeds the quarantine byte budget");
    const elementCount = detection.elementCount ?? 0;
    if (elementCount > policy.maxSvgElements) reject("RESOURCE_LIMIT", "SVG", "SVG element count exceeds the quarantine budget");
  }
  let pixelCount: number | undefined;
  if (detection.width !== undefined && detection.height !== undefined) {
    pixelCount = detection.width * detection.height;
    if (detection.width > policy.maxImageWidth || detection.height > policy.maxImageHeight ||
        !Number.isSafeInteger(pixelCount) || pixelCount > policy.maxImagePixels) {
      reject("RESOURCE_LIMIT", detection.format, `${detection.width}×${detection.height} exceeds the image decode budget`);
    }
  }
  if (detection.durationSeconds !== undefined) {
    if (!Number.isFinite(detection.durationSeconds) || detection.durationSeconds <= 0) reject("UNSAFE_MEDIA", detection.format, "Media duration is invalid");
    const limit = detection.mediaClass === "video" ? policy.maxVideoDurationSeconds : policy.maxAudioDurationSeconds;
    if (detection.durationSeconds > limit) reject("RESOURCE_LIMIT", detection.format, `Media duration exceeds the ${limit} second policy`);
  }
  return {
    schemaVersion: 1,
    status: "pass",
    detectedMimeType: detection.mime,
    mediaClass: detection.mediaClass,
    format: detection.format,
    byteLength: bytes.byteLength,
    isolation: detection.isolation ?? "none",
    ...(detection.width === undefined ? {} : { width: detection.width }),
    ...(detection.height === undefined ? {} : { height: detection.height }),
    ...(pixelCount === undefined ? {} : { pixelCount }),
    ...(detection.durationSeconds === undefined ? {} : { durationSeconds: detection.durationSeconds }),
    ...(detection.sampleRate === undefined ? {} : { sampleRate: detection.sampleRate }),
    ...(detection.channels === undefined ? {} : { channels: detection.channels }),
    ...(detection.fontTableCount === undefined ? {} : { fontTableCount: detection.fontTableCount }),
    ...(detection.elementCount === undefined ? {} : { svgElementCount: detection.elementCount })
  };
}
