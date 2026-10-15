import { createRecoverySession, type RecoverySessionSource } from "./recovery-session-task";
import { executeForegroundSessionTask,type ForegroundSessionTask } from "./foreground-session-task";

const scope = globalThis as unknown as { onmessage: (event: MessageEvent<{ id: number; source: RecoverySessionSource;task?:ForegroundSessionTask }>) => void; postMessage: (message: unknown) => void };
scope.onmessage = ({ data }) => {
  try { scope.postMessage({ id: data.id, result: data.task?executeForegroundSessionTask(data.task):createRecoverySession(data.source) }); }
  catch { scope.postMessage({ id: data.id, error: true }); }
};
