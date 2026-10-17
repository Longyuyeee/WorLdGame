import { createBlobDigest } from "@world-studio/project-persistence";

const client = String.raw`(() => {
  const status = document.getElementById('offline-status');
  const summary = document.getElementById('offline-summary');
  const action = document.getElementById('offline-action');
  const cancel = document.getElementById('offline-cancel');
  const install = document.getElementById('offline-install');
  const tools = document.getElementById('world-publication-tools');
  const plan = document.getElementById('offline-update-plan');
  const acknowledge = document.getElementById('offline-update-ack');
  const confirm = document.getElementById('offline-update-confirm');
  const latestLink = document.getElementById('offline-open-latest');
  const storageOpen = document.getElementById('offline-storage-open'), storagePanel = document.getElementById('offline-storage');
  const storageStatus = document.getElementById('offline-storage-status'), storageList = document.getElementById('offline-storage-list');
  const storageConfirm = document.getElementById('offline-storage-confirm'), storageAck = document.getElementById('offline-storage-ack'), storageDelete = document.getElementById('offline-storage-delete');
  let storageEpoch = 0, storageBusy = false, selectedRelease, storageTrigger;
  const ownRelease = tools.dataset.worldRelease, ownVersion = tools.dataset.publicationVersion;
  let latestInfo, planBusy = false;
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
  if (document.getElementById('player-root')?.dataset.startupState === 'release-missing') { action.hidden = true; return; }
  const releaseUrl = release => { const url = new URL(location.pathname, location.href); url.searchParams.set('world-release', release); return url.href; };
  document.getElementById('offline-keep-entry').onclick = () => {
    const entry = document.getElementById('offline-current-entry'); entry.value = releaseUrl(ownRelease); entry.hidden = false; entry.focus(); entry.select();
  };
  const openBackup = () => {
    if (tools.dispatchEvent(new Event('world-open-save-backup', { cancelable: true }))) say('暂时无法打开备份，请从存读档的“备份”页导出进度；当前故事保持不变。', '请先备份');
  };
  document.getElementById('offline-backup').onclick = openBackup;
  document.getElementById('offline-storage-backup').onclick = openBackup;
  const updatePlan = () => {
    const newer = latestInfo && latestInfo.releaseId !== ownRelease;
    confirm.hidden = false;
    confirm.disabled = !acknowledge.checked || Boolean(operation) || planBusy;
    confirm.textContent = registration?.waiting ? '启用已下载新版（本版仍保留）' : newer ? '再次检查更新' : '确认检查并下载';
    latestLink.hidden = !newer || Boolean(registration?.waiting) || !acknowledge.checked;
    if (newer) latestLink.href = releaseUrl(latestInfo.releaseId);
    document.getElementById('offline-version-note').textContent = newer ? '当前窗口：' + ownVersion + '；本机可用新版：' + latestInfo.publicationVersion + '。版本号相同也可能是运行文件更新；旧档仍需实际核验。' : '当前窗口：' + ownVersion + '。先保留需要的进度和本版入口，再检查更新。';
  };
  const setLatest = info => {
    if (!info || !/^sha256:[a-f0-9]{64}$/.test(info.releaseId) || typeof info.publicationVersion !== 'string') return;
    if (latestInfo?.releaseId !== info.releaseId) acknowledge.checked = false;
    latestInfo = info; updatePlan();
  };
  const showPlan = () => { plan.hidden = false; updatePlan(); };
  acknowledge.onchange = updatePlan;
  document.getElementById('offline-update-later').onclick = () => { plan.hidden = true; action.focus(); };
  const request = (worker, type, requestId, detail = {}) => new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => { channel.port1.close(); reject(new Error('timeout')); }, type === 'CACHE' ? 300000 : 10000);
    channel.port1.onmessage = event => { clearTimeout(timer); channel.port1.close(); resolve(event.data); };
    try { worker.postMessage({ ...detail, type, requestId }, [channel.port2]); }
    catch (error) { clearTimeout(timer); channel.port1.close(); reject(error); }
  });
  const storageReasons = { current: '当前窗口正在使用，不能清理。', default: '本机默认版本，保留供启动与离线使用。', used: '其他游戏窗口正在使用；请先关闭对应窗口，再刷新列表。', unknownWindow: '存在无法确认版本的游戏窗口；请先关闭其他游戏窗口，再刷新。', updating: '正在下载、修复或等待启用新版，请完成后再清理。', unknown: '版本信息缺失或损坏，暂不清理，避免误删。', busy: '缓存正在读取或清理，请稍后刷新重试。', missing: '这个版本已不在缓存中，请刷新列表。', invalid: '清理请求无效，未执行清理。' };
  const sizeText = bytes => Number.isSafeInteger(bytes) && bytes >= 0 ? '约 ' + (bytes / 1048576).toFixed(1) + ' MiB' : '大小未能读取';
  const clearSelection = () => { selectedRelease = undefined; storageConfirm.hidden = true; storageAck.checked = false; storageDelete.disabled = true; document.getElementById('offline-storage-cancel').disabled = false; };
  const drawStorage = result => {
    storageList.replaceChildren();
    for (const item of result.releases) {
      const row = document.createElement('article'), title = document.createElement('h4'), info = document.createElement('p'), reason = document.createElement('p'), remove = document.createElement('button');
      const label = (item.publicationVersion ? '版本 ' + String(item.publicationVersion).slice(0, 64) : '版本信息未知') + ' · 构建 ' + item.releaseId.slice(-8);
      row.setAttribute('aria-label', label); title.textContent = label;
      info.textContent = item.fileCount + ' 个缓存文件 · 内容' + sizeText(item.byteLength) + (item.complete ? ' · 文件齐全' : ' · 文件不完整或信息缺失');
      reason.textContent = storageReasons[item.reason] ?? '未在使用，可以选择清理。';
      remove.type = 'button'; remove.textContent = '清理这个版本'; remove.disabled = Boolean(item.reason);
      remove.onclick = () => {
        if (storageBusy) return;
        clearSelection(); selectedRelease = item.releaseId; storageTrigger = remove; storageConfirm.hidden = false;
        document.getElementById('offline-storage-selected').textContent = '准备清理：' + label + '，缓存文件内容' + sizeText(item.byteLength) + '。';
        storageAck.focus();
      };
      row.append(title, info, reason, remove); storageList.append(row);
    }
    return result.releases.length ? '本游戏 ' + result.releases.length + ' 份缓存，文件内容合计' + sizeText(result.byteLength) + '。' : '本游戏尚无可识别的版本缓存。';
  };
  const loadStorage = async note => {
    if (storageBusy) return;
    const current = ++storageEpoch, worker = registration?.active;
    const report = text => { storageStatus.textContent = (note ? note + ' ' : '') + text; };
    clearSelection(); storageBusy = true; document.getElementById('offline-storage-refresh').disabled = true; storageList.replaceChildren(); storageStatus.textContent = '正在核对本游戏的缓存文件与使用窗口…';
    try {
      if (!worker) { report('本游戏离线组件尚未就绪，请先下载离线内容。'); return; }
      const result = await request(worker, 'STORAGE');
      if (current !== storageEpoch) return;
      if (registration.active !== worker) { report('离线组件已切换，请刷新缓存列表。'); return; }
      if (result.busy) { report('另一窗口正在核对或清理缓存，请稍后刷新。'); return; }
      if (result.schemaVersion !== 1 || !Array.isArray(result.releases)) throw new Error('unsupported');
      report(drawStorage(result));
    } catch { if (current === storageEpoch) report(note ? '暂时无法刷新缓存列表，请稍后再核对。' : '暂时无法读取缓存列表，离线组件可能较旧。请完成更新后重试；未执行清理。'); }
    finally { if (current === storageEpoch) { storageBusy = false; document.getElementById('offline-storage-refresh').disabled = false; } }
  };
  storageOpen.hidden = false;
  storageOpen.onclick = () => { storagePanel.hidden = false; void loadStorage(); };
  document.getElementById('offline-storage-refresh').onclick = () => { void loadStorage(); };
  document.getElementById('offline-storage-close').onclick = () => { storagePanel.hidden = true; clearSelection(); storageOpen.focus(); };
  document.getElementById('offline-storage-cancel').onclick = () => { if (storageBusy) return; clearSelection(); storageTrigger?.focus(); };
  storageAck.onchange = () => { storageDelete.disabled = !storageAck.checked || storageBusy; };
  storageDelete.onclick = async () => {
    const releaseId = selectedRelease, worker = registration?.active;
    if (!releaseId || !storageAck.checked || storageBusy || !worker) return;
    const startedHere = storageConfirm.contains(document.activeElement);
    storageBusy = true; storageDelete.disabled = true; document.getElementById('offline-storage-cancel').disabled = true; document.getElementById('offline-storage-refresh').disabled = true; storageStatus.textContent = '正在重新核对使用窗口并清理所选版本；提交后不能撤销…';
    let restoreFocus = false;
    try {
      const result = await request(worker, 'DELETE_RELEASE', undefined, { releaseId, confirmed: true });
      restoreFocus = startedHere && (storageConfirm.contains(document.activeElement) || document.activeElement === document.body);
      storageBusy = false;
      await loadStorage(result.deleted ? '所选版本缓存已移除；存档未删除，原版入口不再可用。实际回收空间由浏览器决定。' : storageReasons[result.reason] ?? '未能确认清理结果，请刷新列表核对。');
    } catch { restoreFocus = startedHere && (storageConfirm.contains(document.activeElement) || document.activeElement === document.body); storageBusy = false; clearSelection(); document.getElementById('offline-storage-refresh').disabled = false; storageStatus.textContent = '未能确认清理结果，请刷新列表核对；不要重复提交。'; }
    if (restoreFocus && !storagePanel.hidden) document.getElementById('offline-storage-refresh').focus();
  };
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
    say('新版已下载。当前窗口继续本版，重开本版入口也不会自动换剧情。先备份并保留本版入口，再选择启用新版；本机缓存并非永久备份。', '新版等待选择');
    action.textContent = '查看已下载新版'; showPlan();
    const worker = registration.waiting;
    void request(worker, 'INFO').then(info => { if (registration.waiting === worker || registration.active === worker) setLatest(info); }).catch(() => {});
    return true;
  };
  const ready = async () => {
    if (waiting()) return;
    if (!registration?.active) return;
    const pending = ++epoch, worker = registration.active;
    try {
      const result = await request(worker, 'STATUS');
      if (epoch !== pending || registration.active !== worker) return;
      if (waiting()) return;
      finish();
      setLatest(result.latest);
      if (result.ready) { say(result.retained ? '本版离线内容仍保留，本机另有新版。可先备份并保留本版入口，再选择在新窗口打开新版；当前故事不会切换。' : '离线内容已就绪（文件已缓存）。请在当前浏览器断网重开并核对画面、声音和存读档；浏览器清理站点数据后需重新下载。', '文件已缓存'); action.textContent = result.retained ? '查看版本与备份' : '检查更新'; }
      else if (result.retained) { say('本版缓存不完整，不能用新版文件补齐。请保留存档备份，使用作者提供的原版完整游戏；也可查看新版，但旧档可能不兼容。', '旧版文件缺失'); action.textContent = '查看版本与备份'; }
      else { say('离线内容不完整，请联网重新下载；在线游玩仍可继续。', '需要重新下载'); action.textContent = '重试离线下载'; }
    } catch { if (epoch !== pending || registration.active !== worker) return; finish(); say('暂时无法确认离线内容，请联网重试。', '状态未确认'); action.textContent = '重试离线下载'; }
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
  const perform = async approved => {
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
        if (!approved) { action.disabled = false; showPlan(); return; }
        if (registration.waiting) { await request(registration.waiting, 'ACTIVATE'); return; }
        const pendingEpoch = epoch, previousWorker = registration.active;
        await registration.update();
        if (!registration.installing && epoch === pendingEpoch) {
          await ready();
          if (!operation && !registration.waiting && registration.active === previousWorker) say('已检查更新，暂未发现新的可用版本。当前窗口继续本版，已缓存的其他版本仍可在下方选择。', '暂无新版');
        }
      }
    } catch { if (pending ? operation === pending && cancelledWorker !== pending.worker : !cancelledWorker) failed(cacheRepair); }
  };
  action.onclick = () => { void perform(false); };
  confirm.onclick = () => { if (!acknowledge.checked || planBusy) return; planBusy = true; confirm.disabled = true; void perform(true).finally(() => { planBusy = false; updatePlan(); }); };
  navigator.serviceWorker.addEventListener('controllerchange', () => { void ready(); });
  navigator.serviceWorker.getRegistration('./').then(value => {
    if (value && value.scope === new URL('./', location.href).href) { registration = value; watch(); }
  }).catch(() => { say('无法读取离线状态，请重试。', '状态未确认'); });
})();`;

