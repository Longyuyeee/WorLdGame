import { expect, it } from 'vitest';
import { createProjectTemplate, exportProjectBinaryZip, exportProjectZip, saveProject } from '@world-studio/project-domain';
import { importStudioProjectArchive } from './web-delivery-bundle';
import { checkProjectImportText, isProjectImportGuidanceCode, ProjectImportSelectionError } from './project-import-guidance';

const encode = (value: string) => new TextEncoder().encode(value);
const game = { 'index.html': encode('<!doctype html><html>game</html>'), 'build-info.json': encode('{}') };

it.each([
  ['website/local game', game, 'WEB_GAME_ARCHIVE'],
  ['game subdirectory', { 'game/index.html': game['index.html'] }, 'WEB_GAME_ARCHIVE'],
  ['wrapped source', { '作品/world.project.json': encode('{}'), ...game }, 'WRAPPED_PROJECT'],
  ['wrapped delivery', { '作品/delivery.json': encode('{}'), ...game }, 'WRAPPED_PROJECT'],
  ['incomplete delivery', { 'source/project.zip': encode('not yet validated'), ...game }, 'INCOMPLETE_DELIVERY'],
] as const)('explains %s without treating its contents as validated source', (_name, files, code) => {
  expect(() => importStudioProjectArchive(exportProjectBinaryZip(files))).toThrowError(expect.objectContaining({ name: 'ProjectImportSelectionError', code }));
});

it.each([
  ['\ufeff \n<!DOCTYPE html><html></html>', 'GAME_HTML'],
  ['<html lang="zh">never executed<script>throw 1</script>', 'GAME_HTML'],
  [JSON.stringify({ schemaVersion: 1, format: 'world.player-save-backup', payload: 'large progress' }), 'PLAYER_SAVE'],
  [JSON.stringify({ schemaVersion: 1, kind: 'world-playtest-notes', notes: [] }, null, 2), 'REVIEW_FILE'],
  [JSON.stringify({ schemaVersion: 1, kind: 'world-playtest-progress', completions: [] }), 'REVIEW_FILE'],
] as const)('recognizes bounded text envelope %s', (text, code) => {
  expect(() => importStudioProjectArchive(encode(text))).toThrowError(expect.objectContaining({ code }));
});

it('does not infer file types from nested payloads, an unrelated format, or distant text', () => {
  for (const text of ['{"text":"world.player-save-backup"}', '{"schemaVersion":1,"kind":"other"}', 'x'.repeat(4096) + '<html>', JSON.stringify({ payload: { schemaVersion: 1, format: 'world.player-save-backup' } })]) expect(() => checkProjectImportText(encode(text))).not.toThrow();
  expect(() => importStudioProjectArchive(encode('not a zip'))).toThrowError(expect.objectContaining({ code: 'INVALID_ARCHIVE' }));
});

it('does not mask damaged authoritative source or delivery as a wrong selection', () => {
  for (const root of ['world.project.json', 'delivery.json']) {
    try { importStudioProjectArchive(exportProjectBinaryZip({ ...game, [root]: encode('{broken') })); throw Error('should reject'); }
    catch (error) { expect(error).not.toBeInstanceOf(ProjectImportSelectionError); expect(String(error)).not.toBe('Error: should reject'); }
  }
});

it('keeps ZIP corruption, compression and unsafe path rejection ahead of selection guidance', () => {
  const badCrc = exportProjectBinaryZip(game), payloadOffset = 30 + encode('build-info.json').length; badCrc[payloadOffset] = badCrc[payloadOffset]! ^ 1;
  expect(() => importStudioProjectArchive(badCrc)).toThrowError(expect.objectContaining({ code: 'INVALID_ARCHIVE' }));
  const compressed = exportProjectBinaryZip(game), view = new DataView(compressed.buffer), end = compressed.length - 22, central = view.getUint32(end + 16, true);
  view.setUint16(central + 10, 8, true);
  expect(() => importStudioProjectArchive(compressed)).toThrowError(expect.objectContaining({ code: 'UNSUPPORTED_COMPRESSION' }));
  const unsafe = exportProjectBinaryZip({ 'aaa/index.html': encode('game') });
  const original = encode('aaa/index.html'), replacement = encode('../index.html');
  for (let offset = 0; offset < unsafe.length - original.length; offset++) if (original.every((byte, index) => unsafe[offset + index] === byte)) unsafe.set(replacement, offset);
  expect(() => importStudioProjectArchive(unsafe)).toThrowError(expect.objectContaining({ code: 'UNSAFE_PATH' }));
});

it('keeps valid original source and source-owned HTML on the normal import path', () => {
  const source = saveProject(createProjectTemplate('可编辑作品', 'selection-source'));
  const restored = importStudioProjectArchive(exportProjectZip({ ...source, 'index.html': '<html>source attachment</html>' }));
  expect(restored.project.manifest.title).toBe('可编辑作品'); expect(restored.legacyTextOnly).toBe(true);
});
it('keeps excessive counts and duplicate paths ahead of selection hints', () => {
  const tooMany = exportProjectBinaryZip(game), view = new DataView(tooMany.buffer);
  view.setUint16(tooMany.length - 22 + 10, 8193, true);
  expect(() => importStudioProjectArchive(tooMany)).toThrowError(expect.objectContaining({ code: 'SIZE_LIMIT' }));
  const duplicate = exportProjectBinaryZip({ 'index.html': encode('one'), 'abcde.html': encode('two') }), name = encode('abcde.html');
  for (let offset = 0; offset < duplicate.length - name.length; offset++) if (name.every((byte, index) => duplicate[offset + index] === byte)) duplicate.set(encode('index.html'), offset);
  expect(() => importStudioProjectArchive(duplicate)).toThrowError(expect.objectContaining({ code: 'DUPLICATE_PATH' }));
});

it('accepts only own guidance codes from worker messages', () => {
  expect(isProjectImportGuidanceCode('WEB_GAME_ARCHIVE')).toBe(true);
  for (const code of ['constructor', '__proto__', 'INVALID_ARCHIVE', 1, null]) expect(isProjectImportGuidanceCode(code)).toBe(false);
});
