import { loadProject, migrateS0Project, type S0Project } from "../packages/project-domain/src/index";
import { withProjectSettings } from "../packages/gal-settings/src/index";
import { mountWorldPlayerV1 } from "../apps/player-shell/src/mount-player";
import css from "../apps/player-shell/src/player-shell.css?inline";

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
function check(value: unknown, message: string): asserts value { if (!value) throw Error(message); }
const main = () => document.querySelector<HTMLElement>("main")!;
const hash = () => main().dataset.runtimeStateHash;
const text = () => document.querySelector(".player-dialogue__text")?.textContent ?? "";
async function until(test: () => boolean) { for (let i = 0; i < 200; i++) { if (test()) return; await pause(25); } throw Error(`Input timeout: ${text()} / ${JSON.stringify(main()?.dataset)}`); }
function click(name: string) {
  const button = [...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.getAttribute("aria-label") === name || b.textContent?.includes(name));
  check(button && !button.disabled, `Missing button ${name}`); button.click();
}

/** Actual production Player/RAF, injected pad samples; not physical-controller evidence. */
export function start(revealMode: "instant" | "typewriter") {
  const style = document.createElement("style"); style.textContent = css; document.head.append(style);
  const source: S0Project = { schemaVersion: 0, id: "input_lifecycle", title: "输入生命周期验收", entrySceneId: "fork", characters: [], scenes: [
    { id: "fork", title: "Fork", statements: [{ id: "choice", kind: "choice", prompt: "Choose deliberately", options: [
      { id: "choose_left", label: "Left", targetSceneId: "left" }, { id: "choose_right", label: "Right", targetSceneId: "right" }
    ] }] },
    ...["left", "right"].map(route => ({ id: route, title: route, statements: [
      ...Array.from({ length: 3 }, (_, i) => ({ id: `${route}_${i}`, kind: "narration" as const, textId: `${route}_text_${i}`, text: `${route} line ${i}` })),
      { id: `${route}_end`, kind: "end" as const, endingName: "Input complete" }
    ] }))
  ] };
  const base = loadProject(migrateS0Project(source).files);
  let buttons: number[] = [0], axis = 0, connected = true, device = "injected-pad";
  const original = Object.getOwnPropertyDescriptor(navigator, "getGamepads");
  Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => connected ? [{ index: 0, id: device, connected: true,
    axes: [0, axis], buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: buttons.includes(i) })) }] : [] });
  const handle = mountWorldPlayerV1(document.getElementById("player-root")!, { project: { ...base, settings: withProjectSettings(base.settings, {
    text: { revealMode, minimumDisplayMilliseconds: 160, charactersPerSecond: 100, punctuationDelayMilliseconds: 0 }
  }) } });
  const neutral = async () => { buttons = []; axis = 0; await pause(100); };
  const press = async (button = 0) => { await neutral(); buttons = [button]; await pause(160); };
  const hold = async (label: string) => { const before = hash(); await pause(400); check(hash() === before, `${label} leaked input`); };
  return {
    async round(index: number) {
      await until(() => Boolean(main()));
      await hold("initial connection/title"); check(main().dataset.playerStatus === "title", "Held initial confirm started story");
      await press(); await until(() => main().dataset.playerStatus === "waiting-choice"); await hold("title to choice");
      await press(13); await hold("dpad selection");
      check(document.querySelector('[data-player-selected="true"]')?.textContent?.includes("Right"), "Held down wrapped selection");
      await neutral(); axis = -0.8; await pause(300);
      check(document.querySelector('[data-player-selected="true"]')?.textContent?.includes("Left"), "Stick did not select previous");
      await neutral(); axis = 0.8; await pause(300);
      check(document.querySelector('[data-player-selected="true"]')?.textContent?.includes("Right"), "Held stick wrapped selection");
      await press(); await until(() => text() === "right line 0"); await hold("choice/text-ready");
      for (const panel of ["打开剧情历史", "存读档"]) {
        click(panel); await pause(100); await hold(panel);
        click(panel === "存读档" ? panel : "关闭剧情历史"); await pause(100); await hold(`${panel} closed`);
      }
      handle.setHostActivity("suspended"); await pause(100); await hold("suspended");
      handle.setHostActivity("active"); await pause(100); await hold("resumed held");
      connected = false; await pause(100); connected = true; await hold("reconnected held");
      device = `replacement-${index}`; await hold("replacement held");
      check(text() === "right line 0", "Resume/reconnect skipped dialogue");
      await press(); await until(() => text() === "right line 1"); await hold("fresh next line");
      await press(); await until(() => text() === "right line 2"); await hold("last dialogue");
      await press(); await until(() => main().dataset.playerStatus === "ended"); await hold("ending");
      click("回到标题"); await pause(100); await hold("returned title");
      return { index, revealMode, initialHeld: true, choiceHeld: true, dpadHeld: true, stickHeld: true, textReadyHeld: true, panelsHeld: true, resumeHeld: true, reconnectHeld: true, freshPressWorks: true, endingHeld: true };
    },
    close() { handle.unmount(); style.remove(); if (original) Object.defineProperty(navigator, "getGamepads", original); else Reflect.deleteProperty(navigator, "getGamepads"); }
  };
}
