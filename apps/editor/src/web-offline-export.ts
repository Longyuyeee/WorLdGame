import { createBlobDigest } from "@world-studio/project-persistence";

const client = String.raw`(() => {
  const panel = document.getElementById('offline-panel');
  const version = document.getElementById('world-publication-version');
  const layout = () => document.body.style.setProperty('--player-viewport-offset', Math.ceil((panel?.getBoundingClientRect().height ?? 0) + (version?.getBoundingClientRect().height ?? 0)) + 'px');
  layout();
  panel?.addEventListener('toggle', layout);
  // details.toggle may be queued after its open attribute has already changed layout.
  // Rebudget in the mutation microtask so the first expanded frame stays readable.
  if (panel && typeof MutationObserver === 'function') new MutationObserver(layout).observe(panel, { attributes: true, attributeFilter: ['open'] });
  window.addEventListener('resize', layout);
  if (typeof ResizeObserver === 'function') {
    const observer = new ResizeObserver(layout);
    if (panel) observer.observe(panel);
    if (version) observer.observe(version);
  }
  const status = document.getElementById('offline-status');
  const action = document.getElementById('offline-action');
  const install = document.getElementById('offline-install');
  let registration, promptEvent;
  const say = text => { status.textContent = text; };
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); promptEvent = event; install.hidden = false;
  });
  install.onclick = async () => {
    if (!promptEvent) return;
    await promptEvent.prompt(); await promptEvent.userChoice;
    promptEvent = undefined; install.hidden = true;
  };
  if (location.protocol === 'world-game:') {
    say('桌面播放器已使用本地游戏文件，无需下载网站离线内容。'); action.hidden = true; return;
  }
  if (location.protocol === 'file:') {
    say('本地目录可直接试玩；网站离线与安装需发布到 HTTPS 站点。'); action.hidden = true; return;
  }
  if (!isSecureContext || !('serviceWorker' in navigator)) {
    say('当前浏览器或网址不支持网站离线，可继续在线玩；请使用 HTTPS 或下载完整目录包。'); action.hidden = true; return;
  }
  const request = (worker, type) => new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => { channel.port1.close(); reject(new Error('timeout')); }, type === 'CACHE' ? 300000 : 10000);
    channel.port1.onmessage = event => { clearTimeout(timer); channel.port1.close(); resolve(event.data); };
    worker.postMessage({ type }, [channel.port2]);
  });
  const waiting = () => {
    if (!registration?.waiting) return false;
    say('新版已下载，当前故事仍使用原版，不会自动打断。只有作者核对过的兼容版本才能继续旧档；未经核对的更新请保留原版入口。关闭所有游戏窗口后重新打开会使用新版。');
    action.disabled = false; action.textContent = '检查更新'; return true;
  };
  const ready = async () => {
    if (waiting()) return;
    if (!registration?.active) return;
    try {
      const result = await request(registration.active, 'STATUS');
      if (waiting()) return;
      if (result.ready) { say('离线内容已就绪，可断网后重开此网址。浏览器清理站点数据后需重新下载。'); action.textContent = '检查更新'; }
      else { say('离线内容不完整，请联网重新下载；在线游玩仍可继续。'); action.textContent = '重试离线下载'; }
    } catch { say('暂时无法确认离线内容，请联网重试。'); action.textContent = '重试离线下载'; }
    action.disabled = false;
  };
  const observe = worker => {
    if (!worker) return;
    say('正在下载离线内容，请保持页面打开；你可以继续游玩。'); action.disabled = true;
    const changed = () => {
      if (worker.state === 'activated') void ready();
      if (worker.state === 'installed') { if (!waiting()) say('离线下载完成，正在准备…'); }
      if (worker.state === 'redundant') { say('离线下载失败，请检查网络和可用空间后重试；在线游戏仍可继续。'); action.disabled = false; action.textContent = '重试离线下载'; }
    };
    worker.addEventListener('statechange', changed); changed();
  };
  const watch = () => {
    registration.addEventListener('updatefound', () => observe(registration.installing));
    if (registration.installing) observe(registration.installing); else void ready();
  };
  action.onclick = async () => {
    action.disabled = true;
    try {
      if (!registration || (!registration.active && !registration.waiting && !registration.installing)) { registration = await navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' }); watch(); }
      else if (action.textContent === '重试离线下载' && registration.active) {
        say('正在重新下载离线内容…');
        const result = await request(registration.active, 'CACHE');
        if (!result.ready) throw new Error('cache failed');
        await ready();
      } else {
        await registration.update();
        if (!registration.installing) await ready();
      }
    } catch { say('离线下载或更新失败，请检查网络和可用空间后重试；现有游戏可继续。'); action.disabled = false; action.textContent = '重试离线下载'; }
  };
  navigator.serviceWorker.getRegistration('./').then(value => {
    if (value && value.scope === new URL('./', location.href).href) { registration = value; watch(); }
  }).catch(() => { say('无法读取离线状态，请重试。'); });
})();`;

