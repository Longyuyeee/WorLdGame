import { readWebCredits } from './web-credits';
import type { CanonicalProject, JsonObject } from './types';

const key = 'webAssetSources';
export interface WebAssetSourceRecord {
  readonly assetId: string;
  readonly digest: string;
  readonly sourceKind: 'unknown' | 'original' | 'generated' | 'third-party';
  readonly source: string;
  readonly permission: 'pending' | 'documented' | 'replace';
  readonly evidence: string;
  readonly reviewedBy: string;
  readonly reviewedOn: string;
  /** Exact public acknowledgement requested by the source, not an internal evidence path. */
  readonly credit: string;
}
export interface WebAssetSources { readonly schemaVersion: 1; readonly records: readonly WebAssetSourceRecord[]; }
export const EMPTY_WEB_ASSET_SOURCES: WebAssetSources = { schemaVersion: 1, records: [] };
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const validReviewDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/u.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
function text(value: unknown, name: string, limit: number): string {
  if (typeof value !== 'string' || value.length > limit) throw Error(`素材来源的${name}格式不正确（最多 ${limit} 字符）。`);
  return value.trim();
}
export function parseWebAssetSources(value: unknown): WebAssetSources {
  if (!object(value) || value.schemaVersion !== 1 || !Array.isArray(value.records) || value.records.length > 8192) throw Error('素材来源台账格式或版本不正确。');
  const seen = new Set<string>();
  const records = value.records.map((row): WebAssetSourceRecord => {
    if (!object(row)) throw Error('素材来源记录格式不正确。');
    const assetId = text(row.assetId, '素材 ID', 200), digest = text(row.digest, '文件摘要', 71);
    if (!assetId || seen.has(assetId) || !/^sha256:[a-f0-9]{64}$/u.test(digest)) throw Error('素材来源记录的 ID 重复、为空或文件摘要不正确。');
    seen.add(assetId);
    if (typeof row.sourceKind !== 'string' || !['unknown', 'original', 'generated', 'third-party'].includes(row.sourceKind) || typeof row.permission !== 'string' || !['pending', 'documented', 'replace'].includes(row.permission)) throw Error('素材来源或确认状态不正确。');
    const source = text(row.source, '来源事实', 4000), evidence = text(row.evidence, '确认依据', 4000), reviewedBy = text(row.reviewedBy, '确认人', 120), reviewedOn = text(row.reviewedOn, '确认日期', 10), credit = text(row.credit, '公开署名', 2000);
    if (reviewedOn && !validReviewDate(reviewedOn)) throw Error('请填写有效的确认日期（YYYY-MM-DD）。');
    if (row.permission === 'documented' && (!source || row.sourceKind === 'unknown' || !evidence || !reviewedBy || !reviewedOn)) throw Error('记录确认依据前，请补齐来源类型、来源事实、依据、确认人和日期。');
    return { assetId, digest, sourceKind: row.sourceKind as WebAssetSourceRecord['sourceKind'], source, permission: row.permission as WebAssetSourceRecord['permission'], evidence, reviewedBy, reviewedOn, credit };
  });
  return { schemaVersion: 1, records };
}
export function readWebAssetSources(project: CanonicalProject): WebAssetSources {
  const value = project.manifest.preservedFields?.[key];
  return value === undefined ? EMPTY_WEB_ASSET_SOURCES : parseWebAssetSources(value);
}
export function applyWebAssetSources(project: CanonicalProject, value: WebAssetSources): CanonicalProject {
  const parsed = parseWebAssetSources(value);
  return { ...project, manifest: { ...project.manifest, preservedFields: { ...project.manifest.preservedFields, [key]: parsed as unknown as JsonObject } } };
}
/** Internal evidence/contact details stay in the editable source, never in player payloads or build identity. */
export function withoutWebAuthoringMetadata(project: CanonicalProject): CanonicalProject {
  if (project.manifest.preservedFields?.[key] === undefined) return project;
  const { [key]: _sources, ...fields } = project.manifest.preservedFields;
  const { preservedFields: _old, ...manifest } = project.manifest;
  return { ...project, manifest: Object.keys(fields).length ? { ...manifest, preservedFields: fields } : manifest };
}
export function newWebAssetSourceRecord(assetId: string, digest: string): WebAssetSourceRecord {
  return { assetId, digest, sourceKind: 'unknown', source: '', permission: 'pending', evidence: '', reviewedBy: '', reviewedOn: '', credit: '' };
}
export type WebAssetSourceStatus = 'missing' | 'stale' | 'pending' | 'replace' | 'credit-missing' | 'documented';
export const WEB_ASSET_SOURCE_STATUS: Record<WebAssetSourceStatus, string> = { missing: '未填写来源', stale: '文件已更换，需重核', pending: '待确认发行条件', replace: '需要替换素材', 'credit-missing': '公开署名未补齐', documented: '已记录确认依据' };
export function includesWebAssetCredit(acknowledgements: string, credit: string): boolean {
  const normalize = (text: string) => text.replaceAll('\r\n', '\n').trim();
  return !credit.trim() || (`\n\n${normalize(acknowledgements)}\n\n`).includes(`\n\n${normalize(credit)}\n\n`);
}
export function inspectWebAssetSources(project: CanonicalProject, book = readWebAssetSources(project)) {
  const records = new Map(book.records.map(row => [row.assetId, row]));
  // Invalid public credits must not turn missing acknowledgements into a successful check.
  let acknowledgements = ''; try { acknowledgements = readWebCredits(project).acknowledgements; } catch { /* handled by publication checks */ }
  return project.assets.assets.map((asset, index) => {
    const assetId = String(asset.assetId ?? asset.id ?? `unknown_${index}`), name = String(asset.displayName ?? assetId);
    const source = asset.source, digest = object(source) && typeof source.digest === 'string' ? source.digest : '';
    const record = records.get(assetId) ?? null;
    const basisComplete = record && record.source.trim() && record.sourceKind !== 'unknown' && record.evidence.trim() && record.reviewedBy.trim() && validReviewDate(record.reviewedOn);
    const status: WebAssetSourceStatus = !record ? 'missing' : record.digest !== digest ? 'stale' : record.permission === 'replace' ? 'replace' : record.permission !== 'documented' || !basisComplete ? 'pending' : !includesWebAssetCredit(acknowledgements, record.credit) ? 'credit-missing' : 'documented';
    return { assetId, name, digest, record, status };
  });
}
