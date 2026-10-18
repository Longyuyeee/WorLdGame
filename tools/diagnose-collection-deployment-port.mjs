import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { listenBrowserLoopback } from './listen-browser-loopback.mjs';

const reportPath = path.resolve(import.meta.dirname, '../evidence/web-collection-reading/deployment-port-diagnostic.json');
try { await access(reportPath); throw Error('Refusing to overwrite deployment port diagnostic'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const records = [];
for (const mode of ['fetch-forbidden-5061', 'existing-safe-loopback-helper']) {
  let hits = 0; const server = createServer((_request, response) => { hits++; response.writeHead(302, { Location: 'https://example.invalid/never-follow' }).end(); });
  try {
    if (mode === 'fetch-forbidden-5061') await new Promise((resolve, reject) => { server.once('error', reject); server.listen(5061, '127.0.0.1', resolve); });
    else await listenBrowserLoopback(server);
    const port = server.address().port; let status = null, error = null, cause = null;
    try { const response = await fetch(`http://127.0.0.1:${port}/game/build-info.json`, { redirect: 'manual', signal: AbortSignal.timeout(1000) }); status = response.status; await response.body?.cancel(); }
    catch (failure) { error = String(failure); cause = String(failure.cause); }
    records.push({ mode, port, status, error, cause, hits });
    if (mode === 'fetch-forbidden-5061') { assert.equal(status, null); assert.equal(hits, 0); assert.match(cause, /bad port/u); }
    else { assert.equal(status, 302); assert.equal(hits, 1); assert.equal(error, null); }
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
await writeFile(reportPath, JSON.stringify({ passed: true, nodeVersion: process.version, platform: process.platform, records, scope: 'Controlled local reproduction of a fetch-forbidden ephemeral-port failure, followed by the existing safe helper. The first failed TAP did not retain its chosen port, so this does not identify that original port or prove every NETWORK_ERROR has this cause.' }, null, 2), { flag: 'wx' });
console.log('PASS controlled forbidden-port failure and safe-loopback redirect');
