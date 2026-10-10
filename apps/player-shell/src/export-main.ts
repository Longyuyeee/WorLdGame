import { mountWorldPlayerV1 } from "./mount-player";
import { hydrateNativeAtlasMedia } from "./native-atlas";

const root = document.getElementById("player-root");
const payload = document.getElementById("world-project");
if (root !== null && payload !== null) {
  let dispose: (() => void) | undefined;
  try {
    const data = JSON.parse(payload.textContent ?? "");
    const native = hydrateNativeAtlasMedia(data.mediaAssets ?? [], data.nativeAtlasGroups ?? []);
    dispose = native.dispose;
    const player = mountWorldPlayerV1(root, { ...data, mediaAssets: native.media });
    window.addEventListener("pagehide", event => { if (!event.persisted) { player.unmount(); native.dispose(); } });
  } catch {
    dispose?.();
    root.textContent = "游戏未能打开，请重新下载完整游戏文件后再试。";
    root.setAttribute("role", "alert");
  }
}
