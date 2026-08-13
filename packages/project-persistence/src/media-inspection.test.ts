import { describe, expect, it } from "vitest";
import {
  DEFAULT_MEDIA_INSPECTION_POLICY,
  inspectUntrustedMedia
} from "./media-inspection";

function setU16be(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >>> 8) & 0xff;
  bytes[offset + 1] = value & 0xff;
}

function setU16le(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
}

function setU32be(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

function setU32le(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}

function setU64be(bytes: Uint8Array, offset: number, value: bigint): void {
  setU32be(bytes, offset, Number((value >> 32n) & 0xffffffffn));
  setU32be(bytes, offset + 4, Number(value & 0xffffffffn));
}

function setU64le(bytes: Uint8Array, offset: number, value: bigint): void {
  setU32le(bytes, offset, Number(value & 0xffffffffn));
  setU32le(bytes, offset + 4, Number((value >> 32n) & 0xffffffffn));
}

function text(bytes: Uint8Array, offset: number, value: string): void {
  bytes.set([...value].map((character) => character.charCodeAt(0)), offset);
}

function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  setU32be(bytes, 8, 13);
  text(bytes, 12, "IHDR");
  setU32be(bytes, 16, width);
  setU32be(bytes, 20, height);
  bytes[24] = 8;
  bytes[25] = 6;
  return bytes;
}

function wav(dataBytes: number, byteRate = 8_000): Uint8Array {
  const bytes = new Uint8Array(44 + dataBytes);
  text(bytes, 0, "RIFF");
  setU32le(bytes, 4, bytes.byteLength - 8);
  text(bytes, 8, "WAVEfmt ");
  setU32le(bytes, 16, 16);
  setU16le(bytes, 20, 1);
  setU16le(bytes, 22, 1);
  setU32le(bytes, 24, 8_000);
  setU32le(bytes, 28, byteRate);
  setU16le(bytes, 32, 1);
  setU16le(bytes, 34, 8);
  text(bytes, 36, "data");
  setU32le(bytes, 40, dataBytes);
  return bytes;
}

function mp4(duration: number, timescale: number): Uint8Array {
  const bytes = new Uint8Array(52);
  setU32be(bytes, 0, 16);
  text(bytes, 4, "ftypisom");
  setU32be(bytes, 16, 36);
  text(bytes, 20, "moov");
  setU32be(bytes, 24, 28);
  text(bytes, 28, "mvhd");
  setU32be(bytes, 44, timescale);
  setU32be(bytes, 48, duration);
  return bytes;
}

function oggPage(payload: Uint8Array, granule: bigint, headerType: number): Uint8Array {
  const page = new Uint8Array(28 + payload.byteLength);
  text(page, 0, "OggS");
  page[5] = headerType;
  setU64le(page, 6, granule);
  page[26] = 1;
  page[27] = payload.byteLength;
  page.set(payload, 28);
  return page;
}

function flac(): Uint8Array {
  const bytes = new Uint8Array(44);
  text(bytes, 0, "fLaC");
  bytes[4] = 0x80;
  bytes[7] = 34;
  const packed = (48_000n << 44n) | (1n << 41n) | (15n << 36n) | 96_000n;
  setU64be(bytes, 18, packed);
  bytes[42] = 0xff;
  bytes[43] = 0xf8;
  return bytes;
}

function mp3Frames(count: number): Uint8Array {
  const frameLength = 417;
  const bytes = new Uint8Array(frameLength * count);
  for (let frame = 0; frame < count; frame++) bytes.set([0xff, 0xfb, 0x90, 0], frame * frameLength);
  return bytes;
}

