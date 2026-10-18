/** Cancel the owner's wait, not a physical storage write. Always consume a
 * retired promise's late result/rejection without publishing it elsewhere. */
export function awaitPlayerBackupValue<T>(value: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return value;
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (action: () => void) => { if (settled) return; settled = true; signal.removeEventListener('abort', abort); action(); };
    const abort = () => finish(() => reject(signal.reason));
    signal.addEventListener('abort', abort, { once: true });
    value.then(result => finish(() => resolve(result)), reason => finish(() => reject(reason)));
    if (signal.aborted) abort();
  });
}
