import { afterEach, expect, it, vi } from 'vitest';
import { loadProject, migrateS0Project, type S0Project } from '@world-studio/project-domain';
import { createPlayerCore, dispatchPlayerCoreIntentV1 } from '@world-studio/player-core';
import branching from '../../../fixtures/projects/branching/project.s0.json';
import { readPlayerReplayArchive, storePlayerReplayArchive } from './player-replay-store';
afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });
function route(left: boolean) {
  const project = loadProject(migrateS0Project(branching as S0Project).files); let state = createPlayerCore(project);
  for (let i = 0; i < 20 && state.status !== 'ended'; i++) state = dispatchPlayerCoreIntentV1(state, project, state.status === 'waiting-choice' ? { kind: 'select-choice', optionId: left ? 'branch_left_option' : 'branch_right_option' } : { kind: 'primary' });
  return state;
}
it('merges independently played routes and reads their validated entrances', () => {
  const left = route(true), right = route(false); storePlayerReplayArchive(localStorage, left); storePlayerReplayArchive(localStorage, right);
  const entries = readPlayerReplayArchive(localStorage, left); expect(entries.map(item => item.sceneId)).toEqual(expect.arrayContaining(['branch_left', 'branch_right']));
  expect(readPlayerReplayArchive(localStorage, { ...left, projectId: 'another' })).toEqual([]);
});
it('retains damaged data and refuses to overwrite it on retry', () => {
  const state = route(true); storePlayerReplayArchive(localStorage, state); const storageKey = localStorage.key(0)!; localStorage.setItem(storageKey, 'corrupt');
  expect(() => storePlayerReplayArchive(localStorage, state)).toThrow(); expect(localStorage.getItem(storageKey)).toBe('corrupt');
});
it('rejects altered entries and reports storage write failures', () => {
  const state = route(true); expect(() => storePlayerReplayArchive(localStorage, { ...state, replayEntries: [{ ...state.replayEntries[0]!, checksum: 'invalid' }] })).toThrow();
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('quota'); }); expect(() => storePlayerReplayArchive(localStorage, state)).toThrow('quota');
});
