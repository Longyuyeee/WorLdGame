import { createBlobDigest } from "@world-studio/project-persistence";

const client = String.raw`(() => {
  const status = document.getElementById('offline-status');
  const summary = document.getElementById('offline-summary');
  const action = document.getElementById('offline-action');
  const cancel = document.getElementById('offline-cancel');
  const install = document.getElementById('offline-install');
  let registration, promptEvent, operation, cancelledWorker, lastFailure, epoch = 0;
  const say = (text, label) => { status.textContent = text; summary.textContent = label; };
  const finish = () => {
    const restoreFocus = document.activeElement === cancel || (operation?.restoreFocus && document.activeElement === document.body);
    epoch++; operation = undefined; lastFailure = undefined; cancel.hidden = true; cancel.disabled = false; cancel.textContent = '取消下载'; action.disabled = false;
    if (restoreFocus) action.focus();
  };
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); promptEvent = event; install.hidden = false;
  });
  install.onclick = async () => {
    if (!promptEvent) return;
    await promptEvent.prompt(); await promptEvent.userChoice;
    promptEvent = undefined; install.hidden = true;
  };
  if (location.protocol === 'world-game:') {
    say('桌面播放器已使用本地游戏文件，无需下载网站离线内容。', '本地文件'); action.hidden = true; return;
  }
  if (location.protocol === 'file:') {
    say('本地目录可直接试玩；网站离线与安装需发布到 HTTPS 站点。', '本地文件'); action.hidden = true; return;
  }
  if (!isSecureContext || !('serviceWorker' in navigator)) {
    say('当前浏览器或网址不支持网站离线，可继续在线玩；请使用 HTTPS 或下载完整目录包。', '当前环境不支持'); action.hidden = true; return;
  }
  const request = (worker, type, requestId) => new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => { channel.port1.close(); reject(new Error('timeout')); }, type === 'CACHE' ? 300000 : 10000);
    channel.port1.onmessage = event => { clearTimeout(timer); channel.port1.close(); resolve(event.data); };
    try { worker.postMessage({ type, requestId }, [channel.port2]); }
    catch (error) { clearTimeout(timer); channel.port1.close(); reject(error); }
  });
  const start = (worker, mode, id = 'install') => {
    epoch++; cancelledWorker = undefined; lastFailure = undefined; operation = { worker, mode, id };
    action.disabled = true; cancel.hidden = false; cancel.disabled = false; cancel.textContent = '取消下载';
    say('正在下载并核对离线文件；可以返回故事继续游玩。', '下载中'); return operation;
  };
  const cancelled = mode => {
    finish();
    say(mode === 'update' ? '已取消新版下载，原有离线内容和故事进度保留。需要时可重试更新。' : '已取消离线下载，故事进度不会删除。联网时仍可继续玩，需要离线时请重试下载。', '已取消');
    action.textContent = mode === 'update' ? '重试更新' : '重试离线下载';
  };
  const waiting = () => {
    if (!registration?.waiting) return false;
    finish();
    say('新版已下载，当前故事仍使用原版，不会自动打断。只有作者核对过的兼容版本才能继续旧档；未经核对的更新请保留原版入口。关闭所有游戏窗口后重新打开会使用新版。', '新版等待重开');
    action.textContent = '检查更新'; return true;
  };
  const ready = async () => {
    if (waiting()) return;
    if (!registration?.active) return;
    const pending = epoch;
    try {
      const result = await request(registration.active, 'STATUS');
      if (epoch !== pending) return;
      if (waiting()) return;
      finish();
      if (result.ready) { say('离线内容已就绪（文件已缓存）。请在当前浏览器断网重开并核对画面、声音和存读档；浏览器清理站点数据后需重新下载。', '文件已缓存'); action.textContent = '检查更新'; }
      else { say('离线内容不完整，请联网重新下载；在线游玩仍可继续。', '需要重新下载'); action.textContent = '重试离线下载'; }
    } catch { if (epoch !== pending) return; finish(); say('暂时无法确认离线内容，请联网重试。', '状态未确认'); action.textContent = '重试离线下载'; }
  };
  const failed = (cacheRepair, detail) => {
    const updating = Boolean(registration?.active) && !cacheRepair;
    const pending = operation ?? lastFailure; finish(); lastFailure = pending;
    const file = detail?.path ? ' 未完成文件：' + String(detail.path).slice(0, 256) + '。' : '';
    const reason = detail?.reason === 'integrity' ? '文件与本版清单不一致，请联系发布者检查上传是否完整。' : detail?.reason === 'http' ? '下载返回 HTTP ' + detail.httpStatus + '；请检查网络，或联系发布者检查该文件。' : '请检查网络和可用空间后重试。';
    say((updating ? '新版下载或更新失败，原有离线内容保留，当前故事不会切换。' : '离线下载失败，在线游戏仍可继续。') + file + reason, updating ? '更新失败' : '下载失败');
    action.textContent = updating ? '重试更新' : '重试离线下载';
  };
  navigator.serviceWorker.addEventListener('message', event => {
    const detail = event.data;
    const pending = operation ?? (detail?.phase === 'failed' ? lastFailure : undefined);
    if (!pending || event.source !== pending.worker || detail?.type !== 'WORLD_OFFLINE_PROGRESS' || detail.requestId !== pending.id || cancelledWorker === event.source) return;
    if (detail.phase === 'cancelled') { cancelledWorker = event.source; cancelled(operation.mode); }
    else if (detail.phase === 'failed') failed(pending.mode === 'repair', detail);
    else if (detail.phase === 'progress' && Number.isSafeInteger(detail.completed) && Number.isSafeInteger(detail.total) && detail.total > 0 && detail.completed >= 0 && detail.completed <= detail.total) {
      say('正在下载并核对离线内容：' + detail.completed + ' / ' + detail.total + ' 个文件。' + (detail.path ? ' 当前：' + String(detail.path).slice(0, 256) + '。' : '') + '可以返回故事继续游玩。', '下载中 ' + detail.completed + '/' + detail.total);
    }
  });
  const observe = worker => {
    if (!worker) return;
    start(worker, registration?.active ? 'update' : 'download');
    const changed = () => {
      if (cancelledWorker === worker) return;
      if (worker.state === 'activated') void ready();
      if (worker.state === 'installed') { if (!waiting()) say('离线下载完成，正在准备…', '正在准备'); }
      if (worker.state === 'redundant' && operation?.worker === worker) failed(false);
    };
    worker.addEventListener('statechange', changed); changed();
  };
  const watch = () => {
    registration.addEventListener('updatefound', () => observe(registration.installing));
    if (registration.installing) observe(registration.installing); else void ready();
  };
  cancel.onclick = async () => {
    const pending = operation; if (!pending) return;
    pending.restoreFocus = document.activeElement === cancel;
    cancelledWorker = pending.worker; cancel.disabled = true; cancel.textContent = '正在取消…';
    try {
      const result = await request(pending.worker, 'CANCEL', pending.id);
      if (operation !== pending) return;
      if (result.cancelled) cancelled(pending.mode);
      else { cancelledWorker = undefined; await ready(); }
    } catch {
      if (operation !== pending) return;
      cancelledWorker = undefined; cancel.disabled = false; cancel.textContent = '取消下载';
      say('暂时无法确认取消结果；可以继续游玩，或再次取消下载。', '取消未确认');
    }
  };
  action.onclick = async () => {
    const cacheRepair = action.textContent === '重试离线下载' && Boolean(registration?.active);
    action.disabled = true;
    let pending;
    try {
      if (!registration || (!registration.active && !registration.waiting && !registration.installing)) { registration = await navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' }); watch(); }
      else if (cacheRepair) {
        pending = start(registration.active, 'repair', crypto.randomUUID());
        const result = await request(registration.active, 'CACHE', pending.id);
        if (operation !== pending || cancelledWorker === pending.worker) return;
        if (result.busy) { finish(); say('另一窗口正在下载本游戏的离线内容，可以继续游玩，稍后再核对。', '另一窗口下载中'); action.textContent = '重试离线下载'; return; }
        if (!result.ready) throw new Error('cache failed');
        await ready();
      } else {
        const pendingEpoch = epoch;
        await registration.update();
        if (!registration.installing && epoch === pendingEpoch) await ready();
      }
    } catch { if (pending ? operation === pending && cancelledWorker !== pending.worker : !cancelledWorker) failed(cacheRepair); }
  };
  navigator.serviceWorker.getRegistration('./').then(value => {
    if (value && value.scope === new URL('./', location.href).href) { registration = value; watch(); }
  }).catch(() => { say('无法读取离线状态，请重试。', '状态未确认'); });
})();`;

