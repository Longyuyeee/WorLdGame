import type { AssetKind, AssetImportInput } from '@world-studio/project-persistence';
import { inferAssetKind, WEB_ASSET_IMPORT_MAX_BYTES } from './asset-file-import';
export const BATCH_ASSET_MAX_FILES = 50;
export const BATCH_ASSET_MAX_BYTES = 512 * 1024 * 1024;
export interface BatchAssetResult { readonly status: 'success' | 'error' | 'cancelled'; readonly message: string; readonly halt?: boolean; }
export type BatchAssetMetadata = Omit<AssetImportInput, 'bytes' | 'mimeType'>;
export interface BatchAssetRow { readonly file: File; readonly assetId: string; readonly displayName: string; readonly kind: AssetKind; readonly selected: boolean; readonly state: 'ready' | 'importing' | BatchAssetResult['status']; readonly message: string; }
export function batchImportError(code: string | undefined, fallback: string): string {
  if (code === 'UNSUPPORTED_MEDIA_TYPE') return '无法识别文件格式，请选择支持的图片、音频、视频或字体。';
  if (code === 'MIME_MISMATCH') return '文件类型、用途与实际内容不一致，请调整用途或选择正确文件。';
  if (code === 'UNSAFE_MEDIA') return '文件内容不完整或不受支持，请重新导出素材后再试。';
  if (code === 'RESOURCE_LIMIT') return '文件大小、尺寸或时长超出支持范围，请缩小后再试。';
  if (code === 'LEASE_REQUIRED' || code === 'LEASE_LOST') return '工程编辑权已失效，请恢复编辑权后继续。';
  if (code === 'INSPECTION_UNAVAILABLE') return '媒体检查暂不可用，请重新打开工程后再试。';
  if (code === 'IO_FAILURE' || code === 'UNAVAILABLE') return '文件读取或保存失败，请检查文件和本机存储后重试。';
  return fallback;
}
export function batchFileKind(file: Pick<File, 'name' | 'type'>): AssetKind {
  const extension = file.name.split('.').at(-1)?.toLowerCase();
  const fallback = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(extension ?? '') ? 'image/' : ['wav', 'mp3', 'ogg'].includes(extension ?? '') ? 'audio/' : ['mp4', 'webm'].includes(extension ?? '') ? 'video/' : ['woff', 'woff2', 'ttf', 'otf'].includes(extension ?? '') ? 'font/' : '';
  return inferAssetKind(file.type || fallback || 'application/octet-stream');
}
export function batchRowError(row: Pick<BatchAssetRow, 'file' | 'displayName'>): string {
  if (!row.file.size) return '文件为空，请选择完整文件。';
  if (row.file.size > WEB_ASSET_IMPORT_MAX_BYTES) return '单个文件超过 64 MB，请缩小或分开处理。';
  if (!row.displayName.trim() || row.displayName.length > 200) return '请填写 1–200 个字符的素材名称。';
  return '';
}
export function planBatchAssets(files: readonly File[], existingIds: readonly string[], createId: (name: string) => string): readonly BatchAssetRow[] {
  if (!files.length || files.length > BATCH_ASSET_MAX_FILES) throw Error('一次请选择 1–50 个文件。');
  if (files.reduce((sum, file) => sum + file.size, 0) > BATCH_ASSET_MAX_BYTES) throw Error('本批文件总大小超过 512 MB，请分批导入。');
  const used = new Set(existingIds);
  return files.map(file => {
    const base = createId(file.name); let assetId = base, suffix = 2;
    while (used.has(assetId)) { const tail = `_${suffix++}`; assetId = base.slice(0, 96 - tail.length) + tail; }
    used.add(assetId);
    const row: BatchAssetRow = { file, assetId, displayName: file.name.replace(/\.[^.]+$/, '').slice(0, 200) || file.name.slice(0, 200), kind: batchFileKind(file), selected: true, state: 'ready', message: '' };
    const error = batchRowError(row); return error ? { ...row, selected: false, state: 'error', message: error } : row;
  });
}
/** Each successful item is committed by the existing importer; stopping never rolls back completed items. */
export async function runBatchAssets(rows: readonly BatchAssetRow[], importer: (file: File, metadata: BatchAssetMetadata) => Promise<BatchAssetResult>, signal: AbortSignal, update: (id: string, patch: Partial<BatchAssetRow>) => void) {
  let succeeded = 0, failed = 0, stopped = false;
  for (const row of rows) {
    if (signal.aborted) { stopped = true; break; }
    if (!row.selected || row.state === 'success') continue;
    const validation = batchRowError(row);
    if (validation) { update(row.assetId, { state: 'error', message: validation }); failed++; continue; }
    update(row.assetId, { state: 'importing', message: '正在读取、检查并导入…' });
    let result: BatchAssetResult;
    try { result = await importer(row.file, { assetId: row.assetId, displayName: row.displayName.trim(), kind: row.kind, tags: [] }); }
    catch (error) { result = { status: 'error', message: error instanceof Error ? error.message : '导入失败，请重试。', halt: true }; }
    update(row.assetId, { state: result.status, message: result.message });
    if (result.status === 'success') succeeded++; else if (result.status === 'error') failed++;
    if (result.halt || result.status === 'cancelled' || signal.aborted) { stopped = true; break; }
  }
  return { succeeded, failed, stopped };
}
