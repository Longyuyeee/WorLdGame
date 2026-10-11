import { loadProject, migrateS0Project, type S0Project } from "../packages/project-domain/src/index";
import { withProjectSettings } from "../packages/gal-settings/src/index";
import { mountWorldPlayerV1 } from "../apps/player-shell/src/mount-player";
import { IndexedDbWorldPlayerRecoveryStoreV1 } from "../apps/player-shell/src/player-recovery-store";
import { IndexedDbWorldPlayerSaveStoreV3 } from "../apps/player-shell/src/player-save-store";
import { nativeAtlasDiagnostics } from "../apps/player-shell/src/native-atlas";
import { wav } from "./player-voice-browser";
import css from "../apps/player-shell/src/player-shell.css?inline";

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
function check(value: unknown, message: string): asserts value { if (!value) throw Error(message); }
const main = () => document.querySelector<HTMLElement>("main")!;
const hash = () => main().dataset.runtimeStateHash!;
const text = () => document.querySelector(".player-dialogue__text")?.textContent;
async function until(test: () => boolean, label: string) {
  for (let n = 0; n < 750; n++) { if (test()) return; await pause(20); }
  throw Error(`Mixed timeout ${label}: ${text()} / ${JSON.stringify(main()?.dataset)}`);
}
function button(name: string) {
  const item = [...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.getAttribute("aria-label") === name || b.textContent?.includes(name));
  check(item && !item.disabled, `Unavailable ${name}`); return item;
}
const click = (name: string) => button(name).click();

async function videoBlob() {
  const canvas = document.createElement("canvas"); canvas.width = 640; canvas.height = 360;
  const context = canvas.getContext("2d")!, stream = canvas.captureStream(12);
  const recorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp8" }), chunks: Blob[] = [];
  recorder.addEventListener("dataavailable", event => { if (event.data.size) chunks.push(event.data); });
  const stopped = new Promise<void>((resolve, reject) => { recorder.addEventListener("stop", () => resolve(), { once: true }); recorder.addEventListener("error", () => reject(Error("Video fixture recording failed")), { once: true }); });
  try {
    recorder.start();
    for (let frame = 0; frame < 24; frame++) {
      context.fillStyle = `hsl(${frame * 10} 50% 25%)`; context.fillRect(0, 0, 640, 360);
      context.fillStyle = "white"; context.font = "28px sans-serif"; context.fillText(`Mixed story / ${frame}`, 40, 180); await pause(84);
    }
    recorder.stop(); await stopped;
    return new Blob(chunks, { type: "video/webm" });
  } finally { stream.getTracks().forEach(track => track.stop()); canvas.width = canvas.height = 0; }
}

