import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectBrowserMemory } from './player-process-memory.mjs';
const row = (pid, parent) => ({ ProcessId: pid, ParentProcessId: parent, StartedAt:pid*10, WorkingSetSize: '100', PrivatePageCount: '50' });
test('memory sampler selects browser descendants regardless of enumeration order', () => {
  const result = selectBrowserMemory([row(3, 2), row(9, 8), row(2, 1), row(1, 0)], 1);
  assert.deepEqual(result.processes.map(item => item.pid), [3, 2, 1]);
  assert.equal(result.workingSetBytes, 300); assert.equal(result.privateBytes, 150);
});
test('memory sampler rejects missing browser, invalid PID and invalid counters', () => {
  assert.throws(() => selectBrowserMemory([], 1));
  assert.throws(() => selectBrowserMemory([], -1));
  assert.throws(() => selectBrowserMemory([{ ...row(1, 0), PrivatePageCount: 'NaN' }], 1));
  assert.throws(() => selectBrowserMemory([{ ...row(1, 0), WorkingSetSize: null }], 1));
  assert.throws(() => selectBrowserMemory([row(1, 0), row(1, 0)], 1));
  assert.throws(() => selectBrowserMemory([{...row(1,0),StartedAt:undefined}],1));
});
test('memory sampler excludes older survivors whose parent PID was reused by the browser tree',()=>{
  const survivor={...row(10,2),StartedAt:5,WorkingSetSize:'900000000',PrivatePageCount:'900000000'};
  const child={...row(11,10),StartedAt:6};
  const result=selectBrowserMemory([child,survivor,row(3,2),row(2,1),row(1,0)],1);
  assert.deepEqual(result.processes.map(item=>item.pid),[3,2,1]);assert.equal(result.workingSetBytes,300);
  assert.equal(result.identityPolicy,'parent-chain-and-creation-time');
});
