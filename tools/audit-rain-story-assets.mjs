import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const root = path.resolve('assets/rain-story'), specs = JSON.parse(await readFile(path.join(root, 'image-prompts-v1.3.json'))).specs;
const voices = JSON.parse(await readFile(path.join(root, 'voice-lines.json')));
const browser = await chromium.launch({ headless: true, executablePath: process.env.STUDIO_CHROME });
try {
  const page = await browser.newPage(); await page.setContent('<input type="file">');
  const assets = [];
  for (const spec of [...specs, { file: 'letter-icon.png', key: 'icon', transparent: false }]) {
    const bytes = await readFile(path.join(root, spec.file)); await page.locator('input').setInputFiles(path.join(root, spec.file));
    const geometry = await page.evaluate(async () => { const bitmap = await createImageBitmap(document.querySelector('input').files[0]); const c = document.createElement('canvas'); c.width = bitmap.width; c.height = bitmap.height; const context = c.getContext('2d'); context.drawImage(bitmap, 0, 0); const pixels = context.getImageData(0, 0, c.width, c.height).data; let transparentPixels = 0; for (let i = 3; i < pixels.length; i += 4) if (pixels[i] === 0) transparentPixels++; bitmap.close(); return { width: c.width, height: c.height, cornerAlpha: pixels[3], transparentPixels }; });
    if (spec.transparent) assert.ok(geometry.cornerAlpha === 0 && geometry.transparentPixels > 100_000);
    assert.ok(bytes.length <= 8 * 1024 * 1024 && geometry.width * geometry.height <= 4_194_304);
    assets.push({ file: spec.file, sha256: createHash('sha256').update(bytes).digest('hex'), byteLength: bytes.length, ...geometry, origin: spec.key === 'icon' ? 'original SVG rasterization' : 'built-in image_gen', releasePermissionConfirmed: false });
  }
  for (const voice of voices) {
    const bytes = await readFile(path.join(root, voice.file)); let cursor = 12, rate, bits, channels, data;
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
    while (cursor + 8 <= bytes.length) { const kind = bytes.toString('ascii', cursor, cursor + 4), size = bytes.readUInt32LE(cursor + 4); if (kind === 'fmt ') { channels = bytes.readUInt16LE(cursor + 10); rate = bytes.readUInt32LE(cursor + 12); bits = bytes.readUInt16LE(cursor + 22); } if (kind === 'data') data = bytes.subarray(cursor + 8, cursor + 8 + size); cursor += 8 + size + size % 2; }
    assert.ok(data && channels === 1 && bits === 16 && rate === 22050);
    let sum = 0; for (let i = 0; i < data.length; i += 2) sum += (data.readInt16LE(i) / 32768) ** 2;
    const durationSeconds = data.length / 2 / rate, rms = Math.sqrt(sum / (data.length / 2)); assert.ok(durationSeconds > .5 && durationSeconds < 20 && rms > .005);
    assets.push({ ...voice, sha256: createHash('sha256').update(bytes).digest('hex'), byteLength: bytes.length, durationSeconds, rms, rate, bits, channels, origin: 'Windows System.Speech synthesis; not human recording', releasePermissionConfirmed: false });
  }
  await writeFile(path.join(root, 'source-manifest-v1.3.json'), JSON.stringify({ checkedAt: new Date().toISOString(), assets, legalReviewPassed: false }, null, 2) + '\n'); console.log(JSON.stringify({ passed: true, assets: assets.length }));
} finally { await browser.close(); }