/** Shared synthetic story and decodable media for session and publication tests. */
export async function createMixedFixture(id: string, chapters = 12) {
  const videoUrl = URL.createObjectURL(await videoBlob());
  const images = Array.from({ length: 4 }, (_, i) => {
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 1024;
    const context = canvas.getContext("2d")!; context.fillStyle = ["#23485b", "#51402f", "#355f3c", "#502b55"][i]!; context.fillRect(0, 0, 1024, 1024);
    context.fillStyle = "white"; context.font = "50px sans-serif"; context.fillText(`Chapter art ${i}`, 40, 500);
    const url = canvas.toDataURL(); canvas.width = canvas.height = 0;
    return { assetId: `picture_${i}`, displayName: `Picture ${i}`, mimeType: "image/png", canvasSampling: true, url };
  });
  const voices = Array.from({ length: chapters * 3 }, (_, i) => ({ assetId: `voice_${i}`, displayName: `Voice ${i}`, mimeType: "audio/wav", url: wav(), voiceTextId: `text_${Math.floor(i / 3)}_${i % 3}` }));
  const mediaAssets = [...images, ...voices, { assetId: "movie", displayName: "Synthetic chapter video", mimeType: "video/webm", url: videoUrl }];
  const source: S0Project = { schemaVersion: 0, id, title: "混合媒体长故事", entrySceneId: "scene_0", characters: [], scenes: [
    ...Array.from({ length: chapters }, (_, scene): S0Project["scenes"][number] => ({ id: `scene_${scene}`, title: `Chapter ${scene}`, statements: [
      { id: `bg_${scene}`, kind: "direction", command: "background", summary: `asset=picture_${scene % 4} action=set duration=0ms effectPolicy=pure` },
      ...Array.from({ length: 16 }, (_, line): S0Project["scenes"][number]["statements"] => [
        ...(line === 4 ? [
          { id: `movie_${scene}`, kind: "direction" as const, command: "background", summary: `asset=movie action=set effectPolicy=pure awaitMode=awaited descriptorId=mixed.video.${scene}` },
          { id: `restore_bg_${scene}`, kind: "direction" as const, command: "background", summary: `asset=picture_${(scene + 1) % 4} action=set duration=0ms effectPolicy=pure` }
        ] : []),
        { id: `line_${scene}_${line}`, kind: "narration", textId: `text_${scene}_${line}`, text: `第 ${scene + 1} 章 · 第 ${line + 1} 句` }
      ]).flat(),
      { id: `choice_${scene}`, kind: "choice", prompt: `Chapter ${scene} complete`, options: [{ id: `next_${scene}`, label: `进入场景 ${scene + 1}`, targetSceneId: scene === chapters - 1 ? "final" : `scene_${scene + 1}` }] }
    ] })),
    { id: "final", title: "End", statements: [{ id: "end", kind: "end", endingName: "Mixed complete" }] }
  ] };
  const base = loadProject(migrateS0Project(source).files);
  const project = { ...base, assets: { ...base.assets, assets: mediaAssets.map(asset => ({ assetId: asset.assetId, displayName: asset.displayName, mimeType: asset.mimeType, ...("voiceTextId" in asset ? { voiceTextId: asset.voiceTextId } : {}) })) }, settings: withProjectSettings(base.settings, { text: { revealMode: "instant", minimumDisplayMilliseconds: 80, punctuationDelayMilliseconds: 0 } }) };
  return { project, mediaAssets, videoUrl };
}

