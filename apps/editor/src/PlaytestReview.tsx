import { useRef, useEffect, useMemo, useState } from "react";
import type { CanonicalProject } from "@world-studio/project-domain";
import { NOTE_CATEGORIES, noteReviewState, type PlaytestNote, type PlaytestNoteCategory, type PlaytestNoteLocation, type PlaytestNoteStatus } from "./playtest-notes";
import { StudioIcon } from "./studio-icon";
import { DEFAULT_REVIEW_LIST, defaultReviewRange, visibleReviewNotes, type ReviewListView } from "./playtest-review-task";

export function PlaytestNoteDialog({ location, note, error, onSave, onClose }: { readonly location: PlaytestNoteLocation; readonly note: PlaytestNote | null; readonly error: string; readonly onSave: (text: string, category: PlaytestNoteCategory) => void; readonly onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null), [text, setText] = useState(note?.text ?? ""), [category, setCategory] = useState<PlaytestNoteCategory>(note?.category ?? "text");
  useEffect(() => { if (!ref.current?.open) ref.current?.showModal(); }, []);
  return <dialog ref={ref} className="entity-edit-dialog playtest-note-dialog" aria-label="记录试玩问题" onCancel={onClose}><form onSubmit={event => { event.preventDefault(); if (text.trim()) onSave(text.trim(), category); }}>
    <header><div><StudioIcon name="write" /><h2>{note ? "编辑校订记录" : "记下这处问题"}</h2></div><button type="button" aria-label="关闭问题记录" onClick={onClose}>×</button></header>
    <p>{location.sceneTitle} · 自动关联当前内容</p>{location.excerpt && <blockquote>{location.excerpt}</blockquote>}
    <label>问题类型<select aria-label="校订问题类型" value={category} onChange={event => setCategory(event.target.value as PlaytestNoteCategory)}>{Object.entries(NOTE_CATEGORIES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    <label>需要修改什么<textarea autoFocus aria-label="校订问题描述" rows={4} maxLength={2000} value={text} onChange={event => setText(event.target.value)} placeholder="例如：这句对白不自然；配音与下一句之间需要停顿。" /></label>
    {error && <p role="alert">{error}</p>}<footer><span>保存在本浏览器；可在检查页导出记录文件。</span><button type="submit" className="studio-primary" disabled={!text.trim()}>保存校订记录</button></footer>
  </form></dialog>;
}

export function PlaytestReviewBoard({ project, notes, sourceHash, blocked, error, onOpen, onReplay, onEdit, onStatus, onDelete, onExport, onImport, view, onViewChange, focusNoteId }: {
  readonly view?: ReviewListView; readonly onViewChange?: (view: ReviewListView) => void; readonly focusNoteId?: string;
  readonly project: CanonicalProject; readonly notes: readonly PlaytestNote[]; readonly sourceHash: string; readonly blocked: boolean; readonly error: string;
  readonly onOpen: (note: PlaytestNote) => void; readonly onReplay: (note: PlaytestNote) => void; readonly onEdit: (note: PlaytestNote) => void;
  readonly onStatus: (note: PlaytestNote, status: PlaytestNoteStatus) => void; readonly onDelete: (note: PlaytestNote) => void; readonly onExport: () => void; readonly onImport: (file: File) => void;
}) {
  const [localView, setLocalView] = useState(DEFAULT_REVIEW_LIST), list = view ?? localView;
  const update = (patch: Partial<ReviewListView>) => (onViewChange ?? setLocalView)({ ...list, ...patch });
  const { filter, page } = list, setPage = (value: number) => update({ page: value });
  const board = useRef<HTMLElement>(null), pendingFocus = useRef<string | null>(null);
  const sceneTitles = useMemo(() => new Map(project.scenes.map(scene => [scene.id, scene.title])), [project.scenes]);
  const pending = notes.filter(note => noteReviewState(note, sourceHash) !== "verified"), shown = visibleReviewNotes(notes, sourceHash, list, sceneTitles);
  useEffect(() => {
    if (!focusNoteId) return;
    const index = shown.findIndex(note => note.id === focusNoteId);
    if (index < 0) { board.current?.focus({ preventScroll: true }); return; }
    pendingFocus.current = focusNoteId;
    if (Math.floor(index / 8) !== list.page) update({ page: Math.floor(index / 8) });
  }, [focusNoteId]);
  useEffect(() => {
    if (!pendingFocus.current) return;
    const row = [...(board.current?.querySelectorAll<HTMLElement>('[data-review-id]') ?? [])].find(item => item.dataset.reviewId === pendingFocus.current);
    if (row) { row.focus({ preventScroll: true }); row.scrollIntoView?.({ block: 'nearest' }); pendingFocus.current = null; }
  });
  const pages = Math.max(1, Math.ceil(shown.length / 8)), current = Math.min(page, pages - 1);
  return <section ref={board} tabIndex={-1} className="playtest-review-board" aria-label="试玩校订清单"><header><div><p className="eyebrow">作品校订</p><h2>试玩中发现的问题 <span>{pending.length} 待跟进</span></h2><p>修改后标记待复核，重新试玩后由你确认。工程内容变化会提醒再次复核。</p></div><div className="playtest-review-board__files"><button type="button" disabled={blocked} onClick={onExport}>导出校订记录</button><label className="review-import">导入记录<input type="file" accept=".worldreview,.json,application/json" aria-label="导入校订记录" disabled={blocked} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) onImport(file); }} /></label></div></header>
    <p className="review-storage-notice">记录只保存在本浏览器，另行导入/导出，不包含在工程 ZIP 或玩家存档中。</p>{error && <p role="alert">{error}</p>}
    <div className="review-filter"><button type="button" aria-pressed={filter === "pending"} onClick={() => update({ filter: "pending", page: 0 })}>待跟进 {pending.length}</button><button type="button" aria-pressed={filter === "all"} onClick={() => update({ filter: "all", page: 0 })}>全部 {notes.length}</button></div>
    <details className="review-search"><summary>筛选与搜索{list.query || list.category !== "all" ? ` · ${shown.length} 条结果` : ""}</summary><div className="review-search-controls"><label>搜索问题<input type="search" aria-label="搜索校订记录" maxLength={120} value={list.query} onChange={event => update({ query: event.target.value, page: 0 })} placeholder="问题、场景或记录时的内容" /></label><label>问题类型<select aria-label="筛选校订问题类型" value={list.category} onChange={event => update({ category: event.target.value, page: 0 })}><option value="all">全部类型</option>{Object.entries(NOTE_CATEGORIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><button type="button" onClick={() => update({ query: '', category: 'all', page: 0 })}>清除筛选</button></div></details>
    {shown.length === 0 && <p className="review-empty">{list.query || list.category !== "all" ? "没有匹配的问题，可调整或清除筛选。" : notes.length ? "当前记录均已复核。" : "试玩时点击“记录问题”，文字、演出和声音的问题就能在这里集中处理。"}</p>}
    <div className="review-note-list">{shown.slice(current * 8, (current + 1) * 8).map(note => {
      const state = noteReviewState(note, sourceHash), exists = Object.hasOwn(project.scripts, note.sceneId) && project.scripts[note.sceneId]?.statements.some(statement => statement.id === note.statementId) === true;
      return <article key={note.id} tabIndex={-1} data-review-id={note.id} data-current-review={note.id === focusNoteId}><header><span data-review-status={state}>{({ open: "待修改", fixed: "待复核", verified: "已复核", recheck: "内容已变 · 需复核" })[state]}</span><small>{NOTE_CATEGORIES[note.category]} · {project.scenes.find(scene => scene.id === note.sceneId)?.title ?? note.sceneTitle}</small></header><p className="review-note-text">{note.text}</p>{note.excerpt && <details><summary>记录时的内容</summary><blockquote>{note.excerpt}</blockquote></details>}
        {!exists && <p className="review-location-missing">原内容已删除，记录仍保留。</p>}
        <div className="review-note-actions"><button type="button" disabled={blocked || !exists} onClick={() => onOpen(note)}>定位原文</button><button type="button" disabled={blocked || !exists} onClick={() => onReplay(note)}>{defaultReviewRange(note) === 'scene' ? '从场景开头复测' : '从此处复测'}</button>{state === "open" && <button type="button" disabled={blocked} onClick={() => onStatus(note, "fixed")}>标记已修改</button>}{(state === "fixed" || state === "recheck") && <button type="button" disabled={blocked} onClick={() => onStatus(note, "verified")}>确认已复核</button>}<details className="review-note-more"><summary>更多</summary><div><button type="button" disabled={blocked} onClick={() => onEdit(note)}>编辑记录</button>{state === "open" && <button type="button" disabled={blocked} onClick={() => onStatus(note, "verified")}>确认已复核</button>}{(state === "recheck" || state === "verified") && <button type="button" disabled={blocked} onClick={() => onStatus(note, "fixed")}>标记已修改</button>}{state !== "open" && <button type="button" disabled={blocked} onClick={() => onStatus(note, "open")}>重新打开</button>}<details className="review-delete"><summary>删除</summary><button type="button" disabled={blocked} onClick={() => onDelete(note)}>确认删除记录</button></details></div></details></div>
      </article>;
    })}</div>
    {pages > 1 && <footer><button type="button" disabled={current === 0} onClick={() => setPage(current - 1)}>上一页记录</button><span>{current + 1} / {pages}</span><button type="button" disabled={current === pages - 1} onClick={() => setPage(current + 1)}>下一页记录</button></footer>}
  </section>;
}
