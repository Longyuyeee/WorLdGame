// Independent media baseline: no Player, React, saves or service worker required.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url); let engines;
try { engines = require('playwright'); } catch { engines = require(path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const root = path.resolve(import.meta.dirname, '..'), output = path.join(root, 'evidence/web-audio-compatibility');
const rain = await readFile(path.join(root, 'assets/rain-story/soft-rain.wav'));
const tone = Buffer.alloc(44 + 22050 * 2);
tone.write('RIFF'); tone.writeUInt32LE(tone.length - 8, 4); tone.write('WAVEfmt ', 8); tone.writeUInt32LE(16, 16); tone.writeUInt16LE(1, 20); tone.writeUInt16LE(1, 22); tone.writeUInt32LE(22050, 24); tone.writeUInt32LE(44100, 28); tone.writeUInt16LE(2, 32); tone.writeUInt16LE(16, 34); tone.write('data', 36); tone.writeUInt32LE(tone.length - 44, 40);
for (let i = 0; i < 22050; i++) tone.writeInt16LE(Math.round(Math.sin(i * 440 * 2 * Math.PI / 22050) * 4096), 44 + i * 2);
const hits = [];
const worker = `self.addEventListener('install',e=>e.waitUntil((async()=>{const c=await caches.open('audio-probe');await c.add('/tone.wav');self.skipWaiting();})()));self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>{if(!e.request.url.endsWith('.wav'))return;e.respondWith((async()=>{for(const c of await self.clients.matchAll())c.postMessage({url:e.request.url,range:e.request.headers.get('range')});const r=await(await caches.open('audio-probe')).match('/tone.wav');const b=await r.arrayBuffer();const m=/^bytes=(\\d+)-(\\d*)$/.exec(e.request.headers.get('range')||'');if(!m)return new Response(b,{headers:{'Content-Type':'audio/wav','X-Audio-Probe':'worker'}});const s=+m[1],end=Math.min(m[2]?+m[2]:b.byteLength-1,b.byteLength-1);return new Response(b.slice(s,end+1),{status:206,headers:{'Content-Type':'audio/wav','Content-Length':end-s+1,'Content-Range':'bytes '+s+'-'+end+'/'+b.byteLength,'Accept-Ranges':'bytes','X-Audio-Probe':'worker'}});})());});`;
const server = createServer((request, response) => {
  hits.push({ url: request.url, range: request.headers.range ?? null });
  if (request.url === '/controlled/sw.js') { response.writeHead(200, { 'Content-Type': 'text/javascript' }).end(worker); return; }
  if (request.url === '/controlled/sw-only.wav') { response.writeHead(404).end(); return; }
  const bytes = request.url === '/rain.wav' ? rain : ['/tone.wav', '/controlled/tone.wav'].includes(request.url) ? tone : null;
  if (!bytes) { response.writeHead(200, { 'Content-Type': 'text/html' }).end('<button id="play">Play test</button>'); return; }
  const match = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range ?? '');
  if (match) { const start = +match[1], end = Math.min(match[2] ? +match[2] : bytes.length - 1, bytes.length - 1); if (start > end) { response.writeHead(416, { 'Content-Range': `bytes */${bytes.length}` }).end(); return; } response.writeHead(206, { 'Content-Type': 'audio/wav', 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${bytes.length}`, 'Accept-Ranges': 'bytes' }).end(bytes.subarray(start, end + 1)); }
  else response.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': bytes.length, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' }).end(bytes);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const origin = `http://127.0.0.1:${server.address().port}`, results = [];
try {
  for (const engine of ['chromium', 'firefox', 'webkit']) {
    const browser = await engines[engine].launch({ headless: true });
    try {
      const page = await browser.newPage(); await page.goto(origin);
      const capabilities = await page.evaluate(() => { const a = new Audio(); return Object.fromEntries(['audio/wav', 'audio/wav; codecs="1"', 'audio/mpeg', 'audio/ogg; codecs="vorbis"', 'audio/mp4; codecs="mp4a.40.2"'].map(type => [type, a.canPlayType(type)])); });
      const cases = [];
      for (const file of ['tone.wav', 'rain.wav']) for (const mode of ['http', 'blob', 'data']) {
        await page.evaluate(async ({ file, mode }) => {
          const response = await fetch('/' + file), blob = await response.blob();
          let url = '/' + file;
          if (mode === 'blob') url = URL.createObjectURL(blob);
          if (mode === 'data') url = await new Promise(resolve => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(blob); });
          const audio = new Audio(url); audio.controls = true; document.body.append(audio); window.sample = audio; window.result = { playError: null }; document.getElementById('play').onclick = () => { void audio.play().catch(e => { window.result.playError = { name: e.name, message: e.message }; }); };
        }, { file, mode });
        await page.locator('#play').click();
        await page.waitForFunction(() => sample.error || result.playError || (!sample.paused && sample.currentTime > .1), undefined, { timeout: 5000 }).catch(() => {});
        const result = await page.evaluate(() => { const a = window.sample; const result = { passed: !a.error && a.currentTime > .1, errorCode: a.error?.code ?? null, message: a.error?.message ?? null, readyState: a.readyState, currentTime: a.currentTime, paused: a.paused, playError: window.result.playError }; a.pause(); a.removeAttribute('src'); a.load(); a.remove(); return result; });
        cases.push({ file, mode, ...result }); await page.goto(origin);
      }
      const webAudio = await page.evaluate(async () => { const Constructor = window.AudioContext ?? window.webkitAudioContext; if (!Constructor) return { available: false }; const context = new Constructor(); try { const bytes = await (await fetch('/tone.wav')).arrayBuffer(); const decoded = await context.decodeAudioData(bytes); return { available: true, decoded: true, duration: decoded.duration, sampleRate: decoded.sampleRate }; } catch (error) { return { available: true, decoded: false, error: String(error) }; } finally { await context.close(); } });
      await page.goto(origin + '/controlled/'); await page.evaluate(async () => { await navigator.serviceWorker.register('./sw.js'); await navigator.serviceWorker.ready; }); await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
      await page.evaluate(() => { window.workerHits = []; navigator.serviceWorker.addEventListener('message', e => workerHits.push(e.data)); });
      const cachedFetch = await page.evaluate(async () => { const r = await fetch('./sw-only.wav', { headers: { Range: 'bytes=0-1' } }); return { status: r.status, worker: r.headers.get('x-audio-probe'), length: (await r.arrayBuffer()).byteLength }; });
      const workerCases = [];
      for (const [file, outage] of [['tone.wav', false], ['sw-only.wav', false], ['offline-only.wav', true]]) {
        if (outage) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
        const startHit = hits.length;
        await page.evaluate(file => { workerHits.length = 0; const a = new Audio('./' + file); document.body.append(a); window.sample = a; window.result = { playError: null }; document.getElementById('play').onclick = () => void a.play().catch(e => { result.playError = { name: e.name, message: e.message }; }); }, file);
        await page.locator('#play').click(); await page.waitForFunction(() => sample.error || result.playError || sample.currentTime > .1, undefined, { timeout: 5000 }).catch(() => {});
        const result = await page.evaluate(() => { const a = sample; const r = { passed: !a.error && a.currentTime > .1, errorCode: a.error?.code ?? null, playError: result.playError, workerHits: [...workerHits] }; a.pause(); a.removeAttribute('src'); a.load(); a.remove(); return r; }); workerCases.push({ file, outage, ...result, originHits: hits.slice(startHit) });
        if (outage) await new Promise(resolve => server.listen(Number(new URL(origin).port), '127.0.0.1', resolve));
      }
      results.push({ engine, version: browser.version(), capabilities, cases, webAudio, cachedFetch, workerCases }); console.log(engine + ' ' + JSON.stringify({ cases, webAudio, cachedFetch, workerCases }));
    } finally { await browser.close(); }
  }
  assert.ok(results.filter(r => r.engine !== 'webkit').every(r => r.cases.every(c => c.passed) && r.workerCases.every(c => c.passed)), 'positive controls must play');
  await mkdir(output, { recursive: true }); await writeFile(path.join(output, 'native-media-probe.json'), JSON.stringify({ schemaVersion: 1, hostPlatform: process.platform, baselineHasNoGameCodeOrWorker: true, controlledCasesUseIsolatedWorker: true, publicDeployment: false, physicalDevice: false, results, hits }, null, 2));
} finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
