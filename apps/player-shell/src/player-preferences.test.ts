import { afterEach, expect, it, vi } from 'vitest';
import { createGalSettingsApplicationV1, createGalSettingsDocument, galAudioGainV1, withProjectSettings } from '@world-studio/gal-settings';
import { applyPlayerPreferences, DEFAULT_PLAYER_PREFERENCES, parsePlayerPreferences, readPlayerPreferences, storePlayerPreferences } from './player-preferences';
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });
it('keeps authored settings and geometry intact while composing personal text and six audio gains', () => {
  const base = createGalSettingsApplicationV1(withProjectSettings(createGalSettingsDocument(), { text: { fontScale: 1.2 }, audio: { master: .8, bgm: .5 } }), 'web');
  const before = JSON.stringify(base), applied = applyPlayerPreferences(base, { ...DEFAULT_PLAYER_PREFERENCES, fontScale: 1.25, revealSpeed: 2, audio: { ...DEFAULT_PLAYER_PREFERENCES.audio, master: .5, bgm: .4 } });
  expect(applied.text.fontScale).toBe(1.5); expect(applied.text.charactersPerSecond).toBe(base.text.charactersPerSecond * 2);
  expect(galAudioGainV1(applied, 'bgm', .5)).toBeCloseTo(.04); expect(JSON.stringify(base)).toBe(before); expect(applied.display).toBe(base.display); expect(applied.history).toBe(base.history);
});
it('mutes without changing bus settings or overriding project accessibility requirements', () => {
  const base = createGalSettingsApplicationV1(withProjectSettings(createGalSettingsDocument(), { accessibility: { reduceMotion: true, highContrast: true } }), 'web');
  const applied = applyPlayerPreferences(base, { ...DEFAULT_PLAYER_PREFERENCES, muted: true });
  expect(galAudioGainV1(applied, 'voice')).toBe(0); expect(applied.accessibility.reduceMotion).toBe(true); expect(applied.accessibility.highContrast).toBe(true);
});
it('validates stored versions, enums, finite values and all channels, and ignores foreign fields', () => {
  expect(parsePlayerPreferences({ ...DEFAULT_PLAYER_PREFERENCES, schemaVersion: 2 })).toBe(DEFAULT_PLAYER_PREFERENCES);
  expect(parsePlayerPreferences({ ...DEFAULT_PLAYER_PREFERENCES, fontScale: NaN })).toBe(DEFAULT_PLAYER_PREFERENCES);
  expect(parsePlayerPreferences({ ...DEFAULT_PLAYER_PREFERENCES, audio: { master: 1 } })).toBe(DEFAULT_PLAYER_PREFERENCES);
  expect(parsePlayerPreferences({ ...DEFAULT_PLAYER_PREFERENCES, revealMode: 'fast' })).toBe(DEFAULT_PLAYER_PREFERENCES);
  expect(parsePlayerPreferences({ ...DEFAULT_PLAYER_PREFERENCES, audio: null })).toBe(DEFAULT_PLAYER_PREFERENCES);
  expect(parsePlayerPreferences({ ...DEFAULT_PLAYER_PREFERENCES, runtimeState: 'foreign' })).toEqual(DEFAULT_PLAYER_PREFERENCES);
});
it('isolates projects and resets only the chosen project preference', () => {
  storePlayerPreferences('a', { ...DEFAULT_PLAYER_PREFERENCES, muted: true }); storePlayerPreferences('b', { ...DEFAULT_PLAYER_PREFERENCES, fontScale: 1.4 });
  expect(readPlayerPreferences('a').muted).toBe(true); expect(readPlayerPreferences('missing')).toBe(DEFAULT_PLAYER_PREFERENCES);
  storePlayerPreferences('a', DEFAULT_PLAYER_PREFERENCES); expect(readPlayerPreferences('a')).toEqual(DEFAULT_PLAYER_PREFERENCES); expect(readPlayerPreferences('b').fontScale).toBe(1.4);
});
it('falls back on corrupt or denied storage and reports failed writes', () => {
  localStorage.setItem('world-player:preferences:a', '{broken'); expect(readPlayerPreferences('a')).toBe(DEFAULT_PLAYER_PREFERENCES);
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw Error('denied'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('denied'); });
  expect(readPlayerPreferences('a')).toBe(DEFAULT_PLAYER_PREFERENCES); expect(storePlayerPreferences('a', DEFAULT_PLAYER_PREFERENCES)).toBe(false);
});