const worker = String.raw`
const prefix = 'world-offline:' + encodeURIComponent(self.registration.scope) + ':';
const cacheName = prefix + version;
const entries = Object.entries(inventory).map(([path, digest]) => [new URL(path, self.registration.scope).href, digest]);
const urls = new Set(entries.map(([url]) => url));
let activeTask;
async function report(task, phase, detail = {}) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clients) if (client.url.startsWith(self.registration.scope)) {
    try { client.postMessage({ type: 'WORLD_OFFLINE_PROGRESS', requestId: task.id, phase, completed: task.completed, total: entries.length, path: task.path, ...detail }); } catch { /* A closed page must not fail the download. */ }
  }
}
function fill(requestId = 'install') {
  if (activeTask) return activeTask.promise;
  const task = { id: requestId, controller: new AbortController(), completed: 0, path: '' };
  activeTask = task;
  task.promise = (async () => {
    const signal = task.controller.signal;
    try {
      const cache = await caches.open(cacheName);
      for (const [url, digest] of entries) {
        task.path = url.slice(self.registration.scope.length);
        if (signal.aborted) throw new DOMException('cancelled', 'AbortError');
        await report(task, 'progress');
        if (!await cache.match(url)) {
          const response = await fetch(url, { cache: 'no-store', signal });
          if (!response.ok) throw Object.assign(new Error('missing file'), { reason: 'http', httpStatus: response.status });
          const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await response.clone().arrayBuffer()))).map(x => x.toString(16).padStart(2, '0')).join('');
          if ('sha256:' + hash !== digest) throw Object.assign(new Error('incomplete deployment'), { reason: 'integrity' });
          if (signal.aborted) throw new DOMException('cancelled', 'AbortError');
          await cache.put(url, response);
        }
        task.completed++;
      }
      task.path = ''; await report(task, 'progress');
    } catch (error) {
      await report(task, signal.aborted ? 'cancelled' : 'failed', { reason: error.reason, httpStatus: error.httpStatus });
      throw error;
    } finally { if (activeTask === task) activeTask = undefined; }
  })();
  return task.promise;
}
async function complete() {
  if (!(await caches.keys()).includes(cacheName)) return false;
  const cache = await caches.open(cacheName);
  return (await Promise.all(entries.map(async ([url]) => Boolean(await cache.match(url))))).every(Boolean);
}
self.addEventListener('install', event => event.waitUntil(fill().catch(async error => { await caches.delete(cacheName); throw error; })));
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (key.startsWith(prefix) && key !== cacheName) await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('message', event => {
  if (!['STATUS', 'CACHE', 'CANCEL'].includes(event.data?.type)) return;
  event.waitUntil((async () => {
    try {
      if (event.data.type === 'CANCEL') {
        const task = activeTask, owned = Boolean(task && task.id === event.data.requestId);
        if (owned) { task.controller.abort(); await task.promise.catch(() => {}); }
        event.ports[0]?.postMessage({ cancelled: owned, ready: owned && task.id === 'install' ? false : await complete(), version }); return;
      }
      if (event.data.type === 'CACHE') {
        if (activeTask && activeTask.id !== event.data.requestId) { event.ports[0]?.postMessage({ busy: true, version }); return; }
        await fill(event.data.requestId);
      }
      event.ports[0]?.postMessage({ ready: await complete(), version });
    }
    catch { event.ports[0]?.postMessage({ ready: false, version }); }
  })());
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url); url.search = ''; url.hash = '';
  if (url.href === self.registration.scope) url.pathname += 'index.html';
  if (!urls.has(url.href)) return;
  event.respondWith((async () => {
    const response = await (await caches.open(cacheName)).match(url.href);
    if (!response) return fetch(event.request);
    const range = event.request.headers.get('range');
    if (!range) return response;
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) return response;
    const bytes = await response.arrayBuffer();
    const start = match[1] ? Number(match[1]) : Math.max(0, bytes.byteLength - Number(match[2]));
    const end = match[1] && match[2] ? Math.min(Number(match[2]), bytes.byteLength - 1) : bytes.byteLength - 1;
    if (start > end) return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + bytes.byteLength } });
    const headers = new Headers(response.headers); headers.delete('Content-Encoding');
    headers.set('Content-Range', 'bytes ' + start + '-' + end + '/' + bytes.byteLength);
    headers.set('Content-Length', String(end - start + 1)); headers.set('Accept-Ranges', 'bytes');
    return new Response(bytes.slice(start, end + 1), { status: 206, headers });
  })());
});`;

