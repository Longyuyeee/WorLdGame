import { afterEach, expect, it, vi } from 'vitest';
import * as api from './index';
import * as hashes from './hash';
import type { RuntimeHistorySessionV1, RuntimeHistorySessionLegacyV1, RuntimeProgramV1, RuntimeStateV1 } from './types';

function fixture(count = 20) {
  const program: RuntimeProgramV1 = { schemaVersion: 1, irVersion: '1.0.0', projectId: 'session-load', entrySceneId: 'main', scenes: [{ sceneId: 'main', instructions: Array.from({ length: count + 2 }, (_, i) => ({ instructionId: `line.${i}`, opcode: 'narration' as const, operands: { textId: `text.${i}`, text: `第 ${i} 句 🌧️` } })) }] };
  const initial = api.createRuntimeState(program, { buildId: 'build', executionId: 'execution' }); if (!initial.ok) throw Error('fixture');
  let history = api.createRuntimeHistorySessionV1(program, initial.state).session;
  for (let i = 0; i < count; i++) history = api.advanceRuntimeHistoryV1(program, history).session;
  return { program, history };
}
function save(program: RuntimeProgramV1, history: RuntimeHistorySessionV1, schema: 1 | 2 = 2) {
  const created = api.createRuntimeSessionSaveV1(program, history); if (!created.ok) throw Error('save');
  if (schema === 2) return created.serialized;
  const { archives: _archives, ...members } = history;
  const legacy = { ...members, schemaVersion: 1 } as RuntimeHistorySessionLegacyV1;
  return api.canonicalRuntimeStringify({ ...created.save, schemaVersion: 1, history: legacy, historyHash: api.runtimeHistorySessionHashSchemaV1(legacy) });
}
const progress = (history: RuntimeHistorySessionV1) => history.checkpoints[history.cursor]!.state.metaProgress;
const load = (program: RuntimeProgramV1, serialized: string, incoming?: RuntimeStateV1['metaProgress']) => api.loadRuntimeSessionSaveV1(program, serialized, { expectedBuildId: 'build', ...(incoming ? { currentMetaProgress: incoming } : {}) });
afterEach(() => vi.restoreAllMocks());

it.each([1, 2] as const)('validates every old checkpoint exactly once for schema %i, with or without new progress', schema => {
  const { program, history } = fixture(), serialized = save(program, history, schema);
  const incoming = progress(history), hash = vi.spyOn(hashes, 'runtimeStateHashV1');
  for (const [value, newHashes] of [[undefined, 0], [incoming, 0], [{ ...incoming, readTextIds: [...incoming.readTextIds, 'text.extra'].sort() }, 1]] as const) {
    hash.mockClear(); const result = load(program, serialized, value);
    expect(result.ok).toBe(true); expect(hash).toHaveBeenCalledTimes(history.checkpoints.length + newHashes);
  }
});

it.each([1, 2] as const)('matches public load then merge, canonical saves, hashes and Forward for schema %i', schema => {
  const { program, history } = fixture();
  const backed = api.backRuntimeHistoryToCursorV1(program, history, 8).session;
  const serialized = save(program, backed, schema), original = api.canonicalRuntimeStringify(backed);
  const incoming = { ...progress(history), unlockedGalleryAssetIds: ['gallery.extra'], reachedEndingIds: ['ending.extra'] };
  const strict = load(program, serialized); if (!strict.ok) throw Error('load');
  const reference = api.mergeRuntimeHistoryMetaProgressV1(program, strict.session, incoming);
  expect(reference.diagnostics).toEqual([]);
  const actual = load(program, serialized, incoming); if (!actual.ok) throw Error('merged load');
  expect(actual).toEqual({ ...strict, session: reference.session, state: reference.state });
  expect(api.canonicalRuntimeStringify(backed)).toBe(original);
  expect(actual.session.cursor).toBe(8); expect(actual.session.entries).toHaveLength(20);
  expect(api.validateRuntimeHistorySessionV1(program, actual.session)).toEqual([]);
  expect(api.createRuntimeSessionSaveV1(program, actual.session)).toEqual(api.createRuntimeSessionSaveV1(program, reference.session));
  expect(api.forwardRuntimeHistoryV1(program, actual.session)).toEqual(api.forwardRuntimeHistoryV1(program, reference.session));
  expect(load(program, serialized, incoming)).toEqual(actual);
});

