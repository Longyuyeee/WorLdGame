import { createHash } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import * as api from './index';
import * as canonical from './canonical';
import type { RuntimeProgramV1 } from './types';

function fixture(text = '中文 🌧️\n引号 " 和反斜线 \\，\t继续。') {
  const program: RuntimeProgramV1 = { schemaVersion: 1, irVersion: '1.0.0', projectId: 'save-encoding', entrySceneId: 'main', scenes: [{ sceneId: 'main', instructions: [{ instructionId: 'line', opcode: 'narration', operands: { textId: 'text', text } }] }] };
  const initial = api.createRuntimeState(program, { buildId: 'build', executionId: 'execution' }); if (!initial.ok) throw Error('fixture');
  const history = api.advanceRuntimeHistoryV1(program, api.createRuntimeHistorySessionV1(program, initial.state).session).session;
  const created = api.createRuntimeSessionSaveV1(program, history); if (!created.ok) throw Error('save');
  return { program, history, created };
}
afterEach(() => vi.restoreAllMocks());

it.each(['中文 🌧️\n"\\\t', 'é ñ 한글', '𐀀𝄞😀', '\b\f\r\u0001', 'ASCII'])('retains the independent canonical serialization and Node SHA identity for %j', text => {
  const { program, created } = fixture(text);
  const expected = api.canonicalRuntimeStringify(created.save);
  expect(created.serialized).toBe(expected);
  expect(created.artifactHash).toBe(createHash('sha256').update('WORLd-RUNTIME-SESSION-SAVE\0v2\0').update(expected, 'utf8').digest('hex'));
  expect(created.save.historyHash).toBe(createHash('sha256').update('WORLd-RUNTIME-HISTORY\0v2\0').update(api.canonicalRuntimeStringify(created.save.history), 'utf8').digest('hex'));
  const loaded = api.loadRuntimeSessionSaveV1(program, expected, { expectedBuildId: 'build' }); if (!loaded.ok) throw Error('load');
  expect(loaded.artifactHash).toBe(created.artifactHash);
  expect(api.createRuntimeSessionSaveV1(program, loaded.session)).toEqual(created);
});

it('encodes the complete history once per save/load, with no envelope/object cache or unchecked package helper', () => {
  const { program, history } = fixture(), encode = vi.spyOn(canonical, 'canonicalRuntimeEncoding');
  const created = api.createRuntimeSessionSaveV1(program, history); if (!created.ok) throw Error('save');
  expect(encode.mock.calls.filter(([value]) => value === history)).toHaveLength(1);
  encode.mockClear();
  const loaded = api.loadRuntimeSessionSaveV1(program, created.serialized, { expectedBuildId: 'build' }); if (!loaded.ok) throw Error('load');
  expect(encode.mock.calls.filter(([value]) => value === loaded.save.history)).toHaveLength(1);
  expect(api).not.toHaveProperty('hashCanonicalRuntimeHistoryBytes');
  expect(api).not.toHaveProperty('serializeSessionSaveEnvelope');
  Object.assign(history.checkpoints[0]!, { stateHash: '0'.repeat(64) });
  expect(api.createRuntimeSessionSaveV1(program, history).ok).toBe(false);
});

it.each(['duplicate', 'number', 'escape', 'order', 'extra', 'null-history', 'primitive-history'])('rejects %s input through the same strict canonical envelope boundary', kind => {
  const { program, created } = fixture(); let serialized = created.serialized;
  if (kind === 'duplicate') serialized = serialized.replace('"cursor":1,', '"cursor":1,"cursor":1,');
  if (kind === 'number') serialized = serialized.replace('"cursor":1,', '"cursor":1.0,');
  if (kind === 'escape') serialized = serialized.replace('"buildId":"build"', '"buildId":"\\u0062uild"');
  if (kind === 'order') serialized = JSON.stringify({ ...created.save, history: created.save.history });
  if (kind === 'extra') serialized = api.canonicalRuntimeStringify({ ...created.save, extra: 1 });
  if (kind === 'null-history') serialized = api.canonicalRuntimeStringify({ ...created.save, history: null });
  if (kind === 'primitive-history') serialized = api.canonicalRuntimeStringify({ ...created.save, history: 'history' });
  expect(serialized).not.toBe(created.serialized);
  const result = api.loadRuntimeSessionSaveV1(program, serialized, { expectedBuildId: 'build' });
  expect(result.ok).toBe(false); expect(result).not.toHaveProperty('session');
});
