import { describe, expect, it } from 'vitest';
import { createProjectFileRehasher, semanticHashProjectFiles } from './codec';

describe('canonical per-file digest snapshot', () => {
  it.each(['a.json', 'world.project.json', 'z.json', '2', '10', '__proto__', '"\\雨😀'])('preserves the full canonical hash replacing %j before, between and after other paths', key => {
    const files = Object.fromEntries([['z.json', '{"tail":"雨😀"}'], [key, 'old'], ['a.json', '"world.project.json": NOT A KEY'], ['10', 'ten'], ['2', 'two']]);
    const snapshot = { ...files }, rehash = createProjectFileRehasher(files, key);
    for (const source of ['', 'new', '\"\\\n雨😀\ud800', 'long'.repeat(1024)]) expect(rehash(source)).toBe(semanticHashProjectFiles({ ...snapshot, [key]: source }));
    files['z.json'] = 'later mutation'; files[key] = 'later mutation';
    expect(rehash('new')).toBe(semanticHashProjectFiles({ ...snapshot, [key]: 'new' }));
  });
  it('rejects a missing or inherited file instead of hashing a different set of paths', () => {
    expect(() => createProjectFileRehasher({}, 'missing')).toThrow('Missing project file');
    expect(() => createProjectFileRehasher({}, 'toString')).toThrow('Missing project file');
  });
});
