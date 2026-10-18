import { expect, it } from 'vitest';
import { hasUnreadBelow, readPlayerReadingPace, readingMillisecondsPerUnit, storePlayerReadingPace } from './player-reading';
it('keeps reading pace independent of Skip and permits custom host timing', () => {
  expect(readingMillisecondsPerUnit('standard', 30)).toBe(180);
  expect(readingMillisecondsPerUnit('calm', 30)).toBe(240);
  expect(readingMillisecondsPerUnit('brisk', 30)).toBe(90);
  expect(readingMillisecondsPerUnit('policy', 3)).toBe(3);
});
it('keeps valid project-scoped preferences and falls back on denied/invalid storage', () => {
  const map = new Map<string, string>(), storage = { getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => { map.set(key, value); } };
  storePlayerReadingPace(storage, 'a', 'calm'); expect(readPlayerReadingPace(storage, 'a', 'standard')).toBe('calm');
  expect(readPlayerReadingPace(storage, 'b', 'standard')).toBe('standard');
  storage.setItem('world-player:reading:a', '99'); expect(readPlayerReadingPace(storage, 'a', 'policy')).toBe('policy');
  const denied = { getItem: () => { throw Error('denied'); }, setItem: () => { throw Error('denied'); } };
  expect(readPlayerReadingPace(denied, 'a', 'standard')).toBe('standard'); expect(() => storePlayerReadingPace(denied, 'a', 'brisk')).not.toThrow();
});
it('reserves a small tolerance but not an unread screen', () => {
  expect(hasUnreadBelow({ scrollHeight: 1000, clientHeight: 300, scrollTop: 0 })).toBe(true);
  expect(hasUnreadBelow({ scrollHeight: 1000, clientHeight: 300, scrollTop: 699 })).toBe(false);
});
