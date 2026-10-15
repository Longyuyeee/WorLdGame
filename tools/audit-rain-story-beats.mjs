import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import { json, sha, readGamePayload } from './audit-rain-story-refinement.mjs';
import { expectedScript, textRevisions, voiceRevision, voiceBeats, montageExit } from '../assets/rain-story/editorial-v1.7.mjs';

const root = path.resolve(import.meta.dirname, '..');
export const beatOutput = path.join(root, 'evidence/web-story-beats');
const blobKey = asset => { const digest = asset.source.digest.slice(7); return `.world-assets/blobs/sha256/${digest.slice(0, 2)}/${digest.slice(2)}`; };
export function inspectBeatVoice(bytes) {
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF'); assert.equal(bytes.toString('ascii', 8, 12), 'WAVE');
  let cursor = 12, channels, rate, bits, format, data;
  while (cursor + 8 <= bytes.length) {
    const kind = bytes.toString('ascii', cursor, cursor + 4), size = bytes.readUInt32LE(cursor + 4);
    assert.ok(cursor + 8 + size <= bytes.length, 'Truncated WAV chunk');
    if (kind === 'fmt ') { assert.ok(size >= 16); format = bytes.readUInt16LE(cursor + 8); channels = bytes.readUInt16LE(cursor + 10); rate = bytes.readUInt32LE(cursor + 12); bits = bytes.readUInt16LE(cursor + 22); }
    if (kind === 'data') data = bytes.subarray(cursor + 8, cursor + 8 + size);
    cursor += 8 + size + size % 2;
  }
  assert.equal(format, 1); assert.equal(channels, 1); assert.equal(rate, 22050); assert.equal(bits, 16); assert.ok(data?.length && data.length % 2 === 0);
  let sum = 0, peak = 0, clipped = 0;
  for (let i = 0; i < data.length; i += 2) { const sample = data.readInt16LE(i); peak = Math.max(peak, Math.abs(sample)); sum += (sample / 32768) ** 2; if (Math.abs(sample) >= 32767) clipped++; }
  const durationSeconds = data.length / 2 / rate, rms = Math.sqrt(sum / (data.length / 2));
  assert.ok(durationSeconds > 3 && durationSeconds < 9); assert.ok(rms > .005); assert.equal(clipped, 0);
  return { durationSeconds, rms, peak: peak / 32768, clippedSamples: clipped, rate, channels, bits, byteLength: bytes.length, sha256: sha(bytes), humanListeningPassed: false, releasePermissionConfirmed: false };
}
export function auditBeatSource(before, after, voiceBytes) {
  const manifest = json(after['world.project.json']), oldManifest = json(before['world.project.json']);
  assert.equal(manifest.webPublication.version, '1.7.0');
  assert.deepEqual({ ...manifest, webPublication: oldManifest.webPublication }, oldManifest);
  assert.deepEqual({ ...manifest.webPublication, version: oldManifest.webPublication.version }, oldManifest.webPublication);
  const allowed = new Set(['world.project.json', 'domain/assets.json', '.world-assets/index.json', '.world-assets/bundle.json']);
  let moved = 0;
  for (const [key, bytes] of Object.entries(before)) {
    if (key.startsWith('scripts/')) {
      const old = json(bytes), fresh = json(after[key]);
      assert.deepEqual(fresh, expectedScript(old), key);
      const beat = voiceBeats.find(b => old.statements.some(s => s.id === b.line));
      if (old.statements.findIndex(s => s.id === beat.play) !== fresh.statements.findIndex(s => s.id === beat.play)) moved++;
      allowed.add(key);
      continue;
    }
    if (allowed.has(key) || key.startsWith('.world-assets/blobs/')) continue;
    assert.equal(sha(after[key]), sha(bytes), key);
  }
  const oldIndex = json(before['.world-assets/index.json']), index = json(after['.world-assets/index.json']);
  assert.equal(index.assets.length, 25);
  assert.deepEqual({ ...index, assets: oldIndex.assets, indexRevision: oldIndex.indexRevision }, oldIndex);
  assert.ok(index.indexRevision > oldIndex.indexRevision);
  assert.deepEqual(index.assets.map(a => a.assetId), oldIndex.assets.map(a => a.assetId));
  for (const asset of index.assets) {
    const old = oldIndex.assets.find(a => a.assetId === asset.assetId), bytes = after[blobKey(asset)];
    assert.equal(bytes.length, asset.source.byteLength); assert.equal(`sha256:${sha(bytes)}`, asset.source.digest);
    if (asset.assetId !== voiceRevision.assetId) { assert.deepEqual(asset, old); assert.equal(sha(bytes), sha(before[blobKey(old)])); }
    else {
      assert.deepEqual({ ...asset, source: old.source, preservedFields: old.preservedFields }, old);
      assert.equal(asset.source.mimeType, 'audio/wav'); assert.equal(sha(bytes), sha(voiceBytes)); assert.notEqual(asset.source.digest, old.source.digest);
      const inspection = asset.preservedFields.inspection;
      assert.equal(inspection.status, 'pass'); assert.equal(inspection.sampleRate, 22050); assert.equal(inspection.channels, 1);
      assert.ok(inspection.durationSeconds > 3 && inspection.durationSeconds < 9);
      assert.equal(inspection.byteLength, bytes.length);
      assert.equal(inspection.durationSeconds, inspectBeatVoice(Buffer.from(bytes)).durationSeconds);
    }
  }
  const domain = json(after['domain/assets.json']), oldDomain = json(before['domain/assets.json']);
  assert.deepEqual({ ...domain, assets: oldDomain.assets }, oldDomain);
  assert.deepEqual(domain.assets.map(a => a.assetId), oldDomain.assets.map(a => a.assetId));
  for (const asset of domain.assets) {
    if (asset.assetId !== voiceRevision.assetId) assert.deepEqual(asset, oldDomain.assets.find(a => a.assetId === asset.assetId));
    const indexed = index.assets.find(a => a.assetId === asset.assetId); assert.deepEqual(asset.source, indexed.source);
    assert.deepEqual(asset.assetIndexMetadata, indexed.preservedFields);
  }
  const bundle = json(after['.world-assets/bundle.json']);
  assert.deepEqual(bundle, { ...json(before['.world-assets/bundle.json']), referencedBytes: index.assets.reduce((n, a) => n + a.source.byteLength, 0) });
  assert.deepEqual(Object.keys(after).filter(k => k.startsWith('.world-assets/blobs/')).sort(), [...new Set(index.assets.map(blobKey))].sort());
  for (const key of Object.keys(after)) assert.ok(allowed.has(key) || key.startsWith('.world-assets/blobs/') || before[key], `Unexpected file: ${key}`);
  const statements = Object.keys(after).filter(k => k.startsWith('scripts/')).flatMap(k => json(after[k]).statements);
  assert.equal(new Set(statements.map(s => s.id)).size, statements.length);
  assert.equal(statements.filter(s => s.kind === 'narration').length, 90);
  assert.equal(statements.filter(s => s.kind === 'dialogue').length, 9);
  assert.equal(statements.filter(s => s.kind === 'direction').length, 74);
  assert.equal(statements.filter(s => s.kind === 'end').length, 2);
  assert.equal(statements.find(s => s.id === montageExit.id).kind, 'direction');
  return { scenes: 9, narration: 90, dialogue: 9, textCharacters: statements.filter(s => ['narration', 'dialogue'].includes(s.kind)).reduce((n, s) => n + s.text.length, 0), revisedNarrations: textRevisions.length, revisedVoices: 1, movedVoiceBlocks: moved, voiceBeats: 9, directions: 74, assets: 25, unchangedMedia: 24, existingIdsPreserved: true };
}
export async function auditBeatArtifacts(output = beatOutput) {
  const before = unzipSync(await readFile(path.join(root, 'evidence/web-story-refinement/before-rain-stops-project.zip')));
  const sourceBytes = await readFile(path.join(output, 'before-rain-stops-project.zip')), source = unzipSync(sourceBytes);
  const htmlBytes = await readFile(path.join(output, 'before-rain-stops.html')), directoryBytes = await readFile(path.join(output, 'before-rain-stops-web.zip')), directory = unzipSync(directoryBytes);
  const voiceBytes = await readFile(path.join(root, 'assets/rain-story', voiceRevision.file)), voice = inspectBeatVoice(voiceBytes);
  const story = auditBeatSource(before, source, voiceBytes);
  const html = readGamePayload(htmlBytes.toString('utf8')), web = readGamePayload(Buffer.from(directory['index.html']).toString('utf8'));
  assert.deepEqual(html.project, web.project);
  assert.equal(web.project.manifest.preservedFields.webPublication.version, '1.7.0');
  for (const [key, bytes] of Object.entries(source)) if (key.startsWith('scripts/')) { const script = json(bytes); assert.deepEqual(web.project.scripts[script.sceneId], script); }
  for (const asset of json(source['.world-assets/index.json']).assets) {
    const inline = html.mediaAssets.find(a => a.assetId === asset.assetId), file = web.mediaAssets.find(a => a.assetId === asset.assetId);
    assert.equal(`sha256:${sha(Buffer.from(inline.url.split(',')[1], 'base64'))}`, asset.source.digest);
    assert.equal(`sha256:${sha(directory[file.url])}`, asset.source.digest);
  }
  const info = json(directory['build-info.json']);
  for (const entry of info.files) { assert.equal(directory[entry.path].length, entry.byteLength); assert.equal(`sha256:${sha(directory[entry.path])}`, entry.digest); }
  const notes = json(await readFile(path.join(output, 'before-rain-stops.worldreview'))), oldNotes = json(await readFile(path.join(root, 'evidence/web-story-refinement/before-rain-stops.worldreview')));
  assert.equal(notes.notes.length, 11);
  assert.ok(notes.notes.every(n => n.status === 'fixed' && n.checkedSourceHash === null));
  for (const n of oldNotes.notes) assert.deepEqual(notes.notes.find(item => item.id === n.id), n);
  return { passed: true, story, voice, canonicalSourceHtmlDirectoryMatch: true, mediaBytesMatch: true, notes: { originalFixedPreserved: 8, newFixed: 3, humanVerified: 0 }, artifacts: Object.fromEntries([['source', sourceBytes], ['html', htmlBytes], ['directory', directoryBytes]].map(([key, bytes]) => [key, { bytes: bytes.length, sha256: sha(bytes) }])), source, directory };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) { const { source, directory, ...report } = await auditBeatArtifacts(); console.log(JSON.stringify(report, null, 2)); }
