import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import type { PlayerCoreState, loadPlayerCoreSessionSaveV1 } from "@world-studio/player-core";
import { readPlayerSaveBackup, playerBackupToManualSlot, PLAYER_SAVE_BACKUP_MAX_BYTES, type PlayerSaveBackup } from "./player-save-backup";
import { runBackupEnvelopeTask } from './backup-envelope-client';
import type { WorldPlayerSaveSlotV3, WorldPlayerSaveStoreV3, WorldPlayerSaveSummaryV3 } from "./player-save-store";
import type { WorldPlayerSaveWriteCoordinatorV1 } from "./player-save-policy";
import { playerSaveLabel } from "./player-save-label";
import { readPlayerBackupFile } from './backup-file-reader';
import { awaitPlayerBackupValue } from './backup-operation';
import { PlayerBackupInspection } from './PlayerBackupInspection';
import { PlayerSaveDetails } from './PlayerSaveCard';

type SaveCapture = { readonly slot: WorldPlayerSaveSlotV3; readonly preview?: Blob };
const time = (epoch: number) => new Date(epoch).toLocaleString("zh-CN", { hour12: false });
type BackupTask = { readonly kind: 'export' | 'inspect' | 'import'; readonly controller: AbortController; timer?: ReturnType<typeof setTimeout>; writeStarted: boolean; writeCommitted: boolean };
export interface PlayerBackupPreparationControl { cancel(): boolean }
export function PlayerSaveBackupPanel({ state, store, coordinator, slots, currentAllowed, captureCurrent, onImported, onRead, onBusyChange, isCurrent, externalBusy, active: allowed = true, preparationControl, validateBackup, listReady = true }: {
  state: PlayerCoreState; store: WorldPlayerSaveStoreV3; coordinator: WorldPlayerSaveWriteCoordinatorV1;
  slots: readonly WorldPlayerSaveSummaryV3[]; currentAllowed: boolean; captureCurrent: (signal?: AbortSignal) => Promise<SaveCapture>;
  onImported: (slotId: string) => Promise<void>; onRead: (slotId: string, artifactHash: string) => void;
  onBusyChange: (busy: boolean, cancellable?: boolean) => void; isCurrent: () => boolean;
  externalBusy: boolean;
  listReady?: boolean;
  active?: boolean;
  preparationControl?: Ref<PlayerBackupPreparationControl>;
  validateBackup?: (state: PlayerCoreState, serialized: string, signal: AbortSignal) => Promise<ReturnType<typeof loadPlayerCoreSessionSaveV1>>;
}) {
  const [source, setSource] = useState(currentAllowed ? "current" : slots[0]?.slotId ?? "current");
  const [incoming, setIncoming] = useState<PlayerSaveBackup | null>(null), [target, setTarget] = useState("manual-1");
  const [confirmation, setConfirmation] = useState<WorldPlayerSaveSummaryV3 | null>(null);
  const [exportExpanded, setExportExpanded] = useState(true);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState(false);
  const [waiting, setWaiting] = useState(false), [taskKind, setTaskKind] = useState<BackupTask['kind'] | null>(null);
  const [download, setDownload] = useState<{ href: string; filename: string } | null>(null), [importedSlot, setImportedSlot] = useState<{ id: string; artifactHash: string } | null>(null);
  const mounted = useRef(true), operation = useRef<BackupTask | null>(null), fileInput = useRef<HTMLInputElement>(null), exportButton = useRef<HTMLButtonElement>(null);
  const context = useRef({ state, store, isCurrent, onBusyChange }); context.current = { state, store, isCurrent, onBusyChange };
  const scope = useRef({ store, projectId: state.projectId, buildId: state.artifacts?.manifest.buildId });
  const listWasReady = useRef(listReady);
  const cancel = useCallback(() => {
    const request = operation.current; if (!request || request.kind === 'import') return false;
    operation.current = null; clearTimeout(request.timer); request.controller.abort();
    setBusy(false); setWaiting(false); setTaskKind(null); setError(false); setMessage('已取消备份准备或检查，当前故事和原存档未改变。可以重新尝试。'); context.current.onBusyChange(false, false);
    queueMicrotask(() => (request.kind === 'inspect' ? fileInput.current : exportButton.current)?.focus()); return true;
  }, []);
  useImperativeHandle(preparationControl, () => ({ cancel }), [cancel]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; const request = operation.current; operation.current = null; clearTimeout(request?.timer); request?.controller.abort(); }; }, []);
  useEffect(() => {
    const previous = scope.current; scope.current = { store, projectId: state.projectId, buildId: state.artifacts?.manifest.buildId };
    if (previous.store === store && previous.projectId === state.projectId && previous.buildId === scope.current.buildId) return;
    const request = operation.current; operation.current = null; clearTimeout(request?.timer); request?.controller.abort();
    setBusy(false); setWaiting(false); setTaskKind(null); setIncoming(null); setConfirmation(null); setImportedSlot(null); context.current.onBusyChange(false, false); setMessage('作品或存储环境已变化，请重新准备备份。先前已提交的写入不在此撤销。');
  }, [store, state.projectId, state.artifacts?.manifest.buildId]);
  useEffect(() => { if (!allowed || !isCurrent()) cancel(); }, [allowed, cancel, isCurrent]);
  useEffect(() => {
    const recovered = !listWasReady.current && listReady; listWasReady.current = listReady;
    if (recovered && importedSlot && !busy && error && message.startsWith('备份已经写入目标槽位，但列表尚未刷新。') && isCurrent()) {
      setError(false); setMessage(`备份已导入${playerSaveLabel(importedSlot.id)}，列表已核对；当前故事未改变。点击读取继续。${store.previewStorage === 'unavailable' ? '此浏览器未保存截图，剧情进度和历史已保留。' : ''}`);
    }
  }, [listReady, importedSlot, busy, error, message, isCurrent, store]);
  useEffect(() => {
    if (busy || source === 'current' && currentAllowed || slots.some(slot => slot.slotId === source)) return;
    setSource(currentAllowed ? 'current' : slots[0]?.slotId ?? 'current');
  }, [busy, source, currentAllowed, slots]);
  useEffect(() => () => { if (download) URL.revokeObjectURL(download.href); }, [download]);
  useEffect(() => setExportExpanded(incoming === null), [incoming]);
  const active = (captured: PlayerCoreState, request: BackupTask) => operation.current === request && !request.controller.signal.aborted && mounted.current && context.current.store === store && context.current.isCurrent() &&
    captured.projectId === context.current.state.projectId && captured.artifacts?.manifest.buildId === context.current.state.artifacts?.manifest.buildId;
  const run = async (kind: BackupTask['kind'], task: (captured: PlayerCoreState, request: BackupTask) => Promise<void>) => {
    if (operation.current || externalBusy || !allowed || !isCurrent()) return;
    const request: BackupTask = { kind, controller: new AbortController(), writeStarted: false, writeCommitted: false }; operation.current = request;
    setBusy(true); setWaiting(false); setTaskKind(kind); setError(false); onBusyChange(true, kind !== 'import');
    request.timer = setTimeout(() => { if (operation.current === request && mounted.current) setWaiting(true); }, 8000);
    const captured = state;
    try { await task(captured, request); }
    catch (reason) { if (active(captured, request)) {
      setMessage(request.writeCommitted ? '备份已经写入目标槽位，但列表尚未刷新。请重新打开存档核对，勿重复导入；当前故事未改变。'
        : request.writeStarted ? '导入尚未确认成功。当前故事未改变，请核对目标槽位后再操作，不要把关闭提示当作撤销写入。'
        : reason instanceof Error && reason.name === 'ForegroundSessionError' ? '备份后台检查或准备未完成。当前故事和原存档未改变，可以重新尝试。'
        : reason instanceof Error && reason.name === "QuotaExceededError" ? "设备存储空间不足，原进度和原存档保持不变。释放空间后重试。"
        : reason instanceof Error && !reason.message.startsWith("WORLD_") ? reason.message : "操作失败，原进度和原存档保持不变。可以重试。"); setError(true);
    } }
    finally { clearTimeout(request.timer); if (operation.current === request) { operation.current = null; if (mounted.current) { setBusy(false); setWaiting(false); setTaskKind(null); onBusyChange(false, false); } } }
  };
  const exportBackup = () => run('export', async (captured, request) => {
    setMessage("正在生成备份文件…");
    let capture: SaveCapture;
    if (source === "current") { if (!currentAllowed) throw Error("请先读取或开始故事，再备份当前进度。"); setMessage('正在准备当前完整进度和截图…'); capture = await awaitPlayerBackupValue(captureCurrent(request.controller.signal), request.controller.signal); }
    else {
      const slot = await awaitPlayerBackupValue(store.read(captured.projectId, source), request.controller.signal); if (!slot) throw Error("这个槽位已不存在，请重新选择。");
      if (!active(captured, request)) return;
      setMessage('正在读取所选存档的截图…');
      const preview = slot.preview.status === "available" ? await awaitPlayerBackupValue(store.readPreview(captured.projectId, source), request.controller.signal) : null;
      capture = { slot, ...(preview === null ? {} : { preview }) };
    }
    if (!active(captured, request)) return; setMessage('正在校验并生成备份文件…');
    const { bytes } = await runBackupEnvelopeTask({ kind: 'backup-encode', slot: capture.slot, ...(capture.preview ? { preview: capture.preview } : {}), origin: source === 'current' ? 'current' : 'slot' }, request.controller.signal);
    if (!active(captured, request)) return;
    const filename = `${capture.slot.title.normalize("NFKC").replace(/[^\p{Letter}\p{Number}_-]+/gu, "-").slice(0, 60) || "game"}-${source === "current" ? "progress" : source}-${capture.slot.savedAtEpochMilliseconds}.worldsave`;
    const href = URL.createObjectURL(new Blob([bytes], { type: "application/json" }));
    setDownload({ href, filename });
    const link = document.createElement("a"); link.href = href; link.download = filename; document.body.append(link); link.click(); link.remove();
    setMessage("备份文件已生成，请保留下载的文件。可用下方链接重新下载。");
  });
  const inspect = (file: File) => run('inspect', async (captured, request) => {
    setIncoming(null); setConfirmation(null); setImportedSlot(null); setMessage("正在检查备份…");
    if (file.size > PLAYER_SAVE_BACKUP_MAX_BYTES) throw Error("备份文件超过 96 MiB 上限。");
    const bytes = await readPlayerBackupFile(file, request.controller.signal); if (!active(captured, request)) return;
    setMessage('正在完整检查备份进度、版本和截图…');
    const backup = await readPlayerSaveBackup(bytes, captured, crypto.subtle, { signal: request.controller.signal,
      envelope: async (input, projectId) => (await runBackupEnvelopeTask({ kind: 'backup-decode', bytes: input, projectId }, request.controller.signal)).envelope,
      ...(validateBackup ? { load: (serialized: string) => validateBackup(captured, serialized, request.controller.signal) } : {}) });
    if (!active(captured, request)) return;
    const empty = Array.from({ length: 12 }, (_, index) => `manual-${index + 1}`).find(id => !slots.some(slot => slot.slotId === id));
    setIncoming(backup); setTarget(empty ?? "manual-1"); setMessage("备份校验通过，请选择手动槽位后导入。");
  });
  const commit = (expected: WorldPlayerSaveSummaryV3 | null) => run('import', async (captured, request) => {
    if (!listReady) throw Error('请先重试读取存档列表，再核对目标槽位。');
    if (!incoming || store.writeIfUnchanged === undefined) throw Error("当前宿主不支持安全导入，请使用本游戏 Web 播放器。");
    const destination = playerBackupToManualSlot(incoming, target);
    setMessage("正在导入到手动槽位…");
    const written = await coordinator.writeFixed(async () => {
      if (!active(captured, request)) throw Error("游戏已变化，请重新检查备份。");
      request.writeStarted = true;
      return store.writeIfUnchanged!(destination, expected, incoming.preview);
    });
    if (!active(captured, request)) return;
    request.writeCommitted = written; if (!written) request.writeStarted = false;
    setConfirmation(null);
    if (!written) { await onImported(target); throw Error("目标槽位已经变化，未导入。请重新核对目标后再次确认。"); }
    setIncoming(null); setImportedSlot({ id: target, artifactHash: destination.sessionArtifactHash });
    await onImported(target);
    if (!active(captured, request)) return;
    setMessage(`备份已导入${playerSaveLabel(target)}，当前故事未改变。点击读取继续。${store.previewStorage === 'unavailable' ? '此浏览器未保存截图，剧情进度和历史已保留。' : ''}`);
  });
  const requestImport = () => {
    if (!listReady) return;
    const occupied = slots.find(slot => slot.slotId === target);
    if (occupied) { setConfirmation(occupied); setMessage("目标槽位已有进度，请确认是否覆盖。"); setError(false); }
    else void commit(null);
  };
  const reset = () => { setIncoming(null); setConfirmation(null); setImportedSlot(null); setMessage("已取消导入，当前故事和原存档保持不变。"); setError(false); };
  const selected = slots.find(slot => slot.slotId === source);
  const destination = confirmation ?? slots.find(slot => slot.slotId === target);
  const retainOldTarget = () => {
    if (!confirmation || busy || externalBusy || !allowed) return;
    setSource(confirmation.slotId); setExportExpanded(true);
    setMessage('已选中目标旧槽位，请先导出并保留文件；待导入的备份仍在，之后还需明确确认覆盖。'); setError(false);
    queueMicrotask(() => exportButton.current?.focus());
  };
  return <section className="player-save-backup" aria-label="存档备份与恢复" aria-busy={busy}>
    <p>每个文件只保存一份会话、其中记录的已读／解锁和历史，以及可用截图；换浏览器或设备后可导入同一作品。不批量备份其他槽位或独立的收藏／回想档案，个人设置和游戏素材需另行保留。</p>
    {busy && <div className="player-load-wait player-backup-wait" role="status" aria-live="polite">
      <span>{taskKind === 'import' ? '导入提交中，不提供取消写入。请等待结果后核对目标槽位，不要重复导入。' : '正在准备或检查备份，可以取消等待；不会更改当前故事或原存档。'}{waiting ? taskKind === 'import' ? ' 写入等待时间较长，尚未确认结果。' : ' 等待时间较长，可取消后重新选择文件或槽位。' : ''}</span>
      {taskKind !== 'import' && <button type="button" onClick={cancel}>取消备份准备</button>}
    </div>}
    <details className="player-backup-export" open={exportExpanded} onToggle={event => setExportExpanded(event.currentTarget.open)}><summary>导出备份</summary><fieldset disabled={busy || externalBusy || !allowed} aria-label="导出备份">
      <label>备份进度<select aria-label="备份进度" value={source} onChange={event => setSource(event.target.value)}>
        <option value="current" disabled={!currentAllowed}>当前游玩进度{currentAllowed ? "" : "（开始或读档后可用）"}</option>
        {slots.map(slot => <option key={slot.slotId} value={slot.slotId}>{playerSaveLabel(slot.slotId)} · {slot.sceneTitle}</option>)}
      </select></label>
      {selected && <div className="player-backup-slot-details"><PlayerSaveDetails slot={selected} /></div>}
      <button ref={exportButton} type="button" disabled={source === "current" ? !currentAllowed : !selected} onClick={() => void exportBackup()}>导出备份文件</button>
      {download && <><a href={download.href} download={download.filename}>重新下载备份</a><small style={{ overflowWrap: 'anywhere' }}>上次生成：{download.filename}</small></>}
    </fieldset></details>
    <fieldset disabled={busy || externalBusy || !allowed}><legend>导入备份</legend>
      <label>选择存档备份文件<input ref={fileInput} type="file" accept=".worldsave,application/json" aria-label="选择存档备份文件" disabled={store.writeIfUnchanged === undefined} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void inspect(file); }} /></label>
      {store.writeIfUnchanged === undefined && <p>当前宿主没有安全导入能力，请使用本游戏 Web 播放器导入。</p>}
      {incoming && <>
        <PlayerBackupInspection backup={incoming} />
        {!listReady && <p>目标槽位尚未核对，请先重试读取存档列表；备份检查结果仍保留。</p>}
        <label>导入到手动槽位<select aria-label="导入到手动槽位" disabled={!listReady} value={target} onChange={event => { setTarget(event.target.value); setConfirmation(null); }}>
          {Array.from({ length: 12 }, (_, index) => { const id = `manual-${index + 1}`, slot = slots.find(slot => slot.slotId === id); return <option key={id} value={id}>{playerSaveLabel(id)} · {!listReady ? '尚未核对' : slot ? `${slot.sceneTitle}（已有进度）` : "空槽位"}</option>; })}
        </select></label>
        <section className="player-backup-destination" aria-label="目标槽位内容"><h3>{playerSaveLabel(target)} · {confirmation ? '本次确认的旧进度' : '目标槽位记录'}</h3>
          {listReady ? <div className="player-backup-slot-details"><PlayerSaveDetails slot={destination} emptyText="导入后会写入这里，当前故事仍保持不变" />{destination && !destination.readingExcerpt && <small>这个旧档未记录正文摘要，请结合场景和保存时间核对。</small>}</div> : <p>尚未核对目标槽位，请先重试读取存档列表。</p>}
        </section>
        {!confirmation && <button type="button" disabled={!listReady} onClick={requestImport}>导入到所选槽位</button>}
        {confirmation && <section className="player-backup-confirm" aria-label="确认覆盖目标存档"><strong>将替换{playerSaveLabel(confirmation.slotId)}</strong>
          <p>{confirmation.sceneTitle} · {time(confirmation.savedAtEpochMilliseconds)} · 本地时间。需要保留时请先导出这个旧槽位。</p>
          {confirmation.readingExcerpt && <p className="player-backup-inspection__excerpt">{confirmation.readingExcerpt}</p>}
          <button type="button" onClick={retainOldTarget}>先备份这个旧槽位</button>
          <button type="button" disabled={!listReady} onClick={() => void commit(confirmation)}>确认覆盖并导入</button></section>}
        <button type="button" onClick={reset}>取消导入</button>
      </>}
      {importedSlot && <button type="button" onClick={() => onRead(importedSlot.id, importedSlot.artifactHash)}>读取导入的存档</button>}
    </fieldset>
    {message && <p role={error ? "alert" : "status"}>{message}</p>}
  </section>;
}
