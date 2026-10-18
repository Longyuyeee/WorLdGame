import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { unzipSync } from 'fflate';
import { auditCurrentRainSources } from './audit-current-rain-sources.mjs';
import { json } from './audit-rain-story-refinement.mjs';
const root = path.resolve(import.meta.dirname, '..'), source = unzipSync(await readFile(path.join(root, 'evidence/web-story-plans-and-farewell/before-rain-stops-project.zip')));
const withManifest = edit => { const manifest = json(source['world.project.json']); edit(manifest); return { ...source, 'world.project.json': new TextEncoder().encode(JSON.stringify(manifest)) }; };
test('maps all 26 actual files and the revised voice_04 without approving sources or natural listening', async () => { const report = await auditCurrentRainSources(source); assert.equal(report.exactRepositoryAndArchiveFiles, 26); assert.equal(report.approvedPermissions, 0); assert.equal(report.bindings.find(row => row.assetId === 'voice_04').file, 'voice-04-v1.7.wav'); assert.equal(report.legalReviewPassed, false); });
test('rejects missing or duplicate source records', async () => { for (const edit of [m => m.webAssetSources.records.pop(), m => { m.webAssetSources.records[1] = m.webAssetSources.records[0]; }]) await assert.rejects(auditCurrentRainSources(withManifest(edit))); });
test('rejects stale digests, arbitrary paths and invented approval or attribution', async () => { for (const [field, value] of [['digest', `sha256:${'f'.repeat(64)}`], ['source', '../outside.png；invalid'], ['sourceKind', 'unknown'], ['permission', 'documented'], ['reviewedBy', 'not-authorized'], ['reviewedOn', '2026-10-18'], ['credit', 'invented-credit'], ['evidence', 'invented-permission']]) await assert.rejects(auditCurrentRainSources(withManifest(m => { m.webAssetSources.records[0][field] = value; }))); });
test('rejects changed archive bytes and repository mismatches', async () => {
  const entry = json(source['.world-assets/index.json']).assets[0], digest = entry.source.digest.slice(7), name = '.world-assets/blobs/sha256/' + digest.slice(0, 2) + '/' + digest.slice(2);
  await assert.rejects(auditCurrentRainSources({ ...source, [name]: new Uint8Array([1, 2]) })); await assert.rejects(auditCurrentRainSources(source, async () => new Uint8Array([1, 2])));
});
test('rejects the old voice_04 file even with its original valid digest', async () => { await assert.rejects(auditCurrentRainSources(withManifest(m => { m.webAssetSources.records.find(row => row.assetId === 'voice_04').source = 'assets/rain-story/voice-04.wav；old revision'; }))); });
test('rejects changed dialogue, wrong bus and nonadjacent voice context', async () => {
  const name = Object.keys(source).find(name => name.startsWith('scripts/') && json(source[name]).statements.some(row => row.id === 'stmt_ui_113'));
  for (const edit of [script => { script.statements.find(row => row.id === 'stmt_ui_113').text = 'wrong line'; }, script => { script.statements.find(row => row.summary?.includes('asset=voice_04')).summary = 'action=play asset=voice_04 bus=bgm loop=false volume=1'; }, script => { script.statements.splice(script.statements.findIndex(row => row.id === 'stmt_ui_113'), 0, { id: 'jump', kind: 'jump', targetLabel: 'other' }); }]) {
    const script = json(source[name]); edit(script); await assert.rejects(auditCurrentRainSources({ ...source, [name]: new TextEncoder().encode(JSON.stringify(script)) }));
  }
});
