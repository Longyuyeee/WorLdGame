import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { PlayerHistoryPage } from './PlayerHistoryPage';

const entries = Array.from({ length: 121 }, (_, index) => ({ entryId: `entry-${index}`, text: `段落 ${index + 1}` }));
const list = (rows: readonly (typeof entries)[number][]) => <ol>{rows.map(row => <li key={row.entryId}>{row.text}</li>)}</ol>;

it('opens around the current line, bounds rendering and keeps older/future lines reachable', () => {
  render(<PlayerHistoryPage entries={entries} currentEntryId="entry-90" label="当前主线">{list}</PlayerHistoryPage>);
  expect(screen.getAllByRole('listitem')).toHaveLength(40);
  expect(screen.getByText('段落 91')).toBeInTheDocument();
  expect(screen.queryByText('段落 1')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '当前主线：较早记录' }));
  fireEvent.click(screen.getByRole('button', { name: '当前主线：较早记录' }));
  expect(screen.getByText('段落 1')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '当前主线：较早记录' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '定位当前记录' }));
  expect(screen.getByText('段落 91')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '当前主线：较后记录' }));
  expect(screen.getAllByRole('listitem')).toHaveLength(1);
  expect(screen.getByText('段落 121')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '当前主线：较后记录' })).toBeDisabled();
});

it('keeps small histories intact and paginates each archive independently', () => {
  render(<><section aria-label="主线"><PlayerHistoryPage entries={entries.slice(0, 2)} label="当前主线">{list}</PlayerHistoryPage></section><section aria-label="归档"><PlayerHistoryPage entries={entries} label="归档记录 1">{list}</PlayerHistoryPage></section></>);
  const active = within(screen.getByRole('region', { name: '主线' })), archive = within(screen.getByRole('region', { name: '归档' }));
  expect(active.getAllByRole('listitem')).toHaveLength(2);
  expect(active.queryByRole('navigation')).not.toBeInTheDocument();
  expect(archive.getByText('段落 121')).toBeInTheDocument();
  fireEvent.click(archive.getByRole('button', { name: '归档记录 1：较早记录' }));
  expect(archive.getAllByRole('listitem')).toHaveLength(40);
  fireEvent.click(archive.getByRole('button', { name: '最新记录' }));
  expect(archive.getAllByRole('listitem')).toHaveLength(1);
  expect(active.getAllByRole('listitem')).toHaveLength(2);
});

it('keeps archives from stealing the active line and lets the current button reveal it again on the same page', () => {
  const previous = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView'), scrolled: string[] = [];
  Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value(this: Element) { scrolled.push(this.textContent ?? ''); } });
  try {
    render(<><PlayerHistoryPage entries={entries} currentEntryId="entry-90" label="当前主线">{rows => <ol>{rows.map(row => <li key={row.entryId} data-history-position={row.entryId === 'entry-90' ? 'current' : 'past'}>{row.text}</li>)}</ol>}</PlayerHistoryPage><PlayerHistoryPage entries={entries} label="归档记录 1">{list}</PlayerHistoryPage></>);
    expect(scrolled).toEqual(['段落 91']);
    fireEvent.click(screen.getByRole('button', { name: '定位当前记录' }));
    expect(scrolled).toEqual(['段落 91', '段落 91']);
    fireEvent.click(screen.getByRole('button', { name: '最新记录' }));
    expect(scrolled.at(-1)).toBe('段落 121');
  } finally {
    if (previous) Object.defineProperty(Element.prototype, 'scrollIntoView', previous);
    else Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
  }
});
