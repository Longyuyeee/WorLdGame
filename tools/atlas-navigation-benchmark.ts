import { mountWorldPlayerV1 } from "../apps/player-shell/src/mount-player";
import { hydrateNativeAtlasMediaAsync, nativeAtlasDiagnostics } from "../apps/player-shell/src/native-atlas";
import { prepareNativeAtlasMediaAsync } from "../apps/player-shell/src/lazy-atlas-media";
import playerCss from "../apps/player-shell/src/player-shell.css?inline";

/** Same bundle/payload and real Player, only preparation policy differs. No fault/quality instrumentation. */
export async function start(lazy: boolean) {
  const style = document.createElement("style"); style.textContent = playerCss; document.head.append(style);
  const created = new Map<string, number>(), create = URL.createObjectURL, revoke = URL.revokeObjectURL;
  let peakBlobBytes = 0;
  const blobBytes = () => [...created.values()].reduce((a, b) => a + b, 0);
  URL.createObjectURL = blob => { const url = create.call(URL, blob); if (blob instanceof Blob && blob.type === "image/png") { created.set(url, blob.size); peakBlobBytes = Math.max(peakBlobBytes, blobBytes()); } return url; };
  URL.revokeObjectURL = url => { created.delete(url); revoke.call(URL, url); };
  const tasks: { start: number; duration: number }[] = [];
  const observer = new PerformanceObserver(list => tasks.push(...list.getEntries().map(e => ({ start: e.startTime, duration: e.duration }))));
  observer.observe({ type: "longtask", buffered: true });
  const snapshot = () => ({ urls: created.size, blobBytes: blobBytes(), peakBlobBytes, native: nativeAtlasDiagnostics() });
  let player: ReturnType<typeof mountWorldPlayerV1> | undefined, dispose: (() => void) | undefined;
  const close = async () => {
    player?.unmount(); player = undefined; dispose?.(); dispose = undefined;
    await new Promise(resolve => setTimeout(resolve, 50));
    tasks.push(...observer.takeRecords().map(e => ({ start: e.startTime, duration: e.duration }))); observer.disconnect();
    const result = { ...snapshot(), tasks }; URL.createObjectURL = create; URL.revokeObjectURL = revoke; return result;
  };
  try {
    const data = JSON.parse(document.getElementById("world-project")!.textContent!);
    const session = await (lazy ? prepareNativeAtlasMediaAsync : hydrateNativeAtlasMediaAsync)(data.mediaAssets, data.nativeAtlasGroups);
    dispose = session.dispose;
    player = mountWorldPlayerV1(document.getElementById("player-root")!, { ...data, mediaAssets: session.media });
    const title = { navigationMilliseconds: performance.now(), ...snapshot() };
    const enter = async () => {
      const begin = performance.now();
      const click = (label: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find(b => !b.disabled && (b.getAttribute("aria-label") === label || b.textContent?.trim().startsWith(label)))?.click();
      click("开始故事");
      for (let step = 0; step < 400; step++) {
        await new Promise(resolve => setTimeout(resolve, 25));
        if (document.querySelector('[role="alert"]')) throw Error("Unexpected Player error in navigation baseline");
        const pictures = [...document.querySelectorAll<HTMLElement>(".player-stage-background,.player-stage-character")];
        if (pictures.length) {
          if (pictures.every(e => e.dataset.canvasSampling === "ready")) return { entryMilliseconds: performance.now() - begin, pictures: pictures.length, ...snapshot() };
          continue;
        }
        click("放弃并清除"); click("完成动效"); click("继续下一句");
        const choices = [...document.querySelectorAll<HTMLButtonElement>(".player-choice button:not(:disabled)")];
        (choices.find(b => b.textContent?.includes("去海边")) ?? choices[0])?.click();
      }
      throw Error("First actual picture did not render");
    };
    return { title, enter, close };
  } catch (error) { await close(); throw error; }
}
