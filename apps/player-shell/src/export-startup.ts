import { mountWorldPlayerV1 } from "./mount-player";
import { hydrateNativeAtlasMediaAsync } from "./native-atlas";

/** Owns startup attempts and their URLs independently of the mounted Player. */
export function startExportedPlayer(root: HTMLElement, payload: HTMLElement) {
  let controller: AbortController | undefined;
  let dispose: (() => void) | undefined;
  let player: ReturnType<typeof mountWorldPlayerV1> | undefined;
  let generation = 0, closed = false;
  const clear = () => { controller?.abort(); player?.unmount(); player = undefined; dispose?.(); dispose = undefined; };
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
      const native = await hydrateNativeAtlasMediaAsync(data.mediaAssets ?? [], data.nativeAtlasGroups ?? [], attempt.signal, (completed, total) => {
        status.textContent = `正在准备游戏资源：${completed}/${total} 组`;
      });
      if (closed || current !== generation) { native.dispose(); return; }
      dispose = native.dispose;
      root.replaceChildren();
      player = mountWorldPlayerV1(root, { ...data, mediaAssets: native.media });
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
  return { dispose: close };
}
