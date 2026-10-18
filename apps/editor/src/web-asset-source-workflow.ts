import { parseWebAssetSources, type WebAssetSourceStatus, type WebAssetSources } from '@world-studio/project-domain';

export interface WebSourceReviewTarget { assetId?: string | undefined; status?: WebAssetSourceStatus | undefined; }
export const SOURCE_REVIEW_ACTIONS: Record<WebAssetSourceStatus, string> = {
  missing: '补充可核对的来源事实，未知条件保留待确认。',
  stale: '文件已更换；重新核对当前文件，不沿用旧确认。',
  pending: '核对发行条件；没有依据时保留待确认，不代替所有者确认。',
  replace: '前往素材页替换，再核对新文件来源。',
  'credit-missing': '检查准确公开署名，明确加入玩家致谢。',
  documented: '已填写依据且署名匹配；仍不是自动授权结论。',
};
export type SourceDraftField = 'sourceKind' | 'source' | 'evidence' | 'reviewedBy' | 'reviewedOn';
const basis: readonly [SourceDraftField, string][] = [['sourceKind', '来源类型'], ['source', '来源事实'], ['evidence', '确认依据'], ['reviewedBy', '确认人'], ['reviewedOn', '确认日期']];
/** Check every draft before applying any of them. The domain parser remains authoritative. */
export function sourceDraftProblems(book: WebAssetSources) {
  return book.records.flatMap(record => {
    try { parseWebAssetSources({ schemaVersion: 1, records: [record] }); return []; }
    catch (reason) {
      const missing = record.permission === 'documented' ? basis.filter(([field]) => field === 'sourceKind' ? record.sourceKind === 'unknown' : !record[field].trim()) : [];
      const field: SourceDraftField = missing[0]?.[0] ?? (record.reviewedOn ? 'reviewedOn' : 'source');
      const message = missing.length ? `请补齐${missing.map(([, label]) => label).join('、')}；尚未核实时可改回待确认，保留已填内容。` : reason instanceof Error ? reason.message : String(reason);
      return [{ assetId: record.assetId, field, message }];
    }
  });
}
export function nextPendingSource(rows: readonly { assetId: string; status: WebAssetSourceStatus }[], selected: string): string | undefined {
  const index = rows.findIndex(row => row.assetId === selected);
  for (let offset = 1; offset <= rows.length; offset++) {
    const row = rows[(index + offset) % rows.length];
    if (row && row.assetId !== selected && row.status !== 'documented') return row.assetId;
  }
  return undefined;
}
