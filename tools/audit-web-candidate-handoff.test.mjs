import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { auditHandoffMatrix, auditCurrentReleaseLinks } from './audit-web-candidate-handoff.mjs';
import { readGamePayload } from './audit-rain-story-refinement.mjs';

const root = new URL('../', import.meta.url);
const readJson = file => JSON.parse(readFileSync(new URL(file, root), 'utf8'));
const original = readJson('evidence/web-story-new-city-rooms/matrix/matrix.json');
const project = readGamePayload(readFileSync(new URL('evidence/web-story-new-city-rooms/before-rain-stops.html', root), 'utf8')).project;
const press = readFileSync(new URL('release/rain-before/press-kit.md', root), 'utf8');
test('accepts the actual frozen Chromium reference and current download section', () => {
  assert.equal(auditHandoffMatrix(original, 'chromium', original.artifacts, project).cells, 4);
  auditCurrentReleaseLinks(press);
});
for (const [name, mutate] of [
  ['partial route coverage', report => report.checks.pop()],
  ['duplicate route disguised as four cells', report => report.checks[3] = report.checks[2]],
  ['wrong engine', report => report.engine = 'webkit'],
  ['old version', report => report.version = '1.11.0'],
  ['different game bytes', report => report.artifacts.html.sha256 = '0'.repeat(64)],
  ['voice without native completion', report => report.checks[0].voiceProof[0].nativeEnded = false],
  ['online reload called offline', report => report.checks[2].reopenKind = 'online-reload'],
  ['load changes story hash', report => report.checks[0].loadAfter.hash = 'changed'],
]) test(`rejects ${name}`, () => {
  const report = structuredClone(original); mutate(report);
  assert.throws(() => auditHandoffMatrix(report, 'chromium', original.artifacts, project));
});
test('rejects an old current download while preserving explicitly historical text', () => {
  assert.throws(() => auditCurrentReleaseLinks(press.replace('](../../evidence/web-story-new-city-rooms/before-rain-stops.html)', '](../../evidence/web-voice-reading-continuity/before-rain-stops.html)')));
  assert.throws(() => auditCurrentReleaseLinks(press.replace('](../../evidence/web-reading-motion/before-rain-stops.html)', '](../../evidence/web-voice-reading-continuity/before-rain-stops.html)')));
  auditCurrentReleaseLinks(press + '\nHistorical material kept.');
});
