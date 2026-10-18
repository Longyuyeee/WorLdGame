import { useMemo, useRef, useState, type ReactNode } from 'react';
import type { PlayerCoreSnapshotV1, PlayerHistoryVisibleEventV1 } from '@world-studio/player-core';
import { PlayerHistoryPage } from './PlayerHistoryPage';
import { parsePlayerRichTextV1 } from './player-typography';
import type { HistoryChoiceSelections } from './history-reading-context';
import { useHistoryVoice, type HistoryVoiceClip, type HistoryVoicePlaybackProps } from './use-history-voice';

const noNames: Readonly<Record<string, string>> = {};

function eventLabel(event: PlayerHistoryVisibleEventV1): string {
  switch (event.kind) {
    case 'dialogue': case 'narration': return event.text;
    case 'choice': return event.prompt;
    case 'wait': return `等待 ${event.durationMilliseconds} 毫秒`;
    case 'ending': return event.name;
  }
}
function eventKind(event: PlayerHistoryVisibleEventV1): string {
  return { dialogue: '对白', narration: '旁白', choice: '选择', wait: '等待', ending: '结局' }[event.kind];
}
const normalize = (text: string) => text.normalize('NFKC').toLowerCase();
function selectedLabel(event: PlayerHistoryVisibleEventV1, selectedOptionId?: string) {
  return event.kind === 'choice' ? event.options.find(option => option.optionId === selectedOptionId)?.label : undefined;
}
function speaker(event: PlayerHistoryVisibleEventV1, names: Readonly<Record<string, string>>) {
  if (event.kind !== 'dialogue' || !Object.hasOwn(names, event.speakerId)) return undefined;
  const name = names[event.speakerId]; return typeof name === 'string' ? name.trim() || undefined : undefined;
}
function searchText(event: PlayerHistoryVisibleEventV1, names: Readonly<Record<string, string>>, selectedOptionId?: string): string {
  const parts = parsePlayerRichTextV1([speaker(event, names), eventLabel(event), selectedLabel(event, selectedOptionId)].filter(Boolean).join('\n'));
  return normalize(parts.map(part => part.kind === 'text' ? part.text : part.base).join('') + '\n' +
    parts.flatMap(part => part.kind === 'ruby' ? [part.annotation] : []).join(' '));
}

/** Search visible snapshot text and recorded display context, not unchosen
 * options or a story catalog. Core remains the navigation authority;
 * archived and future rows never gain a rollback action through filtering.
 */
