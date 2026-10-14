import { useEffect, useRef, useState } from "react";
import type { PlayerCoreState } from "@world-studio/player-core";
import { createPlayerSaveBackup, readPlayerSaveBackup, playerBackupToManualSlot, PLAYER_SAVE_BACKUP_MAX_BYTES, type PlayerSaveBackup } from "./player-save-backup";
import type { WorldPlayerSaveSlotV3, WorldPlayerSaveStoreV3, WorldPlayerSaveSummaryV3 } from "./player-save-store";
import type { WorldPlayerSaveWriteCoordinatorV1 } from "./player-save-policy";
import { playerSaveLabel } from "./player-save-label";

type SaveCapture = { readonly slot: WorldPlayerSaveSlotV3; readonly preview?: Blob };
const time = (epoch: number) => new Date(epoch).toLocaleString("zh-CN", { hour12: false });
export function PlayerSaveBackupPanel({ state, store, coordinator, slots, currentAllowed, captureCurrent, onImported, onRead, onBusyChange, isCurrent, externalBusy }: {
  state: PlayerCoreState; store: WorldPlayerSaveStoreV3; coordinator: WorldPlayerSaveWriteCoordinatorV1;
  slots: readonly WorldPlayerSaveSummaryV3[]; currentAllowed: boolean; captureCurrent: () => Promise<SaveCapture>;
  onImported: (slotId: string) => Promise<void>; onRead: (slotId: string, artifactHash: string) => void;
  onBusyChange: (busy: boolean) => void; isCurrent: () => boolean;
  externalBusy: boolean;
}) {
  const [source, setSource] = useState(currentAllowed ? "current" : slots[0]?.slotId ?? "current");
  const [incoming, setIncoming] = useState<PlayerSaveBackup | null>(null), [target, setTarget] = useState("manual-1");
  const [confirmation, setConfirmation] = useState<WorldPlayerSaveSummaryV3 | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState(false);
  const [download, setDownload] = useState<{ href: string; filename: string } | null>(null), [importedSlot, setImportedSlot] = useState<{ id: string; artifactHash: string } | null>(null);
  const mounted = useRef(true), operation = useRef(false);
  const context = useRef({ state, store, isCurrent }); context.current = { state, store, isCurrent };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => () => { if (download) URL.revokeObjectURL(download.href); }, [download]);
  const active = (captured: PlayerCoreState) => mounted.current && context.current.store === store && context.current.isCurrent() &&
    captured.projectId === context.current.state.projectId && captured.artifacts?.manifest.buildId === context.current.state.artifacts?.manifest.buildId;
  const run = async (task: (captured: PlayerCoreState) => Promise<void>) => {
    if (operation.current) return;
    operation.current = true; setBusy(true); setError(false); onBusyChange(true);
    const captured = state;
    try { await task(captured); }
    catch (reason) { if (active(captured)) {
      setMessage(reason instanceof Error && reason.name === "QuotaExceededError" ? "设备存储空间不足，原进度和原存档保持不变。释放空间后重试。"
        : reason instanceof Error && !reason.message.startsWith("WORLD_") ? reason.message : "操作失败，原进度和原存档保持不变。可以重试。"); setError(true);
    } }
    finally { operation.current = false; if (mounted.current) { setBusy(false); onBusyChange(false); } }
  };
  const exportBackup = () => run(async captured => {
    setMessage("正在生成备份文件…");
    let capture: SaveCapture;
    if (source === "current") { if (!currentAllowed) throw Error("请先读取或开始故事，再备份当前进度。"); capture = await captureCurrent(); }
    else {
      const slot = await store.read(captured.projectId, source); if (!slot) throw Error("这个槽位已不存在，请重新选择。");
      const preview = slot.preview.status === "available" ? await store.readPreview(captured.projectId, source) : null;
      capture = { slot, ...(preview === null ? {} : { preview }) };
    }
    const bytes = await createPlayerSaveBackup(capture.slot, capture.preview, source === "current" ? "current" : "slot");
    if (!active(captured)) return;
    const filename = `${capture.slot.title.normalize("NFKC").replace(/[^\p{Letter}\p{Number}_-]+/gu, "-").slice(0, 60) || "game"}-${source === "current" ? "progress" : source}-${capture.slot.savedAtEpochMilliseconds}.worldsave`;
    const href = URL.createObjectURL(new Blob([bytes], { type: "application/json" }));
    setDownload({ href, filename });
    const link = document.createElement("a"); link.href = href; link.download = filename; document.body.append(link); link.click(); link.remove();
    setMessage("备份文件已生成，请保留下载的文件。可用下方链接重新下载。");
  });
  const inspect = (file: File) => run(async captured => {
    setIncoming(null); setConfirmation(null); setImportedSlot(null); setMessage("正在检查备份…");
    if (file.size > PLAYER_SAVE_BACKUP_MAX_BYTES) throw Error("备份文件超过 96 MiB 上限。");
    const backup = await readPlayerSaveBackup(new Uint8Array(await file.arrayBuffer()), captured);
    if (!active(captured)) return;
    const empty = Array.from({ length: 12 }, (_, index) => `manual-${index + 1}`).find(id => !slots.some(slot => slot.slotId === id));
    setIncoming(backup); setTarget(empty ?? "manual-1"); setMessage("备份校验通过，请选择手动槽位后导入。");
  });
  const commit = (expected: WorldPlayerSaveSummaryV3 | null) => run(async captured => {
    if (!incoming || store.writeIfUnchanged === undefined) throw Error("当前宿主不支持安全导入，请使用本游戏 Web 播放器。");
    const destination = playerBackupToManualSlot(incoming, target);
    setMessage("正在导入到手动槽位…");
    const written = await coordinator.writeFixed(async () => {
      if (!active(captured)) throw Error("游戏已变化，请重新检查备份。");
      return store.writeIfUnchanged!(destination, expected, incoming.preview);
    });
    if (!active(captured)) return;
    setConfirmation(null);
    if (!written) { await onImported(target); throw Error("目标槽位已经变化，未导入。请重新核对目标后再次确认。"); }
    setIncoming(null); setImportedSlot({ id: target, artifactHash: destination.sessionArtifactHash });
    await onImported(target);
    setMessage(`备份已导入${playerSaveLabel(target)}，当前故事未改变。点击读取继续。`);
  });
  const requestImport = () => {
    const occupied = slots.find(slot => slot.slotId === target);
    if (occupied) { setConfirmation(occupied); setMessage("目标槽位已有进度，请确认是否覆盖。"); setError(false); }
    else void commit(null);
  };
  const reset = () => { setIncoming(null); setConfirmation(null); setImportedSlot(null); setMessage("已取消导入，当前故事和原存档保持不变。"); setError(false); };
  const selected = slots.find(slot => slot.slotId === source);
  return <section className="player-save-backup" aria-label="存档备份与恢复" aria-busy={busy}>
    <p>把一份完整进度和历史存成文件，换浏览器或设备后可导入同一作品。个人设置和游戏素材需另行保留。</p>
    <details className="player-backup-export" open={incoming === null}><summary>导出备份</summary><fieldset disabled={busy || externalBusy} aria-label="导出备份">
      <label>备份进度<select aria-label="备份进度" value={source} onChange={event => setSource(event.target.value)}>
        <option value="current" disabled={!currentAllowed}>当前游玩进度{currentAllowed ? "" : "（开始或读档后可用）"}</option>
        {slots.map(slot => <option key={slot.slotId} value={slot.slotId}>{playerSaveLabel(slot.slotId)} · {slot.sceneTitle}</option>)}
      </select></label>
      {selected && <p>{selected.sceneTitle} · {time(selected.savedAtEpochMilliseconds)} · 本地时间</p>}
      <button type="button" disabled={source === "current" ? !currentAllowed : !selected} onClick={() => void exportBackup()}>导出备份文件</button>
      {download && <a href={download.href} download={download.filename}>重新下载备份</a>}
    </fieldset></details>
    <fieldset disabled={busy || externalBusy}><legend>导入备份</legend>
      <label>选择存档备份文件<input type="file" accept=".worldsave,application/json" aria-label="选择存档备份文件" disabled={store.writeIfUnchanged === undefined} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void inspect(file); }} /></label>
      {store.writeIfUnchanged === undefined && <p>当前宿主没有安全导入能力，请使用本游戏 Web 播放器导入。</p>}
      {incoming && <>
        <dl><dt>作品</dt><dd>{incoming.slot.title}</dd><dt>进度</dt><dd>{incoming.slot.chapterTitle ? `${incoming.slot.chapterTitle} / ` : ""}{incoming.slot.sceneTitle}</dd>
          <dt>保存时间</dt><dd>{time(incoming.slot.savedAtEpochMilliseconds)} · 本地时间</dd><dt>备份来源</dt><dd>{incoming.origin === "current" ? "当时的游玩进度（直接备份）" : playerSaveLabel(incoming.slot.slotId)}</dd>
          <dt>版本</dt><dd>{incoming.compatibility === "current" ? "当前版本兼容" : "已核对的旧版本，可继续"}</dd></dl>
        <label>导入到手动槽位<select aria-label="导入到手动槽位" value={target} onChange={event => { setTarget(event.target.value); setConfirmation(null); }}>
          {Array.from({ length: 12 }, (_, index) => { const id = `manual-${index + 1}`, slot = slots.find(slot => slot.slotId === id); return <option key={id} value={id}>{playerSaveLabel(id)} · {slot ? `${slot.sceneTitle}（已有进度）` : "空槽位"}</option>; })}
        </select></label>
        {!confirmation && <button type="button" onClick={requestImport}>导入到所选槽位</button>}
        {confirmation && <section className="player-backup-confirm" aria-label="确认覆盖目标存档"><strong>将替换{playerSaveLabel(confirmation.slotId)}</strong>
          <p>{confirmation.sceneTitle} · {time(confirmation.savedAtEpochMilliseconds)} · 本地时间。需要保留时请先导出这个旧槽位。</p>
          <button type="button" onClick={() => void commit(confirmation)}>确认覆盖并导入</button></section>}
        <button type="button" onClick={reset}>取消导入</button>
      </>}
      {importedSlot && <button type="button" onClick={() => onRead(importedSlot.id, importedSlot.artifactHash)}>读取导入的存档</button>}
    </fieldset>
    {message && <p role={error ? "alert" : "status"}>{message}</p>}
  </section>;
}
