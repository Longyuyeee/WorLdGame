/** Browser.close may terminate the debugging socket before its reply arrives.
 * Only the owned child process's actual clean exit is authority for a restart.
 * An acknowledged request, disconnected socket, or swallowed error is not enough.
 */
export function requestCleanBrowserExit(child, requestClose, timeoutMilliseconds = 10000) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.reject(Error('Test browser exited before close was requested'));
  return new Promise((resolve, reject) => {
    let requestError;
    const cleanup = () => { clearTimeout(timer); child.removeListener('exit', exited); };
    const exited = (code, signal) => {
      cleanup();
      if (code !== 0 || signal !== null) reject(Error(`Test browser did not exit cleanly: ${code}/${signal}`));
      else resolve();
    };
    const timer = setTimeout(() => {
      cleanup(); reject(Error(`Previous test browser did not exit${requestError ? ': ' + requestError.message : ''}`));
    }, timeoutMilliseconds);
    child.once('exit', exited);
    // Attach a rejection handler immediately, including synchronous send errors.
    // Do not await a protocol response from a process we requested to terminate.
    Promise.resolve().then(requestClose).catch(error => { requestError = error; });
  });
}