describe("untrusted media inspection gate", () => {
  it("sniffs PNG dimensions instead of trusting the browser MIME", () => {
    const report = inspectUntrustedMedia(png(1920, 1080), "image/png", "cg");
    expect(report).toMatchObject({
      status: "pass",
      detectedMimeType: "image/png",
      format: "PNG",
      width: 1920,
      height: 1080,
      pixelCount: 2_073_600,
      isolation: "none"
    });
  });

  it("rejects MIME confusion and incompatible editor kinds", () => {
    expect(() => inspectUntrustedMedia(png(16, 16), "image/jpeg", "cg")).toThrowError(expect.objectContaining({ code: "MIME_MISMATCH" }));
    expect(() => inspectUntrustedMedia(png(16, 16), "image/png", "audio")).toThrowError(expect.objectContaining({ code: "MIME_MISMATCH" }));
  });

  it("rejects image decode bombs before publication", () => {
    expect(() => inspectUntrustedMedia(png(16_384, 16_384), "image/png", "background")).toThrowError(
      expect.objectContaining({ code: "RESOURCE_LIMIT" })
    );
  });

  it("quarantines passive SVG and rejects active content or external references", () => {
    const safe = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720"><path d="M0 0"/></svg>');
    expect(inspectUntrustedMedia(safe, "image/svg+xml", "ui")).toMatchObject({
      format: "SVG",
      width: 1280,
      height: 720,
      isolation: "svg-quarantine",
      svgElementCount: 2
    });
    const script = new TextEncoder().encode('<svg viewBox="0 0 10 10"><script>alert(1)</script></svg>');
    expect(() => inspectUntrustedMedia(script, "image/svg+xml", "ui")).toThrowError(expect.objectContaining({ code: "UNSAFE_MEDIA" }));
    const external = new TextEncoder().encode('<svg viewBox="0 0 10 10"><image href="https://example.test/a.png"/></svg>');
    expect(() => inspectUntrustedMedia(external, "image/svg+xml", "ui")).toThrowError(expect.objectContaining({ code: "UNSAFE_MEDIA" }));
  });

  it("extracts bounded WAV and MP4 duration metadata", () => {
    expect(inspectUntrustedMedia(wav(16_000), "audio/x-wav", "audio")).toMatchObject({
      format: "WAV",
      durationSeconds: 2,
      sampleRate: 8_000,
      channels: 1
    });
    expect(inspectUntrustedMedia(mp4(90_000, 1_000), "video/mp4", "video")).toMatchObject({
      format: "MP4",
      durationSeconds: 90
    });
  });

  it("recognizes the remaining frozen image and audio formats by structure", () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0, 11, 8, 4, 56, 7, 128, 1, 1, 0x11, 0, 0xff, 0xd9]);
    expect(inspectUntrustedMedia(jpeg, "image/jpeg", "character")).toMatchObject({ format: "JPEG", width: 1920, height: 1080 });

    const gif = new Uint8Array(13);
    text(gif, 0, "GIF89a");
    setU16le(gif, 6, 640);
    setU16le(gif, 8, 360);
    expect(inspectUntrustedMedia(gif, "image/gif", "cg")).toMatchObject({ format: "GIF", width: 640, height: 360 });

    const webp = new Uint8Array(30);
    text(webp, 0, "RIFF");
    setU32le(webp, 4, 22);
    text(webp, 8, "WEBPVP8X");
    setU32le(webp, 16, 10);
    webp[24] = 255;
    webp[27] = 127;
    expect(inspectUntrustedMedia(webp, "image/webp", "background")).toMatchObject({ format: "WebP", width: 256, height: 128 });

    expect(inspectUntrustedMedia(flac(), "audio/flac", "audio")).toMatchObject({ format: "FLAC", durationSeconds: 2, sampleRate: 48_000, channels: 2 });
    const opusHead = new Uint8Array(19);
    text(opusHead, 0, "OpusHead");
    opusHead[8] = 1;
    opusHead[9] = 2;
    const ogg = new Uint8Array(oggPage(opusHead, 0n, 2).byteLength + 29);
    const firstPage = oggPage(opusHead, 0n, 2);
    ogg.set(firstPage);
    ogg.set(oggPage(new Uint8Array([0]), 96_000n, 4), firstPage.byteLength);
    expect(inspectUntrustedMedia(ogg, "audio/ogg", "audio")).toMatchObject({ format: "Ogg Opus", durationSeconds: 2, sampleRate: 48_000, channels: 2 });
    expect(inspectUntrustedMedia(mp3Frames(2), "audio/mpeg", "audio")).toMatchObject({ format: "MP3", sampleRate: 44_100, channels: 2 });
  });

  it("enforces duration and bounded font-table policies", () => {
    const strict = { ...DEFAULT_MEDIA_INSPECTION_POLICY, maxAudioDurationSeconds: 1 };
    expect(() => inspectUntrustedMedia(wav(16_000), "audio/wav", "audio", strict)).toThrowError(expect.objectContaining({ code: "RESOURCE_LIMIT" }));

    const font = new Uint8Array(28);
    font.set([0, 1, 0, 0]);
    setU16be(font, 4, 1);
    text(font, 12, "head");
    setU32be(font, 20, 28);
    setU32be(font, 24, 1);
    expect(() => inspectUntrustedMedia(font, "font/ttf", "font")).toThrowError(expect.objectContaining({ code: "UNSAFE_MEDIA" }));
  });

  it("accepts bounded SFNT, WOFF and WOFF2 directories", () => {
    const sfnt = new Uint8Array(29);
    sfnt.set([0, 1, 0, 0]);
    setU16be(sfnt, 4, 1);
    text(sfnt, 12, "head");
    setU32be(sfnt, 20, 28);
    setU32be(sfnt, 24, 1);
    expect(inspectUntrustedMedia(sfnt, "application/font-sfnt", "font")).toMatchObject({ format: "TrueType", fontTableCount: 1 });

    const otf = sfnt.slice();
    text(otf, 0, "OTTO");
    expect(inspectUntrustedMedia(otf, "font/otf", "font")).toMatchObject({ format: "OpenType", fontTableCount: 1 });

    const woff = new Uint8Array(65);
    text(woff, 0, "wOFF");
    setU32be(woff, 8, woff.byteLength);
    setU16be(woff, 12, 1);
    text(woff, 44, "head");
    setU32be(woff, 48, 64);
    setU32be(woff, 52, 1);
    setU32be(woff, 56, 1);
    expect(inspectUntrustedMedia(woff, "font/woff", "font")).toMatchObject({ format: "wOFF", fontTableCount: 1 });

    const woff2 = new Uint8Array(50);
    text(woff2, 0, "wOF2");
    setU32be(woff2, 8, woff2.byteLength);
    setU16be(woff2, 12, 1);
    setU32be(woff2, 16, 29);
    setU32be(woff2, 20, 1);
    expect(inspectUntrustedMedia(woff2, "font/woff2", "font")).toMatchObject({ format: "wOF2", fontTableCount: 1 });
  });

  it("fails closed for empty, truncated and unknown content", () => {
    expect(() => inspectUntrustedMedia(new Uint8Array(), "image/png", "cg")).toThrowError(expect.objectContaining({ code: "UNSAFE_MEDIA" }));
    expect(() => inspectUntrustedMedia(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), "image/png", "cg")).toThrowError(expect.objectContaining({ code: "UNSAFE_MEDIA" }));
    expect(() => inspectUntrustedMedia(new TextEncoder().encode("not-media"), "application/octet-stream", "other")).toThrowError(
      expect.objectContaining({ code: "UNSUPPORTED_MEDIA_TYPE" })
    );
  });

  it("rejects invalid policy values instead of silently disabling a budget", () => {
    expect(() => inspectUntrustedMedia(png(16, 16), "image/png", "cg", {
      ...DEFAULT_MEDIA_INSPECTION_POLICY,
      maxImagePixels: Number.POSITIVE_INFINITY
    })).toThrowError(expect.objectContaining({ code: "RESOURCE_LIMIT", subject: "inspection-policy" }));
  });
});
