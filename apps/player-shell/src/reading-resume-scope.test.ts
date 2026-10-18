import { expect, it } from 'vitest';
import { createPlayerCore, startPlayerCore, type PlayerCoreState } from '@world-studio/player-core';
import { loadProject, migrateS0Project, type S0Project } from '@world-studio/project-domain';
import tiny from '../../../fixtures/projects/tiny/project.s0.json';
import { ReadingResumeScope, sameReadingRuntimeExceptMeta } from './reading-resume-scope';

const project = loadProject(migrateS0Project(tiny as S0Project).files), runtime = startPlayerCore(createPlayerCore(project), project).runtimeState!;
const hash = (n: number) => n.toString(16).padStart(64, '0');
const owner = (n = 1) => ({ paragraph: 'same-paragraph', context: { projectId: runtime.projectId, buildId: runtime.buildId, runtimeStateHash: hash(n), locale: 'zh-CN', textHash: hash(99) }, runtime: n === 1 ? runtime : { ...runtime, metaProgress: { ...runtime.metaProgress, readTextIds: ['a', String(n)] } } });
it('keeps one scope and the original source when only formal Meta changes', () => {
  const scope = new ReadingResumeScope(), a = owner(), id = scope.track(a), b = owner(2); expect(scope.track(b)).toBe(id); expect(scope.sources(b).map(row => row.runtimeStateHash)).toEqual([hash(2), hash(1)]); expect(sameReadingRuntimeExceptMeta(a.runtime, b.runtime)).toBe(true);
});
it('does not multiply aliases on identical rerenders', () => {
  const scope = new ReadingResumeScope(), a = owner(), id = scope.track(a); for (let i = 0; i < 30; i++) expect(scope.track(a)).toBe(id); expect(scope.sources(a)).toEqual([a.context]);
});
it('pins an explicitly validated saved hash but still starts a fresh load scope', () => {
  const scope = new ReadingResumeScope(), a = owner(), id = scope.track(a), b = owner(2); expect(scope.track(b, hash(40))).not.toBe(id); expect(scope.sources(b).map(row => row.runtimeStateHash)).toEqual([hash(2), hash(40)]);
});
it('bounds repeated Meta changes to eight sources while preserving the original and newest hashes', () => {
  const scope = new ReadingResumeScope(); scope.track(owner()); for (let i = 2; i <= 30; i++) scope.track(owner(i)); const sources = scope.sources(owner(30));
  expect(sources).toHaveLength(8); expect(sources[0]!.runtimeStateHash).toBe(hash(30)); expect(sources[1]!.runtimeStateHash).toBe(hash(1)); expect(new Set(sources.map(row => row.runtimeStateHash)).size).toBe(8); expect(scope.sources(owner(31))).toHaveLength(8);
});
it.each(['projectId', 'buildId', 'locale', 'textHash'] as const)('does not alias a different %s even with shared Runtime references', key => {
  const scope = new ReadingResumeScope(), a = owner(), id = scope.track(a), b = { ...owner(2), context: { ...owner(2).context, [key]: 'different' } };
  expect(scope.track(b)).not.toBe(id); expect(scope.sources(b)).toEqual([b.context]);
});
it('starts a new scope after a paragraph/history boundary or explicit clear', () => {
  const scope = new ReadingResumeScope(), a = owner(), first = scope.track(a), b = { ...owner(2), paragraph: 'another-paragraph' }; expect(scope.track(b)).not.toBe(first); scope.clear(); expect(scope.id).toBeNull(); expect(scope.track(a)).not.toBe(first); expect(scope.sources(a)).toEqual([a.context]);
});
it.each(['variables', 'cursor', 'executionId', 'pendingChoice', 'audioState'] as const)('does not alias changed non-Meta %s state', key => {
  const scope = new ReadingResumeScope(), a = owner(), id = scope.track(a), b = owner(2);
  const value = key === 'executionId' ? 'different' : key === 'pendingChoice' ? {} : { ...b.runtime[key] as object };
  const changed = { ...b, runtime: { ...b.runtime, [key]: value } as NonNullable<PlayerCoreState['runtimeState']> };
  expect(sameReadingRuntimeExceptMeta(a.runtime, changed.runtime)).toBe(false); expect(scope.track(changed)).not.toBe(id); expect(scope.sources(changed)).toEqual([changed.context]);
});
it('never treats missing Runtime state as a Meta-only continuation', () => {
  expect(sameReadingRuntimeExceptMeta(null, null)).toBe(false); expect(sameReadingRuntimeExceptMeta(runtime, null)).toBe(false);
});
it('rejects a changed Runtime shape rather than ignoring unknown non-Meta fields', () => {
  expect(sameReadingRuntimeExceptMeta(runtime, { ...runtime, extra: true } as typeof runtime)).toBe(false);
});
it('does not expose prior aliases to an unrelated owner before the next layout tracks it', () => {
  const scope = new ReadingResumeScope(); scope.track(owner()); scope.track(owner(2)); const other = { ...owner(3), paragraph: 'new-paragraph' }; expect(scope.sources(other)).toEqual([other.context]);
});
