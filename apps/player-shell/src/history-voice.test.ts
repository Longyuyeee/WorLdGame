import { expect, it } from 'vitest';
import { advancePlayerCore, backPlayerCore, compactPlayerCoreHistoryV1, createPlayerCore, startPlayerCore } from '@world-studio/player-core';
import { createPlayerMediaMultichannelDemoV1 } from './media-demo';
import { historyVoiceReferences } from './history-voice';

function fixture() {
  const demo = createPlayerMediaMultichannelDemoV1(), script = demo.project.scripts.media_stage!;
  const project = { ...demo.project, scripts: { ...demo.project.scripts, media_stage: { ...script, statements: [
    { id: 'voice_a', kind: 'direction' as const, command: 'audio', summary: 'action=play asset=media_theme bus=voice volume=0.6' },
    { id: 'one', kind: 'narration' as const, textId: 'one_text', text: '第一句' },
    { id: 'stop', kind: 'direction' as const, command: 'audio', summary: 'action=stop bus=voice' },
    { id: 'two', kind: 'narration' as const, textId: 'two_text', text: '没有声音' },
    { id: 'bgm', kind: 'direction' as const, command: 'audio', summary: 'action=play asset=media_theme bus=bgm volume=0.1' },
    { id: 'voice_b', kind: 'direction' as const, command: 'audio', summary: 'action=play asset=media_theme bus=voice volume=0.3' },
    { id: 'three', kind: 'narration' as const, textId: 'three_text', text: '第三句' },
    { id: 'end', kind: 'end' as const, endingName: '结束' }
  ] } } };
  return { project, state: startPlayerCore(createPlayerCore(project), project) };
}
it('associates only committed voice receipts, preserving authored gain without changing history', () => {
  const { state } = fixture(), history = state.historySession!, before = JSON.stringify(history), references = historyVoiceReferences(history);
  expect([...references.values()]).toMatchObject([{ assetId: 'media_theme', volume: .6 }]); expect(JSON.stringify(history)).toBe(before);
});
it('honors a formal stop and never uses the music channel as voice', () => {
  const { state } = fixture(), second = advancePlayerCore(state), references = historyVoiceReferences(second.historySession);
  expect(references.has(second.historySession!.entries.at(-1)!.entryId)).toBe(false); expect(references.size).toBe(1);
});
it('distinguishes two receipts using the same source rather than attaching the live voice everywhere', () => {
  const { state } = fixture(), third = advancePlayerCore(advancePlayerCore(state));
  expect([...historyVoiceReferences(third.historySession).values()].map(row => row.volume)).toEqual([.6, .3]);
});
it('does not expose recorded future audio after a rollback', () => {
  const { state } = fixture(), third = advancePlayerCore(advancePlayerCore(state)), backed = backPlayerCore(third), future = third.historySession!.entries.at(-1)!;
  expect(backed.historySession!.cursor).toBeLessThan(third.historySession!.cursor); expect(historyVoiceReferences(backed.historySession).has(future.entryId)).toBe(false);
});
it('does not guess a released prefix or archive association, and accepts an empty history', () => {
  expect(historyVoiceReferences(null).size).toBe(0);
  const { state } = fixture(), third = advancePlayerCore(advancePlayerCore(state)), compacted = compactPlayerCoreHistoryV1(third, 1);
  const references = historyVoiceReferences(compacted.historySession); expect([...references.values()].every(row => row.volume === .3)).toBe(true);
  for (const archive of compacted.historySession!.archives) for (const row of archive.entries) expect(references.has(row.originalEntryId)).toBe(false);
});
it('matches stage gain interpretation for both numeric and legacy string permille receipts', () => {
  const { state } = fixture(), history = state.historySession!;
  for (const volumePermille of [250, '250']) {
    const entries = history.entries.map(entry => ({ ...entry, effects: entry.effects.map(effect => { const { volume: _volume, ...payload } = effect.payload; return { ...effect, payload: { ...payload, volumePermille } }; }) }));
    expect([...historyVoiceReferences({ ...history, entries }).values()][0]!.volume).toBe(.25);
  }
});
