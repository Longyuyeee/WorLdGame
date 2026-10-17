import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import { json, sha, readGamePayload } from './audit-rain-story-refinement.mjs';
const root = path.resolve(import.meta.dirname, '..');
export async function auditCurrentRainSources(files, readRepository = file => readFile(path.join(root, file))) {
  const manifest = json(files['world.project.json']), index = json(files['.world-assets/index.json']);
  assert.equal(manifest.webPublication.version, '1.11.0'); assert.equal(index.assets.length, 26);
  assert.equal(manifest.webAssetSources.records.length, 26);
  assert.equal(new Set(index.assets.map(asset => asset.assetId)).size, 26); assert.equal(new Set(manifest.webAssetSources.records.map(row => row.assetId)).size, 26);
  const records = [];
  for (const entry of index.assets) {
    const record = manifest.webAssetSources.records.find(row => row.assetId === entry.assetId); assert.ok(record, entry.assetId);
    assert.equal(record.digest, entry.source.digest); assert.equal(record.permission, 'pending');
    assert.equal(record.sourceKind, ['letter_icon', 'night_travel_theme', 'soft_rain', 'station_chime'].includes(entry.assetId) ? 'original' : 'generated');
    for (const field of ['evidence', 'credit', 'reviewedBy', 'reviewedOn']) assert.equal(record[field], '', `${entry.assetId}: no invented approval or attribution`);
    const sourceFile = record.source.split('；')[0]; assert.match(sourceFile, /^assets\/rain-story\/[a-z0-9.-]+\.(?:png|wav)$/u);
    const repository = await readRepository(sourceFile), digest = entry.source.digest.slice(7), archive = files['.world-assets/blobs/sha256/' + digest.slice(0, 2) + '/' + digest.slice(2)];
    assert.ok(archive, entry.assetId); for (const bytes of [repository, archive]) { assert.equal('sha256:' + sha(bytes), entry.source.digest, entry.assetId); assert.equal(bytes.length, entry.source.byteLength, entry.assetId); }
    records.push({ assetId: entry.assetId, sourceFile, digest: entry.source.digest, bytes: archive.length, sourceKind: record.sourceKind, permission: record.permission });
  }
  const lines = json(await readRepository('assets/rain-story/voice-lines.json')), revision = json(await readRepository('assets/rain-story/voice-revision-v1.7.json'));
  const scripts = Object.entries(files).filter(([name]) => name.startsWith('scripts/')).map(([, bytes]) => json(bytes));
  const characters = json(files['domain/characters.json']).characters, scenes = Object.entries(files).filter(([name]) => name.startsWith('scenes/')).map(([, bytes]) => json(bytes));
  const voices = lines.map((old, i) => ({ ...old, ...(i === 3 ? revision : {}), assetId: `voice_${String(i + 1).padStart(2, '0')}` }));
  assert.equal(voices.length, 9);
  const bindings = voices.map(voice => {
    // Exact expectations for this frozen work, not a second directive parser.
    const cues = scripts.flatMap(script => script.statements.flatMap((statement, i) => statement.kind === 'direction' && statement.command === 'audio' && statement.summary.split(/\s+/u).includes(`asset=${voice.assetId}`) ? [{ script, statement, next: script.statements[i + 1] }] : []));
    assert.equal(cues.length, 1, voice.assetId); const cue = cues[0]; assert.equal(cue.statement.summary, `action=play asset=${voice.assetId} bus=voice loop=false volume=1`);
    assert.equal(cue.next.kind, 'dialogue'); assert.equal(cue.next.text, voice.text); assert.equal(characters.find(row => row.id === cue.next.speakerId)?.displayName, voice.speaker); assert.equal(scenes.find(row => row.id === cue.script.sceneId)?.title, voice.scene);
    assert.equal(records.find(row => row.assetId === voice.assetId).sourceFile, 'assets/rain-story/' + voice.file);
    return { assetId: voice.assetId, scene: voice.scene, statementId: cue.next.id, text: voice.text, speaker: voice.speaker, file: voice.file, transcriptionVerified: false, naturalListeningApproved: false };
  });
  return { passed: true, version: '1.11.0', exactRepositoryAndArchiveFiles: 26, pendingPermissions: 26, approvedPermissions: 0, records, bindings, legalReviewPassed: false, naturalListeningApproved: false };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const source = await readFile(path.join(root, 'evidence/web-story-plans-and-farewell/before-rain-stops-project.zip')), report = await auditCurrentRainSources(unzipSync(source));
  const payload = readGamePayload(await readFile(path.join(root, 'evidence/web-reading-press/before-rain-stops.html'), 'utf8'));
  for (const asset of payload.mediaAssets) assert.equal('sha256:' + sha(Buffer.from(asset.url.split(',')[1], 'base64')), report.records.find(row => row.assetId === asset.assetId).digest);
  assert.equal(payload.mediaAssets.length, 26);
  await mkdir(path.join(root, 'evidence/web-source-preview'), { recursive: true }); await writeFile(path.join(root, 'evidence/web-source-preview/media-audit.json'), JSON.stringify({ ...report, sourceSha256: sha(source), scope: 'Exact archive/repository/player bytes and nine source-text/voice-file associations. Not speech recognition, ownership verification, attribution requirements or redistribution permission.' }, null, 2)); console.log('PASS 26 exact source files and nine current dialogue associations; all permissions remain pending');
}
