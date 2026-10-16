import { afterEach, expect, it, vi } from 'vitest';
import * as api from './index';
import * as hashes from './hash';
import type { RuntimeHistorySessionV1, RuntimeProgramV1 } from './types';

function fixture(count = 15) {
  const program: RuntimeProgramV1 = { schemaVersion: 1, irVersion: '1.1.0', projectId: 'presentation', entrySceneId: 'main', scenes: [{ sceneId: 'main', instructions: [
    ...Array.from({ length: count }, (_, index) => ({ instructionId: `line${index}`, opcode: 'narration' as const, operands: { textId: `text${index}`, text: `第 ${index} 句` } })),
    ...Array.from({ length: 6 }, (_, index) => ({ instructionId: `cue${index}`, opcode: 'direction' as const, operands: { command: 'textbox', parameters: { action: 'set', template: 'adv' } } })),
    { instructionId: 'checkpoint', opcode: 'checkpoint', operands: { stepId: 'checkpoint' } },
    { instructionId: 'after', opcode: 'narration', operands: { textId: 'after', text: 'After the checkpoint' } }
  ] }] };
  const created = api.createRuntimeState(program, { buildId: 'build', executionId: 'execution' }); if (!created.ok) throw Error('fixture');
  let history = api.createRuntimeHistorySessionV1(program, created.state).session;
  for (let index = 0; index < count; index++) history = api.advanceRuntimeHistoryV1(program, history).session;
  return { program, history };
}
function reference(program: RuntimeProgramV1, history: RuntimeHistorySessionV1, maximumSteps = 50) {
  const steps: api.RuntimeHistoryAdvanceStepV1[] = []; let current = api.advanceRuntimeHistoryV1(program, history);
  for (let index = 0; index < maximumSteps; index++) {
    const { session, ...step } = current; steps.push({ ...step, cursor: session.cursor });
    if (current.diagnostics.length || current.state.pendingEffect || current.state.pendingBarrier || current.state.terminal.kind === 'ended' || current.event !== null && !['direction', 'checkpoint-reached'].includes(current.event.kind)) break;
    if (index + 1 < maximumSteps) current = api.advanceRuntimeHistoryV1(program, current.session);
  }
  return { ...current, steps };
}
afterEach(() => vi.restoreAllMocks());

it('matches every ordered step, checkpoint hash, effects and complete saved bytes', () => {
  const { program, history } = fixture(), before = api.canonicalRuntimeStringify(history);
  const actual = api.advanceRuntimeHistoryToPresentationV1(program, history, 50), expected = reference(program, history);
  expect(actual).toEqual(expected); expect(actual.steps).toHaveLength(8);
  expect(api.createRuntimeSessionSaveV1(program, actual.session)).toEqual(api.createRuntimeSessionSaveV1(program, expected.session));
  expect(api.canonicalRuntimeStringify(history)).toBe(before);
});
it('checks each old checkpoint once and hashes every newly appended checkpoint', () => {
  const { program, history } = fixture(30), hash = vi.spyOn(hashes, 'runtimeStateHashV1');
  const actual = api.advanceRuntimeHistoryToPresentationV1(program, history, 50);
  expect(actual.diagnostics).toEqual([]); expect(hash).toHaveBeenCalledTimes(31 + 8);
});
it('revalidates old checkpoints on the next action and rejects invalid step bounds', () => {
  const { program, history } = fixture();
  for (const bound of [0, -1, 1.5, NaN, 10001]) expect(api.advanceRuntimeHistoryToPresentationV1(program, history, bound)).toMatchObject({ session: history, steps: [], diagnostics: [{ code: 'RUNTIME_HISTORY_INVALID' }] });
  const advanced = api.advanceRuntimeHistoryToPresentationV1(program, history, 50);
  (advanced.session.checkpoints[0]!.state as { buildId: string }).buildId = 'changed';
  expect(api.advanceRuntimeHistoryToPresentationV1(program, advanced.session, 50)).toMatchObject({ steps: [], diagnostics: [{ code: 'RUNTIME_HISTORY_INVALID' }] });
});
it('preserves partial internal steps at a budget or recorded-future boundary', () => {
  const { program, history } = fixture();
  expect(api.advanceRuntimeHistoryToPresentationV1(program, history, 3)).toEqual(reference(program, history, 3));
  const advanced = api.advanceRuntimeHistoryToPresentationV1(program, history, 50), backed = api.backRuntimeHistoryV1(program, advanced.session);
  expect(api.advanceRuntimeHistoryToPresentationV1(program, backed.session, 50)).toEqual(reference(program, backed.session));
  expect(api.advanceRuntimeHistoryToPresentationV1(program, history, 50, { instructionBudget: 0 }).session).toBe(history);
});
it('stops at an awaited effect and accepts its input only on the first following step', () => {
  const { program: base } = fixture(0), first = base.scenes[0]!;
  const program = { ...base, scenes: [{ ...first, instructions: [{ instructionId: 'await', opcode: 'direction' as const, operands: { command: 'background', parameters: { action: 'set', asset: 'bg', awaitMode: 'awaited' } } }, ...first.instructions] }] };
  const created = api.createRuntimeState(program, { buildId: 'build', executionId: 'execution' }); if (!created.ok) throw Error('fixture');
  const pending = api.advanceRuntimeHistoryToPresentationV1(program, api.createRuntimeHistorySessionV1(program, created.state).session, 50), effect = pending.state.pendingEffect!;
  expect(pending.steps).toHaveLength(1); expect(effect).not.toBeNull();
  const input: api.RuntimeInputV1 = { schemaVersion: 1, kind: 'effectCompleted', inputId: 'completed', executionId: 'execution', expectedStateRevision: pending.state.stateRevision, logicalSequence: effect.logicalSequence, effectId: effect.effectId, replayKey: effect.replayKey };
  const actual = api.advanceRuntimeHistoryToPresentationV1(program, pending.session, 50, { input });
  expect(actual.diagnostics).toEqual([]); expect(actual.event?.kind).toBe('narration');
  expect(actual.session.entries.filter(entry => entry.input?.inputId === input.inputId)).toHaveLength(1);
  expect(api.validateRuntimeHistorySessionV1(program, actual.session)).toEqual([]);
});
