import { useEffect, useMemo, useState } from 'react';
import type { CanonicalProject } from '@world-studio/project-domain';
import type { AssetIndexEntry } from '@world-studio/project-persistence';
import { inspectDirectiveArguments } from '@world-studio/story-language';
import { AssetLibraryPreview, type AssetLibraryReader } from './asset-library-card';

/** Source references only. An adjacent line is context, not a predicted route or
 * proof that an arbitrary audio file speaks that text. Never scan across control flow. */
export function sourceAssetContexts(project: CanonicalProject, assetId: string) {
  return project.scenes.flatMap(scene => (project.scripts[scene.id]?.statements ?? []).flatMap((statement, index, statements) => {
    if (statement.kind !== 'direction' || typeof statement.summary !== 'string') return [];
    const args = inspectDirectiveArguments(statement.summary);
    if (!['asset', 'transitionAsset'].some(key => args.parameters[key] === assetId && !args.duplicateKeys.includes(key))) return [];
    const next = statements[index + 1], line = next && ['dialogue', 'narration'].includes(String(next.kind)) && typeof next.text === 'string' ? next.text : null;
    const speaker = next?.kind === 'dialogue' ? project.characters.characters.find(character => character.id === next.speakerId)?.displayName : null;
    return [{ sceneId: scene.id, scene: scene.title, statementId: String(statement.id), summary: statement.summary, line, speaker: typeof speaker === 'string' ? speaker : null }];
  }));
}

export function SourceAssetPreview({ entry, reader, project, visible }: { entry: AssetIndexEntry; reader: AssetLibraryReader | null; project: CanonicalProject; visible: boolean }) {
  const [open, setOpen] = useState(false);
  const contexts = useMemo(() => sourceAssetContexts(project, entry.assetId), [project.scripts, project.scenes, project.characters, entry.assetId]);
  useEffect(() => { if (!visible) setOpen(false); }, [visible]);
  useEffect(() => {
    const close = () => setOpen(false), hidden = () => { if (document.hidden) close(); };
    window.addEventListener('pagehide', close); document.addEventListener('visibilitychange', hidden);
    return () => { window.removeEventListener('pagehide', close); document.removeEventListener('visibilitychange', hidden); };
  }, []);
  const image = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(entry.source.mimeType);
  const supported = entry.kind === 'audio' || image;
  return <section className="web-source-preview" aria-label="当前文件预览与使用位置" data-asset-id={entry.assetId} data-digest={entry.source.digest}>
    <p>预览以当前文件摘要为准；文件已替换时不播放旧文件。试听或查看不会确认发行条件，也不会改动剧情。</p>
    {supported ? <button type="button" disabled={!reader} aria-expanded={visible && open} onClick={() => setOpen(value => !value)}>{open ? '关闭当前素材预览' : entry.kind === 'audio' ? '试听当前音频' : '查看当前图片'}</button> : <p>此类型请在素材页或完整试玩中检查；来源填写可继续。</p>}
    {!reader && <p role="status">资源仓库暂不可用，来源填写仍保留；请保存后重新打开工程。</p>}
    {visible && open && supported && <AssetLibraryPreview key={`${entry.assetId}:${entry.source.digest}`} entry={entry} reader={reader} />}
    <details><summary>故事中的使用位置（{contexts.length}）</summary>
      <small>仅列已提交的演出引用及紧随的原文，不代表运行路线或音频转写；封面、字体等界面引用不计入此表。</small>
      {contexts.length ? <ul>{contexts.map(context => <li key={context.sceneId + ':' + context.statementId}><strong>{context.scene}</strong><code>{context.statementId} · {context.summary}</code>{context.line && <p>{context.speaker && <b>{context.speaker}：</b>}{context.line}</p>}</li>)}</ul> : <p>没有已提交的演出引用，可继续核对来源。</p>}
    </details>
  </section>;
}
