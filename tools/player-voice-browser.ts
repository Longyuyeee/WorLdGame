import { loadProject, migrateS0Project, type S0Project } from "../packages/project-domain/src/index";
import { withProjectSettings } from "../packages/gal-settings/src/index";
import { mountWorldPlayerV1 } from "../apps/player-shell/src/mount-player";
import css from "../apps/player-shell/src/player-shell.css?inline";

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
function check(value: unknown, message: string): asserts value { if (!value) throw Error(message); }
const main = () => document.querySelector<HTMLElement>("main")!;
const hash = () => main().dataset.runtimeStateHash;
const text = () => document.querySelector(".player-dialogue__text")?.textContent ?? "";
async function until(test: () => boolean) { for (let i = 0; i < 300; i++) { if (test()) return; await pause(20); } throw Error(`Voice timeout: ${text()} / ${JSON.stringify(main()?.dataset)}`); }
function button(name: string) {
  const result = [...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.getAttribute("aria-label") === name || b.textContent?.includes(name));
  check(result && !result.disabled, `Missing action ${name}`); return result;
}
function click(name: string) { button(name).click(); }
export function wav() {
  const samples = 4000, data = new Uint8Array(44 + samples * 2), view = new DataView(data.buffer);
  const ascii = (at: number, value: string) => [...value].forEach((char, i) => { data[at + i] = char.charCodeAt(0); });
  ascii(0, "RIFF"); view.setUint32(4, data.length - 8, true); ascii(8, "WAVEfmt "); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, 8000, true); view.setUint32(28, 16000, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); ascii(36, "data"); view.setUint32(40, samples * 2, true);
  for (let i = 0; i < samples; i++) view.setInt16(44 + i * 2, Math.sin(i * Math.PI * 2 * 220 / 8000) * 1000, true);
  return `data:audio/wav;base64,${btoa(String.fromCharCode(...data))}`;
}

/** Synthetic tone clips, real browser decoder/events and production Player; no human speech/device claim. */
export function start(revealMode: "instant" | "typewriter", projectId: string) {
  const style = document.createElement("style"); style.textContent = css; document.head.append(style);
  const source: S0Project = { schemaVersion: 0, id: projectId, title: "语音连续播放验收", entrySceneId: "scene_0", characters: [], scenes: Array.from({ length: 12 }, (_, scene) => ({
    id: `scene_${scene}`, title: `Scene ${scene}`, statements: [
      ...Array.from({ length: 3 }, (_, line) => ({ id: `line_${scene}_${line}`, kind: "narration" as const, textId: `text_${scene}_${line}`, text: `Scene ${scene} line ${line}` })),
      ...(scene === 11 ? [{ id: "end", kind: "end" as const, endingName: "Voice complete" }] : [{ id: `choice_${scene}`, kind: "choice" as const, prompt: "Continue deliberately", options: [{ id: `next_${scene}`, label: `进入场景 ${scene + 1}`, targetSceneId: `scene_${scene + 1}` }] }])
    ]
  })) };
  const base = loadProject(migrateS0Project(source).files), url = wav();
  const mediaAssets = Array.from({ length: 36 }, (_, i) => ({ assetId: `voice_${i}`, displayName: `Voice ${i}`, mimeType: "audio/wav", url }));
  const project = { ...base, assets: { ...base.assets, assets: mediaAssets.map((asset, i) => ({ assetId: asset.assetId, displayName: asset.displayName, mimeType: asset.mimeType, voiceTextId: `text_${Math.floor(i / 3)}_${i % 3}` })) }, settings: withProjectSettings(base.settings, { text: { revealMode, charactersPerSecond: 100, minimumDisplayMilliseconds: 80, punctuationDelayMilliseconds: 0 } }) };
  const events: { kind: string; asset: string; time: number }[] = [];
  const capture = (event: Event) => { if (event.target instanceof HTMLAudioElement) events.push({ kind: event.type, asset: event.target.dataset.assetId ?? "", time: performance.now() }); };
  for (const name of ["play", "ended", "error"]) document.addEventListener(name, capture, true);
  const handle = mountWorldPlayerV1(document.getElementById("player-root")!, { project, mediaAssets, playbackPolicy: { schemaVersion: 1, policyVersion: "1.2.0", auto: { baseDelayMilliseconds: 100, millisecondsPerReadableUnit: 0, voiceTailMilliseconds: 100, instantInstructionBudget: 128, video: "wait-for-end" }, skip: { defaultActivation: "toggle", defaultSpeed: 20, instantInstructionBudget: 128, video: "cancel-and-continue" } } });
  return {
    point(name: string) { const element = button(name); element.scrollIntoView({ block: "center" }); const r = element.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; },
    async scene(index: number) {
      await until(() => text() === `Scene ${index} line 0`);
      const voice = document.querySelector<HTMLAudioElement>('audio[data-audio-bus="voice"]')!;
      await until(() => voice.readyState >= 2 && !voice.paused);
      const row: Record<string, unknown> = { scene: index, mode: index % 2 === 0 ? "auto" : "skipAll" };
      if (index === 0) {
        voice.pause(); click("自动播放"); const before = hash(); await pause(800);
        check(hash() === before, "Auto advanced a paused voice after its duration"); row.pausedVoiceHeld = true;
        await voice.play(); await until(() => voice.ended);
        await pause(30); check(hash() === before, "Auto omitted actual voice tail"); row.tailHeld = true;
      } else if (index === 2) {
        click("自动播放"); handle.setHostActivity("suspended"); await pause(50);
        const before = hash(); await pause(800); check(hash() === before && voice.paused, "Host pause leaked audio/story");
        handle.setHostActivity("active"); await pause(30); check(hash() === before, "Host resume skipped story"); row.hostHeld = true;
      } else if (index === 4) {
        click("存读档"); const savedText = text(); click("快速保存"); await until(() => main().dataset.saveOperation === "saved");
        click("存读档"); await until(() => voice.ended); click("继续下一句"); await until(() => text() !== savedText);
        click("快速读取"); await until(() => main().dataset.saveOperation === "loaded" && text() === savedText);
        row.quickLoadRestored = true; click("自动播放");
      } else if (index === 6) {
        click("自动播放"); click("打开剧情历史"); const before = hash(); await pause(800);
        check(hash() === before, "History leaked Auto"); click("关闭剧情历史"); row.historyHeld = true;
      } else if (index === 8) {
        click("自动播放"); voice.src = "data:audio/wav;base64,AAAA"; voice.load();
        await until(() => voice.error !== null); row.failedVoiceRecovered = true;
      } else if (index === 10) {
        await until(() => voice.ended);
        const plays = events.filter(event => event.kind === "play" && event.asset === voice.dataset.assetId).length;
        handle.setHostActivity("suspended"); await pause(50); handle.setHostActivity("active"); await pause(150);
        check(events.filter(event => event.kind === "play" && event.asset === voice.dataset.assetId).length === plays, "Resume replayed completed voice");
        row.completedVoiceNotReplayed = true; click("自动播放");
      } else click(index % 2 === 0 ? "自动播放" : "快进全部");
      await until(() => main().dataset.playerStatus === (index === 11 ? "ended" : "waiting-choice"));
      const boundary = hash(); await pause(150); check(hash() === boundary, "Boundary advanced without explicit choice");
      row.boundaryHeld = true; return row;
    },
    close() { handle.unmount(); style.remove(); for (const name of ["play", "ended", "error"]) document.removeEventListener(name, capture, true); return { events, mounted: document.querySelector("main") !== null }; }
  };
}
