import { mountWorldPlayerV1 } from "./mount-player";
import { prepareNativeAtlasMediaAsync } from "./lazy-atlas-media";

/** Owns startup attempts and their URLs independently of the mounted Player. */
export function startExportedPlayer(root: HTMLElement, payload: HTMLElement) {
  const doc = root.ownerDocument, location = doc.defaultView?.location;
  const declared = doc.querySelector<HTMLMetaElement>('meta[name="world-release"]')?.content;
  if (location && /^https?:$/u.test(location.protocol) && declared) {
    const url = new URL(location.href), requested = url.searchParams.get('world-release');
    if (requested !== null && requested !== declared) {
      root.dataset.startupState = 'release-missing'; root.replaceChildren();
      const message = doc.createElement('p'); message.setAttribute('role', 'alert');
      message.textContent = '这个旧版入口在当前浏览器中已不可用，当前服务器返回的是另一版本。未打开新版或改写存档。请保留备份，使用作者提供的原版游戏；换浏览器或清理缓存后，本机旧版链接不能代替完整游戏文件。';
      const latest = doc.createElement('a'); url.searchParams.delete('world-release'); latest.href = url.href; latest.textContent = '查看当前线上版本（旧档可能不兼容）'; root.append(message, latest);
      Object.assign(latest.style, { display: 'inline-flex', alignItems: 'center', minHeight: '44px', padding: '8px 12px', border: '1px solid currentColor', borderRadius: '8px', color: 'inherit' });
      return { dispose() {}, notifyMemoryPressure() { throw Error('WORLD_PLAYER_NOT_READY'); } };
    }
    if (requested === null) {
      // A history-only change need not update the URL exposed as Client.url to
      // a replacement Worker. Navigate before mounting so every asset request
      // stays bound to this release even when the Worker later restarts.
      url.searchParams.set('world-release', declared); root.dataset.startupState = 'pinning'; root.textContent = '正在打开本版游戏…'; location.replace(url.href);
      return { dispose() {}, notifyMemoryPressure() { throw Error('WORLD_PLAYER_NOT_READY'); } };
    }
  }
  const publicationHome = root.id === 'player-root' ? root.ownerDocument.getElementById('world-publication-home') : null;
  let controller: AbortController | undefined;
  let dispose: (() => void) | undefined;
  let player: ReturnType<typeof mountWorldPlayerV1> | undefined;
  let generation = 0, closed = false;
  const clear = () => { controller?.abort(); player?.unmount(); player = undefined; dispose?.(); dispose = undefined; if (publicationHome) publicationHome.hidden = false; };
  const message = (text: string, label: string, action: () => void, alert = false) => {
    root.replaceChildren();
    const status = document.createElement("p"); status.textContent = text; status.setAttribute("role", alert ? "alert" : "status");
    const button = document.createElement("button"); button.textContent = label; button.onclick = action;
    root.append(status, button);
    return status;
  };
  const run = async () => {
    if (closed) return;
    clear(); const current = ++generation, attempt = new AbortController(); controller = attempt;
    root.dataset.startupState = "loading";
    const status = message("正在准备游戏资源…", "取消加载", () => {
      ++generation; clear(); root.dataset.startupState = "cancelled";
      message("加载已取消，可以重新尝试。", "重新加载", () => { void run(); });
    });
    try {
      // Allow the loading/cancel UI to paint before parsing and hashing embedded payloads.
      await new Promise<void>(resolve => setTimeout(resolve, 0)); attempt.signal.throwIfAborted();
      const data = JSON.parse(payload.textContent ?? "");
      const native = await prepareNativeAtlasMediaAsync(data.mediaAssets ?? [], data.nativeAtlasGroups ?? [], attempt.signal, (completed, total) => {
        status.textContent = `正在准备游戏资源：${completed}/${total} 组`;
      });
      if (closed || current !== generation) { native.dispose(); return; }
      dispose = native.dispose;
      root.replaceChildren();
      player = mountWorldPlayerV1(root, { ...data, mediaAssets: native.media, onReleaseIdleResources: native.trimIdle });
      if (publicationHome) publicationHome.hidden = true;
      root.dataset.startupState = "ready";
    } catch {
      if (closed || current !== generation) return;
      clear(); root.dataset.startupState = "failed";
      message("游戏资源未能加载。可重试；若仍失败，请重新下载完整游戏文件。", "重新加载", () => { void run(); }, true);
    }
  };
  const close = () => { if (closed) return; closed = true; ++generation; clear(); window.removeEventListener("pagehide", onPageHide); };
  const onPageHide = (event: PageTransitionEvent) => { if (!event.persisted) close(); };
  window.addEventListener("pagehide", onPageHide);
  void run();
  return { dispose: close, notifyMemoryPressure: (level: "moderate" | "critical") => {
    if (closed || player === undefined) throw Error("WORLD_PLAYER_NOT_READY");
    player.notifyMemoryPressure(level);
  } };
}