const worker = String.raw`
const prefix = 'world-offline:' + encodeURIComponent(self.registration.scope) + ':';
const cacheName = prefix + version;
const entries = Object.entries(inventory).map(([path, digest]) => [new URL(path, self.registration.scope).href, digest]);
const metadataUrl = new URL('__world-release-info__', self.registration.scope).href;
const ownInfo = { schemaVersion: 1, releaseId: version, publicationVersion, inventory };
const releaseId = url => { const value = new URL(url).searchParams.get('world-release'); return value === null ? version : /^sha256:[a-f0-9]{64}$/.test(value) ? value : null; };
async function targetInfo(event) {
  const id = event.source?.url ? releaseId(event.source.url) : version;
  if (id === version) return { id, info: ownInfo };
  if (!id || !(await caches.keys()).includes(prefix + id)) return { id, info: null };
  try {
    const response = await (await caches.open(prefix + id)).match(metadataUrl), info = response && await response.json();
    return { id, info: info?.schemaVersion === 1 && info.releaseId === id && info.inventory && typeof info.publicationVersion === 'string' ? info : null };
  } catch { return { id, info: null }; }
}
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
      await cache.put(metadataUrl, new Response(JSON.stringify(ownInfo), { headers: { 'Content-Type': 'application/json' } }));
      task.path = ''; await report(task, 'progress');
    } catch (error) {
      await report(task, signal.aborted ? 'cancelled' : 'failed', { reason: error.reason, httpStatus: error.httpStatus });
      throw error;
    } finally { if (activeTask === task) activeTask = undefined; }
  })();
  return task.promise;
}
async function complete(id = version, info = ownInfo) {
  if (!id || !info || !(await caches.keys()).includes(prefix + id)) return false;
  const cache = await caches.open(prefix + id);
  return (await Promise.all(Object.keys(info.inventory).map(async path => Boolean(await cache.match(new URL(path, self.registration.scope).href))))).every(Boolean);
}
const deleting = new Set(); let readers = 0, listings = 0;
async function cachedInfo(id) {
  if (!/^sha256:[a-f0-9]{64}$/.test(id)) return null;
  const target = await targetInfo({ source: { url: self.registration.scope + '?world-release=' + encodeURIComponent(id) } });
  const info = target.info, entries = info && typeof info.inventory === 'object' && !Array.isArray(info.inventory) ? Object.entries(info.inventory) : [];
  return entries.length && entries.every(([path, digest]) => path && !path.startsWith('/') && !/[\\?#]/.test(path) && !path.split('/').some(part => part === '.' || part === '..') && new URL(path, self.registration.scope).href.startsWith(self.registration.scope) && /^sha256:[a-f0-9]{64}$/.test(digest)) ? info : null;
}
async function protection(id, source) {
  if (id === releaseId(source.url)) return 'current';
  if (id === version) return 'default';
  if (activeTask || self.registration.installing || self.registration.waiting) return 'updating';
  if (readers) return 'busy';
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of windows) {
    if (!client.url.startsWith(self.registration.scope)) continue;
    const selected = new URL(client.url).searchParams.get('world-release');
    if (!selected || !/^sha256:[a-f0-9]{64}$/.test(selected)) return 'unknownWindow';
    if (selected === id) return 'used';
  }
  return null;
}
async function storage(source) {
  if (deleting.size) return { busy: true };
  listings++;
  try {
  const releases = []; let byteLength = 0;
  for (const key of (await caches.keys()).sort()) {
    if (!key.startsWith(prefix)) continue;
    const id = key.slice(prefix.length); if (!/^sha256:[a-f0-9]{64}$/.test(id)) continue;
    const cache = await caches.open(key), info = await cachedInfo(id); let bytes = 0, fileCount = 0, known = true;
    for (const request of await cache.keys()) {
      if (request.url === metadataUrl) continue;
      fileCount++;
      try { const response = await cache.match(request); bytes += (await response.arrayBuffer()).byteLength; } catch { known = false; }
    }
    releases.push({ releaseId: id, publicationVersion: info?.publicationVersion, byteLength: known ? bytes : null, fileCount, complete: await complete(id, info), reason: await protection(id, source) ?? (info ? null : 'unknown') });
    byteLength = byteLength === null || !known ? null : byteLength + bytes;
  }
  return { schemaVersion: 1, releases, byteLength };
  } finally { listings--; }
}
async function deleteRelease(event) {
  const id = event.data.releaseId;
  if (event.data.confirmed !== true || typeof id !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(id)) return { deleted: false, reason: 'invalid' };
  if (deleting.size || listings) return { deleted: false, reason: 'busy' };
  deleting.add(id);
  try {
    const active = self.registration.active;
    const reason = await protection(id, event.source);
    if (reason) return { deleted: false, reason };
    if (!(await caches.keys()).includes(prefix + id)) return { deleted: false, reason: 'missing' };
    if (!await cachedInfo(id)) return { deleted: false, reason: 'unknown' };
    // Recheck after metadata I/O: a tab or update may have appeared since selection.
    const changed = await protection(id, event.source);
    if (changed || self.registration.active !== active) return { deleted: false, reason: changed ?? 'updating' };
    return { deleted: await caches.delete(prefix + id) };
  } finally { deleting.delete(id); }
}
self.addEventListener('install', event => event.waitUntil(fill().catch(async error => { await caches.delete(cacheName); throw error; })));
self.addEventListener('activate', event => event.waitUntil((async () => {
  // Pinned pages and their saved links still need previous public game bytes.
  // Never delete an older game merely because another build activates.
  await self.clients.claim();
})()));
self.addEventListener('message', event => {
  if (!['STATUS', 'CACHE', 'CANCEL', 'INFO', 'ACTIVATE', 'STORAGE', 'DELETE_RELEASE'].includes(event.data?.type)) return;
  event.waitUntil((async () => {
    try {
      if (['STORAGE', 'DELETE_RELEASE'].includes(event.data.type)) {
        if (!event.source?.url?.startsWith(self.registration.scope)) { event.ports[0]?.postMessage({ deleted: false, reason: 'invalid' }); return; }
        event.ports[0]?.postMessage(event.data.type === 'STORAGE' ? await storage(event.source) : await deleteRelease(event)); return;
      }
      if (event.data.type === 'INFO') { event.ports[0]?.postMessage(ownInfo); return; }
      if (event.data.type === 'ACTIVATE') { await self.skipWaiting(); event.ports[0]?.postMessage({ activated: true }); return; }
      const target = await targetInfo(event);
      if (event.data.type === 'CANCEL') {
        const task = activeTask, owned = Boolean(task && task.id === event.data.requestId);
        if (owned) { task.controller.abort(); await task.promise.catch(() => {}); }
        event.ports[0]?.postMessage({ cancelled: owned, ready: owned && task.id === 'install' ? false : await complete(), version }); return;
      }
      if (event.data.type === 'CACHE') {
        if (target.id !== version) { event.ports[0]?.postMessage({ ready: false, retained: true, latest: ownInfo }); return; }
        if (activeTask && activeTask.id !== event.data.requestId) { event.ports[0]?.postMessage({ busy: true, version }); return; }
        await fill(event.data.requestId);
      }
      event.ports[0]?.postMessage({ ready: await complete(target.id, target.info), version: target.id, retained: target.id !== version, latest: ownInfo });
    }
    catch { event.ports[0]?.postMessage({ ready: false, version }); }
  })());
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (!url.href.startsWith(self.registration.scope)) return;
  const requested = url.searchParams.get('world-release'); url.search = ''; url.hash = '';
  if (url.href === self.registration.scope) url.pathname += 'index.html';
  if (url.href === metadataUrl) { event.respondWith(new Response('Not a public game file', { status: 404 })); return; }
  const blocked = new Set(deleting); readers++;
  event.respondWith((async () => {
    try {
    const client = event.clientId ? await self.clients.get(event.clientId) : null;
    const navigating = event.request.mode === 'navigate';
    const pinned = requested !== null || (!navigating && Boolean(client && new URL(client.url).searchParams.has('world-release')));
    const id = requested !== null ? releaseId(event.request.url) : navigating ? version : client ? releaseId(client.url) : version;
    const exists = id && (await caches.keys()).includes(prefix + id);
    const target = !blocked.has(id) && !deleting.has(id) && pinned && event.request.mode === 'navigate' ? await targetInfo({ source: { url: event.request.url } }) : null;
    const incomplete = target && !await complete(target.id, target.info);
    const response = exists && !incomplete && !blocked.has(id) && !deleting.has(id) ? await (await caches.open(prefix + id)).match(url.href) : null;
    if (!response) {
      if (!pinned) return fetch(event.request);
      if (event.request.mode === 'navigate') {
        const latest = self.registration.scope.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
        return new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>旧版入口不可用</title><main><h1>旧版离线内容不可用</h1><p role="alert">未替换为新版，也未改写存档。请保留备份，使用作者提供的原版游戏。清理缓存或换浏览器后，本版链接不能代替完整游戏文件。</p><a href="' + latest + '">查看当前线上版本（旧档可能不兼容）</a></main>', { status: 410, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
      return new Response('This retained version is missing a game file; refusing mixed-version fallback.', { status: 503 });
    }
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
    } finally { readers--; }
  })());
});`;

