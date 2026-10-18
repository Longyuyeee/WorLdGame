import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { unzipSync, strToU8 } from 'fflate';
import { auditSource, json, sha, readGamePayload } from './audit-rain-story-refinement.mjs';
import { revisions, backgroundChanges, audioChanges, newBackgrounds, refinedScenes } from '../assets/rain-story/editorial-v1.6.mjs';

const root = path.resolve(import.meta.dirname, '..'), before = unzipSync(await readFile(path.join(root, 'evidence/web-save-backup/before-rain-stops-project.zip')));
const encode = value => strToU8(JSON.stringify(value));
// Synthetic source fixture tests the audit's rejection paths; real candidate is authored/exported by the browser script.
async function fixture() {
  const after = { ...before }, manifest = json(before['world.project.json']); manifest.webPublication.version = '1.6.0'; after['world.project.json'] = encode(manifest);
  for (const [key, value] of Object.entries(before)) {
    if (!key.startsWith('scripts/')) continue; const script = json(value);
    script.statements = script.statements.flatMap(s => {
      const r = revisions.find(r => r.statementId === s.id), b = backgroundChanges.find(b => b.statementId === s.id), a = audioChanges.find(a => a.before === s.id);
      const current = r ? { ...s, text: r.text } : b ? { ...s, summary: s.summary.replace(`asset=${b.from}`, `asset=${b.to}`) } : s;
      return a ? [{ id: `refinement_${a.action}`, kind: 'direction', command: 'audio', summary: a.action === 'play' ? 'action=play asset=soft_rain bus=ambient loop=true volume=0.1' : 'action=stop bus=ambient' }, current] : [current];
    }); after[key] = encode(script);
  }
  const index = json(before['.world-assets/index.json']);
  for (const bg of newBackgrounds) { const bytes = await readFile(path.join(root, 'assets/rain-story', bg.file)), digest = sha(bytes); after[`.world-assets/blobs/sha256/${digest.slice(0, 2)}/${digest.slice(2)}`] = bytes; index.assets.push({ assetId: bg.assetId, kind: 'background', displayName: bg.name, source: { digest: `sha256:${digest}`, mimeType: 'image/png', byteLength: bytes.length }, tags: [] }); }
  after['.world-assets/index.json'] = encode(index); return after;
}
test('planned refinement preserves all original identities and assets, and has only the declared story/stage changes', async () => {
  const report = auditSource(before, await fixture()); assert.equal(report.changedText, 5); assert.equal(report.changedBackgrounds, 5); assert.equal(report.addedAudioCues, 2); assert.equal(report.assets, 25); assert.equal(report.directions, 73);
  assert.equal(refinedScenes.length, 9); assert.equal(refinedScenes.flatMap(s => s.prose).length, 90); assert.ok(revisions.every(r => r.text !== r.original));
});
test('rejects undeclared prose changes or identity changes rather than silently accepting a partial candidate', async () => {
  for (const mutate of [s => { s.text += '未审计修改'; }, s => { s.id += '_changed'; }]) {
    const after = await fixture(), key = Object.keys(after).find(k => k.startsWith('scripts/')), script = json(after[key]); mutate(script.statements.find(s => s.kind === 'narration')); after[key] = encode(script); assert.throws(() => auditSource(before, after));
  }
});
test('rejects moved rain stop cues and changed original blob bytes', async () => {
  let after = await fixture(); const key = Object.keys(after).find(k => k.startsWith('scripts/') && json(after[k]).statements.some(s => s.id === 'refinement_stop')), script = json(after[key]);
  const index = script.statements.findIndex(s => s.id === 'refinement_stop'), [cue] = script.statements.splice(index, 1); script.statements.push(cue); after[key] = encode(script); assert.throws(() => auditSource(before, after));
  after = await fixture(); after[Object.keys(before).find(k => k.startsWith('.world-assets/blobs/'))] = new Uint8Array([0]); assert.throws(() => auditSource(before, after));
});
test('new day/night backgrounds are actual wide PNGs with traceable, non-overwriting edit targets', async () => {
  const prompts = JSON.parse(await readFile(path.join(root, 'assets/rain-story/image-prompts-v1.6.json'), 'utf8'));
  for (const bg of newBackgrounds) { const bytes = await readFile(path.join(root, 'assets/rain-story', bg.file)), reference = await readFile(path.join(root, 'assets/rain-story', bg.reference)); assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a'); assert.ok(Math.abs(bytes.readUInt32BE(16) / bytes.readUInt32BE(20) - 16 / 9) < .01); assert.notEqual(sha(bytes), sha(reference)); const prompt = prompts.assets.find(a => a.file === bg.file); assert.equal(prompt.reference, bg.reference); assert.equal(prompt.method, 'built-in imagegen'); assert.equal(prompt.releasePermissionConfirmed, false); }
});
test('large inline games use bounded delimiter parsing, not a recursive payload regex', () => {
  const payload = { media: 'x'.repeat(8 * 1024 * 1024) }; assert.equal(readGamePayload(`<script id="world-project" type="application/json">${JSON.stringify(payload)}</script>`).media.length, payload.media.length);
  assert.throws(() => readGamePayload('<html>missing</html>')); assert.throws(() => readGamePayload('<script id="world-project" type="application/json">broken</script>'));
});
