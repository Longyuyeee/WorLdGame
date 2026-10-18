import { expect, it } from 'vitest';
import { readReadingResume, storeReadingResume, storeReadingResumeMarks, validReadingAnchor, type ReadingResumeMark } from './reading-resume-store';
const mark: ReadingResumeMark = { projectId: 'story', buildId: 'build', runtimeStateHash: 'a'.repeat(64), locale: 'zh-CN', textHash: 'b'.repeat(64), anchor: { kind: 'text', offset: 70, inset: -.5 } };
function storage() { const values = new Map<string, string>(); return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } }; }
it('writes a Meta alias batch with one read and one write while retaining unrelated recent marks', () => {
  const source = storage(); storeReadingResume(source, mark); let reads = 0, writes = 0;
  const counted = { getItem(key: string) { reads++; return source.getItem(key); }, setItem(key: string, value: string) { writes++; source.setItem(key, value); } };
  const incoming = ['c', 'd', 'e'].map(value => ({ ...mark, runtimeStateHash: value.repeat(64), anchor: { kind: 'pixel' as const, top: 900 } })); expect(storeReadingResumeMarks(counted, incoming)).toBe(true);
  expect({ reads, writes }).toEqual({ reads: 1, writes: 1 }); for (const row of incoming) expect(readReadingResume(source, row)).toEqual(row.anchor); expect(readReadingResume(source, mark)).toEqual(mark.anchor);
});
it('rejects an invalid mixed or oversized batch before modifying any cache', () => {
  const source = storage(); storeReadingResume(source, mark); const before = [...source.values.entries()];
  for (const incoming of [[], Array(9).fill(mark), [mark, { ...mark, projectId: 'other' }], [mark, { ...mark, anchor: { kind: 'pixel', top: -1 } }]]) {
    expect(storeReadingResumeMarks(source, incoming as ReadingResumeMark[])).toBe(false); expect([...source.values.entries()]).toEqual(before);
  }
});
it('deduplicates a batch using first-source priority without mutating input', () => {
  const source = storage(), first = { ...mark, anchor: { kind: 'start' as const } }, duplicate = { ...mark, anchor: { kind: 'end' as const } }, incoming = Object.freeze([first, duplicate]);
  expect(storeReadingResumeMarks(source, incoming)).toBe(true); expect(readReadingResume(source, mark)).toEqual({ kind: 'start' }); expect(duplicate.anchor).toEqual({ kind: 'end' }); expect(JSON.parse([...source.values.values()][0]!).marks).toHaveLength(1);
});
it('keeps the existing eight-mark schema and treats a rejected batch write as optional failure', () => {
  const source = storage(); for (let i = 0; i < 8; i++) storeReadingResume(source, { ...mark, runtimeStateHash: i.toString(16).padStart(64, '0') });
  expect(storeReadingResumeMarks(source, [mark])).toBe(true); expect(JSON.parse([...source.values.values()][0]!).marks).toHaveLength(8);
  const before = [...source.values.entries()]; expect(storeReadingResumeMarks({ getItem: source.getItem, setItem() { throw Error('quota'); } }, [mark])).toBe(false); expect([...source.values.entries()]).toEqual(before);
});
it('stores only bounded presentation data and restores a copy for the exact validated source', () => {
  const s = storage(); expect(storeReadingResume(s, mark)).toBe(true); const anchor = readReadingResume(s, mark); expect(anchor).toEqual(mark.anchor); expect(anchor).not.toBe(mark.anchor);
  const text = [...s.values.values()][0]!; expect(text.length).toBeLessThan(1000); expect(text).not.toContain('serializedSessionSave');
});
it.each(['projectId', 'buildId', 'runtimeStateHash', 'locale', 'textHash'] as const)('does not reuse another %s context', field => {
  const s = storage(); storeReadingResume(s, mark); expect(readReadingResume(s, { ...mark, [field]: field.includes('Hash') ? 'c'.repeat(64) : 'other' })).toBeNull();
});
it('bounds marks to eight most recently written records and updates rather than duplicates', () => {
  const s = storage(); for (let i = 0; i < 12; i++) storeReadingResume(s, { ...mark, runtimeStateHash: i.toString(16).padStart(64, '0') });
  expect(readReadingResume(s, { ...mark, runtimeStateHash: '0'.repeat(64) })).toBeNull();
  storeReadingResume(s, { ...mark, runtimeStateHash: 'b'.padStart(64, '0'), anchor: { kind: 'start' } });
  const saved = JSON.parse([...s.values.values()][0]!); expect(saved.marks).toHaveLength(8); expect(saved.marks[0].anchor).toEqual({ kind: 'start' });
});
it.each([null, { kind: 'end', extra: 1 }, { kind: 'text', offset: -1, inset: 0 }, { kind: 'text', offset: 1.5, inset: 0 }, { kind: 'text', offset: 2_000_001, inset: 0 }, { kind: 'text', offset: 1, inset: Infinity }, { kind: 'pixel', top: NaN }, { kind: 'pixel', top: 10_000_001 }])('rejects malformed or excessive anchors %j', anchor => {
  expect(validReadingAnchor(anchor)).toBe(false); expect(storeReadingResume(storage(), { ...mark, anchor } as ReadingResumeMark)).toBe(false);
});
it.each(['json', 'large', 'version', 'extra', 'foreign', 'over-budget'])('ignores corrupt %s cache without modifying it during a read', kind => {
  const s = storage(); storeReadingResume(s, mark); const key = [...s.values.keys()][0]!;
  const text = kind === 'json' ? '{' : kind === 'large' ? ' '.repeat(32769) : JSON.stringify({ schemaVersion: kind === 'version' ? 2 : 1, marks: kind === 'foreign' ? [{ ...mark, projectId: 'foreign' }] : kind === 'over-budget' ? Array(9).fill(mark) : [mark], ...(kind === 'extra' ? { unknown: 1 } : {}) });
  s.values.set(key, text); expect(readReadingResume(s, mark)).toBeNull(); expect(s.values.get(key)).toBe(text);
});
it('treats denied access and failed writes as optional cache failure', () => {
  const s = { getItem() { throw Error('denied'); }, setItem() { throw Error('quota'); } };
  expect(readReadingResume(s, mark)).toBeNull(); expect(storeReadingResume(s, mark)).toBe(false);
});
it('repairs only its own corrupt presentation cache on the next intentional write', () => {
  const s = storage(); storeReadingResume(s, mark); const key = [...s.values.keys()][0]!;
  s.values.set(key, '{broken'); s.values.set('unrelated', 'keep'); expect(storeReadingResume(s, mark)).toBe(true);
  expect(readReadingResume(s, mark)).toEqual(mark.anchor); expect(s.values.get('unrelated')).toBe('keep');
});
