import { afterEach, expect, it, vi } from 'vitest';
import * as api from './index';
import * as hashes from './hash';
import type { RuntimeHistorySessionV1, RuntimeProgramV1 } from './types';

function fixture(count = 40) {
  const program: RuntimeProgramV1 = { schemaVersion: 1, irVersion: '1.0.0', projectId: 'history-navigation', entrySceneId: 'main', scenes: [{ sceneId: 'main', instructions: Array.from({ length: count + 2 }, (_, index) => ({ instructionId: `line.${index}`, opcode: 'narration' as const, operands: { textId: `text.${index}`, text: `第 ${index} 句 🌍` } })) }] };
  const initial = api.createRuntimeState(program, { buildId: 'build', executionId: 'execution' }); if (!initial.ok) throw Error('fixture');
  let history = api.createRuntimeHistorySessionV1(program, initial.state).session;
  for (let index = 0; index < count; index++) history = api.advanceRuntimeHistoryV1(program, history).session;
  return { program, history };
}
function reference(program: RuntimeProgramV1, history: RuntimeHistorySessionV1, target: number) {
  const navigationPlans = []; let current = api.backRuntimeHistoryV1(program, history);
  while (true) {
    if (current.diagnostics.length > 0) break;
    navigationPlans.push({ cursor: current.session.cursor, plan: current.reconciliationPlan! });
    if (current.session.cursor <= target) break;
    current = api.backRuntimeHistoryV1(program, current.session);
  }
  return { ...current, navigationPlans };
}
afterEach(() => vi.restoreAllMocks());

it('matches ordered public Back, complete history bytes, monotonic progress and later Forward', () => {
  const { program, history } = fixture(); const original = api.canonicalRuntimeStringify(history);
  const expected = reference(program, history, 6), actual = api.backRuntimeHistoryToCursorV1(program, history, 6);
  expect(actual).toEqual(expected);
  expect(api.canonicalRuntimeStringify(history)).toBe(original);
  expect(api.validateRuntimeHistorySessionV1(program, actual.session)).toEqual([]);
  expect(api.createRuntimeSessionSaveV1(program, actual.session)).toEqual(api.createRuntimeSessionSaveV1(program, expected.session));
  expect(actual.state.metaProgress.readTextIds).toEqual(history.checkpoints[history.cursor]!.state.metaProgress.readTextIds);
  expect(api.forwardRuntimeHistoryV1(program, actual.session)).toEqual(api.forwardRuntimeHistoryV1(program, expected.session));
});

it('hashes the old checkpoints once for one call, then every newly rebased checkpoint', () => {
  const { program, history } = fixture(60), hash = vi.spyOn(hashes, 'runtimeStateHashV1');
  const actual = api.backRuntimeHistoryToCursorV1(program, history, 10);
  expect(actual.diagnostics).toEqual([]); expect(hash).toHaveBeenCalledTimes(61 + 50);
});

it('revalidates mutations between calls and rejects nonexistent or malformed targets without moving', () => {
  const { program, history } = fixture();
  for (const target of [-1, 41, 1.5, NaN]) expect(api.backRuntimeHistoryToCursorV1(program, history, target)).toMatchObject({ session: history, navigationPlans: [], diagnostics: [{ code: 'RUNTIME_HISTORY_INVALID' }] });
  expect(api.backRuntimeHistoryToCursorV1(program, history, history.cursor).session).toBe(history);
  api.backRuntimeHistoryToCursorV1(program, history, 10);
  (history.checkpoints[0]!.state as { buildId: string }).buildId = 'tampered';
  expect(api.backRuntimeHistoryToCursorV1(program, history, 10).diagnostics[0]?.code).toBe('RUNTIME_HISTORY_INVALID');
});

it('retains compacted readonly archives while moving within the surviving rollback window', () => {
  const { program, history } = fixture(60), compacted = api.compactRuntimeHistoryV1(program, history, 20).session;
  const actual = api.backRuntimeHistoryToCursorV1(program, compacted, 3);
  expect(actual).toEqual(reference(program, compacted, 3));
  expect(actual.session.archives).toBe(compacted.archives);
  expect(api.validateRuntimeHistorySessionV1(program, actual.session)).toEqual([]);
});

it('keeps every compensation in reverse execution order', () => {
  const program: RuntimeProgramV1 = { schemaVersion: 1, irVersion: '1.0.0', projectId: 'compensation', entrySceneId: 'main', scenes: [{ sceneId: 'main', instructions: [
    { instructionId: 'background', opcode: 'direction', operands: { command: 'background', parameters: { action: 'set', asset: 'bg', effectPolicy: 'reversible', compensationKind: 'background.restore', replayKey: 'replay.background' } } },
    { instructionId: 'line', opcode: 'narration', operands: { textId: 'text', text: 'After effect' } }
  ] }] };
  const initial = api.createRuntimeState(program, { buildId: 'build', executionId: 'execution' }); if (!initial.ok) throw Error('fixture');
  let history = api.createRuntimeHistorySessionV1(program, initial.state).session;
  for (let index = 0; index < 2; index++) history = api.advanceRuntimeHistoryV1(program, history).session;
  const actual = api.backRuntimeHistoryToCursorV1(program, history, 0);
  expect(actual).toEqual(reference(program, history, 0));
  expect(actual.navigationPlans.flatMap(step => step.plan.compensations)).toMatchObject([{ descriptorId: 'background', compensation: { kind: 'background.restore' } }]);
});

it('stops at the same committed barrier after preserving prior successful moves', () => {
  const program: RuntimeProgramV1 = { schemaVersion: 1, irVersion: '1.0.0', projectId: 'barrier', entrySceneId: 'main', scenes: [{ sceneId: 'main', instructions: [
    { instructionId: 'published', opcode: 'direction', operands: { command: 'background', parameters: { action: 'set', asset: 'bg', effectPolicy: 'barrier', barrierReason: 'Published externally' } } },
    { instructionId: 'line1', opcode: 'narration', operands: { textId: 'text1', text: 'One' } },
    { instructionId: 'line2', opcode: 'narration', operands: { textId: 'text2', text: 'Two' } }
  ] }] };
  const initial = api.createRuntimeState(program, { buildId: 'build', executionId: 'execution' }); if (!initial.ok) throw Error('fixture');
  const pending = api.advanceRuntimeHistoryV1(program, api.createRuntimeHistorySessionV1(program, initial.state).session), barrier = pending.state.pendingBarrier!;
  let history = api.advanceRuntimeHistoryV1(program, pending.session, { input: { schemaVersion: 1, kind: 'barrierApproved', inputId: 'approved', executionId: pending.state.executionId, expectedStateRevision: pending.state.stateRevision, logicalSequence: barrier.logicalSequence, requestId: barrier.requestId, descriptorId: barrier.descriptorId } }).session;
  for (let index = 0; index < 2; index++) history = api.advanceRuntimeHistoryV1(program, history).session;
  const actual = api.backRuntimeHistoryToCursorV1(program, history, 0);
  expect(actual).toEqual(reference(program, history, 0));
  expect(actual.navigationPlans).toHaveLength(2);
  expect(actual.diagnostics[0]?.code).toBe('RUNTIME_BARRIER_BLOCKED');
  expect(actual.barrierBlock?.reason).toBe('Published externally');
});
