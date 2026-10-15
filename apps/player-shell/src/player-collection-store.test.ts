import { afterEach, expect, it, vi } from 'vitest';
import { collectionKey, readPlayerCollection, storePlayerCollection } from './player-collection-store';
const progress = { schemaVersion: 1 as const, projectId: 'story', progressScopeId: 'player', readTextIds: ['a'], unlockedGalleryAssetIds: ['art'], reachedEndingIds: ['left'] };
afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });
it('stores a monotonic union and keeps builds and projects separate', () => {
  storePlayerCollection(localStorage, 'story', 'build', progress); const merged = storePlayerCollection(localStorage, 'story', 'build', { ...progress, readTextIds: ['b'], reachedEndingIds: ['right'] });
  expect(merged.readTextIds).toEqual(['a', 'b']); expect(merged.reachedEndingIds).toEqual(['left', 'right']); expect(readPlayerCollection(localStorage, 'story', 'build')).toEqual(merged);
  expect(readPlayerCollection(localStorage, 'story', 'new-build')).toBeNull(); expect(readPlayerCollection(localStorage, 'other', 'build')).toBeNull();
});
it('retains an unreadable record instead of overwriting it', () => {
  localStorage.setItem(collectionKey('story', 'build'), 'corrupt'); expect(() => storePlayerCollection(localStorage, 'story', 'build', progress)).toThrow(); expect(localStorage.getItem(collectionKey('story', 'build'))).toBe('corrupt');
});
it('rejects the wrong identity, malformed sets and storage write failures', () => {
  expect(() => storePlayerCollection(localStorage, 'other', 'build', progress)).toThrow(); expect(() => storePlayerCollection(localStorage, 'story', 'build', { ...progress, readTextIds: ['b', 'a'] })).toThrow();
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('quota'); }); expect(() => storePlayerCollection(localStorage, 'story', 'build', progress)).toThrow('quota');
});
