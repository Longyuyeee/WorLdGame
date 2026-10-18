import { createRecoverySession, type RecoverySessionSource } from "./recovery-session-task";
import { executeForegroundSessionWorkerTask } from "./foreground-session-task";
import { encodeHistoryResult } from './history-result-transport';
import { decodeSessionInput, decodeForegroundSessionInput, type ForegroundSessionWireTask, type SessionInputWire } from './session-input-transport';
import { executeBackupEnvelopeTask, type BackupEnvelopeTask } from './backup-envelope';

const scope = globalThis as unknown as { onmessage: (event: MessageEvent<{ id: number; source: SessionInputWire<RecoverySessionSource>;task?:ForegroundSessionWireTask; backupTask?: BackupEnvelopeTask }>) => void; postMessage: (message: unknown, transfer?: Transferable[]) => void };
scope.onmessage = async ({ data }) => {
  if (data.backupTask) {
    try { const result = await executeBackupEnvelopeTask(data.backupTask); scope.postMessage({ id: data.id, backupResult: result }, result.kind === 'backup-encode' ? [result.bytes.buffer] : []); }
    catch (error) { scope.postMessage({ id: data.id, backupError: error instanceof Error ? error.message.slice(0, 256) : '备份后台检查失败。' }); }
    return;
  }
  try { scope.postMessage({ id: data.id, result: data.task?encodeHistoryResult(executeForegroundSessionWorkerTask(decodeForegroundSessionInput(data.task))):createRecoverySession(decodeSessionInput(data.source)) }); }
  catch { scope.postMessage({ id: data.id, error: true }); }
};