export function addWebOfflineFiles(files: Record<string, Uint8Array>, title: string, publicationVersion = "1.0.0", icon?: { path: string; size: number }): void {
  const encode = (text: string) => new TextEncoder().encode(text);
  const size = (Object.values(files).reduce((sum, bytes) => sum + bytes.byteLength, 0) / 1048576).toFixed(1);
  files["offline.js"] = encode(client);
  files["app-icon.svg"] = encode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="100" fill="#181827"/><path d="M96 148h56l40 180 38-132h52l38 132 40-180h56l-66 224h-56l-38-128-38 128h-56z" fill="#c5b5ff"/></svg>');
  files["manifest.webmanifest"] = encode(JSON.stringify({ id: "./", name: title, short_name: title.slice(0, 24), lang: "zh-CN", start_url: "./index.html", scope: "./", display: "standalone", background_color: "#181827", theme_color: "#181827", icons: [{ src: icon?.path ?? "app-icon.svg", sizes: icon ? `${icon.size}x${icon.size}` : "any", type: icon ? "image/png" : "image/svg+xml", purpose: "any" }] }));
  files["index.html"] = encode(new TextDecoder().decode(files["index.html"]).replace('</head>', `<meta name="application-version" content="${publicationVersion}"><link rel="icon" href="${icon?.path ?? "app-icon.svg"}"></head>`));
  const panel = `<div id="world-publication-home" hidden><section id="world-publication-tools" aria-label="游戏信息"><p id="world-publication-version">版本 ${publicationVersion}</p><details id="offline-panel"><summary>离线与安装 · <span id="offline-summary" role="status">尚未下载</span></summary><p id="offline-status" role="status">尚未下载离线内容</p><p>需要约 ${size} MiB 空间及下载流量。安装入口由浏览器提供，也可查看浏览器菜单中的“安装/添加到主屏幕”。</p><button id="offline-action" type="button">下载离线内容</button> <button id="offline-cancel" type="button" hidden>取消下载</button> <button id="offline-install" type="button" hidden>安装游戏</button></details></section></div>`;
  files["offline.css"] = encode('#offline-panel{box-sizing:border-box;width:100%;color:var(--player-ink,#eee);font:14px/1.6 system-ui;overflow-wrap:anywhere}#offline-panel summary{box-sizing:border-box;cursor:pointer;min-height:44px;padding:10px 12px;border:1px solid var(--player-muted,#b9a8ed);border-radius:8px}#offline-panel summary:focus-visible{outline:3px solid var(--player-accent,#b9a8ed);outline-offset:-3px}#offline-panel p{margin:10px 0}#offline-panel button{min-height:44px;padding:8px 14px;border-radius:8px;border:1px solid var(--player-muted,#b9a8ed);background:var(--player-panel,#292638);color:inherit}#offline-panel button[hidden]{display:none}');
  files["index.html"] = encode(new TextDecoder().decode(files["index.html"]).replace('</head>', '<link rel="manifest" href="manifest.webmanifest"><meta name="theme-color" content="#181827"><link rel="stylesheet" href="offline.css"></head>').replace(/<body([^>]*)>/, '<body$1>' + panel).replace('</body>', '<script src="offline.js"></script></body>'));
  const inventory = Object.fromEntries(Object.entries(files).map(([path, bytes]) => [path, createBlobDigest(bytes)]));
  // Worker bytes participate in the version so fixes also create a fresh cache.
  const version = createBlobDigest(encode(JSON.stringify({ inventory, worker })));
  files["sw.js"] = encode(`const inventory = ${JSON.stringify(inventory)};\nconst version = ${JSON.stringify(version)};\n${worker}`);
}
