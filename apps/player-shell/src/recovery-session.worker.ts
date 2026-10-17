import { createRecoverySession, type RecoverySessionSource } from "./recovery-session-task";
import { executeForegroundSessionWorkerTask } from "./foreground-session-task";
import { encodeHistoryResult } from './history-result-transport';
import { decodeSessionInput, decodeForegroundSessionInput, type ForegroundSessionWireTask, type SessionInputWire } from './session-input-transport';

const scope = globalThis as unknown as { onmessage: (event: MessageEvent<{ id: number; source: SessionInputWire<RecoverySessionSource>;task?:ForegroundSessionWireTask }>) => void; postMessage: (message: unknown) => void };
scope.onmessage = ({ data }) => {
  try { scope.postMessage({ id: data.id, result: data.task?encodeHistoryResult(executeForegroundSessionWorkerTask(decodeForegroundSessionInput(data.task))):createRecoverySession(decodeSessionInput(data.source)) }); }
  catch { scope.postMessage({ id: data.id, error: true }); }
};
