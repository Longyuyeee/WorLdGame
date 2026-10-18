import { expect, it } from 'vitest';
import { createProjectTemplate, saveProject, loadProject, semanticHash } from './index';
import { applyWebAssetSources, inspectWebAssetSources, newWebAssetSourceRecord, parseWebAssetSources, readWebAssetSources, withoutWebAuthoringMetadata, includesWebAssetCredit } from './web-asset-sources';
import { applyWebCredits, DEFAULT_WEB_CREDITS } from './web-credits';
import { readWebSaveCompatibility, verifyWebSaveCompatibility, withoutWebSaveCompatibility, webProjectSourceForRuntime } from './web-save-compatibility';
const digest = `sha256:${'a'.repeat(64)}`;
const project = () => {
  const p = createProjectTemplate('来源测试', '018f08d8-71a1-7bc2-a627-2f4a843ee150');
  return { ...p, manifest: { ...p.manifest, preservedFields: { unrelated: 'keep', webPublication: { schemaVersion: 1, name: '来源测试', version: '1.0.0', iconAssetId: '' } } }, assets: { ...p.assets, assets: [{ assetId: 'image', displayName: '原图', source: { digest } }, { assetId: 'image_2', source: { digest } }] } };
};
const record = () => ({ ...newWebAssetSourceRecord('image', digest), sourceKind: 'original' as const, source: 'repo/source.svg', permission: 'documented' as const, evidence: '测试依据，并非真实授权', reviewedBy: '测试确认人', reviewedOn: '2026-10-16', credit: '素材示例：测试作者' });
it('defaults old projects to missing and roundtrips private, per-ID records without mutating source', () => {
  const base = project(), before = semanticHash(base), r = record();
  expect(readWebAssetSources(base).records).toEqual([]); expect(inspectWebAssetSources(base).map(row => row.status)).toEqual(['missing', 'missing']);
  const next = loadProject(saveProject(applyWebAssetSources(base, { schemaVersion: 1, records: [r] })));
  expect(readWebAssetSources(next).records).toEqual([r]); expect(next.manifest.preservedFields?.unrelated).toBe('keep'); expect(next.scripts).toEqual(base.scripts); expect(semanticHash(base)).toBe(before);
  expect(withoutWebAuthoringMetadata(next)).toEqual(base); expect(withoutWebAuthoringMetadata(base)).toBe(base);
});
it('never carries confirmation across file replacement or shared bytes, and requires exact public acknowledgement blocks', () => {
  let p = applyWebAssetSources(project(), { schemaVersion: 1, records: [record()] });
  expect(inspectWebAssetSources(p).map(row => row.status)).toEqual(['credit-missing', 'missing']);
  p = applyWebCredits(p, { ...DEFAULT_WEB_CREDITS, acknowledgements: `其他致谢\n\n${record().credit}` });
  expect(inspectWebAssetSources(p)[0]!.status).toBe('documented');
  expect(inspectWebAssetSources({ ...p, assets: { ...p.assets, assets: [{ ...p.assets.assets[0]!, source: { digest: `sha256:${'b'.repeat(64)}` } }] } })[0]!.status).toBe('stale');
  expect(inspectWebAssetSources(p, { schemaVersion: 1, records: [{ ...record(), permission: 'pending' }] })[0]!.status).toBe('pending');
  expect(inspectWebAssetSources(p, { schemaVersion: 1, records: [{ ...record(), permission: 'replace' }] })[0]!.status).toBe('replace');
  expect(includesWebAssetCredit('prefix ' + record().credit, record().credit)).toBe(false);
  expect(includesWebAssetCredit('one\r\n\r\ntwo', 'one\n\ntwo')).toBe(true);
});
it('rejects malformed imports, incomplete confirmations, impossible dates, oversize fields and duplicate IDs', () => {
  for (const value of [null, { schemaVersion: 2, records: [] }, { schemaVersion: 1, records: [record(), record()] }, ...[
    { digest: 'not-a-digest' }, { sourceKind: ['original'] }, { permission: ['documented'] }, { sourceKind: 'unknown' }, { source: '' }, { evidence: '' }, { reviewedBy: '' }, { reviewedOn: '' }, { reviewedOn: '2026-02-30' }, { credit: 'x'.repeat(2001) },
  ].map(patch => ({ schemaVersion: 1, records: [{ ...record(), ...patch }] }))]) expect(() => parseWebAssetSources(value)).toThrow();
  expect(() => readWebAssetSources({ ...project(), manifest: { ...project().manifest, preservedFields: { webAssetSources: { schemaVersion: 999 } } } })).toThrow();
});
it('keeps author evidence out of compiler identity and verified version receipts, but not public credit edits', () => {
  const base = project(), p = applyWebAssetSources(base, { schemaVersion: 1, records: [record()] });
  expect(webProjectSourceForRuntime(p)).toEqual(base);
  const next = verifyWebSaveCompatibility(p, base); expect(readWebSaveCompatibility(next)).toEqual({ status: 'verified', versions: ['1.0.0'] });
  expect(readWebAssetSources(withoutWebSaveCompatibility(next))).toEqual(readWebAssetSources(p));
  expect(readWebSaveCompatibility(applyWebCredits(next, { ...DEFAULT_WEB_CREDITS, acknowledgements: '新公开署名' })).status).toBe('stale');
  expect(withoutWebAuthoringMetadata(p).manifest.preservedFields).not.toHaveProperty('webAssetSources');
});
