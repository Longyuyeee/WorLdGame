import { createRecoverySession, type RecoverySessionSource } from "./recovery-session-task";
import { executeForegroundSessionWorkerTask,type ForegroundSessionWorkerTask } from "./foreground-session-task";

const scope = globalThis as unknown as { onmessage: (event: MessageEvent<{ id: number; source: RecoverySessionSource;task?:ForegroundSessionWorkerTask }>) => void; postMessage: (message: unknown) => void };
scope.onmessage = ({ data }) => {
  try { scope.postMessage({ id: data.id, result: data.task?executeForegroundSessionWorkerTask(data.task):createRecoverySession(data.source) }); }
  catch { scope.postMessage({ id: data.id, error: true }); }
};