it('retains branched archives, accepted input tombstones and recorded future while merging', () => {
  const { program: textProgram } = fixture(2);
  const program: RuntimeProgramV1 = { ...textProgram, scenes: [{ sceneId: 'main', instructions: [{ instructionId: 'choice', opcode: 'choice', operands: { prompt: '去哪里？', options: [{ optionId: 'left', label: '左', targetSceneId: 'left' }, { optionId: 'right', label: '右', targetSceneId: 'right' }] } }] }, ...['left', 'right'].map(sceneId => ({ sceneId, instructions: [{ instructionId: `line.${sceneId}`, opcode: 'narration' as const, operands: { textId: `text.${sceneId}`, text: sceneId } }] }))] };
  const initial = api.createRuntimeState(program, { buildId: 'build', executionId: 'execution' }); if (!initial.ok) throw Error('fixture');
  const choice = api.advanceRuntimeHistoryV1(program, api.createRuntimeHistorySessionV1(program, initial.state).session);
  function choose(history: RuntimeHistorySessionV1, optionId: string) {
    const state = history.checkpoints[history.cursor]!.state, pending = state.pendingChoice!;
    return api.advanceRuntimeHistoryV1(program, history, { input: { schemaVersion: 1, kind: 'choiceSelected', inputId: `input.${optionId}`, executionId: state.executionId, expectedStateRevision: state.stateRevision, logicalSequence: pending.logicalSequence, requestId: pending.requestId, instructionId: pending.instructionId, optionId } });
  }
  const left = choose(choice.session, 'left'), fork = api.backRuntimeHistoryV1(program, left.session);
  const right = choose(fork.session, 'right'), backed = api.backRuntimeHistoryV1(program, right.session).session;
  expect(backed.archives).toHaveLength(1); expect(backed.inputTombstones).toHaveLength(1);
  const serialized = save(program, backed), incoming = { ...progress(backed), reachedEndingIds: ['ending.extra'] };
  const actual = load(program, serialized, incoming); if (!actual.ok) throw Error('load');
  expect(actual.session.archives).toEqual(backed.archives); expect(actual.session.inputTombstones).toEqual(backed.inputTombstones);
  expect(actual.session.cursor).toBe(1); expect(actual.session.entries).toHaveLength(2);
  expect(api.forwardRuntimeHistoryV1(program, actual.session).state.cursor).toEqual(right.state.cursor);
  expect(api.validateRuntimeHistorySessionV1(program, actual.session)).toEqual([]);
});

it.each(([1, 2] as const).flatMap(schema => ['checkpoint', 'entry', 'archive', 'tombstone', 'envelope', 'hash', 'canonical'].map(kind => ({ schema, kind }))))('rejects schema $schema $kind damage on every load even with a recomputed outer hash', ({ schema, kind }) => {
  const { program, history } = fixture(), serialized = save(program, history, schema);
  expect(load(program, serialized, progress(history)).ok).toBe(true);
  const damaged = JSON.parse(serialized);
  if (kind === 'checkpoint') damaged.history.checkpoints[0].stateHash = '0'.repeat(64);
  if (kind === 'entry') damaged.history.entries[0].entryId = `entry.${'0'.repeat(64)}`;
  if (kind === 'archive') damaged.history.archives = [{}];
  if (kind === 'tombstone') damaged.history.inputTombstones = [{}];
  if (kind === 'envelope') damaged.cursor = 0;
  damaged.historyHash = kind === 'hash' ? '0'.repeat(64) : schema === 1 ? api.runtimeHistorySessionHashSchemaV1(damaged.history) : api.runtimeHistorySessionHashV1(damaged.history);
  const input = api.canonicalRuntimeStringify(damaged) + (kind === 'canonical' ? '\n' : '');
  const result = load(program, input, progress(history));
  expect(result.ok).toBe(false); expect(result).not.toHaveProperty('session'); expect(result).not.toHaveProperty('state');
  expect(load(program, serialized, progress(history)).ok).toBe(true);
});

it.each([1, 2] as const)('rejects invalid or foreign incoming progress independently for schema %i', schema => {
  const { program, history } = fixture(), serialized = save(program, history, schema), original = progress(history);
  for (const incoming of [{ ...original, projectId: 'foreign' }, { ...original, progressScopeId: 'foreign' }, { ...original, readTextIds: ['z', 'a'] }, { ...original, readTextIds: ['a', 'a'] }]) {
    const result = load(program, serialized, incoming); expect(result.ok).toBe(false); expect(result).not.toHaveProperty('state');
  }
  expect(load(program, serialized, original).ok).toBe(true);
});

it('keeps public merge fully validating and exposes no unchecked package entry', () => {
  const { program, history } = fixture(), incoming = progress(history);
  expect(api.mergeRuntimeHistoryMetaProgressV1(program, history, incoming).diagnostics).toEqual([]);
  Object.assign(history.checkpoints[0]!, { stateHash: '0'.repeat(64) });
  expect(api.mergeRuntimeHistoryMetaProgressV1(program, history, incoming).diagnostics[0]?.code).toBe('RUNTIME_HISTORY_INVALID');
  expect(api).not.toHaveProperty('mergeValidatedRuntimeHistoryMetaProgressInternal');
});