export function addWebOfflineFiles(files: Record<string, Uint8Array>, title: string, publicationVersion = "1.0.0", icon?: { path: string; size: number }): void {
  const encode = (text: string) => new TextEncoder().encode(text);
  const size = (Object.values(files).reduce((sum, bytes) => sum + bytes.byteLength, 0) / 1048576).toFixed(1);
  files["offline.js"] = encode(client);
  files["app-icon.svg"] = encode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="100" fill="#181827"/><path d="M96 148h56l40 180 38-132h52l38 132 40-180h56l-66 224h-56l-38-128-38 128h-56z" fill="#c5b5ff"/></svg>');
  files["manifest.webmanifest"] = encode(JSON.stringify({ id: "./", name: title, short_name: title.slice(0, 24), lang: "zh-CN", start_url: "./index.html", scope: "./", display: "standalone", background_color: "#181827", theme_color: "#181827", icons: [{ src: icon?.path ?? "app-icon.svg", sizes: icon ? `${icon.size}x${icon.size}` : "any", type: icon ? "image/png" : "image/svg+xml", purpose: "any" }] }));
  files["index.html"] = encode(new TextDecoder().decode(files["index.html"]).replace('</head>', `<meta name="application-version" content="${publicationVersion}"><link rel="icon" href="${icon?.path ?? "app-icon.svg"}"></head>`));
  const panel = `<div id="world-publication-home" hidden><section id="world-publication-tools" data-world-release="__WORLD_RELEASE__" data-publication-version="${publicationVersion}" aria-label="游戏信息"><p id="world-publication-version">版本 ${publicationVersion}</p><details id="offline-panel"><summary>离线与安装 · <span id="offline-summary" role="status">尚未下载</span></summary><p id="offline-status" role="status">尚未下载离线内容</p><p>本版完整离线内容约 ${size} MiB，下载或保留其他版本另需空间与流量。安装入口由浏览器提供，也可查看浏览器菜单中的“安装/添加到主屏幕”。</p><button id="offline-action" type="button">下载离线内容</button> <button id="offline-cancel" type="button" hidden>取消下载</button> <button id="offline-install" type="button" hidden>安装游戏</button><section id="offline-update-plan" aria-label="更新前准备" hidden><h3>更新前准备</h3><p id="offline-version-note"></p><p>新剧情可能不兼容旧档。先导出进度，再保留本版入口；该入口只依赖本浏览器的缓存，换机或清理数据后可能失效，不能代替作者提供的完整游戏文件。同一作品的新旧版共用本浏览器存档槽位，继续保存可能覆盖另一版的槽位；请先导出需要的进度。新旧版缓存会同时占用空间。</p><button id="offline-backup" type="button">备份游玩进度</button> <button id="offline-keep-entry" type="button">显示本版入口</button><label>本版浏览器内入口<input id="offline-current-entry" aria-label="本版浏览器内入口" type="text" readonly hidden></label><label><input id="offline-update-ack" type="checkbox">我已了解旧档可能不兼容，并已保留需要的资料</label><button id="offline-update-confirm" type="button" disabled>确认检查并下载</button> <a id="offline-open-latest" target="_blank" rel="noopener" hidden>在新窗口打开新版</a> <button id="offline-update-later" type="button">稍后，继续本版</button></section><button id="offline-storage-open" type="button" hidden>查看缓存与空间</button><section id="offline-storage" aria-label="缓存与空间" hidden><h3>缓存与空间</h3><p id="offline-storage-status" role="status"></p><p>这里只统计本游戏缓存文件的内容大小，不含存档和浏览器索引／压缩开销，不等于实际磁盘占用。清理不会删除进度，但对应旧版入口会失效；需要原版完整游戏和进度备份才能在清理后继续旧剧情。</p><button id="offline-storage-backup" type="button">先备份游玩进度</button> <button id="offline-storage-refresh" type="button">刷新缓存列表</button> <button id="offline-storage-close" type="button">收起缓存管理</button><div id="offline-storage-list"></div><section id="offline-storage-confirm" aria-label="清理版本确认" hidden><h4>确认清理版本</h4><p id="offline-storage-selected"></p><p>只删除所选版本的游戏缓存，不删除存档。清理后旧入口不能重开该版，当前服务器也可能无法重新提供原版；此操作不能撤销。</p><label><input id="offline-storage-ack" type="checkbox">我已保留需要的原版游戏与进度备份</label><button id="offline-storage-delete" type="button" disabled>确认清理所选版本</button> <button id="offline-storage-cancel" type="button">取消清理</button></section></section></details></section></div>`;
  files["offline.css"] = encode('#offline-panel{box-sizing:border-box;width:100%;color:var(--player-ink,#eee);font:14px/1.6 system-ui;overflow-wrap:anywhere}#offline-panel summary{box-sizing:border-box;cursor:pointer;min-height:44px;padding:10px 12px;border:1px solid var(--player-muted,#b9a8ed);border-radius:8px}#offline-panel summary:focus-visible{outline:3px solid var(--player-accent,#b9a8ed);outline-offset:-3px}#offline-panel p{margin:10px 0}#offline-panel button{min-height:44px;padding:8px 14px;border-radius:8px;border:1px solid var(--player-muted,#b9a8ed);background:var(--player-panel,#292638);color:inherit}#offline-panel button:disabled{opacity:.55;cursor:not-allowed}#offline-panel button[hidden],#offline-panel a[hidden],#offline-panel section[hidden],#offline-panel input[hidden]{display:none}#offline-storage{border-top:1px solid var(--player-muted,#b9a8ed);margin-top:12px;padding-top:8px;text-align:start}#offline-storage article,#offline-storage-confirm{border:1px solid var(--player-muted,#b9a8ed);border-radius:8px;padding:12px;margin:12px 0}#offline-storage h4{margin:4px 0}#offline-storage label{display:block;margin:12px 0}#offline-update-plan{border-top:1px solid var(--player-muted,#b9a8ed);margin-top:12px;padding-top:8px;text-align:start}#offline-update-plan label{display:block;margin:10px 0}#offline-current-entry{box-sizing:border-box;max-width:100%;width:100%;min-height:44px}#offline-open-latest{display:inline-block;padding:10px 8px;min-height:24px;color:inherit}');
  files["index.html"] = encode(new TextDecoder().decode(files["index.html"]).replace('</head>', '<link rel="manifest" href="manifest.webmanifest"><meta name="theme-color" content="#181827"><link rel="stylesheet" href="offline.css"></head>').replace(/<body([^>]*)>/, '<body$1>' + panel).replace('</body>', '<script src="offline.js"></script></body>'));
  const baseInventory = Object.fromEntries(Object.entries(files).map(([path, bytes]) => [path, createBlobDigest(bytes)]));
  // Worker bytes participate in the version so fixes also create a fresh cache.
  const version = createBlobDigest(encode(JSON.stringify({ inventory: baseInventory, worker })));
  files["index.html"] = encode(new TextDecoder().decode(files["index.html"]).replace('data-world-release="__WORLD_RELEASE__"', `data-world-release="${version}"`).replace('</head>', `<meta name="world-release" content="${version}"></head>`));
  const manifest = JSON.parse(new TextDecoder().decode(files['manifest.webmanifest']));
  manifest.start_url = './index.html?world-release=' + encodeURIComponent(version);
  files['manifest.webmanifest'] = encode(JSON.stringify(manifest));
  const inventory = Object.fromEntries(Object.entries(files).map(([path, bytes]) => [path, createBlobDigest(bytes)]));
  files["sw.js"] = encode(`const inventory = ${JSON.stringify(inventory)};\nconst version = ${JSON.stringify(version)};\nconst publicationVersion = ${JSON.stringify(publicationVersion)};\n${worker}`);
}
