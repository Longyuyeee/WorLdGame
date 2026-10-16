import { useEffect, useRef, useState, type ReactNode } from 'react';

const PAGE_SIZE = 40;

/** Bound the visible history without trimming the authoritative session. */
export function PlayerHistoryPage<T extends { readonly entryId: string }>({ entries, currentEntryId, label, children }: {
  readonly entries: readonly T[];
  readonly currentEntryId?: string | undefined;
  readonly label: string;
  readonly children: (visible: readonly T[]) => ReactNode;
}) {
  const lastPage = Math.max(0, Math.ceil(entries.length / PAGE_SIZE) - 1);
  const anchor = currentEntryId === undefined ? -1 : entries.findIndex(entry => entry.entryId === currentEntryId);
  const currentPage = anchor < 0 ? lastPage : Math.floor(anchor / PAGE_SIZE);
  const [selectedPage, setSelectedPage] = useState(currentPage);
  const [scrollRequest, setScrollRequest] = useState(0);
  const moveTo = (next: number) => { setSelectedPage(next); setScrollRequest(value => value + 1); };
  const page = Math.min(selectedPage, lastPage), start = page * PAGE_SIZE;
  const records = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    // Readonly archives must not steal the initial scroll from the active line.
    if (currentEntryId === undefined && scrollRequest === 0) return;
    const target = page === currentPage
      ? records.current?.querySelector('[data-history-position="current"]') ?? records.current?.querySelector('li:last-child')
      : records.current?.querySelector('li');
    target?.scrollIntoView?.({ block: page === currentPage ? 'nearest' : 'start' });
  }, [page, currentPage, currentEntryId, entries.length, scrollRequest]);
  return <>
    {lastPage > 0 && <nav className="player-history-pages" aria-label={`${label}分页`}>
      <span role="status">第 {start + 1}–{Math.min(start + PAGE_SIZE, entries.length)} 条，共 {entries.length} 条</span>
      <div>
        <button type="button" aria-label={`${label}：较早记录`} disabled={page === 0} onClick={() => moveTo(page - 1)}>← 较早</button>
        <button type="button" aria-label={currentEntryId === undefined ? '最新记录' : '定位当前记录'} onClick={() => moveTo(currentPage)}>{currentEntryId === undefined ? '最新' : '当前句'}</button>
        <button type="button" aria-label={`${label}：较后记录`} disabled={page === lastPage} onClick={() => moveTo(page + 1)}>较后 →</button>
      </div>
    </nav>}
    <div ref={records} className="player-history-page-records">{children(entries.slice(start, start + PAGE_SIZE))}</div>
  </>;
}
