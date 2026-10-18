/** Windows listen(0) can choose a port forbidden by the browser (e.g. 1720). */
export async function listenBrowserLoopback(server, nextPort = () => 20000 + Math.floor(Math.random() * 30000)) {
  let lastError;
  for (let attempt = 0; attempt < 16; attempt++) {
    const port = nextPort();
    if (!Number.isSafeInteger(port) || port < 20000 || port >= 50000) throw Error('Browser test port must be in 20000..49999');
    try {
      await new Promise((resolve, reject) => {
        const cleanup = () => { server.off('error', failed); server.off('listening', ready); };
        const failed = error => { cleanup(); reject(error); }, ready = () => { cleanup(); resolve(); };
        server.once('error', failed); server.once('listening', ready);
        try { server.listen(port, '127.0.0.1'); } catch (error) { failed(error); }
      });
      return server.address().port;
    } catch (error) {
      // Windows excluded TCP ranges can reject an otherwise safe high port.
      // Retry a bounded number of loopback-only candidates, never broaden the
      // address or silently accept a server that did not bind.
      if (error.code !== 'EADDRINUSE' && error.code !== 'EACCES') throw error;
      lastError = error;
    }
  }
  throw Error('No available browser loopback test port', { cause: lastError });
}
