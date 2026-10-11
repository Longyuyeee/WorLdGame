import { loadProject, migrateS0Project, type S0Project } from "../packages/project-domain/src/index";
import { withProjectSettings } from "../packages/gal-settings/src/index";
import { mountWorldPlayerV1 } from "../apps/player-shell/src/mount-player";
import { IndexedDbWorldPlayerRecoveryStoreV1 } from "../apps/player-shell/src/player-recovery-store";
import { IndexedDbWorldPlayerSaveStoreV3 } from "../apps/player-shell/src/player-save-store";
import { wav } from "./player-voice-browser";
import css from "../apps/player-shell/src/player-shell.css?inline";

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
function check(value: unknown, message: string): asserts value { if (!value) throw Error(message); }
const main = () => document.querySelector<HTMLElement>("main")!;
const text = () => document.querySelector(".player-dialogue__text")?.textContent ?? "";
const voice = () => document.querySelector<HTMLAudioElement>('audio[data-audio-bus="voice"]')!;
async function until(test: () => boolean) { for (let i = 0; i < 300; i++) { if (test()) return; await pause(20); } throw Error(`Cold-start timeout: ${text()} ${JSON.stringify(main()?.dataset)}`); }
function button(name: string) { const result = [...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.getAttribute("aria-label") === name || b.textContent?.trim() === name || (name === "开始故事" && b.classList.contains("player-primary"))); check(result, `Missing ${name}`); return result; }

export function start(projectId: string, cold: boolean) {
  const style = document.createElement("style"); style.textContent = css; document.head.append(style);
  const source: S0Project = { schemaVersion: 0, id: projectId, title: "冷启动与声音恢复", entrySceneId: "scene_start", characters: [], scenes: [{ id: "scene_start", title: "Start", statements: [
    { id: "line_a", kind: "narration", textId: "text_a", text: "Starting point" },
    { id: "line_b", kind: "narration", textId: "text_b", text: "Saved progress" },
    { id: "finish", kind: "end", endingName: "Cold complete" }
  ] }] };
  const base = loadProject(migrateS0Project(source).files), url = wav();
  const mediaAssets = ["a", "b"].map(id => ({ assetId: `voice_${id}`, displayName: `Voice ${id}`, mimeType: "audio/wav", url }));
  const project = { ...base, assets: { ...base.assets, assets: mediaAssets.map((asset, i) => ({ assetId: asset.assetId, displayName: asset.displayName, mimeType: asset.mimeType, voiceTextId: i ? "text_b" : "text_a" })) }, settings: withProjectSettings(base.settings, { text: { revealMode: "instant" } }) };
  const recovery = new IndexedDbWorldPlayerRecoveryStoreV1(indexedDB), saves = new IndexedDbWorldPlayerSaveStoreV3(indexedDB);
  let release!: () => void, denyAudio = cold, failClear = false;
  const scan = new Promise<void>(resolve => { release = resolve; });
  const originalPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () { return denyAudio && this instanceof HTMLAudioElement ? Promise.reject(new DOMException("Injected permission denial", "NotAllowedError")) : originalPlay.call(this); };
  const events: string[] = [];
  let observedPlays = 0;
  const capture = (event: Event) => { if (event.target instanceof HTMLAudioElement) events.push(event.type); };
  document.addEventListener("play", capture, true); document.addEventListener("ended", capture, true);
  const handle = mountWorldPlayerV1(document.getElementById("player-root")!, { project, mediaAssets, saveStore: saves, recoveryStore: {
    version: "1.0.0", backend: "indexeddb-controlled-scan", async read(id) { if (cold) await scan; return recovery.read(id); },
    write: record => recovery.write(record), async clear(id) { if (failClear) throw Error("Injected storage busy"); await recovery.clear(id); }
  } });
  return {
    async ready() { await until(() => Boolean(main()) && main().dataset.recoveryOperation === (cold ? "scanning" : "idle")); },
    point(name: string) { const element = button(name), r = element.getBoundingClientRect(); const point = { x: r.x + r.width / 2, y: r.y + r.height / 2 }; check(point.x >= 0 && point.y >= 0 && point.x < innerWidth && point.y < innerHeight && element.contains(document.elementFromPoint(point.x, point.y)), `Action clipped or covered: ${name}`); return point; },
    async releaseScan() { release(); await until(() => main().dataset.recoveryOperation === "available"); },
    async seed() {
      await until(() => text() === "Starting point" && voice().ended);
      button("继续下一句").click(); await until(() => text() === "Saved progress");
      button("快速保存").click(); await until(() => main().dataset.saveOperation === "saved");
      for (let i = 0; i < 100; i++) { const record = await recovery.read(projectId); if (record?.runtimeStateHash === main().dataset.runtimeStateHash) return { recoveryHash: record.runtimeStateHash, quickHash: (await saves.read(projectId, "quick-1"))!.runtimeStateHash }; await pause(20); }
      throw Error("Recovery was not persisted");
    },
    async confirmation() { await until(() => Boolean([...document.querySelectorAll("button")].find(b => b.textContent === "确认开始新故事"))); check(main().dataset.playerStatus === "title", "New game bypassed confirmation"); },
    async restored() { await until(() => text() === "Saved progress" && Boolean(document.querySelector(".player-audio-recovery"))); return main().dataset.runtimeStateHash; },
    allowAudio() { denyAudio = false; },
    async playing() { await until(() => !voice().paused && voice().currentTime > 0 && events.filter(event => event === "play").length > observedPlays); observedPlays = events.filter(event => event === "play").length; check(text() === "Saved progress", "Audio retry advanced story"); },
    async interrupt() { voice().currentTime = 0; voice().pause(); await until(() => Boolean(document.querySelector(".player-audio-recovery"))); },
    async completeVoice() { await until(() => voice().ended); },
    async suspendResumeDenied() { denyAudio = true; voice().currentTime = 0; handle.setHostActivity("suspended"); await pause(50); handle.setHostActivity("active"); await until(() => Boolean(document.querySelector(".player-audio-recovery"))); },
    async returnTitle() { await until(() => voice().ended); button("继续下一句").click(); await until(() => main().dataset.playerStatus === "ended"); button("回到标题").click(); await until(() => main().dataset.playerStatus === "title"); },
    async failNewStory() { failClear = true; button("确认开始新故事").click(); await until(() => main().dataset.recoveryOperation === "error"); check(main().dataset.playerStatus === "title", "Failed clear started new story"); failClear = false; },
    async newStory(savedHash: string) { await until(() => text() === "Starting point"); check((await saves.read(projectId, "quick-1"))?.runtimeStateHash === savedHash, "New game damaged formal quick save"); button("快速读取").click(); await until(() => main().dataset.saveOperation === "loaded" && text() === "Saved progress"); return { quickSavePreserved: true, loadedAfterNewGame: true }; },
    close() { handle.unmount(); style.remove(); document.removeEventListener("play", capture, true); document.removeEventListener("ended", capture, true); HTMLMediaElement.prototype.play = originalPlay; return { plays: events.filter(e => e === "play").length, ended: events.filter(e => e === "ended").length, unmounted: !document.querySelector("main") }; }
  };
}