const worker = String.raw`
const prefix = 'world-offline:' + encodeURIComponent(self.registration.scope) + ':';
const cacheName = prefix + version;
const entries = Object.entries(inventory).map(([path, digest]) => [new URL(path, self.registration.scope).href, digest]);
const urls = new Set(entries.map(([url]) => url));
async function fill() {
  const cache = await caches.open(cacheName);
  for (const [url, digest] of entries) {
    if (await cache.match(url)) continue;
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error('missing file');
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await response.clone().arrayBuffer()))).map(x => x.toString(16).padStart(2, '0')).join('');
    if ('sha256:' + hash !== digest) throw new Error('incomplete deployment');
    await cache.put(url, response);
  }
}
async function complete() {
  const cache = await caches.open(cacheName);
  return (await Promise.all(entries.map(async ([url]) => Boolean(await cache.match(url))))).every(Boolean);
}
self.addEventListener('install', event => event.waitUntil(fill().catch(async error => { await caches.delete(cacheName); throw error; })));
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (key.startsWith(prefix) && key !== cacheName) await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('message', event => {
  if (!['STATUS', 'CACHE'].includes(event.data?.type)) return;
  event.waitUntil((async () => {
    try { if (event.data.type === 'CACHE') await fill(); event.ports[0]?.postMessage({ ready: await complete(), version }); }
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
  files["index.html"] = encode(new TextDecoder().decode(files["index.html"]).replace('</head>', `<meta name="application-version" content="${publicationVersion}"><link rel="icon" href="${icon?.path ?? "app-icon.svg"}"></head>`).replace('<body>', `<body style="--player-viewport-offset:68px"><p id="world-publication-version" style="margin:0;padding:4px 12px;background:#181827;color:#eee;font:12px/16px system-ui">版本 ${publicationVersion}</p>`));
  const panel = `<details id="offline-panel"><summary>离线与安装 · <span id="offline-status" role="status">尚未下载离线内容</span></summary><p>需要约 ${size} MiB 空间及下载流量。安装入口由浏览器提供，也可查看浏览器菜单中的“安装/添加到主屏幕”。</p><button id="offline-action" type="button">下载离线内容</button> <button id="offline-install" type="button" hidden>安装游戏</button></details>`;
  files["offline.css"] = encode('#offline-panel{box-sizing:border-box;width:100%;padding:8px 16px;background:#181827;color:#eee;font:14px/1.5 system-ui;overflow-wrap:anywhere}#offline-panel summary{cursor:pointer;min-height:28px}#offline-panel p{margin:8px 0}#offline-panel button{min-height:44px;padding:8px 14px;border-radius:8px;border:1px solid #b9a8ed;background:#292638;color:#fff}#offline-panel button[hidden]{display:none}');
  files["index.html"] = encode(new TextDecoder().decode(files["index.html"]).replace('</head>', '<link rel="manifest" href="manifest.webmanifest"><meta name="theme-color" content="#181827"><link rel="stylesheet" href="offline.css"></head>').replace(/<body([^>]*)>/, '<body$1>' + panel).replace('</body>', '<script src="offline.js"></script></body>'));
  const inventory = Object.fromEntries(Object.entries(files).map(([path, bytes]) => [path, createBlobDigest(bytes)]));
  // Worker bytes participate in the version so fixes also create a fresh cache.
  const version = createBlobDigest(encode(JSON.stringify({ inventory, worker })));
  files["sw.js"] = encode(`const inventory = ${JSON.stringify(inventory)};\nconst version = ${JSON.stringify(version)};\n${worker}`);
}
