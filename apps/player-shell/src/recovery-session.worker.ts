import { createRecoverySession, type RecoverySessionSource } from "./recovery-session-task";

const scope = globalThis as unknown as { onmessage: (event: MessageEvent<{ id: number; source: RecoverySessionSource }>) => void; postMessage: (message: unknown) => void };
scope.onmessage = ({ data }) => {
  try { scope.postMessage({ id: data.id, result: createRecoverySession(data.source) }); }
  catch { scope.postMessage({ id: data.id, error: true }); }
};