export function PlayerHistoryContent({ history, locale, canNavigate, onNavigate, renderText, speakerNames = noNames, selections, voiceFor, voicePlayback }: {
  readonly history: NonNullable<PlayerCoreSnapshotV1['history']>;
  readonly locale: string;
  readonly canNavigate: boolean;
  readonly onNavigate: (entryId: string) => void;
  readonly renderText: (text: string) => ReactNode;
  readonly speakerNames?: Readonly<Record<string, string>>;
  readonly selections?: HistoryChoiceSelections | undefined;
  readonly voiceFor?: ((entryId: string, event: PlayerHistoryVisibleEventV1) => HistoryVoiceClip | null | undefined) | undefined;
  readonly voicePlayback?: HistoryVoicePlaybackProps | undefined;
}) {
  const audition = useHistoryVoice(voicePlayback ?? { active: canNavigate, muted: false, volume: 1 });
  const [query, setQuery] = useState(''), search = normalize(query.trim());
  const input = useRef<HTMLInputElement | null>(null);
  const indexed = useMemo(() => ({ active: history.activeEntries.map(entry => ({ entry, text: searchText(entry.event, speakerNames, selections?.active.get(entry.entryId)) })),
    archives: history.archives.map((archive, index) => ({ archive, index, rows: archive.entries.map(entry => ({ entry, text: searchText(entry.event, speakerNames, selections?.archives.get(archive.archiveId)?.get(entry.entryId)) })) })) }), [history, speakerNames, selections]);
  const active = indexed.active.filter(row => !search || row.text.includes(search)).map(row => row.entry);
  const archives = indexed.archives.map(item => ({ ...item, entries: item.rows.filter(row => !search || row.text.includes(search)).map(row => row.entry) }));
  const matches = active.length + archives.reduce((count, archive) => count + archive.entries.length, 0);
  const record = (event: PlayerHistoryVisibleEventV1, position: string, optionId: string | undefined, navigate?: () => void, voice?: HistoryVoiceClip | null) => {
    const choice = selectedLabel(event, optionId), label = eventLabel(event);
    return <div className="player-history-record">
      <span className="player-history-record__identity">{speaker(event, speakerNames) ?? eventKind(event)} · {position}</span>
      <strong className="player-typography-text" lang={locale}>{renderText(label)}</strong>
      {choice !== undefined && <p className="player-history-choice">已选择：{renderText(choice)}</p>}
      {event.kind === 'choice' && position === '当前' && <p className="player-history-choice-pending">等待选择</p>}
      {voice !== undefined && <button type="button" aria-label={`重听语音：${label}`} disabled={!canNavigate || voice === null} onClick={event => { if (voice) audition.play(voice, label, event.currentTarget); }}>重听语音{voice === null ? ' · 资源不可用' : ''}</button>}
      {navigate && <button type="button" aria-label={`回退到：${label}`} disabled={!canNavigate} onClick={navigate}>回到这一句</button>}
    </div>;
  };
  return <>
    <div className="player-history-search">
      <label htmlFor="player-history-query">查找已记录的剧情</label>
      <div><input ref={input} id="player-history-query" type="search" value={query} placeholder="人物、正文、已选选项或结局" maxLength={256} onChange={event => setQuery(event.target.value)} onKeyDown={event => {
        if (event.key === 'Escape' && query && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); setQuery(''); }
      }} />
        {query && <button type="button" onClick={() => { setQuery(''); input.current?.focus(); }}>清除查找</button>}</div>
      <p role="status">{search ? `找到 ${matches} 条记录` : '查找当前主线与只读归档。回看不改变剧情，点击“回到这一句”才回退；前方及归档记录不能回退。'}</p>
      {voiceFor && !search && <p>重听只播放声音，不回退剧情；未保留声音关联、前方及归档记录不提供重听。</p>}
    </div>
    <div className="player-history-panel-body">
      {audition.player}
      {history.forwardPolicy.blocked && <p className="player-history-panel__notice" role="status">项目设置禁止在回退后沿原分支前进。</p>}
      {history.backwardBarrier !== null && <p className="player-history-panel__barrier" role="status"><strong>不可逆边界</strong><span>{history.backwardBarrier.reason}</span><small>距离当前位置 {history.backwardBarrier.distance} 步 · {history.backwardBarrier.descriptorId}</small></p>}
      {search && matches === 0 && <p className="player-history-panel__empty">没有找到匹配记录，试试更短的词句，或清除查找回到当前句。</p>}
      {(!search || active.length > 0) && <section className="player-history-panel__section">
        <h3>当前主线{search ? ` · ${active.length} 条` : ''}</h3>
        {active.length === 0 ? <p className="player-history-panel__empty">尚无可显示条目。</p> : <PlayerHistoryPage key={`active:${search}`} entries={active} currentEntryId={active.find(entry => entry.position === 'current')?.entryId} label="当前主线">{visible => <ol className="player-history-list">{visible.map(entry => {
          const position = entry.position === 'current' ? '当前' : entry.position === 'future' ? '前方 · 不可回退' : entry.canNavigateBack ? '已读' : '已读 · 不可回退';
          return <li key={entry.entryId} data-history-position={entry.position} aria-current={entry.position === 'current' ? 'location' : undefined}>{record(entry.event, position, selections?.active.get(entry.entryId), entry.canNavigateBack && entry.position === 'past' ? () => onNavigate(entry.entryId) : undefined, entry.position !== 'future' ? voiceFor?.(entry.entryId, entry.event) : undefined)}</li>;
        })}</ol>}</PlayerHistoryPage>}
      </section>}
      {archives.filter(item => !search || item.entries.length > 0).map(({ archive, index, entries }) => <section className="player-history-panel__section player-history-panel__archive" key={archive.archiveId} data-archive-id={archive.archiveId}>
        <h3>归档记录 {index + 1}{search ? ` · ${entries.length} 条` : ''}</h3><p>旧分支或内存保护归档 · 只读，不支持回滚</p>
        <PlayerHistoryPage key={`${archive.archiveId}:${search}`} entries={entries} label={`归档记录 ${index + 1}`}>{visible => <ol className="player-history-list">{visible.map(entry => <li key={entry.entryId}>{record(entry.event, '归档', selections?.archives.get(archive.archiveId)?.get(entry.entryId))}</li>)}</ol>}</PlayerHistoryPage>
      </section>)}
    </div>
  </>;
}
