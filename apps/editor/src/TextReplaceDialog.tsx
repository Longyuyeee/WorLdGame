import { useEffect, useRef, useState } from 'react';
import type { StudioSession } from './studio-session';
import { activeSourceSession } from './studio-session';
import { createTextReplacePlan, findTextReplacements, type TextReplaceMatch, type TextReplacePlan, type TextReplaceQuery } from './project-text-replace';
import { StudioIcon } from './studio-icon';
import './styles/text-replace.css';

function excerpts(row: TextReplaceMatch): [string, string] {
  let start = 0; while (start < row.before.length && start < row.after.length && row.before[start] === row.after[start]) start++;
  start = Math.max(0, start - 50);
  return [row.before, row.after].map(text => `${start ? '…' : ''}${text.slice(start, start + 240)}${text.length > start + 240 ? '…' : ''}`) as [string, string];
}
export function TextReplaceDialog({ session, onApply, onHistory, onLocate, onClose }: {
  session: StudioSession; onApply: (plan: TextReplacePlan) => string | null; onHistory: (direction: 'undo' | 'redo') => string | null; onLocate: (row: TextReplaceMatch) => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null), results = useRef<HTMLElement>(null), trigger = useRef(document.activeElement);
  const [query, setQuery] = useState<TextReplaceQuery>({ find: '', replacement: '', sceneId: '', kind: 'all', caseSensitive: true });
  const [preview, setPreview] = useState<(ReturnType<typeof findTextReplacements> & { project: StudioSession['project']; query: string }) | null>(null);
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set()), [page, setPage] = useState(0), [error, setError] = useState(''), [message, setMessage] = useState('');
  useEffect(() => { dialog.current?.showModal(); return () => { if (trigger.current instanceof HTMLElement && trigger.current.isConnected) trigger.current.focus(); }; }, []);
  const stale = !!preview && (preview.project !== session.project || preview.query !== JSON.stringify(query));
  const selected = preview?.matches.filter(row => selection.has(row.key)) ?? [], source = activeSourceSession(session);
  const patch = (value: Partial<TextReplaceQuery>) => { setQuery(current => ({ ...current, ...value })); setError(''); setMessage(''); };
  const runPreview = () => { try { const result = findTextReplacements(session.project, query); setPreview({ ...result, project: session.project, query: JSON.stringify(query) }); setSelection(new Set(result.matches.map(row => row.key))); setPage(0); setError(''); setMessage(''); if (window.innerWidth < 640) requestAnimationFrame(() => results.current?.scrollIntoView?.({ block: 'start' })); } catch (failure) { setError((failure as Error).message); setPreview(null); } };
  const pages = Math.max(1, Math.ceil((preview?.matches.length ?? 0) / 12));
  return <dialog ref={dialog} className="text-replace-dialog" aria-labelledby="text-replace-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <header><span><StudioIcon name="search" /></span><div><h2 id="text-replace-title">查找与替换</h2><p>预览后选择要改的文字；应用前不会改动故事。</p></div><button type="button" aria-label="关闭查找替换" onClick={onClose}>×</button></header>
    <div className="text-replace-body">
      <form onSubmit={event => { event.preventDefault(); runPreview(); }}>
        <div className="text-replace-fields"><label>查找文字<input autoFocus aria-label="查找文字" maxLength={200} value={query.find} onChange={event => patch({ find: event.target.value })} placeholder="输入要统一修改的称呼、错字或句子" /></label><label>替换为<input aria-label="替换为" maxLength={2000} value={query.replacement} onChange={event => patch({ replacement: event.target.value })} placeholder="可留空以删除匹配部分" /></label></div>
        <div className="text-replace-options"><label>范围<select aria-label="替换场景范围" value={query.sceneId} onChange={event => patch({ sceneId: event.target.value })}><option value="">全部场景</option>{session.project.scenes.map(scene => <option value={scene.id} key={scene.id}>{scene.title}</option>)}</select></label><label>文字类型<select aria-label="替换文字类型" value={query.kind} onChange={event => patch({ kind: event.target.value })}><option value="all">全部文字</option><option value="dialogue">角色对白</option><option value="narration">旁白</option><option value="choice">选择提示与选项</option><option value="end">结局名称</option></select></label><label className="text-replace-case"><input type="checkbox" checked={query.caseSensitive} onChange={event => patch({ caseSensitive: event.target.checked })} />区分英文大小写</label><button type="submit" className="studio-primary" disabled={!query.find}>预览替换</button></div>
        <small>按原文字面匹配，每条会替换所有匹配处。正文、选择和结局名称可修改；场景名、角色对象和脚本指令请在原编辑入口处理。</small>
      </form>
      {error && <p className="text-replace-error" role="alert">{error}</p>}{message && <p className="text-replace-success" role="status">{message}</p>}
      {preview && <section ref={results} aria-label="替换预览"><header><div><strong>{preview.total} 条文字 · {preview.occurrences} 处匹配</strong><p>勾选 {selected.length} 条 · {new Set(selected.map(row => row.sceneId)).size} 个场景</p></div><button type="button" disabled={stale} onClick={() => setSelection(selection.size === preview.matches.length ? new Set() : new Set(preview.matches.map(row => row.key)))}>{selection.size === preview.matches.length && selection.size ? '取消全选' : '全选结果'}</button></header>
        {stale && <p className="text-replace-error" role="status">查找条件或原文已变化，请重新预览。</p>}
        {preview.truncated && <p className="text-replace-error">匹配超过 200 条，仅展示前 200 条。请缩小场景或文字类型后再替换。</p>}
        {preview.total === 0 && <p>没有需要改变的文字，可调整查找条件或替换内容。</p>}
        <div className="text-replace-results">{preview.matches.slice(page * 12, (page + 1) * 12).map((row, index) => { const [before, after] = excerpts(row); return <article key={row.key} data-replace-target={row.targetId} data-replace-scene={row.sceneId}><header><label><input type="checkbox" aria-label={`选择第 ${page * 12 + index + 1} 条文字`} checked={selection.has(row.key)} disabled={stale} onChange={event => setSelection(current => { const next = new Set(current); if (event.target.checked) next.add(row.key); else next.delete(row.key); return next; })} /><span>{row.sceneTitle} · {row.label}<small>{row.occurrences} 处</small></span></label><button type="button" disabled={stale} onClick={() => onLocate(row)}>定位原文</button></header><div className="text-replace-comparison"><div><small>修改前</small><p>{before}</p></div><div><small>修改后</small><p>{after}</p></div></div>{(row.before.length > 240 || row.after.length > 240) && <details><summary>查看完整文字</summary><p>修改前：{row.before}</p><p>修改后：{row.after}</p></details>}</article>; })}</div>
        {pages > 1 && <nav aria-label="替换结果分页"><button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>上一页结果</button><span>{page + 1} / {pages}</span><button type="button" disabled={page === pages - 1} onClick={() => setPage(page + 1)}>下一页结果</button></nav>}
      </section>}
    </div>
    <footer><div className="text-replace-history"><button type="button" disabled={!source.history.length} onClick={() => { const failure = onHistory('undo'); setError(failure ?? ''); if (!failure) { setPreview(null); setMessage('已撤销，相关场景已一起恢复。'); } }}>撤销</button><button type="button" disabled={!source.future.length} onClick={() => { const failure = onHistory('redo'); setError(failure ?? ''); if (!failure) { setPreview(null); setMessage('已重做，相关场景已一起更新。'); } }}>重做</button><small>与顶部脚本历史同步；整批替换可一次撤销。</small></div><div><button type="button" onClick={onClose}>关闭</button><button type="button" className="studio-primary" disabled={!preview || stale || preview.truncated || !selected.length} onClick={() => { try { const failure = onApply(createTextReplacePlan(session, selected)); if (failure) { setError(failure); return; } setPreview(null); setError(''); setMessage(`已替换 ${selected.length} 条文字，可一次撤销。`); } catch (failure) { setError((failure as Error).message); } }}>替换选中的 {selected.length} 条</button></div></footer>
  </dialog>;
}
