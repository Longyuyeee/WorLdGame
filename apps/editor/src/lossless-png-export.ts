import { unzlibSync, zlibSync } from "fflate";

export interface PngExportCandidate { readonly bytes: Uint8Array; readonly reason: string; readonly verified: boolean; }
const signature = [137, 80, 78, 71, 13, 10, 26, 10];
const crcTable = Uint32Array.from({ length: 256 }, (_, i) => { let c = i; for (let bit = 0; bit < 8; bit++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc(bytes: Uint8Array): number { let c = 0xffffffff; for (const b of bytes) c = crcTable[(c ^ b) & 255]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function adler(bytes: Uint8Array): number { let a = 1, b = 0; for (const value of bytes) { a = (a + value) % 65521; b = (b + a) % 65521; } return ((b << 16) | a) >>> 0; }
function join(parts: readonly Uint8Array[]): Uint8Array { const result = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let at = 0; for (const part of parts) { result.set(part, at); at += part.length; } return result; }

/** Recompress only IDAT, retaining exact filtered bytes and all other chunks.
 * No canvas/color conversion, no pixel edits, no source mutation. */
export function optimizeLosslessPng(source: Uint8Array): PngExportCandidate {
  const original = (reason: string): PngExportCandidate => ({ bytes: source, reason, verified: false });
  if (source.length > 32 * 1024 * 1024 || !signature.every((b, i) => source[i] === b)) return original("非 PNG 或超过 32 MiB 编码预算");
  try {
    const view = new DataView(source.buffer, source.byteOffset, source.byteLength);
    const chunks: { type: string; bytes: Uint8Array; data: Uint8Array }[] = [];
    let at = 8, seenData = false, closedData = false;
    while (at < source.length) {
      if (at + 12 > source.length || chunks.length > 4096) return original("PNG 块不完整或数量超限");
      const length = view.getUint32(at), end = at + 12 + length;
      if (end > source.length) return original("PNG 块长度无效");
      const type = String.fromCharCode(...source.subarray(at + 4, at + 8));
      if (!/^[A-Za-z]{4}$/.test(type) || crc(source.subarray(at + 4, end - 4)) !== view.getUint32(end - 4)) return original("PNG 块校验失败");
      if (["acTL", "fcTL", "fdAT"].includes(type)) return original("动画 PNG 保持原始文件");
      if (type[0] === type[0]!.toUpperCase() && !["IHDR", "PLTE", "IDAT", "IEND"].includes(type)) return original("未知关键块保持原始文件");
      if (type === "IDAT") { if (closedData) return original("非连续 IDAT 保持原始文件"); seenData = true; }
      else if (seenData) closedData = true;
      chunks.push({ type, bytes: source.subarray(at, end), data: source.subarray(at + 8, end - 4) }); at = end;
    }
    if (chunks[0]?.type !== "IHDR" || chunks[0].data.length !== 13 || chunks.filter(c => c.type === "IHDR").length !== 1 || chunks.at(-1)?.type !== "IEND" || chunks.filter(c => c.type === "IEND").length !== 1 || chunks.at(-1)!.data.length !== 0 || !seenData) return original("PNG 结构无效");
    const header = chunks[0].data, hv = new DataView(header.buffer, header.byteOffset, header.byteLength);
    const width = hv.getUint32(0), height = hv.getUint32(4), channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[header[9]!];
    if (!width || !height || width > 4096 || height > 4096 || header[8] !== 8 || !channels || header[10] !== 0 || header[11] !== 0 || header[12] !== 0) return original("仅处理 8 位非交错 PNG，最大边长 4096");
    const rowBytes = width * channels + 1, expected = rowBytes * height;
    if (expected > 16 * 1024 * 1024) return original("超过 16 MiB 解码预算");
    const compressed = join(chunks.filter(c => c.type === "IDAT").map(c => c.data));
    if (compressed.length < 6) return original("PNG 数据流不完整");
    // A fixed output buffer bounds allocation, an extra byte detects overflow.
    const raw = unzlibSync(compressed, { out: new Uint8Array(expected + 1) });
    if (raw.length !== expected || adler(raw) !== new DataView(compressed.buffer).getUint32(compressed.length - 4)) return original("PNG 数据流长度或 Adler 校验不匹配");
    for (let row = 0; row < height; row++) if (raw[row * rowBytes]! > 4) return original("PNG 滤波类型无效");
    const encoded = zlibSync(raw, { level: 9 });
    const check = unzlibSync(encoded, { out: new Uint8Array(expected + 1) });
    if (check.length !== raw.length || !check.every((b, i) => b === raw[i])) return original("重压缩逐字节对照失败");
    const idat = new Uint8Array(encoded.length + 12), iv = new DataView(idat.buffer);
    iv.setUint32(0, encoded.length); idat.set([73, 68, 65, 84], 4); idat.set(encoded, 8); iv.setUint32(idat.length - 4, crc(idat.subarray(4, idat.length - 4)));
    let inserted = false;
    const bytes = join([source.subarray(0, 8), ...chunks.flatMap(chunk => { if (chunk.type !== "IDAT") return [chunk.bytes]; if (inserted) return []; inserted = true; return [idat]; })]);
    return bytes.length < source.length ? { bytes, reason: "IDAT 逐字节无损验证通过，采用更小文件", verified: true } : { bytes: source, reason: "无实际字节收益，保持原始文件", verified: true };
  } catch { return original("无法安全重压缩，保持原始文件"); }
}
