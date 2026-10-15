import { useEffect, useRef, useState } from 'react';
import { applyWebAssetSources, applyWebCredits, EMPTY_WEB_ASSET_SOURCES, includesWebAssetCredit, inspectWebAssetSources, newWebAssetSourceRecord, readWebAssetSources, readWebCredits, WEB_ASSET_SOURCE_STATUS, type CanonicalProject, type WebAssetSourceRecord, type WebAssetSources } from '@world-studio/project-domain';
import './styles/web-credits.css';
import './styles/web-asset-sources.css';

export function WebAssetSourcesDialog({ project, initialAssetId, onApply, onClose, onReplace }: {
  project: CanonicalProject; initialAssetId?: string | undefined; onApply: (project: CanonicalProject) => void; onClose: () => void; onReplace: (assetId: string) => void;
}) {
  const [initial] = useState(() => { try { return { book: readWebAssetSources(project), error: '' }; } catch (error) { return { book: null, error: String(error) }; } });
  const [book, setBook] = useState<WebAssetSources>(initial.book ?? EMPTY_WEB_ASSET_SOURCES);
  const [repair, setRepair] = useState(false), [publicDraft, setPublicDraft] = useState(project);
  const [selected, setSelected] = useState(initialAssetId ?? String(project.assets.assets[0]?.assetId ?? project.assets.assets[0]?.id ?? ''));
  const [query, setQuery] = useState(''), [pendingOnly, setPendingOnly] = useState(false), [error, setError] = useState(initial.error);
  const dialog = useRef<HTMLDialogElement>(null), trigger = useRef(document.activeElement);
  useEffect(() => { dialog.current?.showModal?.(); return () => { const el = trigger.current; if (el instanceof HTMLElement && el.isConnected) el.focus(); }; }, []);
  const rows = inspectWebAssetSources(publicDraft, book), row = rows.find(item => item.assetId === selected);
  const validDigest = !!row && /^sha256:[a-f0-9]{64}$/u.test(row.digest);
  const draft = row?.record ?? (row && validDigest ? newWebAssetSourceRecord(row.assetId, row.digest) : null);
  const dirty = repair || JSON.stringify(book) !== JSON.stringify(initial.book ?? EMPTY_WEB_ASSET_SOURCES) || publicDraft !== project;
  const locked = initial.book === null && !repair;
  const patch = (fields: Partial<WebAssetSourceRecord>) => {
    if (!draft) return;
    const next = { ...draft, ...fields };
    setBook(value => ({ schemaVersion: 1, records: [...value.records.filter(item => item.assetId !== next.assetId), next] })); setError('');
  };
  const visible = rows.filter(item => (!pendingOnly || item.status !== 'documented') && `${item.name} ${item.assetId}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <dialog ref={dialog} className="web-credits-editor web-sources-editor" aria-labelledby="web-sources-heading" onCancel={event => {
    event.preventDefault(); if (dirty) setError('修改尚未应用，请应用或点击“放弃修改”关闭。'); else onClose();
  }}>
    <form onSubmit={event => { event.preventDefault(); try { onApply(applyWebAssetSources(publicDraft, book)); onClose(); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); } }}>
      <header><div><h2 id="web-sources-heading">素材来源与发行准备</h2><p>{rows.length} 项素材 · {rows.filter(item => item.status !== 'documented').length} 项仍待处理。填写来源不等于取得许可，所有者仍需核实发行条件。</p><p>内部依据随源工程保存，不进入玩家游戏；公开署名需要单独加入制作名单。</p></div></header>
      {locked ? <div className="web-credits-editor__body"><p role="alert">台账格式不正确，尚未覆盖原记录。可先导出源工程保留原文，再明确重建台账；重建并应用会替换损坏的原记录。</p><button type="button" onClick={() => { setRepair(true); setError(''); }}>重建来源台账</button></div> : <div className="web-credits-editor__body web-sources-layout">
        <section className="web-sources-list" aria-label="来源素材清单"><label>搜索素材<input value={query} onChange={event => setQuery(event.target.value)} /></label><label className="web-sources-filter"><input type="checkbox" checked={pendingOnly} onChange={event => setPendingOnly(event.target.checked)} />只看待处理</label><div role="group" aria-label="选择来源素材">{visible.map(item => <button type="button" key={item.assetId} aria-pressed={selected === item.assetId} onClick={() => { setSelected(item.assetId); setError(''); }}><strong>{item.name}</strong><small>{WEB_ASSET_SOURCE_STATUS[item.status]}</small></button>)}</div>{visible.length === 0 && <p>没有匹配的素材。</p>}</section>
        <section className="web-sources-fields" aria-label="素材来源详情">{row ? <>
          <h3>{row.name}</h3><small>{row.assetId} · {WEB_ASSET_SOURCE_STATUS[row.status]}</small><code className="web-sources-digest">当前文件：{row.digest || '没有有效摘要'}</code>
          {row.status === 'stale' && <div className="web-sources-stale"><p>旧记录对应 {row.record?.digest}。文件已更换，旧依据不再计入当前素材。请重新核对；开始后保留来源/署名供参考，但清空旧确认依据、人和日期。</p><button type="button" disabled={!validDigest} onClick={() => patch({ digest: row.digest, permission: 'pending', evidence: '', reviewedBy: '', reviewedOn: '' })}>为当前文件重新核对</button></div>}
          {!validDigest && <p role="alert">当前素材没有有效文件摘要，请先补齐或替换源文件。</p>}
          {draft && <fieldset disabled={!validDigest || row.status === 'stale'} className="web-sources-form"><legend className="sr-only">来源记录</legend>
            <label>来源类型<select aria-label="来源类型" value={draft.sourceKind} onChange={event => patch({ sourceKind: event.target.value as WebAssetSourceRecord['sourceKind'] })}><option value="unknown">尚不明确</option><option value="original">项目原创 / 程序生成</option><option value="generated">生成式工具 / 系统合成</option><option value="third-party">第三方素材</option></select></label>
            <label>来源事实<textarea aria-label="来源事实" maxLength={4000} rows={4} value={draft.source} placeholder="素材来自哪里、工具/作者、原始文件或来源页。只写可核对事实。" onChange={event => patch({ source: event.target.value })} /></label>
            <label>发行条件状态<select aria-label="发行条件状态" value={draft.permission} onChange={event => patch({ permission: event.target.value as WebAssetSourceRecord['permission'] })}><option value="pending">待确认发行条件</option><option value="documented">已记录确认依据（非自动授权）</option><option value="replace">需要替换素材</option></select></label>
            <label>确认依据<textarea aria-label="确认依据" maxLength={4000} rows={3} value={draft.evidence} placeholder="适用许可/合同/供应方条款及核对范围、证据位置；尚未确认请保留待确认状态。" onChange={event => patch({ evidence: event.target.value })} /></label>
            <div className="web-credits-fields"><label>确认人<input maxLength={120} value={draft.reviewedBy} onChange={event => patch({ reviewedBy: event.target.value })} /></label><label>确认日期<input type="date" value={draft.reviewedOn} onChange={event => patch({ reviewedOn: event.target.value })} /></label></div>
            <label>需展示的公开署名<textarea aria-label="需展示的公开署名" maxLength={2000} rows={3} value={draft.credit} placeholder="只填可公开的准确署名/许可展示文字；留空不表示已确认无需署名。" onChange={event => patch({ credit: event.target.value })} /></label>
            <button type="button" disabled={!draft.credit.trim()} onClick={() => { try { const credits = readWebCredits(publicDraft); if (!includesWebAssetCredit(credits.acknowledgements, draft.credit)) setPublicDraft(applyWebCredits(publicDraft, { ...credits, acknowledgements: [credits.acknowledgements, draft.credit.trim()].filter(Boolean).join('\n\n') })); setError(''); } catch (reason) { setError(String(reason)); } }}>加入玩家致谢（仅此条）</button>
            <small>不会公开内部来源或依据。应用后可在“制作名单与致谢”核对、修改；不自动生成作者姓名和版权声明。</small>
          </fieldset>}
          <button type="button" disabled={dirty} onClick={() => onReplace(row.assetId)}>前往替换此素材</button>{dirty && <small>先应用或放弃修改，再前往素材页。替换后原依据会提示重新核对。</small>}
        </> : <p>选择素材查看；没有素材时无需填写。</p>}</section>
      </div>}
      <footer>{error && <p role="alert">{error}</p>}<div><button type="button" onClick={onClose}>{dirty ? '放弃修改' : '取消'}</button><button className="studio-primary" type="submit" disabled={locked}>应用来源台账</button></div></footer>
    </form>
  </dialog>;
}
