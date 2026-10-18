import { expect, it } from 'vitest';
import { createRuntimeState, runRuntime, traceRuntimeSceneEntriesV1 } from './runtime';
import type { RuntimeProgramV1 } from './types';
const program: RuntimeProgramV1 = { schemaVersion: 1, irVersion: '1.0.0', projectId: 'trace', entrySceneId: 'start', scenes: [
  { sceneId: 'start', instructions: [{ instructionId: 'to_target', opcode: 'call', operands: { targetSceneId: 'target' } }] },
  { sceneId: 'target', instructions: [{ instructionId: 'line', opcode: 'narration', operands: { textId: 'text', text: 'Target' } }, { instructionId: 'end', opcode: 'end', operands: { endingId: 'done', name: 'Done' } }] }
] };
it('captures the pre-instruction entry and actual call stack without changing formal execution', () => {
  const initial = createRuntimeState(program, { buildId: 'build', executionId: 'run' }); if (!initial.ok) throw Error('fixture');
  const trace = traceRuntimeSceneEntriesV1(program, initial.state), { sceneEntries, ...ordinary } = trace;
  expect(ordinary).toEqual(runRuntime(program, initial.state)); expect(sceneEntries.map(s => s.cursor.sceneId)).toEqual(['start', 'target']);
  expect(sceneEntries[1]!.cursor.instructionIndex).toBe(0); expect(sceneEntries[1]!.callStack).toEqual([{ sceneId: 'start', instructionIndex: 1 }]); expect(sceneEntries[1]!.metaProgress.readTextIds).toEqual([]);
});
it('retains the existing instruction budget and diagnostics', () => {
  const initial = createRuntimeState(program, { buildId: 'build', executionId: 'run' }); if (!initial.ok) throw Error('fixture');
  const { sceneEntries, ...ordinary } = traceRuntimeSceneEntriesV1(program, initial.state, { instructionBudget: 1 });
  expect(ordinary).toEqual(runRuntime(program, initial.state, { instructionBudget: 1 })); expect(ordinary.diagnostics[0]?.code).toBe('RUNTIME_BUDGET_EXCEEDED'); expect(sceneEntries).toHaveLength(1);
});