/** One mounted story; real IndexedDB with explicitly injected storage faults. */
export async function start(id: string, chapters = 12) {
  const style = document.createElement("style"); style.textContent = css; document.head.append(style);
  const { project, mediaAssets, videoUrl } = await createMixedFixture(id, chapters);
  const backend = new IndexedDbWorldPlayerRecoveryStoreV1(), saves = new IndexedDbWorldPlayerSaveStoreV3();
  let gate: Promise<void> | null = null, release = () => {}, quota = false, writes = 0, activeWrites = 0, peakWrites = 0, maxSerializedBytes = 0;
  const hold = () => { gate = new Promise<void>(resolve => { release = () => { gate = null; resolve(); }; }); };
  const store = { version: backend.version, backend: "mixed-real-IndexedDB-injected-faults", read: (key: string) => backend.read(key), clear: (key: string) => backend.clear(key),
    write: async (record: Parameters<typeof backend.write>[0]) => {
      writes++; activeWrites++; peakWrites = Math.max(peakWrites, activeWrites); maxSerializedBytes = Math.max(maxSerializedBytes, new TextEncoder().encode(record.serializedSessionSave).byteLength);
      try { if (gate) await gate; if (quota) throw new DOMException("injected quota", "QuotaExceededError"); await backend.write(record); } finally { activeWrites--; }
    } };
  const handle = mountWorldPlayerV1(document.getElementById("player-root")!, { project, mediaAssets, recoveryStore: store, saveStore: saves,
    playbackPolicy: { schemaVersion: 1, policyVersion: "1.2.0", auto: { baseDelayMilliseconds: 80, millisecondsPerReadableUnit: 0, voiceTailMilliseconds: 80, instantInstructionBudget: 128, video: "wait-for-end" }, skip: { defaultActivation: "toggle", defaultSpeed: 20, instantInstructionBudget: 128, video: "cancel-and-continue" } } });
  const events: { type: string; kind: string; asset: string; time: number }[] = [];
  const capture = (event: Event) => { if (event.target instanceof HTMLMediaElement) events.push({ type: event.type, kind: event.target.tagName.toLowerCase(), asset: event.target.dataset.assetId ?? "", time: performance.now() }); };
  for (const event of ["play", "pause", "ended", "error"]) document.addEventListener(event, capture, true);
  let frameHandle = 0, lastFrame = 0;
  const frameBins = { count: 0, over34: 0, over100: 0, max: 0 };
  const frame = (time: number) => { if (lastFrame && handle.getObservation().hostActivity === "active") { const ms = time - lastFrame; frameBins.count++; frameBins.max = Math.max(frameBins.max, ms); if (ms > 34) frameBins.over34++; if (ms > 100) frameBins.over100++; } lastFrame = time; frameHandle = requestAnimationFrame(frame); };
  frameHandle = requestAnimationFrame(frame);
  async function durable() { for (let n = 0; n < 250; n++) { if (activeWrites === 0 && (await backend.read(id))?.runtimeStateHash === hash()) return; await pause(20); } throw Error("Latest mixed boundary not durable"); }
  return {
    point(name: string) { const element = button(name); element.scrollIntoView({ block: "center" }); const r = element.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; },
    async ready() { await until(() => ["idle", "available"].includes(main().dataset.recoveryOperation!), "startup"); return main().dataset.recoveryOperation; },
    async chapter(scene: number) {
      await until(() => text() === `第 ${scene + 1} 章 · 第 1 句` && main().dataset.stageImagesPending === "false", "chapter entry");
      await durable();
      const row: Record<string, unknown> = { scene, mode: scene % 2 ? "skipAll" : "auto", entryDecode: document.querySelector<HTMLCanvasElement>("canvas[data-image-decode]")?.dataset.imageDecode };
      check(row.entryDecode === "owned-bitmap", "Mixed entry bypassed PNG ownership");
      if (scene === 4 || scene === 6) await until(() => document.querySelector<HTMLAudioElement>('audio[data-audio-bus="voice"]')?.ended === true, "voice before manual advance");
      if (scene === 4) {
        click("快速保存"); await until(() => main().dataset.saveOperation === "saved", "quick save");
        const quick = (await saves.read(id, "quick-1"))!, savedText = text(); hold(); await pause(30); click("继续下一句");
        await until(() => activeWrites === 1 && main().dataset.recoveryOperation === "error", "delayed write timeout");
        const queued = writes; click("快速读取"); await until(() => main().dataset.saveOperation === "loaded" && text() === savedText, "quick load during physical IO");
        const loadedHash = hash(); release(); await durable();
        check(hash() === loadedHash && writes === queued + 1, "Delayed pre-load record overwrote loaded progress");
        check((await saves.read(id, "quick-1"))?.sessionArtifactHash === quick.sessionArtifactHash, "Recovery modified quick slot");
        row.timeoutQuickLoadHeld = true; row.latestLoadDurable = true;
      }
      if (scene === 6) {
        const prior = (await backend.read(id))!; quota = true; await pause(30); click("继续下一句");
        await until(() => main().dataset.recoveryOperation === "error", "quota");
        check(document.body.textContent?.includes("设备存储空间不足"), "Missing actionable capacity guidance");
        check((await backend.read(id))?.sessionArtifactHash === prior.sessionArtifactHash, "Quota destroyed prior record");
        quota = false; click("重试恢复保护"); await durable(); row.quotaRecovered = true;
      }
      if (scene === 2) hold();
      click(scene % 2 ? "快进全部" : "自动播放");
      if (scene === 10) {
        click("打开剧情历史"); const before = hash(); await pause(400); check(hash() === before, "History panel advanced story"); click("关闭剧情历史"); row.historyHeld = true;
      }
      if (scene % 2 === 0) {
        await until(() => Boolean(document.querySelector("video")), "awaited video");
        const video = document.querySelector<HTMLVideoElement>("video")!; await until(() => !video.paused && video.currentTime > 0, "real video playing");
        const beforeTime = video.currentTime;
        if (scene === 2) { release(); await until(() => activeWrites === 0, "save finishes during video"); }
        if (scene === 8) {
          handle.setHostActivity("suspended"); await until(() => video.paused, "video suspended"); const beforeHash = hash(), pausedTime = video.currentTime;
          await pause(350); check(hash() === beforeHash && Math.abs(video.currentTime - pausedTime) < 0.06, "Suspension leaked video/story");
          handle.setHostActivity("active"); row.videoSuspendedHeld = true;
        } else {
          // A host props/UI render and an IO completion must not pause the same video.
          handle.setHostActivity("active"); await pause(120);
          check(!video.paused && video.currentTime > beforeTime, "UI/save render interrupted attached video"); row.videoRenderHeld = true;
        }
        await until(() => video.ended, "natural video end"); row.videoEnded = true;
      }
      await until(() => main().dataset.playerStatus === "waiting-choice", "choice boundary");
      const boundary = hash(); await pause(160); check(hash() === boundary, "Automatic choice crossed boundary"); await durable();
      check(!document.querySelector("video"), "Video owner survived replacement");
      const choice = document.querySelector<HTMLButtonElement>(".player-choice button")!;
      const label = choice.querySelector<HTMLElement>(":scope > .player-typography-text")!;
      const buttonRect = choice.getBoundingClientRect(), labelRect = label.getBoundingClientRect();
      check(labelRect.width >= buttonRect.width / 2 && labelRect.top >= buttonRect.top && labelRect.bottom <= buttonRect.bottom, "Choice label inherited badge dimensions or overflowed its button");
      return { ...row, boundaryHeld: true, choiceLayout: { buttonWidth: buttonRect.width, labelWidth: labelRect.width, labelHeight: labelRect.height, buttonHeight: buttonRect.height, contained: true }, historyLength: Number(main().dataset.historyLength), historyArchives: Number(main().dataset.historyArchives), native: nativeAtlasDiagnostics(), writes, peakWrites, maxSerializedBytes, frames: { ...frameBins } };
    },
    async checkpoint() { await durable(); click("快速保存"); await until(() => main().dataset.saveOperation === "saved", "final quick save"); return { hash: hash(), historyLength: Number(main().dataset.historyLength), quickArtifact: (await saves.read(id, "quick-1"))!.sessionArtifactHash }; },
    async restored(expected: { hash: string; historyLength: number; quickArtifact: string }) {
      await until(() => main().dataset.playerStatus === "waiting-choice", "cold restore");
      check(hash() === expected.hash && Number(main().dataset.historyLength) === expected.historyLength, "Cold restart lost current story/history");
      check((await saves.read(id, "quick-1"))?.sessionArtifactHash === expected.quickArtifact, "Cold restart changed quick slot");
      const before = hash(); click("后退一步"); await until(() => hash() !== before, "cold back"); click("前进一步"); await until(() => hash() === before, "cold forward");
      return { hash: hash(), historyLength: Number(main().dataset.historyLength), quickPreserved: true, backForwardHeld: true };
    },
    observe() { return { native: nativeAtlasDiagnostics(), frames: { ...frameBins }, events, writes, peakWrites, maxSerializedBytes, historyLength: Number(main().dataset.historyLength) }; },
    async storage() {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("world-player-saves"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      try {
        const read = async (store: string, key: string) => {
          const stored = await new Promise<any>((resolve, reject) => {
            const request = database.transaction(store, "readonly").objectStore(store).get(key);
            request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
          });
          check(stored.format === "world.player-packed-record", "Long session was not packed on disk");
          return { packed: true, payloadBytes: stored.data.byteLength, canonicalBytes: stored.byteLength, sha256: stored.sha256,
            metadataBytes: new TextEncoder().encode(JSON.stringify(stored.metadata)).length };
        };
        return { databaseVersion: database.version, recovery: await read("recovery-sessions", id), quick: await read("save-slots", `${id}\0quick-1`) };
      } finally { database.close(); }
    },
    async close() { handle.unmount(); cancelAnimationFrame(frameHandle); style.remove(); for (const event of ["play", "pause", "ended", "error"]) document.removeEventListener(event, capture, true); URL.revokeObjectURL(videoUrl); await pause(30); return { unmounted: !document.querySelector("main"), native: nativeAtlasDiagnostics() }; }
  };
}
