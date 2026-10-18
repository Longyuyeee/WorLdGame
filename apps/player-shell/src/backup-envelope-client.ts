import { oneShotSessionWorker } from './session-worker-pool';
import { executeBackupEnvelopeTask, PLAYER_SAVE_BACKUP_MAX_BYTES, type BackupEnvelopeTask, type BackupEnvelopeResult } from './backup-envelope';

export class BackupEnvelopeError extends Error { override readonly name = 'BackupEnvelopeError'; }
let serial = 0;
/** CPU-only ownership: cancelling terminates parsing/hash work, not a storage write. */
export async function runBackupEnvelopeTask<T extends BackupEnvelopeTask>(task: T, signal: AbortSignal, timeoutMs = 15_000): Promise<Extract<BackupEnvelopeResult, { kind: T['kind'] }>> {
  signal.throwIfAborted();
  if (task.kind === 'backup-decode' && task.bytes.length > PLAYER_SAVE_BACKUP_MAX_BYTES) throw Error('备份文件超过 96 MiB 上限。');
  let connection;
  try { connection = oneShotSessionWorker('world-player-backup'); } catch { /* Existing Worker-unavailable compatibility policy. */ }
  if (!connection) return await executeBackupEnvelopeTask(task, signal) as Extract<BackupEnvelopeResult, { kind: T['kind'] }>;
  const owned = connection, worker = owned.worker, id = ++serial;
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (action: () => void) => { if (settled) return; settled = true; clearTimeout(timer); signal.removeEventListener('abort', abort); owned.discard(); action(); };
    const fail = () => finish(() => reject(new BackupEnvelopeError('备份后台处理未完成，可以重新尝试；当前故事和原存档未改变。')));
    const abort = () => finish(() => reject(signal.reason));
    const timer = setTimeout(fail, timeoutMs);
    worker.onerror = event => { event.preventDefault(); fail(); }; worker.onmessageerror = fail;
    worker.onmessage = ({ data }: MessageEvent) => {
      if (settled || data?.id !== id) return;
      if (data.backupError && typeof data.backupError === 'string' && data.backupError.length <= 256) { finish(() => reject(new BackupEnvelopeError(data.backupError))); return; }
      const result = data.backupResult as BackupEnvelopeResult | undefined;
      // The bundled worker performs full validation. Check transport shape here
      // without re-encoding the entire save a second time on the UI thread.
      if (result?.kind !== task.kind || (result.kind === 'backup-encode'
        ? !ArrayBuffer.isView(result.bytes) || Object.prototype.toString.call(result.bytes) !== '[object Uint8Array]' || result.bytes.length === 0 || result.bytes.length > PLAYER_SAVE_BACKUP_MAX_BYTES
        : !result.envelope || result.envelope.slot?.projectId !== (task as Extract<BackupEnvelopeTask, { kind: 'backup-decode' }>).projectId ||
          typeof result.envelope.slot.serializedSessionSave !== 'string' || !['current', 'slot'].includes(result.envelope.origin) ||
          result.envelope.preview !== undefined && !(result.envelope.preview instanceof Blob))) { fail(); return; }
      finish(() => resolve(result as Extract<BackupEnvelopeResult, { kind: T['kind'] }>));
    };
    signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) { abort(); return; }
    // Never detach caller input. The worker transfers its newly encoded output.
    try { worker.postMessage({ id, backupTask: task }); } catch { fail(); }
  });
}
