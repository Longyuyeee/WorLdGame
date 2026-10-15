import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pollBrowserState } from './poll-browser-state.mjs';
test('awaits resolved false and returns only the later positive snapshot', async () => {
  let calls = 0;
  const page = { evaluate: async () => ++calls < 3 ? false : { active: 0, protectedHash: 'current' } };
  assert.deepEqual(await pollBrowserState(page, () => {}, null, { intervalMs: 1 }), { active: 0, protectedHash: 'current' });
  assert.equal(calls, 3);
});
test('a never-ready asynchronous result times out instead of passing', async () => {
  await assert.rejects(pollBrowserState({ evaluate: async () => false }, () => {}, null, { timeoutMs: 10, intervalMs: 1 }), /did not become true/);
});
test('propagates browser read failures rather than accepting them', async () => {
  await assert.rejects(pollBrowserState({ evaluate: async () => { throw new Error('database'); } }, () => {}), /database/);
});
