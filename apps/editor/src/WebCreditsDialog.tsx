import { useEffect, useRef, useState } from 'react';
import { DEFAULT_WEB_CREDITS, applyWebCredits, hasWebCredits, readWebCredits, type CanonicalProject, type WebCredits } from '@world-studio/project-domain';
import { StudioIcon } from './studio-icon';
import './styles/web-credits.css';

export function creditsSummary(project: CanonicalProject): string {
  try { const value = readWebCredits(project); return hasWebCredits(value) ? `${value.studio || '制作名单'} · ${value.entries.length} 条署名` : '尚未填写 · 可选'; }
  catch { return '内容格式有误 · 请修复后生成'; }
}
export function WebCreditsDialog({ project, onApply, onClose }: { project: CanonicalProject; onApply: (project: CanonicalProject) => void; onClose: () => void }) {
  const [initial] = useState(() => { try { return { value: readWebCredits(project), error: '' }; } catch (error) { return { value: DEFAULT_WEB_CREDITS, error: `${(error as Error).message} 可以重新填写并应用，或取消保留原记录。` }; } });
  const [draft, setDraft] = useState<WebCredits>(initial.value), [error, setError] = useState(initial.error);
  const dialog = useRef<HTMLDialogElement>(null), trigger = useRef(document.activeElement);
  useEffect(() => { dialog.current?.showModal(); return () => { if (trigger.current instanceof HTMLElement && trigger.current.isConnected) trigger.current.focus(); }; }, []);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial.value);
  const patch = (value: Partial<WebCredits>) => { setDraft(current => ({ ...current, ...value })); setError(''); };
  return <dialog ref={dialog} className="web-credits-editor" aria-labelledby="web-credits-title" onCancel={event => { event.preventDefault(); if (dirty) setError('修改尚未应用，请应用或点击“放弃修改”关闭。'); else onClose(); }}>
    <form onSubmit={event => { event.preventDefault(); try { onApply(applyWebCredits(project, draft)); onClose(); } catch (failure) { setError((failure as Error).message); } }}>
      <header><span className="web-credits-mark"><StudioIcon name="characters" /></span><div><h2 id="web-credits-title">制作名单与致谢</h2><p>玩家可在标题、阅读菜单和结局查看；内容随工程和游戏保存。</p></div></header>
      <div className="web-credits-editor__body">
        <div className="web-credits-fields"><label>制作团队<input aria-label="制作团队" maxLength={120} value={draft.studio} onChange={event => patch({ studio: event.target.value })} placeholder="个人、社团或工作室名称" /></label><label>作品网站<input aria-label="作品网站" maxLength={2048} value={draft.website} onChange={event => patch({ website: event.target.value })} placeholder="https://…（可选）" /></label></div>
        <section aria-label="制作人员署名"><header><h3>制作人员</h3><button type="button" disabled={draft.entries.length >= 80} onClick={() => patch({ entries: [...draft.entries, { role: '', name: '', url: '' }] })}><StudioIcon name="plus" />添加署名</button></header>
          {draft.entries.length === 0 && <p>可按编剧、美术、音乐、配音等职责添加，最多 80 条。</p>}
          {draft.entries.map((entry, index) => <fieldset key={index} className="web-credit-row"><legend>署名 {index + 1}</legend><div className="web-credits-fields"><label>职责<input aria-label={`职责 ${index + 1}`} maxLength={80} value={entry.role} onChange={event => patch({ entries: draft.entries.map((row, i) => i === index ? { ...row, role: event.target.value } : row) })} placeholder="编剧／美术／音乐…" /></label><label>姓名／名称<input aria-label={`署名 ${index + 1}`} maxLength={200} value={entry.name} onChange={event => patch({ entries: draft.entries.map((row, i) => i === index ? { ...row, name: event.target.value } : row) })} /></label></div><label>相关链接（可选）<input aria-label={`署名链接 ${index + 1}`} value={entry.url} maxLength={2048} onChange={event => patch({ entries: draft.entries.map((row, i) => i === index ? { ...row, url: event.target.value } : row) })} placeholder="https://…" /></label><div className="web-credit-order"><button type="button" disabled={index === 0} aria-label={`上移署名 ${index + 1}`} onClick={() => { const entries = [...draft.entries]; [entries[index - 1], entries[index]] = [entries[index]!, entries[index - 1]!]; patch({ entries }); }}>上移</button><button type="button" disabled={index === draft.entries.length - 1} aria-label={`下移署名 ${index + 1}`} onClick={() => { const entries = [...draft.entries]; [entries[index + 1], entries[index]] = [entries[index]!, entries[index + 1]!]; patch({ entries }); }}>下移</button><button type="button" aria-label={`移除署名 ${index + 1}`} onClick={() => patch({ entries: draft.entries.filter((_, i) => i !== index) })}>移除</button></div></fieldset>)}
        </section>
        <label>素材与特别鸣谢<textarea aria-label="素材与特别鸣谢" maxLength={12000} rows={7} value={draft.acknowledgements} onChange={event => patch({ acknowledgements: event.target.value })} placeholder="素材名称、来源、创作者及要求展示的许可说明；按行填写。" /></label>
        <label>版权说明<textarea aria-label="版权说明" rows={2} maxLength={500} value={draft.copyright} onChange={event => patch({ copyright: event.target.value })} placeholder="填写作品自己的版权说明（可选）" /></label>
        <small>这里只展示你填写的信息，填写署名不会自动取得素材许可。留空时，游戏不显示制作名单入口。</small>
      </div>
      <footer>{error && <p role="alert">{error}</p>}<div><button type="button" onClick={onClose}>{dirty ? '放弃修改' : '取消'}</button><button type="submit" className="studio-primary">应用制作名单</button></div></footer>
    </form>
  </dialog>;
}
