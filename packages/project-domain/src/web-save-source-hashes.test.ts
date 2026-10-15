import { afterEach, describe, expect, it, vi } from 'vitest';
import * as codec from './codec';
import { createProjectTemplate } from './project-lifecycle';
import type { CanonicalProject, JsonObject } from './types';
import { readWebSaveCompatibility, verifiedWebSaveSourceHashes, webProjectAtPublicationVersion, webSaveCompatibilityFingerprint } from './web-save-compatibility';

function project(): CanonicalProject {
  const base = createProjectTemplate('内部标题 雨😀', '018f08d8-71a1-7bc2-a627-2f4a843ee151');
  return { ...base, manifest: { ...base.manifest, preservedFields: {
    unknown: { text: '\"\\\n雨', fields: [null, true, 1.5] },
    webAssetSources: { privateEvidence: 'NOT PUBLIC' },
    webPublication: { schemaVersion: 1, name: '玩家标题 雨😀', version: 'next', iconAssetId: '', unknown: ['kept'] }
  } } };
}
function withReceipt(value: CanonicalProject, versions: readonly string[]): CanonicalProject {
  return { ...value, manifest: { ...value.manifest, preservedFields: { ...value.manifest.preservedFields,
    webSaveCompatibility: { schemaVersion: 1, fingerprint: webSaveCompatibilityFingerprint(value), versions: [...versions] }
  } } };
}
afterEach(() => vi.restoreAllMocks());

describe('verified Web version source hashes', () => {
  it.each([1, 8, 32])('preserves complete independently serialized identities for %i versions using one file serialization', count => {
    const versions = Array.from({ length: count }, (_, index) => `1.0.${index}`), value = withReceipt(project(), versions);
    const expected = versions.map(version => codec.semanticHash(webProjectAtPublicationVersion(value, version)));
    const before = codec.saveProject(value), save = vi.spyOn(codec, 'saveProject');
    expect(verifiedWebSaveSourceHashes(value)).toEqual(expected);
    expect(save).toHaveBeenCalledTimes(1);
    expect(codec.saveProject(value)).toEqual(before);
  });
  it('uses full-source overwrite semantics for non-canonical aliased manifest paths', () => {
    const base = project(), aliased = { ...base, manifest: { ...base.manifest, assetsPath: codec.PROJECT_MANIFEST_PATH } };
    const value = withReceipt(aliased, ['old', 'older']);
    expect(readWebSaveCompatibility(value).status).toBe('verified');
    expect(verifiedWebSaveSourceHashes(value)).toEqual(['old', 'older'].map(version => codec.semanticHash(webProjectAtPublicationVersion(value, version))));
  });
  it('does not reuse a receipt or serialized source after an in-place edit', () => {
    const value = withReceipt(project(), ['old']), before = verifiedWebSaveSourceHashes(value);
    const fields = value.assets as unknown as { preservedFields: JsonObject };
    fields.preservedFields = { changed: 'new content' };
    expect(readWebSaveCompatibility(value).status).toBe('stale');
    expect(verifiedWebSaveSourceHashes(value)).toEqual([]);
    const renewed = withReceipt(value, ['old']);
    expect(verifiedWebSaveSourceHashes(renewed)).not.toEqual(before);
    expect(verifiedWebSaveSourceHashes(renewed)).toEqual([codec.semanticHash(webProjectAtPublicationVersion(renewed, 'old'))]);
  });
  it('omits only receipt/private evidence; title normalization, public credits and unknown source fields stay authoritative', () => {
    const base = withReceipt(project(), ['old']), expected = verifiedWebSaveSourceHashes(base);
    const privateChange = { ...base, manifest: { ...base.manifest, preservedFields: { ...base.manifest.preservedFields, webAssetSources: { otherPrivateEvidence: 'not identity' } } } };
    expect(verifiedWebSaveSourceHashes(privateChange)).toEqual(expected);
    for (const fields of [{ webCredits: { acknowledgements: 'public' } }, { unknown: 'changed' }]) {
      const changed = { ...base, manifest: { ...base.manifest, preservedFields: { ...base.manifest.preservedFields, ...fields } as JsonObject } };
      expect(verifiedWebSaveSourceHashes(changed)).toEqual([]);
    }
    const exported = { ...base, manifest: { ...base.manifest, title: '玩家标题 雨😀' } };
    expect(readWebSaveCompatibility(exported).status).toBe('verified');
    expect(verifiedWebSaveSourceHashes(exported)).toEqual([codec.semanticHash(webProjectAtPublicationVersion(exported, 'old'))]);
  });
  it.each([
    undefined, null, {}, { schemaVersion: 2, fingerprint: '0'.repeat(64), versions: ['old'] },
    { schemaVersion: 1, fingerprint: 'bad', versions: ['old'] },
    { schemaVersion: 1, fingerprint: '0'.repeat(64), versions: [] },
    { schemaVersion: 1, fingerprint: '0'.repeat(64), versions: ['old', 'old'] },
    { schemaVersion: 1, fingerprint: '0'.repeat(64), versions: ['../bad'] },
    { schemaVersion: 1, fingerprint: '0'.repeat(64), versions: Array.from({ length: 33 }, (_, i) => `v${i}`) },
    { schemaVersion: 1, fingerprint: '0'.repeat(64), versions: ['old'], callerBuildId: 'never-trusted' }
  ])('rejects an unchecked or malformed receipt without serializing files (%#)', receipt => {
    const base = project(), fields = { ...base.manifest.preservedFields };
    if (receipt !== undefined) fields.webSaveCompatibility = receipt as JsonObject;
    const value = { ...base, manifest: { ...base.manifest, preservedFields: fields } }, save = vi.spyOn(codec, 'saveProject');
    expect(verifiedWebSaveSourceHashes(value)).toEqual([]);
    expect(save).not.toHaveBeenCalled();
  });
  it('rejects a structurally valid forged fingerprint and missing publication without accepting caller identities', () => {
    const base = withReceipt(project(), ['old']);
    const fields: JsonObject = { ...base.manifest.preservedFields, webSaveCompatibility: { schemaVersion: 1, fingerprint: '0'.repeat(64), versions: ['old'] } };
    expect(verifiedWebSaveSourceHashes({ ...base, manifest: { ...base.manifest, preservedFields: fields } })).toEqual([]);
    const { webPublication: _publication, ...missingPublication } = fields;
    expect(verifiedWebSaveSourceHashes({ ...base, manifest: { ...base.manifest, preservedFields: missingPublication } })).toEqual([]);
  });
});
