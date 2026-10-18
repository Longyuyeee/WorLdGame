import { useEffect, useState } from 'react';
import type { PlayerSaveBackup } from './player-save-backup';
import { playerSaveLabel } from './player-save-label';

function BackupScreenshot({ blob }: { readonly blob: Blob }) {
  const [source, setSource] = useState<{ blob: Blob; url: string } | null>(null), [failed, setFailed] = useState<Blob | null>(null);
  useEffect(() => {
    let url: string | null = null;
    try { url = URL.createObjectURL(blob); setSource({ blob, url }); } catch { setFailed(blob); }
    return () => { if (url !== null) URL.revokeObjectURL(url); };
  }, [blob]);
  if (failed === blob) return <p role="status">截图无法显示，已校验的进度仍可导入；请根据正文摘要核对。</p>;
  return source?.blob === blob ? <img src={source.url} alt="备份中附带的截图" onError={() => setFailed(blob)} /> : <p role="status">正在显示备份截图…</p>;
}
const labels = { narration: '旁白', dialogue: '对白', choice: '等待选择', ending: '结局', wait: '等待', effect: '演出', barrier: '剧情边界', title: '标题', error: '错误' };
export function PlayerBackupInspection({ backup }: { readonly backup: PlayerSaveBackup }) {
  const [showPreview, setShowPreview] = useState(false);
  useEffect(() => setShowPreview(false), [backup]);
  return <section className="player-backup-inspection" aria-label="备份内容核对">
    <h3>将导入的进度</h3>
    <dl><dt>作品</dt><dd>{backup.slot.title}</dd><dt>记录位置</dt><dd>{backup.slot.chapterTitle ? `${backup.slot.chapterTitle} / ` : ''}{backup.slot.sceneTitle}</dd>
      <dt>保存时间</dt><dd>{new Date(backup.slot.savedAtEpochMilliseconds).toLocaleString('zh-CN', { hour12: false })} · 本地时间</dd>
      <dt>备份来源</dt><dd>{backup.origin === 'current' ? '当时的游玩进度（直接备份）' : playerSaveLabel(backup.slot.slotId)}</dd>
      <dt>版本</dt><dd>{backup.compatibility === 'current' ? '当前版本兼容' : '已核对的旧版本，可继续'}</dd>
      <dt>阅读位置</dt><dd>{labels[backup.inspectedReading.kind]}</dd></dl>
    <strong>校验后的正文摘要</strong>
    <p className="player-backup-inspection__excerpt">{backup.inspectedReading.excerpt ?? '这个位置没有可显示的正文摘要，请结合进度类型与保存时间核对。'}</p>
    <small>摘要来自完整进度校验后的当前阅读内容，最多 160 字；截图仅供参考。此时尚未导入，也未读取。</small>
    {backup.preview ? <><button type="button" aria-expanded={showPreview} onClick={() => setShowPreview(value => !value)}>{showPreview ? '收起备份截图' : '查看备份截图'}</button>{showPreview && <BackupScreenshot blob={backup.preview} />}</> : <p>这份备份没有截图，已校验的进度仍可导入。</p>}
  </section>;
}
